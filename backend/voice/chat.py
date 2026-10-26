"""A customer's agent in a text chat: the next reply to a conversation, tools and all.

The agent is the one that answers the number's calls: the same prompt (its `{{variables}}`, what she
remembers about the person, `# Right now`, `# Your tools`, all from product.phone_call), plus CHAT_RULES
saying this is a chat, not a call. Her tools are tools.CallTools, run as Gemini functions: a reply may
call several in a row (up to MAX_TOOL_ROUNDS) before it is written. Each run is logged like a call's.

It knows nothing of WhatsApp: the caller passes the turns ({"role": "caller"|"agent", "text"}) and sends
the reply on. whatsapp.py does that for WhatsApp chats; the app's test chat can do the same.

Replies run on the owner's own Gemini key (ctx["gemini_key"]), on the chat model (voice-call-rates.json
`chat`, CHAT_MODEL overrides it), whatever voice stack the agent uses for calls.
"""

import os

from loguru import logger

import costs
import product

MODEL = os.getenv("CHAT_MODEL", costs.RATES["chat"]["model"])
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


async def reply(ctx: dict, turns: list[dict], tools=None) -> tuple[str, dict]:
    """The agent's next message, and the tokens it took ({"textIn", "textOut"}). Never raises: when Gemini
    fails she says SORRY, and the reason is logged."""
    usage: dict = {"textIn": 0, "textOut": 0}
    body: dict = {
        "systemInstruction": {"parts": [{"text": f"{ctx['prompt']}\n\n{CHAT_RULES}"}]},
        "contents": contents(turns),
    }
    if fns := declarations(tools):
        body["tools"] = [{"functionDeclarations": fns}]
    if not body["contents"]:
        return "", usage
    try:
        for _ in range(MAX_TOOL_ROUNDS + 1):
            data = await product.gemini_generate(ctx["gemini_key"], MODEL, body, TIMEOUT)
            _add_usage(usage, data.get("usageMetadata") or {})
            content = ((data.get("candidates") or [{}])[0].get("content") or {})
            parts = content.get("parts") or []
            calls = [p["functionCall"] for p in parts if isinstance(p.get("functionCall"), dict)]
            if not calls:
                text = "".join(p.get("text", "") for p in parts if not p.get("thought")).strip()
                return (text[:REPLY_MAX] if text else SORRY), usage
            if not tools:
                return SORRY, usage
            # Her turn goes back as Google wrote it (thought signatures included), then each tool's answer.
            body["contents"].append({"role": "model", "parts": parts})
            answers = []
            for call in calls:
                name, args = str(call.get("name") or ""), dict(call.get("args") or {})
                ok, result, booking_id = await tools.run(name, args, len(turns))
                answers.append({"functionResponse": {"name": name, "response": {"result": result}}})
            body["contents"].append({"role": "user", "parts": answers})
        logger.warning(f"chat: no answer after {MAX_TOOL_ROUNDS} tool rounds")
    except Exception as e:
        logger.warning(f"chat: Gemini could not reply: {e!r}")
    return SORRY, usage
