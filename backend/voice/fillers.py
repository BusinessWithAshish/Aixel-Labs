"""Short thinking sounds, in the agent's own voice.

When the model takes a moment, silence is indistinguishable from a dead line:
the caller says "hello?", which counts as an interruption, which throws away
the reply that was arriving. A quarter of a second of "mm" prevents all of it.

Gemini's TTS models offer the same 30 voices as the Live API, so the filler is
the same speaker as the rest of the call and there is no seam.

    python fillers.py sulafat puck kore    # pre-generate, otherwise it is lazy
"""

import base64
import json
import os
import sys
import urllib.request
from pathlib import Path

import numpy as np
from dotenv import load_dotenv
from loguru import logger

HERE = Path(__file__).parent
load_dotenv(HERE / ".env", override=True)

# Clips that come with the code (the voices in use when it was written), and clips made on this
# machine the first time another voice needs one. CACHE is untracked: every release links the
# checkout's own (backend/deploy/deploy.sh), so a deploy never makes them again.
SHIPPED = HERE / "fillers"
CACHE = HERE / "cache"
SAMPLE_RATE = 24000  # what the Live API sends, so no resampling
TTS_MODEL = os.getenv("GEMINI_TTS_MODEL", "gemini-3.1-flash-tts-preview")
MAX_SECONDS = 0.7

# Spoken flat and unstressed. Anything longer starts to sound like an answer.
FILLER_TEXT = "Say this exactly, quietly and flat, as a two hundred millisecond thinking noise, not a word: mm"


def _trim(pcm: bytes, floor: int = 300, max_seconds: float = MAX_SECONDS) -> bytes:
    """Cut leading and trailing silence, cap the length, fade the end out.

    The cap can land mid-sound, which clicks; a short fade hides the seam.
    """
    samples = np.frombuffer(pcm, dtype=np.int16).astype(np.float32)
    loud = np.flatnonzero(np.abs(samples) > floor)
    if loud.size:
        pad = int(0.02 * SAMPLE_RATE)
        samples = samples[max(0, loud[0] - pad) : min(len(samples), loud[-1] + pad)]
    samples = samples[: int(max_seconds * SAMPLE_RATE)]

    fade = min(int(0.06 * SAMPLE_RATE), len(samples))
    if fade:
        samples[-fade:] *= np.linspace(1.0, 0.0, fade)
    return samples.astype(np.int16).tobytes()


def _generate(voice: str, text: str = FILLER_TEXT, max_seconds: float = MAX_SECONDS, api_key: str | None = None) -> bytes:
    # A customer's call passes its owner's key; None is ours, for Ashish's own line only.
    key = api_key or os.environ["GEMINI_API_KEY"]
    body = json.dumps(
        {
            "contents": [{"parts": [{"text": text}]}],
            "generationConfig": {
                "responseModalities": ["AUDIO"],
                "speechConfig": {
                    "voiceConfig": {"prebuiltVoiceConfig": {"voiceName": voice.capitalize()}}
                },
            },
        }
    ).encode()
    req = urllib.request.Request(
        f"https://generativelanguage.googleapis.com/v1beta/models/{TTS_MODEL}:generateContent",
        data=body,
        headers={"Content-Type": "application/json", "x-goog-api-key": key},
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        data = json.load(r)
    part = data["candidates"][0]["content"]["parts"][0]
    inline = part.get("inlineData") or part.get("inline_data")
    return _trim(base64.b64decode(inline["data"]), max_seconds=max_seconds)


def clip(name: str) -> bytes | None:
    """A kept clip, shipped or made here; None when there is none yet."""
    for folder in (SHIPPED, CACHE):
        if (folder / name).exists():
            return (folder / name).read_bytes()
    return None


def keep(name: str, pcm: bytes):
    CACHE.mkdir(exist_ok=True)
    (CACHE / name).write_bytes(pcm)


def get_filler(voice: str, api_key: str | None = None) -> bytes | None:
    """Cached PCM for this voice, generating it the first time it is asked for (on `api_key`,
    the call's own Gemini key; the clip is the same for every call in that voice)."""
    name = f"{voice.lower()}.pcm"
    if (pcm := clip(name)) is not None:
        return pcm
    try:
        pcm = _generate(voice, api_key=api_key)
    except Exception as e:
        logger.error(f"could not generate a filler for {voice}: {e}")
        return None
    keep(name, pcm)
    logger.info(f"filler for {voice}: {len(pcm) / 2 / SAMPLE_RATE:.2f}s -> {CACHE / name}")
    return pcm


# Played before the agent says a word, on every call. One fixed voice for all of
# them: like any "this call is recorded" notice it is a separate announcement,
# and it means no per-voice clip has to exist before a call can start.
NOTICE_TEXT = "This call is recorded."
NOTICE_VOICE = "charon"


def get_notice() -> bytes | None:
    """The recording notice, generated once and kept on disk."""
    if (pcm := clip("notice.pcm")) is not None:
        return pcm
    try:
        pcm = _generate(NOTICE_VOICE, NOTICE_TEXT, max_seconds=4.0)
    except Exception as e:
        logger.error(f"could not generate the recording notice: {e}")
        return None
    keep("notice.pcm", pcm)
    logger.info(f"recording notice: {len(pcm) / 2 / SAMPLE_RATE:.2f}s -> {CACHE / 'notice.pcm'}")
    return pcm


# Left on a voicemail after the beep. A fixed recording, never improvised: the words
# can be reviewed once, and nothing can go off script on someone's answering machine.
# It says it is an AI (the same disclosure as the live opener) and asks them to call
# this number back, which is why a call that comes IN gets its own greeting.
VOICEMAIL_TEXT = (
    "Hi, this is Maya, an AI assistant from Aixel Labs. We've built a demo of a website "
    "that books appointments by itself, and an AI that answers your phone. If you'd like "
    "to see it, call this number back. Thanks, and have a good day."
)


# A customer agent's own message (its voicemail setting, variables filled in) differs per call,
# so it is made per call and only the last few are kept, in memory.
_MESSAGES: dict[tuple[str, str], bytes] = {}
MESSAGES_KEPT = 32


def get_voicemail(voice: str, api_key: str | None = None, text: str = VOICEMAIL_TEXT) -> bytes | None:
    """The voicemail message in this call's own voice (on `api_key`, as get_filler), at most 30 s.
    Ours (VOICEMAIL_TEXT) is generated once per voice and kept on disk; any other text per call."""
    if text != VOICEMAIL_TEXT:
        if (voice.lower(), text) in _MESSAGES:
            return _MESSAGES[(voice.lower(), text)]
        try:
            pcm = _generate(voice, text, max_seconds=30.0, api_key=api_key)
        except Exception as e:
            logger.error(f"could not generate a voicemail message for {voice}: {e}")
            return None
        while len(_MESSAGES) >= MESSAGES_KEPT:
            _MESSAGES.pop(next(iter(_MESSAGES)))
        _MESSAGES[(voice.lower(), text)] = pcm
        logger.info(f"voicemail message for {voice}: {len(pcm) / 2 / SAMPLE_RATE:.1f}s ({len(text)} characters)")
        return pcm
    name = f"voicemail-{voice.lower()}.pcm"
    if (pcm := clip(name)) is not None:
        return pcm
    try:
        pcm = _generate(voice, VOICEMAIL_TEXT, max_seconds=30.0, api_key=api_key)
    except Exception as e:
        logger.error(f"could not generate the voicemail message for {voice}: {e}")
        return None
    keep(name, pcm)
    logger.info(f"voicemail message for {voice}: {len(pcm) / 2 / SAMPLE_RATE:.1f}s -> {CACHE / name}")
    return pcm


if __name__ == "__main__":
    if sys.argv[1:2] == ["voicemail"]:
        for name in sys.argv[2:] or ["aoede"]:
            pcm = get_voicemail(name)
            print(f"voicemail/{name}: {'%.1fs' % (len(pcm) / 2 / SAMPLE_RATE) if pcm else 'failed'}")
        sys.exit(0)
    if sys.argv[1:2] == ["notice"]:
        pcm = get_notice()
        print(f"notice: {'%.2fs' % (len(pcm) / 2 / SAMPLE_RATE) if pcm else 'failed'}")
        sys.exit(0)
    for name in sys.argv[1:] or ["aoede"]:
        pcm = get_filler(name)
        print(f"{name}: {'%.2fs' % (len(pcm) / 2 / SAMPLE_RATE) if pcm else 'failed'}")
