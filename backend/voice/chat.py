"""A customer's agent in a text chat: the next reply to a conversation, tools and all.

The agent is the one that answers the number's calls: the same prompt (its `{{variables}}`, what she
remembers about the person, `# Right now`, `# Your tools`, all from product.phone_call), plus CHAT_RULES
saying this is a chat, not a call. Her tools are tools.CallTools, run as Gemini functions: a reply may
call several in a row (up to MAX_TOOL_ROUNDS) before it is written. Each run is logged like a call's.

It knows nothing of WhatsApp: the caller passes the turns ({"role": "caller"|"agent", "text"}) and sends
the reply on. whatsapp.py does that for WhatsApp chats; the app's test chat can do the same.

Replies run on the owner's own Gemini key (ctx["gemini_key"]), on the agent's chat model (its `whatsapp.chatModel`,
voice-call-rates.json `chat.models`), whatever voice stack the agent uses for calls.

Voice notes (no keys of ours, ever): `transcribe` hears one on the owner's own speech-to-text (the agent's
PIPELINE STT, else their Deepgram key, then OpenAI, else Gemini on their Gemini key), and `speak` says a
reply in the agent's voice (Gemini TTS on their Gemini key, fillers.get_line on VOICE_NOTE_MODEL) as an OGG/Opus voice note.
"""

import asyncio
import base64
import os
import re
import subprocess
import tempfile

import aiohttp
from loguru import logger

import costs
import fillers
import product

MODEL = os.getenv("CHAT_MODEL", costs.RATES["chat"]["model"])
MODELS = tuple(costs.CHAT_RATES)
DEEPGRAM_MODEL, OPENAI_STT_MODEL = "nova-3", "gpt-4o-mini-transcribe"
SPOKEN_MAX_SECS = 120.0  # a voice reply longer than this is cut
HANDOFF = {
    "name": "ask_for_a_person",
    "description": ("Hand this chat to a person from the team. Use it when the person asks for a human, is upset, "
                    "or needs something you cannot do. Then tell them a team member will reply here soon."),
    "parameters": {"type": "object", "properties": {
        "reason": {"type": "string", "description": "Why, in a few words, for the team member."}}, "required": ["reason"]},
}
TIMEOUT = 30.0
# Tool rounds one reply may take (check_availability, then book_appointment, ...) before it must answer.
MAX_TOOL_ROUNDS = 4
# WhatsApp's own limit on a text message.
REPLY_MAX = 4096
# Turns sent with each request: a long chat keeps its latest ones.
HISTORY_MAX = 60
SORRY = "Sorry, I couldn't answer that just now. Please try again in a moment."

CHAT_RULES = """# This is a WhatsApp chat

You are texting with this person on WhatsApp, not talking on a phone call. Everything above about calls
applies to this chat: what you do, what you know, your tools. But write the way people text:

- Short messages: one to three sentences, a question at a time. No headings, no tables.
- Plain words. Use *bold* only for a date, a time or a booking you confirm.
- Ignore anything above about voices, speaking, pauses, the line, voicemail or hanging up.
- Never say you are on a call. If they would rather talk, tell them they can call this same WhatsApp number."""


def contents(turns: list[dict]) -> list[dict]:
    """The conversation in Gemini's roles: the person is `user`, the agent `model`. Gemini wants the
    first turn to be the user's, so a chat that starts with the agent drops its opening line."""
    out = []
    for turn in turns[-HISTORY_MAX:]:
        text = str(turn.get("text") or "").strip()
        if not text:
            continue
        role = "user" if turn.get("role") == "caller" else "model"
        if out and out[-1]["role"] == role:  # two in a row (the person sent several): one turn
            out[-1]["parts"].append({"text": text})
        elif out or role == "user":
            out.append({"role": role, "parts": [{"text": text}]})
    return out


def declarations(tools) -> list[dict]:
    """The agent's tools as Gemini function declarations (the same schema her calls get)."""
    schema = tools.schema() if tools else None
    return [fn.to_default_dict() for fn in schema.standard_tools] if schema else []


def _add_usage(total: dict, usage: dict):
    total["textIn"] = total.get("textIn", 0) + int(usage.get("promptTokenCount") or 0)
    total["textOut"] = total.get("textOut", 0) + int(usage.get("candidatesTokenCount") or 0) + int(usage.get("thoughtsTokenCount") or 0)


def model_of(agent: dict) -> str:
    """The agent's chat model, when it is one we price; else the default."""
    picked = ((agent.get("whatsapp") or {}) if isinstance(agent.get("whatsapp"), dict) else {}).get("chatModel")
    return picked if picked in MODELS else MODEL


async def reply(ctx: dict, turns: list[dict], tools=None, model: str = MODEL, handoff=None) -> tuple[str, dict]:
    """The agent's next message, and the tokens it took ({"textIn", "textOut"}). `handoff`: an async
    (reason) -> str that hands the chat to a person; given, she may call it (HANDOFF). Never raises: when
    Gemini fails she says SORRY, and the reason is logged."""
    usage: dict = {"textIn": 0, "textOut": 0}
    body: dict = {
        "systemInstruction": {"parts": [{"text": f"{ctx['prompt']}\n\n{CHAT_RULES}"}]},
        "contents": contents(turns),
    }
    if fns := declarations(tools) + ([HANDOFF] if handoff else []):
        body["tools"] = [{"functionDeclarations": fns}]
    if not body["contents"]:
        return "", usage
    try:
        for _ in range(MAX_TOOL_ROUNDS + 1):
            data = await product.gemini_generate(ctx["gemini_key"], model, body, TIMEOUT)
            _add_usage(usage, data.get("usageMetadata") or {})
            content = ((data.get("candidates") or [{}])[0].get("content") or {})
            parts = content.get("parts") or []
            calls = [p["functionCall"] for p in parts if isinstance(p.get("functionCall"), dict)]
            if not calls:
                text = "".join(p.get("text", "") for p in parts if not p.get("thought")).strip()
                return (text[:REPLY_MAX] if text else SORRY), usage
            if not tools and not handoff:
                return SORRY, usage
            # Her turn goes back as Google wrote it (thought signatures included), then each tool's answer.
            body["contents"].append({"role": "model", "parts": parts})
            answers = []
            for call in calls:
                name, args = str(call.get("name") or ""), dict(call.get("args") or {})
                if name == HANDOFF["name"] and handoff:
                    result = await handoff(str(args.get("reason") or "")[:300])
                elif tools:
                    _, result, _ = await tools.run(name, args, len(turns))
                else:
                    result = f"There is no tool called {name}."
                answers.append({"functionResponse": {"name": name, "response": {"result": result}}})
            body["contents"].append({"role": "user", "parts": answers})
        logger.warning(f"chat: no answer after {MAX_TOOL_ROUNDS} tool rounds")
    except Exception as e:
        logger.warning(f"chat: Gemini could not reply: {e!r}")
    return SORRY, usage


# --- Voice notes --------------------------------------------------------------------------------------


def audio_secs(audio: bytes) -> float:
    """How long a voice note is (ffprobe), 0 when it cannot tell."""
    with tempfile.NamedTemporaryFile(suffix=".audio") as f:
        f.write(audio)
        f.flush()
        out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f.name],
                             capture_output=True, text=True, timeout=30)
    try:
        return round(float(out.stdout.strip()), 1)
    except ValueError:
        return 0.0


def stt_choice(ctx: dict, keys: list | None) -> tuple[str, str, str]:
    """(provider, model, key) a voice note is heard with: the agent's PIPELINE STT, else the owner's
    Deepgram key, then OpenAI, else Gemini on their Gemini key."""
    stack = ctx.get("stack") or {}
    if stack.get("kind") == "PIPELINE" and stack["stt"]["provider"] in ("deepgram", "openai"):
        return stack["stt"]["provider"], stack["stt"]["model"], stack["stt"]["key"]
    for provider, model in (("deepgram", DEEPGRAM_MODEL), ("openai", OPENAI_STT_MODEL)):
        if key := product.key_for(keys, provider):
            return provider, model, product.open_secret(key["keySealed"])
    return "gemini", MODEL, ctx["gemini_key"]


async def transcribe(ctx: dict, audio: bytes, mime: str) -> tuple[str | None, dict]:
    """What a voice note says, and its usage ({"provider", "model", "secs"}, plus Gemini's tokens when Gemini
    heard it). None when nothing could be heard. Never raises."""
    keys = (await asyncio.to_thread(product.db().voice_accounts.find_one, {"userId": ctx["doc"]["userId"]}, {"keys": 1}) or {}).get("keys")
    provider, model, key = stt_choice(ctx, keys)
    usage = {"provider": provider, "model": model, "secs": await asyncio.to_thread(audio_secs, audio)}
    mime = (mime or "audio/ogg").split(";")[0]
    try:
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=60)) as session:
            if provider == "deepgram":
                async with session.post(f"https://api.deepgram.com/v1/listen?model={model}&smart_format=true&detect_language=true",
                                        data=audio, headers={"Authorization": f"Token {key}", "Content-Type": mime}) as r:
                    data = await r.json(content_type=None)
                text = (((data.get("results") or {}).get("channels") or [{}])[0].get("alternatives") or [{}])[0].get("transcript")
            elif provider == "openai":
                form = aiohttp.FormData()
                form.add_field("model", model)
                form.add_field("file", audio, filename="voice-note.ogg", content_type=mime)
                async with session.post("https://api.openai.com/v1/audio/transcriptions", data=form,
                                        headers={"Authorization": f"Bearer {key}"}) as r:
                    data = await r.json(content_type=None)
                text = data.get("text")
            else:
                data = await product.gemini_generate(key, model, {"contents": [{"role": "user", "parts": [
                    {"inlineData": {"mimeType": mime, "data": base64.b64encode(audio).decode()}},
                    {"text": "Write down exactly what is said in this voice note, in the language it is spoken. Only the words."}]}]})
                _add_usage(usage, data.get("usageMetadata") or {})
                parts = ((data.get("candidates") or [{}])[0].get("content") or {}).get("parts") or []
                text = "".join(p.get("text", "") for p in parts if not p.get("thought"))
    except Exception as e:
        logger.warning(f"chat: could not hear a voice note on {provider}: {e!r}")
        return None, usage
    text = str(text or "").strip()
    return (text or None), usage


def spoken(text: str) -> str:
    """A reply as it is said: WhatsApp's *bold*, _italic_, ~strike~ and `code` marks dropped, so TTS never reads them."""
    return re.sub(r"(?<![\w*_~`])[*_~`]+(?=\S)|(?<=\S)[*_~`]+(?![\w*_~`])", "", text)


async def speak(ctx: dict, text: str) -> bytes | None:
    """`text` as a voice note (OGG/Opus) in the agent's voice, on the owner's Gemini key. None when it failed."""
    pcm = await asyncio.to_thread(fillers.get_line, ctx["voice"] or "aoede", spoken(text), ctx["gemini_key"], SPOKEN_MAX_SECS,
                                  fillers.VOICE_NOTE_MODEL)
    if not pcm:
        return None
    return await voice_note(pcm, ["-f", "s16le", "-ar", str(fillers.SAMPLE_RATE), "-ac", "1"])


async def voice_note(audio: bytes, source: list[str] | None = None) -> bytes | None:
    """`audio` as WhatsApp plays a voice note: OGG/Opus, mono. `source` describes raw input (PCM); else ffmpeg reads the
    container (a browser's WebM or MP4 recording). None when it could not be encoded."""
    out = await asyncio.to_thread(subprocess.run, [
        "ffmpeg", "-v", "error", *(source or []), "-i", "pipe:0", "-t", str(SPOKEN_MAX_SECS), "-ac", "1",
        "-c:a", "libopus", "-b:a", "32k", "-application", "voip", "-f", "ogg", "pipe:1"], input=audio, capture_output=True, timeout=60)
    if out.returncode or not out.stdout:
        logger.warning(f"chat: could not encode a voice note: {out.stderr[:200]!r}")
        return None
    return out.stdout