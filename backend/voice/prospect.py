"""A fake prospect who calls Maya, so the prompt can be tested without a phone.

It speaks Telnyx's own WebSocket protocol at the same /telnyx endpoint a real
call uses -- same 8 kHz mu-law, same serializer, same pipeline -- so the only
thing missing versus a real call is the carrier.

Each turn: listen until Maya stops, transcribe her (Groq Whisper), decide what
a busy business owner would say back (Gemini), speak it (Gemini TTS), send it.

    .venv/bin/python prospect.py --voice sulafat --persona busy --turns 8
"""

import argparse
import asyncio
import audioop
import base64
import io
import json
import os
import time
import urllib.request
import uuid
import wave
from pathlib import Path

import numpy as np
import websockets
from dotenv import load_dotenv

HERE = Path(__file__).parent
load_dotenv(HERE / ".env", override=True)

WS = "ws://127.0.0.1:7860/telnyx"
FRAME_MS = 20
FRAME_BYTES = 160  # 20 ms of 8 kHz mu-law
SILENCE = b"\xff" * FRAME_BYTES  # mu-law zero
AGENT_DONE_AFTER = 1.0  # quiet this long and we take it as her turn ending
MAX_WAIT = 20.0

# The free tier hands out 503s when a model is busy, so keep spares.
TEXT_MODELS = [os.getenv("PROSPECT_MODEL", "gemini-3.5-flash"),
               "gemini-3-flash-preview", "gemini-3.1-flash-lite", "gemini-3.6-flash"]
TTS_MODEL = os.getenv("GEMINI_TTS_MODEL", "gemini-3.1-flash-tts-preview")
PROSPECT_VOICE = "algenib"  # gravelly, clearly not one we test Maya on

PERSONAS = {
    "busy": """You own a plumbing company. You are mid-job and the phone rang.
You are short, a bit impatient, not rude. You will give a cold caller a few
seconds if they are straight with you. You close at five. After hours your
phone goes to voicemail and you lose jobs because of it, though you have never
thought about it much. If someone earns it, you will agree to a short call.""",
    "skeptical": """You own a dental practice. You have been burned by agencies
before and you assume every caller is wasting your time. You interrupt. You ask
what it costs early, and you ask bluntly whether you are talking to a robot.
You only agree to anything if they answer you straight.""",
    "friendly": """You run a small landscaping business and you are relaxed and
chatty. You ramble a bit, you are happy to talk. You are mildly interested in
anything that saves you time, but you drift off topic and need bringing back.""",
}


def _post(url: str, payload: dict, attempts: int = 3) -> dict:
    last = None
    for i in range(attempts):
        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode(),
            headers={"Content-Type": "application/json", "User-Agent": "voicelab/1.0"},
        )
        try:
            with urllib.request.urlopen(req, timeout=90) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            last = e
            if e.code not in (429, 500, 503):
                raise
            time.sleep(1.5 * (i + 1))
    raise last


def transcribe(pcm8k: bytes) -> str:
    """Groq Whisper. Cheap, fast, and good enough to drive the conversation."""
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(8000)
        w.writeframes(pcm8k)
    body, boundary = [], uuid.uuid4().hex
    body.append(f"--{boundary}\r\nContent-Disposition: form-data; name=\"model\"\r\n\r\nwhisper-large-v3-turbo\r\n".encode())
    body.append(
        f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"a.wav\"\r\n"
        f"Content-Type: audio/wav\r\n\r\n".encode() + buf.getvalue() + b"\r\n"
    )
    body.append(f"--{boundary}--\r\n".encode())
    req = urllib.request.Request(
        "https://api.groq.com/openai/v1/audio/transcriptions",
        data=b"".join(body),
        headers={
            "Authorization": f"Bearer {os.environ['GROQ_API_KEY']}",
            "Content-Type": f"multipart/form-data; boundary={boundary}",
            "User-Agent": "voicelab/1.0",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.load(r).get("text", "").strip()
    except Exception as e:
        print(f"  (transcribe failed: {e})")
        return ""


def decide(persona: str, history: list[dict]) -> str:
    """What this prospect says next."""
    script = "\n".join(f"{h['who']}: {h['text']}" for h in history)
    prompt = (
        f"{PERSONAS[persona]}\n\n"
        "You are on a phone call. Reply with ONLY the words you say out loud, "
        "one or two short sentences, the way people actually talk on the phone. "
        "No stage directions, no quotation marks. If the caller has earned it, "
        "agree to a time. If they waste your time, say so or hang up by saying "
        "exactly: [HANGUP]\n\n"
        f"The call so far:\n{script}\n\nYou say:"
    )
    key = os.environ["GEMINI_API_KEY"]
    for model in TEXT_MODELS:
        try:
            data = _post(
                f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={key}",
                {"contents": [{"parts": [{"text": prompt}]}]},
            )
            return data["candidates"][0]["content"]["parts"][0]["text"].strip()
        except Exception as e:
            print(f"  ({model} unavailable: {e})")
    return "Sorry, say that again?"


def speak(text: str) -> bytes:
    """Prospect's words -> 8 kHz mu-law, ready for the wire."""
    key = os.environ["GEMINI_API_KEY"]
    data = _post(
        f"https://generativelanguage.googleapis.com/v1beta/models/{TTS_MODEL}:generateContent?key={key}",
        {
            # No style instruction here: the newer TTS models read it out loud.
            "contents": [{"parts": [{"text": text}]}],
            "generationConfig": {
                "responseModalities": ["AUDIO"],
                "speechConfig": {
                    "voiceConfig": {"prebuiltVoiceConfig": {"voiceName": PROSPECT_VOICE.capitalize()}}
                },
            },
        },
    )
    part = data["candidates"][0]["content"]["parts"][0]
    inline = part.get("inlineData") or part.get("inline_data")
    pcm24 = base64.b64decode(inline["data"])
    pcm8, _ = audioop.ratecv(pcm24, 2, 1, 24000, 8000, None)
    return audioop.lin2ulaw(pcm8, 2)


async def run(voice: str, persona: str, turns: int):
    stream_id = str(uuid.uuid4())
    history: list[dict] = []
    outbox: asyncio.Queue[bytes] = asyncio.Queue()

    async with websockets.connect(f"{WS}?voice={voice}", max_size=None) as ws:
        await ws.send(json.dumps({"event": "connected"}))
        await ws.send(
            json.dumps(
                {
                    "event": "start",
                    "stream_id": stream_id,
                    "start": {
                        # "test:" tells the server not to call Telnyx about this
                        "call_control_id": f"test:{stream_id}",
                        "media_format": {"encoding": "PCMU", "sample_rate": 8000, "channels": 1},
                    },
                }
            )
        )

        async def sender():
            """Hold the line open, the way a real phone does."""
            while True:
                try:
                    frame = outbox.get_nowait()
                except asyncio.QueueEmpty:
                    frame = SILENCE
                await ws.send(
                    json.dumps(
                        {
                            "event": "media",
                            "stream_id": stream_id,
                            "media": {"payload": base64.b64encode(frame).decode()},
                        }
                    )
                )
                await asyncio.sleep(FRAME_MS / 1000)

        heard = bytearray()
        last_audio = {"t": 0.0}

        async def receiver():
            async for raw in ws:
                try:
                    msg = json.loads(raw)
                except Exception:
                    continue
                if msg.get("event") == "media":
                    ulaw = base64.b64decode(msg["media"]["payload"])
                    heard.extend(audioop.ulaw2lin(ulaw, 2))
                    last_audio["t"] = time.perf_counter()

        send_task = asyncio.create_task(sender())
        recv_task = asyncio.create_task(receiver())

        async def wait_for_her_to_finish() -> bytes:
            deadline = time.perf_counter() + MAX_WAIT
            while time.perf_counter() < deadline:
                await asyncio.sleep(0.1)
                if last_audio["t"] and time.perf_counter() - last_audio["t"] > AGENT_DONE_AFTER:
                    break
            captured = bytes(heard)
            heard.clear()
            last_audio["t"] = 0.0
            return captured

        try:
            for turn in range(turns):
                audio = await wait_for_her_to_finish()
                if len(audio) < 8000:  # under half a second of speech
                    print("  (she said nothing)")
                    break
                said = transcribe(audio)
                # The thinking cue is a noise, not a turn: keep listening.
                if len(said.strip(" .,!?")) <= 4:
                    print(f"  (filler: {said!r} — still waiting)")
                    audio2 = await wait_for_her_to_finish()
                    if len(audio2) >= 8000:
                        said = transcribe(audio2)
                    else:
                        print("  (she never finished)")
                        break
                print(f"\n  MAYA: {said}")
                history.append({"who": "Caller", "text": said})

                reply = await asyncio.to_thread(decide, persona, history)
                if "[HANGUP]" in reply:
                    print("  PROSPECT: *hangs up*")
                    history.append({"who": "You", "text": "*hangs up*"})
                    break
                print(f"  PROSPECT: {reply}")
                history.append({"who": "You", "text": reply})

                ulaw = await asyncio.to_thread(speak, reply)
                for i in range(0, len(ulaw), FRAME_BYTES):
                    outbox.put_nowait(ulaw[i : i + FRAME_BYTES].ljust(FRAME_BYTES, b"\xff"))
                while not outbox.empty():
                    await asyncio.sleep(0.05)
        finally:
            send_task.cancel()
            recv_task.cancel()

    out = HERE / "research" / f"testcall-{persona}-{int(time.time())}.json"
    out.parent.mkdir(exist_ok=True)
    out.write_text(json.dumps({"voice": voice, "persona": persona, "turns": history}, indent=1))
    print(f"\nsaved {out}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--voice", default="sulafat")
    ap.add_argument("--persona", default="busy", choices=list(PERSONAS))
    ap.add_argument("--turns", type=int, default=8)
    args = ap.parse_args()
    asyncio.run(run(args.voice, args.persona, args.turns))
