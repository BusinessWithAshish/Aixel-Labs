"""Browser round of the voice latency trial.

Two stacks behind one server, so the same prompt, voice detection and turn
taking are compared fairly:

    /a   Gemini Live                    one model hears and speaks
    /b   Deepgram -> Groq -> Cartesia   the three step pipeline

Run:  .venv/bin/python bot.py --port 7860
Then open /a or /b, allow the microphone, and talk.

Every turn is appended to turns.jsonl: how long after you stopped speaking the
agent's first audio left the server.
"""

import argparse
import asyncio
import hashlib
import hmac
import json
import os
import re
import time
import uuid
from pathlib import Path

import numpy as np

import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI, Request, Response, WebSocket
from fastapi.responses import HTMLResponse
from loguru import logger

from fillers import VOICEMAIL_TEXT, get_voicemail

from pipecat.audio.turn.smart_turn.base_smart_turn import SmartTurnParams
from pipecat.audio.turn.smart_turn.local_smart_turn_v3 import LocalSmartTurnAnalyzerV3
from pipecat.audio.vad.silero import SileroVADAnalyzer
from pipecat.audio.vad.vad_analyzer import VADParams
from pipecat.frames.frames import (
    BotStartedSpeakingFrame,
    BotStoppedSpeakingFrame,
    CancelWorkerFrame,
    EndWorkerFrame,
    Frame,
    InputAudioRawFrame,
    InterruptionFrame,
    LLMFullResponseEndFrame,
    LLMFullResponseStartFrame,
    LLMMessagesAppendFrame,
    LLMRunFrame,
    LLMTextFrame,
    OutputAudioRawFrame,
    TranscriptionFrame,
    TTSAudioRawFrame,
    TTSStartedFrame,
    TTSStoppedFrame,
    TTSTextFrame,
    UserStartedSpeakingFrame,
    UserStoppedSpeakingFrame,
    VADUserStoppedSpeakingFrame,
)
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.worker import PipelineParams, PipelineWorker
from pipecat.processors.aggregators.llm_context import LLMContext
from pipecat.processors.aggregators.llm_response_universal import (
    LLMContextAggregatorPair,
    LLMUserAggregatorParams,
)
from pipecat.processors.frame_processor import FrameDirection, FrameProcessor
from pipecat.serializers.base_serializer import FrameSerializer
from pipecat.services.google.gemini_live.llm import GeminiLiveLLMService
from pipecat.transports.websocket.fastapi import (
    FastAPIWebsocketParams,
    FastAPIWebsocketTransport,
)
from pipecat.turns.user_start import VADUserTurnStartStrategy
from pipecat.turns.user_stop import TurnAnalyzerUserTurnStopStrategy
from pipecat.turns.user_turn_strategies import UserTurnStrategies
from pipecat.workers.runner import WorkerRunner

HERE = Path(__file__).parent
load_dotenv(HERE / ".env", override=True)

# The stable Live model Google recommends for new voice agents. gemini-3.1-flash-live-preview
# is labelled legacy, is ~265 ms faster here, but repeats itself and ends 3 replies in 4 on
# a question; set GEMINI_LIVE_MODEL to go back to it if the stable model ever misbehaves.
GEMINI_LIVE_MODEL_DEFAULT = "gemini-3.8-live"

# The server is on the public internet through a tunnel, and every call it accepts
# costs money. Nothing is let in unless it came through Telnyx's own app (which
# carries VOICELAB_KEY in its webhook URL) or is a test tool on this machine.
VOICELAB_KEY = os.getenv("VOICELAB_KEY", "")


def is_local(headers, host: str | None) -> bool:
    """A process on this machine talking to the server directly (the test tools).

    The tunnel connects from loopback too, but Cloudflare stamps everything it
    forwards with CF-Connecting-IP, and a caller cannot remove it. Caddy
    (api.aixellabs.in/voice/*) connects from loopback as well and always sets
    X-Forwarded-For, which a caller cannot remove either.
    """
    names = {k.lower() for k in headers.keys()}
    return host in ("127.0.0.1", "::1") and not names & {"cf-connecting-ip", "x-forwarded-for"}


def key_ok(candidate: str | None, headers, host: str | None) -> bool:
    if is_local(headers, host):
        return True
    return bool(VOICELAB_KEY and candidate) and hmac.compare_digest(candidate, VOICELAB_KEY)


def make_token(*parts: str, ttl: int = 180) -> str:
    """A short-lived signature for one media stream, handed out only by /texml."""
    exp = int(time.time()) + ttl
    sig = hmac.new(VOICELAB_KEY.encode(), f"{exp}|{'|'.join(parts)}".encode(), hashlib.sha256).hexdigest()[:32]
    return f"{exp}.{sig}"


def token_ok(token: str | None, parts: tuple, headers, host: str | None) -> bool:
    if is_local(headers, host):
        return True
    try:
        exp, sig = (token or "").split(".")
        want = hmac.new(VOICELAB_KEY.encode(), f"{exp}|{'|'.join(parts)}".encode(), hashlib.sha256).hexdigest()[:32]
        return bool(VOICELAB_KEY) and int(exp) >= time.time() and hmac.compare_digest(sig, want)
    except ValueError:
        return False
SAMPLE_RATE_IN = 16000
SAMPLE_RATE_OUT = 24000
TURNS_LOG = HERE / "turns.jsonl"

SYSTEM_PROMPT = """You are Maya, calling local business owners on behalf of Aixel Labs.
You help them with two things: a website that books appointments by itself, and AI
that answers their calls and follow ups.

Say in your first sentence that you are an AI assistant.
Keep every reply to one or two short sentences, the way people speak on the phone.
Never read out special characters. If they object, acknowledge it in a few words and
ask one question back. Your goal is to book a ten minute call later this week."""


class RawPCMSerializer(FrameSerializer):
    """Raw 16-bit PCM both ways, so the browser page needs no libraries.

    Incoming binary is microphone audio. Outgoing binary is the agent's voice.
    One text message, "clear", tells the page to drop audio it has queued when
    the caller interrupts.
    """

    async def serialize(self, frame: Frame) -> str | bytes | None:
        if isinstance(frame, OutputAudioRawFrame):
            return frame.audio
        if isinstance(frame, InterruptionFrame):
            return json.dumps({"type": "clear"})
        return None

    async def deserialize(self, data: str | bytes) -> Frame | None:
        if isinstance(data, (bytes, bytearray)):
            return InputAudioRawFrame(
                audio=bytes(data), sample_rate=SAMPLE_RATE_IN, num_channels=1
            )
        return None


class TurnTimer(FrameProcessor):
    """Times the gap between the caller finishing and the agent's first audio."""

    def __init__(self, state: dict, stack: str, **kwargs):
        super().__init__(**kwargs)
        self._state = state
        self._stack = stack

    async def process_frame(self, frame: Frame, direction: FrameDirection):
        await super().process_frame(frame, direction)

        if isinstance(frame, UserStartedSpeakingFrame):
            self._state["speaking"] = True
            self._state["answered"] = False
        elif isinstance(frame, UserStoppedSpeakingFrame):
            self._state["speaking"] = False
            # A caller whose sentence was split by a pause can "stop" again
            # after the agent has already begun answering the first half. That
            # stop has no reply still to come, so timing it would pair it with
            # the next chunk of the same answer and log a 40-170 ms gap.
            if not self._state.get("answered"):
                # A PIPELINE stack (cascade.py) ends the turn only once its STT has the words, so its gap
                # starts where the caller's speech ended (the voice detector's stop), as Gemini Live's
                # does: Smart Turn ends ~9 turns in 10 right at that stop.
                self._state["stopped_at"] = (self._state.get("vad_stopped_at") if self._state.get("from_vad")
                                             else None) or time.perf_counter()
        elif isinstance(frame, VADUserStoppedSpeakingFrame):
            self._state["vad_stopped_at"] = time.perf_counter()
        elif isinstance(frame, OutputAudioRawFrame):
            self._state["answered"] = True
            stopped_at = self._state.pop("stopped_at", None)
            if stopped_at is not None:
                gap_ms = round((time.perf_counter() - stopped_at) * 1000)
                self._state.setdefault("gaps", []).append(gap_ms)
                gaps = sorted(self._state["gaps"])
                median = gaps[len(gaps) // 2]
                logger.info(f"[{self._stack}] turn gap {gap_ms} ms (median {median} ms)")
                with TURNS_LOG.open("a") as f:
                    f.write(
                        json.dumps(
                            {
                                "at": time.strftime("%Y-%m-%dT%H:%M:%S"),
                                "stack": self._stack,
                                "turn_gap_ms": gap_ms,
                                "turn": len(self._state["gaps"]),
                            }
                        )
                        + "\n"
                    )

        await self.push_frame(frame, direction)


def load_prompt() -> str:
    """Read prompt.md fresh for every call.

    Reading it per call rather than at startup means editing the prompt and
    dialling again is the whole loop -- no restart, nothing to redeploy. The
    browser pages and the phone line share it, so a test on either one is a
    test of the same words.
    """
    path = HERE / "prompt.md"
    if path.exists():
        return path.read_text().strip()
    logger.warning("prompt.md missing, falling back to the built-in prompt")
    return SYSTEM_PROMPT


class CallLog(FrameProcessor):
    """Keeps what was actually said, both sides, in order.

    Gemini already transcribes both directions, so this only has to catch the
    frames and keep them: TranscriptionFrame is the caller, TTSTextFrame is the
    agent. Written to calls/<stream>.json when the call ends, which is what a
    follow-up email or a CRM note would later be built from.
    """

    def __init__(self, record: dict, guard: "CallGuard | None" = None, **kwargs):
        super().__init__(**kwargs)
        self._record = record
        self._guard = guard

    async def process_frame(self, frame: Frame, direction: FrameDirection):
        await super().process_frame(frame, direction)

        if isinstance(frame, TranscriptionFrame) and frame.text.strip():
            self._record["turns"].append(
                {"at": time.strftime("%H:%M:%S"), "who": "caller", "text": frame.text.strip()}
            )
            if self._guard:
                self._guard.on_caller_text(frame.text)
        elif self._guard and isinstance(frame, UserStartedSpeakingFrame):
            self._guard.on_speech_started()
        elif self._guard and isinstance(frame, UserStoppedSpeakingFrame):
            self._guard.on_speech_stopped()
        elif isinstance(frame, TTSTextFrame) and frame.text.strip():
            turns = self._record["turns"]
            # The agent's speech arrives sentence by sentence; keep one entry
            # per reply rather than one per sentence. A tool run in between
            # (tools.py sets turn_break) starts a new one, so the transcript
            # shows where it happened.
            fresh = self._record.pop("turn_break", False)
            if turns and turns[-1]["who"] == "agent" and not fresh:
                turns[-1]["text"] += " " + frame.text.strip()
            else:
                turns.append(
                    {"at": time.strftime("%H:%M:%S"), "who": "agent", "text": frame.text.strip()}
                )

        await self.push_frame(frame, direction)


class TalkOverGate(FrameProcessor):
    """Throws away a reply that starts while the caller is still talking.

    When a caller pauses mid-sentence the turn is declared over, Gemini starts
    composing, and the caller carries on. Usually the resumed speech cancels the
    pending reply. Occasionally it does not, and she answers the first half
    while the second half is still being said, for seconds. By the time that
    reply starts the caller is known to be speaking, so the whole reply is
    dropped.

    Dropping it is not enough on its own: Gemini counts the turn as answered and
    stays silent when the caller finishes. So once they do, and no new reply
    has started, it is asked to answer everything they said.

    Each response opens with a TTSStartedFrame, which is where the decision is
    made, so a dropped reply can never leak into the next one.
    """

    # A caller cannot be "speaking" for this long; past it the flag is stale
    # (a lost stop frame) and replies must flow again rather than go silent.
    STALE_AFTER = 20.0
    # How long after the caller finishes to wait for Gemini's own reply before
    # asking for one. Healthy replies start within ~0.9 s.
    ASK_AFTER = 1.2
    NOTE = (
        "The caller has now finished speaking. Reply to everything they just "
        "said, in one or two sentences, exactly as if you had waited for them "
        "to finish before answering. Never say sorry, never say you missed or "
        "didn't catch anything, and never mention this note."
    )

    DROPPED = (
        TTSStartedFrame,
        TTSAudioRawFrame,
        OutputAudioRawFrame,
        TTSTextFrame,
        LLMTextFrame,
        LLMFullResponseStartFrame,
        LLMFullResponseEndFrame,
        TTSStoppedFrame,
    )

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self._speaking_since: float | None = None
        self._discarding = False
        self._owed_reply = False
        self._ask_task: asyncio.Task | None = None

    def _caller_talking(self) -> bool:
        return (
            self._speaking_since is not None
            and time.monotonic() - self._speaking_since < self.STALE_AFTER
        )

    def _cancel_ask(self):
        if self._ask_task:
            self._ask_task.cancel()
            self._ask_task = None

    async def _ask_for_reply(self):
        try:
            await asyncio.sleep(self.ASK_AFTER)
        except asyncio.CancelledError:
            return
        self._owed_reply = False
        logger.info("[gate] Gemini stayed silent after a dropped reply, asking it to answer")
        await self.push_frame(
            LLMMessagesAppendFrame([{"role": "user", "content": self.NOTE}]),
            FrameDirection.UPSTREAM,
        )

    async def process_frame(self, frame: Frame, direction: FrameDirection):
        await super().process_frame(frame, direction)

        if isinstance(frame, UserStartedSpeakingFrame):
            self._speaking_since = time.monotonic()
            self._cancel_ask()
        elif isinstance(frame, UserStoppedSpeakingFrame):
            self._speaking_since = None
            if self._owed_reply:
                self._cancel_ask()
                self._ask_task = self.create_task(self._ask_for_reply())
        elif direction == FrameDirection.DOWNSTREAM:
            if isinstance(frame, TTSStartedFrame):
                self._discarding = self._caller_talking()
                if self._discarding:
                    logger.info("[gate] a reply started over the caller, dropping it")
                    self._owed_reply = True
                else:
                    # A real reply is under way, so none is owed.
                    self._owed_reply = False
                    self._cancel_ask()
            if self._discarding and isinstance(frame, self.DROPPED):
                return

        await self.push_frame(frame, direction)


# Gemini refusing the KEY, as opposed to a network blip: reconnecting cannot fix these, so a
# customer's call ends and its owner is told. Matched on Google's own words, which arrive as the
# Live socket's close reason ("1007 None. API key not valid. Please pass a valid API key.").
GEMINI_KEY_PROBLEMS = (
    ("INVALID", "it is not a valid API key",
     re.compile(r"api key not valid|api_key_invalid|api key expired|api_key_expired|unregistered callers", re.I)),
    ("API_DISABLED", "the Gemini API is turned off for its Google Cloud project, or the key may not use it",
     re.compile(r"has not been used in project|service_disabled|it is disabled|api_key_service_blocked|permission[_ ]denied", re.I)),
    ("QUOTA", "it is out of quota, or billing is not set up for it",
     re.compile(r"quota|resource[_ ]exhausted|billing|\b429\b", re.I)),
)


def gemini_key_problem(error) -> tuple[str, str] | None:
    """(status, plain words) when Gemini refused the key: INVALID, API_DISABLED or QUOTA (the
    app's VoiceGeminiKeyStatus). None for anything else."""
    text = str(error)
    for status, words, pattern in GEMINI_KEY_PROBLEMS:
        if pattern.search(text):
            return status, words
    return None


class TurnSafeGeminiLive(GeminiLiveLLMService):
    """Gemini Live that never opens a caller turn while Gemini is composing a reply.

    With Gemini's own VAD off, Pipecat brackets each caller turn with activity_start /
    activity_end and streams the audio in between. When a caller pauses mid-sentence
    ("Hi, [0.3 s] I'd like to book a cleaning..."), Smart Turn ends the turn, activity_end
    goes out, and the caller resumes 0.1-0.6 s later. Measured 2026-10-16 (timing probes,
    /play): if that activity_start reaches Gemini after it has begun composing its reply to
    the first piece but before the reply's first chunk, Gemini does not take it as a
    barge-in. No `interrupted` comes, the window's audio (1.4-3.4 s of it, sent) is never
    transcribed or heard, and the reply to the first piece goes out anyway: TalkOverGate
    drops it as talked-over and she answers as if the sentence was never said. Once the
    session went silent for the rest of the call. It is a race inside Gemini: most
    resumed turns are merged fine. An activity_start sent once the reply has started IS a
    clean barge-in (`interrupted` within ~15 ms, the new audio heard), and one sent while
    nothing is pending is ordinary.

    So from activity_end until Gemini shows what it is doing (a reply chunk, a tool call,
    turn_complete, interrupted), a new caller turn is held here: all of its audio is kept
    (not just the 0.6 s pre-roll), and activity_start plus that audio go out the moment
    Gemini shows its hand, as the barge-in it handles. A held turn that already ended is
    closed (activity_end) straight after. Gemini silent for HOLD_MAX after activity_end:
    sent anyway. The reply that showed (to the first words only) is cut by that barge-in
    and is not played: neither it nor the chunks that trail a barge-in or an `interrupted`
    (Pipecat would start those as a new reply, and TalkOverGate would then ask Gemini for a
    second answer). A reply nobody talks into is untouched; a resumed turn reaches Gemini up to
    ~1 s later, which delays her answer only if the caller had already finished by then.
    """

    # Past this long after activity_end with nothing from Gemini, stop waiting for it.
    # Replies normally start ~0.9 s after (p90 ~1.5 s).
    HOLD_MAX = 2.5
    # A held turn longer than this keeps only its most recent part (a runaway guard).
    HOLD_CAP_SECS = 30.0
    # A cut reply's leftovers arrive within ~20 ms of Gemini's interrupted.
    DOOM_SECS = 0.3
    # Smart Turn ends a caller's turn at the pause between two sentences ("It goes to
    # voicemail. [0.4 s] I check it in the morning.") as confidently as at a real end
    # (p 0.97-0.99 both, measured 2026-10-16). Every activity_end makes Gemini compose a
    # reply, and Gemini bills each reply for the WHOLE session context (system prompt +
    # all audio so far): those cut-off replies were 8 of 21 Gemini turns on a 3-minute
    # call, ~30% of its cost. Callers who go on resume 10-340 ms after the verdict (half
    # within ~100 ms), so activity_end waits this long and is dropped if they do.
    # Off (0.0): at 0.1 it cut Gemini cost another 13% on top of rotation (28% without it),
    # but added 80-185 ms to the server-side reply gap (2026-10-17). Ashish's call.
    END_GRACE = 0.0
    # Most go on 120-340 ms after it, because the VAD confirms speech only after 0.1 s of
    # it. Sound inside the grace (RMS over GRACE_SOUND_RMS: real lines idle at 2-50,
    # callers talk at 600-9000) is most likely them going on, so the wait is stretched
    # by END_GRACE_SOUND for the VAD to confirm it. A reply to a caller who has really
    # stopped is delayed only END_GRACE.
    END_GRACE_SOUND = 0.15
    GRACE_SOUND_RMS = 200
    # Rotation: once she has finished speaking, close the Gemini session and open a fresh
    # one seeded with the conversation so far AS TEXT (the context the aggregators keep).
    # The re-billed history is then ~3 text tokens a second of speech at $0.75/M instead
    # of ~24 audio tokens a second at $3/M. A caller who starts talking meanwhile is held
    # (all audio kept) and goes out the moment the new session is ready.
    # Measured 2026-10-17 (booking agent, scripted calls): Gemini cost -57%, reply gap
    # unchanged, 84 rotations of 0.3-0.45 s, none failed.
    # Off since 2026-10-24 (Ashish): a fresh session per reply changed her voice and clipped lines on real calls.
    ROTATE = False
    ROTATE_MAX_WAIT = 5.0  # a held turn waits this long at most for the new session
    # Thinking: None = the model's default (3.8-live thinks ~50-150 tokens a reply, billed
    # as text out; it rejects thinking_level). 0 = off: -7% on a booking call, same reply
    # gap, bookings still right (2026-10-17) -- but never run through tests/sim.py.
    THINKING_BUDGET: int | None = None

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._composing_since: float | None = None  # when activity_end went out, until Gemini shows
        self._held_start = None  # the UserStartedSpeakingFrame of a held turn
        self._held_stop = None  # its UserStoppedSpeakingFrame, if it ended while held
        self._held_at = 0.0
        self._releasing = False
        self._doomed_until = 0.0  # while set: a reply being cut off, not to be played
        self._hold_timer: asyncio.Task | None = None
        self._grace: asyncio.Task | None = None  # an activity_end waiting out END_GRACE
        self._grace_heard = False  # sound arrived during the grace
        self._rotating: float | None = None  # when the current rotation began
        self._rotate_task: asyncio.Task | None = None
        # What the call cost in Gemini tokens (summed over every usage report) and how
        # much caller audio actually went to Gemini. Written into the call record.
        self.usage = {"reports": 0, "audio_sent_secs": 0.0}
        # Gemini refused the call's key (gemini_key_problem): awaited once with (status, words,
        # Google's message) in place of Pipecat's reconnect attempts, which cannot help.
        # None: Pipecat's own handling (Ashish's line).
        self.on_key_error = None
        self._key_refused = False

    async def _connection_task_handler(self, config):
        # A refused key fails the connect itself, outside Pipecat's receive loop.
        try:
            await super()._connection_task_handler(config)
        except Exception as e:
            if not await self._refused(e):
                raise

    async def _handle_connection_error(self, error):
        if await self._refused(error):
            return False
        return await super()._handle_connection_error(error)

    async def _refused(self, error) -> bool:
        """True when Gemini refused the key and on_key_error has dealt with it."""
        problem = gemini_key_problem(error) if self.on_key_error else None
        if not problem:
            return False
        if not self._key_refused:
            self._key_refused = True
            logger.error(f"[gemini] the call's key was refused ({problem[0]}): {error}")
            await self.on_key_error(*problem, str(error))
        return True

    def _count_sent(self, nbytes: int, rate: int | None):
        if rate:
            self.usage["audio_sent_secs"] += nbytes / (2 * rate)

    def _note_usage(self, u):
        """Gemini bills each turn for everything in the session context: every report's
        prompt count is the whole context at that moment, so the call's input cost is
        the SUM of the reports, not the last one."""
        def by_mod(details):
            return {str(d.modality.value if hasattr(d.modality, "value") else d.modality).lower(): d.token_count or 0
                    for d in details or []}
        row = {"prompt": u.prompt_token_count or 0, "response": u.response_token_count or 0,
               "thoughts": u.thoughts_token_count or 0, "tool_prompt": u.tool_use_prompt_token_count or 0,
               "cached": u.cached_content_token_count or 0}
        for side, details in (("in", u.prompt_tokens_details), ("out", u.response_tokens_details),
                              ("cached", u.cache_tokens_details), ("tool", u.tool_use_prompt_tokens_details)):
            for mod, n in by_mod(details).items():
                row[f"{side}_{mod}"] = n
        tot = self.usage
        tot["reports"] += 1
        for k, v in row.items():
            tot[k] = tot.get(k, 0) + v
        logger.info("[usage] " + " ".join(f"{k}={v}" for k, v in row.items() if v)
                    + f" | call so far: prompt={tot['prompt']} response={tot['response']}"
                    + f" audio_sent={tot['audio_sent_secs']:.1f}s")

    def _composing(self) -> bool:
        return (
            self._composing_since is not None
            and time.monotonic() - self._composing_since < self.HOLD_MAX
        )

    async def _handle_user_started_speaking(self, frame):
        if self._grace is not None:
            # They went on within the grace: still the same turn, and Gemini never heard it end.
            await self.cancel_task(self._grace)
            self._grace = None
            logger.info("[turns] the caller went on within the grace: same turn")
            return
        if self._held_start is not None:
            # Resumed again before Gemini showed anything: still the same held turn.
            self._held_stop = None
            return
        if self._rotating is not None:
            self._held_start, self._held_stop, self._held_at = frame, None, time.monotonic()
            self._hold_timer = self.create_task(self._release_after(self.ROTATE_MAX_WAIT))
            logger.info("[turns] the caller started while the session rotates: holding the turn")
            return
        if self._vad_disabled and self._composing():
            self._held_start, self._held_stop, self._held_at = frame, None, time.monotonic()
            wait = self.HOLD_MAX - (self._held_at - self._composing_since)
            self._hold_timer = self.create_task(self._release_after(wait))
            logger.info("[turns] the caller resumed while Gemini composes its reply: holding the turn")
            return
        self._composing_since = None
        await super()._handle_user_started_speaking(frame)

    async def _handle_user_stopped_speaking(self, frame):
        if self._held_start is not None:
            self._held_stop = frame  # closed when the held turn is released
            return
        if self.END_GRACE and self._vad_disabled and self._session and self._ready_for_realtime_input:
            # Until it runs, _user_is_speaking stays set: their audio still goes out in the window.
            self._grace_heard = False
            self._grace = self.create_task(self._end_after_grace(frame))
            return
        await self._end_turn(frame)

    async def _end_after_grace(self, frame):
        try:
            await asyncio.sleep(self.END_GRACE)
            if self._grace_heard:
                await asyncio.sleep(self.END_GRACE_SOUND)
        except asyncio.CancelledError:
            return
        self._grace = None
        await self._end_turn(frame)

    async def _end_turn(self, frame):
        await super()._handle_user_stopped_speaking(frame)
        if self._vad_disabled and self._session and self._ready_for_realtime_input:
            self._composing_since = time.monotonic()

    def _resolved_thinking_config(self):
        if self.THINKING_BUDGET is not None:
            from google.genai.types import ThinkingConfig

            return ThinkingConfig(thinking_budget=self.THINKING_BUDGET)
        return super()._resolved_thinking_config()

    async def _flush_user_audio_preroll(self):
        self._count_sent(len(self._user_audio_preroll_buffer), self._user_audio_preroll_buffer_sample_rate)
        await super()._flush_user_audio_preroll()

    async def _send_user_audio(self, frame):
        if self._grace is not None and not self._grace_heard and frame.audio:
            x = np.frombuffer(frame.audio, dtype=np.int16).astype(np.float32)
            self._grace_heard = float(np.sqrt(np.mean(x * x))) > self.GRACE_SOUND_RMS
        if self._rotating is not None and self._held_start is None:
            # No session to stream to: keep the usual pre-roll, as Pipecat would.
            buf = self._user_audio_preroll_buffer
            buf.extend(frame.audio)
            keep = int(frame.sample_rate * frame.num_channels * 2 * self._user_audio_preroll_secs)
            if len(buf) > keep:
                del buf[: len(buf) - keep]
            self._user_audio_preroll_buffer_sample_rate = frame.sample_rate
            return
        if self._held_start is None and not self._releasing:
            if self._session and self._ready_for_realtime_input and not self._audio_input_paused and (
                    not self._vad_disabled or self._user_is_speaking):
                self._count_sent(len(frame.audio), frame.sample_rate)  # what super() streams now
            await super()._send_user_audio(frame)
            return
        # Held (or being released): keep every frame, in order, for the release to send.
        buf = self._user_audio_preroll_buffer
        buf.extend(frame.audio)
        cap = int(frame.sample_rate * frame.num_channels * 2 * self.HOLD_CAP_SECS)
        if len(buf) > cap:
            del buf[: len(buf) - cap]
        self._user_audio_preroll_buffer_sample_rate = frame.sample_rate

    async def _release_after(self, secs: float):
        try:
            await asyncio.sleep(max(0.0, secs))
        except asyncio.CancelledError:
            return
        self._hold_timer = None
        await self._release("the new session is late" if self._rotating else "Gemini showed nothing")

    async def _release(self, why: str):
        start, stop = self._held_start, self._held_stop
        if start is None:
            return
        if self._hold_timer and self._hold_timer is not asyncio.current_task():
            await self.cancel_task(self._hold_timer)
        self._hold_timer = None
        held = time.monotonic() - self._held_at
        self._held_start = self._held_stop = None
        self._composing_since = None
        logger.info(f"[turns] {why}: opening the held turn ({held:.2f} s held, caller {'done' if stop else 'still talking'})")
        # Audio arriving while these sends are awaited joins the buffer and goes out after
        # what is already in it, never ahead of activity_start.
        self._releasing = True
        try:
            await super()._handle_user_started_speaking(start)  # activity_start + the buffer
            while self._user_audio_preroll_buffer and self._session and self._ready_for_realtime_input:
                await self._flush_user_audio_preroll()
        except Exception as e:
            await self._handle_send_error(e)
        finally:
            self._releasing = False
        if stop is not None:
            await super()._handle_user_stopped_speaking(stop)
            if self._session and self._ready_for_realtime_input:
                self._composing_since = time.monotonic()

    async def process_frame(self, frame, direction):
        await super().process_frame(frame, direction)
        if self.ROTATE and isinstance(frame, BotStoppedSpeakingFrame) and self._can_rotate():
            self._rotate_task = self.create_task(self._rotate())

    def _can_rotate(self) -> bool:
        pending = set(self._tool_call_id_to_name) - self._completed_tool_calls
        return bool(
            self._vad_disabled and self._session and self._ready_for_realtime_input and self._context
            and self._rotating is None and not self._user_is_speaking and not self._bot_is_responding
            and self._held_start is None and self._grace is None and self._composing_since is None
            and not self._disconnecting and not pending
        )

    async def _rotate(self):
        self._rotating = time.monotonic()
        try:
            await self._disconnect()
            self._session_resumption_handle = None  # a NEW session, not the old one resumed
            await self._connect()  # _create_initial_response seeds it from the context, as text
        except Exception as e:
            logger.error(f"[usage] rotation failed: {e}")
            self._rotating = None

    async def _create_initial_response(self, for_reconnect: bool = False):
        await super()._create_initial_response(for_reconnect)
        if self._rotating is not None and self._ready_for_realtime_input:
            # Tool results already in the context were answered in the old session: not new.
            await self._process_completed_function_calls(send_new_results=False)
            took, self._rotating = time.monotonic() - self._rotating, None
            self.usage["rotations"] = self.usage.get("rotations", 0) + 1
            msgs = self._context.get_messages() if self._context else []
            last = msgs[-1] if msgs else {}
            logger.info(f"[usage] new session seeded with {len(msgs)} messages as text in {took:.2f} s; "
                        f"last: {str(last.get('role') if isinstance(last, dict) else type(last).__name__)} "
                        f"{str(last.get('content') if isinstance(last, dict) else last)[:80]!r}")
            if self._held_start is not None:
                await self._release("the new session is ready")

    async def _handle_server_message(self, message):
        if message.usage_metadata:
            self._note_usage(message.usage_metadata)
        sc = message.server_content
        reply = bool(sc and ((sc.model_turn and sc.model_turn.parts) or (sc.output_transcription and sc.output_transcription.text)))
        ended = bool(message.tool_call or (sc and sc.turn_complete))
        if self._doomed_until and time.monotonic() > self._doomed_until:
            self._doomed_until = 0.0
        # While a cut reply is still arriving, its chunks, interrupted and turn_complete say
        # nothing about the turn now with Gemini: only what comes after it does.
        if (self._composing_since is not None or self._held_start is not None) and not self._doomed_until:
            if reply or ended or (sc and sc.interrupted):
                self._composing_since = None
                if self._held_start is not None:
                    if reply:  # it answers only their first words, and the barge-in below cuts it
                        self._doom_reply()
                    await self._release("Gemini started its reply" if reply else "Gemini is no longer composing")
        if sc and sc.interrupted and not ended:
            # Gemini cut its reply, but chunks already on their way still arrive after the
            # `interrupted`; Pipecat would start them as a new reply. Nobody should hear them.
            self._doom_reply()
        if self._doomed_until:
            if reply:
                # Keep everything else (the caller's transcript, interrupted, turn_complete, usage).
                sc = sc.model_copy(update={"model_turn": None, "output_transcription": None})
                message = message.model_copy(update={"server_content": sc})
            if ended:
                self._doomed_until = 0.0
        await super()._handle_server_message(message)

    async def _handle_interruption(self):
        if self._bot_is_responding:
            # A barge-in on her reply: Gemini's `interrupted` follows within ~15 ms, and the
            # chunks arriving in between would otherwise start the same reply over.
            self._doom_reply()
        await super()._handle_interruption()

    def _doom_reply(self):
        """Drop the reply now arriving until Gemini ends it (turn_complete, or a tool call),
        or for DOOM_SECS at most: a real reply comes ~0.5 s or more after the caller's turn."""
        self._doomed_until = time.monotonic() + self.DOOM_SECS

    async def cleanup(self):
        if self._rotate_task:
            await self.cancel_task(self._rotate_task)
            self._rotate_task = None
        if self._grace:
            await self.cancel_task(self._grace)
            self._grace = None
        if self._hold_timer:
            await self.cancel_task(self._hold_timer)
            self._hold_timer = None
        await super().cleanup()


# ---------------------------------------------------------------------------
# Ending the call, and remembering who asked not to be called again.
#
# None of this is left to the model's judgement: the caller's own words are
# matched with plain patterns, so a request to stop is honoured every time.

SUPPRESSED = HERE / "suppressed.jsonl"


def normalize_number(number) -> str | None:
    """+<digits>, or None for anything that is not a real phone number.

    A softphone test dials sip:maya@..., which has no callee to protect. Telnyx also hands SIP callers over
    without the "sip:" (gencred7ifNMv...@sip.telnyx.com.au, aixelf4a2b32690a7837d@sip.telnyx.com): an
    address with an "@" or letters is never a phone number, whatever digits it holds.
    """
    text = str(number or "").strip().lower().removeprefix("tel:")
    if not text or "@" in text or re.search(r"[a-z]", text):
        return None
    digits = re.sub(r"\D", "", text)
    return "+" + digits if len(digits) >= 7 else None


def is_suppressed(number) -> bool:
    """True if this number has asked not to be called. Every dialer must ask."""
    n = normalize_number(number)
    if not n or not SUPPRESSED.exists():
        return False
    for line in SUPPRESSED.read_text().splitlines():
        try:
            if json.loads(line).get("number") == n:
                return True
        except ValueError:
            continue
    return False


def suppress(number: str, reason: str, quote: str, stream_id: str):
    with SUPPRESSED.open("a") as f:
        f.write(
            json.dumps(
                {
                    "number": number,
                    "reason": reason,
                    "quote": quote[:160],
                    "stream_id": stream_id,
                    "at": time.strftime("%Y-%m-%dT%H:%M:%S"),
                }
            )
            + "\n"
        )


# What ends the call, whatever she says next.
STOP_PATTERNS = [
    (
        "dnc",
        re.compile(
            r"take me off|take (my|this) number off|remove (me|my (number|name)|this number)"
            r"|delete (me|my (number|name)|this number)|do not call"
            r"|don'?t (ever )?(call|contact|phone|ring|text|bother) (me |us |here |this number )?(again|anymore|any more)"
            r"|don'?t (ever )?(call|contact|phone|text) (me|us|here|this number)(?=\s*([.,!?]|$)|\s+ever\b)"
            r"|never (call|contact|phone|text) (me|us|here|this number)"
            r"|stop (calling|contacting|phoning|texting|bothering)"
            r"|no me (llame|llamen|vuelva|vuelvan)|no (llame|llamen) (m[aá]s|otra vez)|(borre|quite|elimine) (mi|el) n[uú]mero"
            r"|number (hata|delete) (do|karo)|call (mat|nahi) kar(o|na)|dobara call mat",
            re.I,
        ),
    ),
    (
        "wrong_number",
        re.compile(
            r"wrong number|not (the|a) (right|correct) number|private residence"
            r"|don'?t (own|run|have) (a |any )?business(?! (card|plan|hours|phone|line))|not a business"
            r"|n[uú]mero equivocado|galat number",
            re.I,
        ),
    ),
    (
        "recording_objection",
        re.compile(
            r"(not|n't) (consent|agree|ok(ay)?|comfortable|happy|allow)\w*.{0,25}record"
            r"|\b(stop|turn off|don'?t|do not|no)\s+(the |this |that |your |any )?record(ing)?\b|object to .{0,15}record"
            r"|record(ing|ed)?.{0,25}(without|not) (my )?(consent|permission)",
            re.I,
        ),
    ),
]
HARD_ABUSE = re.compile(
    r"\bf+u+c+k+\w*|\bshit\w*|\bbullshit|\bbitch\w*|\basshole|\bbastard|\bpiss off|\bgo to hell"
    r"|\bscrew you|\bshut up|\bcunt|\bdamn you|\bmotherf\w+",
    re.I,
)
# An insult aimed at her ("you stupid robot", "you idiot") is as final as a curse;
# the same word about something else ("that's a stupid question") is not.
DIRECTED_ABUSE = re.compile(
    r"\byou( people| guys| lot| all)?('re| are)?\s+(a |an |such a |so |really |just a |nothing but a )?"
    r"(stupid|idiot\w*|moron\w*|useless|dumb|pathetic|worthless|imbecile|scum\w*|liar|joke)\b",
    re.I,
)
SOFT_ABUSE = re.compile(
    r"\b(idiot|stupid|moron|useless|dumb|imbecile|scumbag|garbage|pathetic|loser|jerk)\b", re.I
)
# She says goodbye: the call is over a moment later.
GOODBYE = re.compile(
    r"\b(good ?bye|bye( now| for now)?|take care|have a (good|great|nice|lovely) (one|day|evening|afternoon|night|week|weekend)"
    r"|mind how you go|all the best|stay (safe|well)|talk (then|soon)|enjoy the rest of your \w+"
    r"|i'?ll let you (go|get)|let you get back|leave you to it|i'?ll leave you"
    r"|adi[oó]s|hasta (luego|pronto)|alvida)\b",
    re.I,
)


# The caller's transcript can lose the first word ("Don't call here again" ->
# "call here again"), but she heard the whole thing: when she says she'll pass
# a request on, that counts as a stop request whatever the transcript says.
STOP_ACK = re.compile(
    r"\bpass(ing|ed)? (that |it |this )?(on|along)\b|\bflag (that|it|this)\b|do.?not.?call (list|register)", re.I
)


def plain(text: str) -> str:
    """Typographic quotes to plain ones. gemini-3.8-live writes "I’ll let you go" with a
    curly apostrophe, and every pattern in this file says I'll."""
    return text.replace("\u2019", "'").replace("\u2018", "'").replace("\u201c", '"').replace("\u201d", '"')


def says_goodbye(text: str) -> bool:
    """Does the reply END on a goodbye? A "take care" mid-reply is not one."""
    text = plain(text)
    parts = re.split(r"(?<=[.!?—])\s+", text.strip())
    if not parts or parts[-1].rstrip().endswith("?"):
        return False  # "want me to let you go?" asks; it does not leave
    return bool(GOODBYE.search(parts[-1]))



# ---------------------------------------------------------------------------
# Is anyone there? A voicemail greeting, a carrier message and an automated menu
# are not people, and she must not pitch them.
#
# Three signals, none of which is the word "voicemail" on its own: the first
# question she asks is whether their calls go to voicemail, so a real owner's
# answer ("it goes to voicemail, I call people back in the morning") is full of
# the same vocabulary.
#   1. a phrase only a recording says ("after the tone", "can't come to the
#      phone", "press 1"),
#   2. a long stretch of uninterrupted talking right at pickup, plus a phrase
#      that is merely typical of one (a person says "hello?" and waits),
#   3. the beep that ends a greeting, after the greeting itself.

MACHINE_STRONG = re.compile(
    r"after (the|you hear the) (tone|beep)|at the (tone|beep)|wait for the (tone|beep)|at the sound of"
    r"|record your message|when you('re| are| have) (done|finished) recording|finished recording"
    r"|(can'?t|cannot|unable to|not able to|won'?t be able to) (come|get|make it) to the phone"
    r"|(can'?t|cannot|unable to|not able to) (take|answer|get to) (your|the|this) (call|phone)"
    r"|not (available|able) to (take|answer) (your|the|this) call"
    r"|you('ve| have) reached (the )?(voice ?mail|mailbox|answering (machine|service))"
    r"|voice ?mail (box )?(of|for)\b|mailbox (is|has been) (full|not set up)|not accepting (any )?(messages|calls)"
    r"|the (\w+ )?(person|party|subscriber|customer|number) (you('re| are| have)|that you('re| are)) (trying to reach|called|dialed|dialled)"
    r"|(call|you) (has|have) been forwarded to|automated voice (message|mail)|voice message system|(please )?try (your call )?again later"
    r"|(is|are) (currently )?(not reachable|switched off|out of (the )?(coverage|service))|number you have dialed"
    r"|leave (a|your) (message|name)( and (phone )?number)? (after|at) the"
    r"|buz[oó]n de voz|despu[eé]s del tono|deje su mensaje",
    re.I,
)
# An automated menu or hold message: nobody to talk to, nothing to leave.
IVR_STRONG = re.compile(
    r"press (the )?(pound|star|hash|zero|one|two|three|four|five|six|seven|eight|nine|\d|#|\*)\b"
    r"|for [\w' ,]{3,40}, press|your call is (very )?important to us|please (stay|hold) on the line"
    r"|all (of )?(our )?(agents|representatives|operators|team members) are (busy|assisting|currently)"
    r"|if you know your (party'?s )?extension|dial by name|para espa[nñ]ol|this call (may be|is being) (monitored|recorded)",
    re.I,
)
# Typical of a greeting, but a live person says them too: only counted next to a long monologue.
MACHINE_MEDIUM = {
    "reached": re.compile(r"you('ve| have) reached|thank(s| you) for calling", re.I),
    "away": re.compile(r"not (available|here|in)\b|isn'?t (available|here|in)\b|(away|out) (from|of) (my|the) (phone|desk|office)|unavailable", re.I),
    "message": re.compile(r"leave (me |us )?(a |your )?(brief |short |detailed )?message|your name and (phone )?number|your message", re.I),
    "callback": re.compile(r"get back to you|return your call|call you back|as soon as (i|we) (can|possible)", re.I),
    "voicemail": re.compile(r"voice ?mail|mailbox|answering (machine|service)", re.I),
    "closed": re.compile(r"(we are|we're|office is|currently) (closed|out of the office)|our (office )?hours (are|is)|outside (of )?(our |normal )?(business|office) hours", re.I),
}


class ToneFinder:
    """Finds the beep that ends a voicemail greeting in a stream of 16-bit audio.

    A beep is one steady, loud pure tone for a quarter of a second or more. Speech
    spreads its energy across a fundamental and its harmonics, so no single
    frequency ever holds most of it; a dial tone's two frequencies split it in two.

    It also says what came after, because that is what tells a greeting from a
    truck reversing behind someone who is still talking: a machine goes quiet to
    record you; a person carries on.

    feed() returns the events that happened in this chunk, in order:
      "beep"         the tone has lasted long enough
      "after:quiet"  a second and a half after the tone ended, nobody has made a sound
      "after:active" ...someone did
    """

    HOP = 512  # 32 ms at 16 kHz
    NEED = 8  # steady frames in a row: ~256 ms
    PEAK_SHARE = 0.80  # of the energy in the voice band, held by one frequency
    MIN_RMS = 250.0  # quieter than this is not a tone
    LOUD = 700.0  # louder than this, after the tone, is a person (or a noisy site) carrying on
    WATCH = 1.5  # seconds to watch after the tone
    SETTLE = 3  # frames ignored just after the tone (its tail and the codec's ringing)
    SOUND_FRAMES = 3  # loud frames after that which count as someone carrying on (~100 ms)

    def __init__(self):
        self._buf = np.zeros(0, dtype=np.float32)
        self._run = 0
        self._freq = 0.0
        self._fired = False
        self._left: int | None = None  # frames still to watch after the tone
        self._settle = 0
        self._loud = 0
        self._win = np.hanning(self.HOP).astype(np.float32)

    def feed(self, pcm: bytes, rate: int = 16000) -> list[str]:
        self._buf = np.concatenate([self._buf, np.frombuffer(pcm, dtype=np.int16).astype(np.float32)])
        events: list[str] = []
        while len(self._buf) >= self.HOP:
            frame, self._buf = self._buf[: self.HOP], self._buf[self.HOP :]
            events += self._frame(frame, rate)
        return events

    def _steady(self, x: np.ndarray, rms: float, rate: int) -> bool:
        if rms < self.MIN_RMS:
            return False
        spec = np.abs(np.fft.rfft(x * self._win)) ** 2
        hz = np.fft.rfftfreq(len(x), 1.0 / rate)
        total = float(spec[(hz >= 100) & (hz <= 3800)].sum())
        if total <= 0:
            return False
        peak = int(np.argmax(np.where((hz >= 300) & (hz <= 3200), spec, 0.0)))
        share = float(spec[max(0, peak - 2) : peak + 3].sum()) / total
        f = float(hz[peak])
        if share < self.PEAK_SHARE or (self._run and abs(f - self._freq) > 0.06 * self._freq):
            return False
        self._freq = f
        return True

    def _frame(self, x: np.ndarray, rate: int) -> list[str]:
        rms = float(np.sqrt(np.mean(x * x)))
        events: list[str] = []
        if self._steady(x, rms, rate):
            self._run += 1
            self._left = None
            if self._run >= self.NEED and not self._fired:
                self._fired = True
                events.append("beep")
            return events
        self._run = 0
        if self._fired and self._left is None:  # the tone has just ended
            self._left = int(self.WATCH * rate / self.HOP)
            self._settle, self._loud = self.SETTLE, 0
        if self._left is not None:
            if self._settle > 0:
                self._settle -= 1  # the frame where the tone stopped is half tone: not a sound
            elif rms >= self.LOUD:
                self._loud += 1
            self._left -= 1
            if self._left <= 0:
                events.append("after:active" if self._loud >= self.SOUND_FRAMES else "after:quiet")
                self._left, self._fired = None, False
        return events


class BeepDetector(FrameProcessor):
    """Tells the guard when the caller's line has produced a beep, and what followed it."""

    def __init__(self, guard: "CallGuard", **kwargs):
        super().__init__(**kwargs)
        self._guard = guard
        self._finder = ToneFinder()

    async def process_frame(self, frame: Frame, direction: FrameDirection):
        await super().process_frame(frame, direction)
        if isinstance(frame, InputAudioRawFrame) and self._guard.listening:
            for event in self._finder.feed(frame.audio, frame.sample_rate):
                if event == "beep":
                    self._guard.on_beep()
                else:
                    self._guard.on_beep_after(quiet=event == "after:quiet")
        await self.push_frame(frame, direction)


class CallGuard:
    """What has been said that must end the call, shared by two processors.

    The caller side feeds it their words; the agent side watches for her goodbye
    and hangs up. A stop request, a wrong number, an objection to recording or
    abuse is "forced": the call ends after her next reply whatever she says and
    whatever the caller says next. A plain goodbye can be taken back if the
    caller starts speaking again.
    """

    GOODBYE_GRACE = 2.5  # after her goodbye, time for a "wait..." before the line drops
    FORCED_GRACE = 1.0
    FALLBACK = 10.0  # forced, but she never replied: end anyway

    def __init__(self, record: dict, callee=None):
        self.record = record
        self.callee = normalize_number(callee)
        record["callee"] = self.callee
        self.reason: str | None = None
        self.forced = False
        self.abuse = 0
        self.agent: "GuardAgent | None" = None
        # --- is it a recording? ---
        self.t0 = time.monotonic()
        self._speaking_since: float | None = None
        self._speech_pickup = 0.0  # caller speech inside the first PICKUP seconds
        self._speech_all = 0.0
        self._vm_text = ""
        self._strong: str | None = None
        self._ivr: str | None = None
        self._mediums: set[str] = set()
        self._beep_at: float | None = None
        self._speech_before_beep = 0.0
        self._quiet_after_beep: bool | None = None
        # --- leaving a message ---
        self.vm_mode = False  # she is silent, waiting for the beep
        self.muted = False  # nothing of hers may reach the line (the model, her filler)
        self.beep_quiet = asyncio.Event()  # a beep has ended and the line went quiet: speak now
        self._last_speech_end = 0.0

    @property
    def listening(self) -> bool:
        """The beep detector should keep working: the call is live, or waiting for a beep."""
        return (not self.forced) or self.vm_mode

    def caller_quiet_for(self) -> float:
        return 0.0 if self._speaking_since is not None else self._now() - self._last_speech_end

    VM_WINDOW = 60.0  # a greeting is at the start of the call
    PICKUP = 15.0  # "talks the whole time" means a recording only inside this stretch

    def _now(self) -> float:
        return time.monotonic() - self.t0

    def _speech(self) -> tuple[float, float]:
        """(speech seconds inside the pickup stretch, speech seconds in all), live."""
        pick, allspeech = self._speech_pickup, self._speech_all
        if self._speaking_since is not None:
            a, b = self._speaking_since, self._now()
            allspeech += max(0.0, b - a)
            pick += max(0.0, min(b, self.PICKUP) - min(a, self.PICKUP))
        return pick, allspeech

    def heard_before(self, secs: float):
        """Speech at pickup that was kept from the agent (their "hello") still counts as talking."""
        self._speech_pickup += secs
        self._speech_all += secs

    def on_speech_started(self):
        if self._speaking_since is None:
            self._speaking_since = self._now()

    def on_speech_stopped(self):
        if self._speaking_since is not None:
            a, b = self._speaking_since, self._now()
            self._speaking_since = None
            self._speech_all += max(0.0, b - a)
            self._speech_pickup += max(0.0, min(b, self.PICKUP) - min(a, self.PICKUP))
            self._last_speech_end = b
        self.check_machine()

    def on_beep(self):
        if (self.forced and not self.vm_mode) or (not self.vm_mode and self._now() > self.VM_WINDOW):
            return
        self._beep_at = self._now()
        self._speech_before_beep = self._speech()[1]
        self._quiet_after_beep = None
        logger.info(f"[guard] a beep, after {self._speech_before_beep:.1f}s of the caller talking")

    def on_beep_after(self, quiet: bool):
        """What the line did in the second and a half after the beep."""
        if self._beep_at is None:
            return
        self._quiet_after_beep = quiet
        if quiet:
            self.beep_quiet.set()
        self.check_machine()

    def check_machine(self):
        """Decide whether the other end is a recording. Called on every new fact and once a second."""
        if self.forced or self._now() > self.VM_WINDOW:
            return
        pickup, _ = self._speech()
        kind, why = "voicemail", None
        if self._ivr:
            kind, why = "ivr", self._ivr
        elif self._strong:
            why = self._strong
        elif pickup >= 11:
            why = f"{pickup:.0f}s of talking straight after pickup"
        elif pickup >= 8 and self._mediums:
            why = f"{pickup:.0f}s of talking after pickup, and a greeting's wording ({'/'.join(sorted(self._mediums))})"
        elif self._quiet_after_beep and self._speech_before_beep >= 2:
            why = "a beep after a greeting, then the line went quiet"
        if why:
            self.trigger_machine(kind, why)

    def trigger_machine(self, kind: str, why: str):
        self.forced = True
        self.reason = kind
        self.record.setdefault("flags", []).append({"flag": kind, "quote": why[:160]})
        if kind == "voicemail" and self.agent and self.agent.can_leave_message():
            self.vm_mode = True
            logger.info(f"[guard] voicemail ({why[:90]!r}): going quiet, waiting for the beep to leave a message")
            self.agent.begin_voicemail()
        else:
            logger.info(f"[guard] {kind}: a recording, not a person -- hanging up now ({why[:90]!r})")
            if self.agent:
                self.agent.hang_up_now(kind)

    def _look_for_machine(self, text: str):
        """Fold one more piece of the caller's transcript into the evidence."""
        self._vm_text = (self._vm_text + " " + text)[-600:]
        if IVR_STRONG.search(self._vm_text) and not self._ivr:
            self._ivr = text[:120]
        if MACHINE_STRONG.search(self._vm_text) and not self._strong:
            self._strong = text[:120]
        if self._now() <= 30:
            for name, rx in MACHINE_MEDIUM.items():
                if rx.search(text):
                    self._mediums.add(name)
        self.check_machine()

    def on_caller_text(self, text: str):
        text = plain(text.strip())
        if not text or self.forced:
            return
        for flag, rx in STOP_PATTERNS:
            if rx.search(text):
                self.trigger(flag, text)
                return
        self._look_for_machine(text)
        if self.forced:
            return
        score = (2 if (HARD_ABUSE.search(text) or DIRECTED_ABUSE.search(text)) else 0) + (1 if SOFT_ABUSE.search(text) else 0)
        if score:
            self.abuse += score
            if self.abuse >= 2:
                self.trigger("abuse", text)

    def final_scan(self):
        """Last look at everything the caller said, when the call is over.

        Catches a stop request whose transcript arrived too late to end the
        call itself, so the number is protected even then.
        """
        if self.forced or not self.callee or is_suppressed(self.callee):
            return
        for turn in self.record["turns"]:
            if turn["who"] != "caller":
                continue
            for flag, rx in STOP_PATTERNS:
                if flag in ("dnc", "wrong_number") and rx.search(plain(turn["text"])):
                    self.record.setdefault("flags", []).append({"flag": flag, "quote": turn["text"][:160]})
                    suppress(self.callee, flag, turn["text"], self.record["stream_id"])
                    logger.info(f"[guard] final scan: {self.callee} added to {SUPPRESSED.name} ({flag})")
                    return

    def trigger(self, reason: str, quote: str):
        self.forced = True
        self.reason = reason
        self.record.setdefault("flags", []).append({"flag": reason, "quote": quote[:160]})
        logger.info(f"[guard] {reason}: ending the call after her next reply -- {quote[:80]!r}")
        if reason in ("dnc", "wrong_number"):
            if self.callee:
                suppress(self.callee, reason, quote, self.record["stream_id"])
                logger.info(f"[guard] {self.callee} added to {SUPPRESSED.name}")
            else:
                logger.warning("[guard] no callee number on this call, nothing to suppress")
        if self.agent:
            self.agent.note_trigger()


class GuardAgent(FrameProcessor):
    """Hangs up: after her goodbye, or after the reply that follows a forced reason.

    Pushing EndWorkerFrame downstream lets everything queued ahead of it, her
    goodbye included, play out before the line drops.
    """

    VM_WAIT = 35.0  # longest wait for the beep once a greeting is recognised
    VM_SILENT = 6.0  # a greeting is followed by its beep within seconds; this much quiet and there is none

    def __init__(self, guard: CallGuard, voice: str | None = None, gemini_key: str | None = None,
                 message: str | None = VOICEMAIL_TEXT, **kwargs):
        super().__init__(**kwargs)
        self._guard = guard
        self._voice = voice  # None: this pipeline cannot leave a message (the browser test page)
        self._gemini_key = gemini_key  # makes the message clip if this voice has none yet; None = ours
        # What to say after the beep: ours on Ashish's line; a customer agent's own (its voicemail
        # setting, product.voicemail_message), or None = hang up without one.
        self._message = message
        guard.agent = self
        self._reply = ""
        self._speaking = False
        self._spoke_since_trigger = False
        self._pending: asyncio.Task | None = None
        self._ended = False
        self._watch: asyncio.Task | None = None

    def _cancel_pending(self):
        if self._pending:
            self._pending.cancel()
            self._pending = None

    def _arm(self, secs: float, why: str):
        self._cancel_pending()
        self._pending = self.create_task(self._end_after(secs, why))

    async def _end_after(self, secs: float, why: str):
        try:
            await asyncio.sleep(secs)
        except asyncio.CancelledError:
            return
        await self._end(why)

    async def _end(self, why: str):
        if self._ended:
            return
        self._ended = True
        self._guard.final_scan()
        reason = self._guard.reason or "goodbye"
        self._guard.record["ended_by"] = reason
        logger.info(f"[guard] hanging up ({reason}): {why}")
        await self.push_frame(EndWorkerFrame(reason=reason))

    # Everything the model might still say while she waits: none of it may reach a voicemail.
    _MUTED = (
        TTSStartedFrame, TTSAudioRawFrame, OutputAudioRawFrame, TTSTextFrame, LLMTextFrame,
        LLMFullResponseStartFrame, LLMFullResponseEndFrame, TTSStoppedFrame,
    )

    def can_leave_message(self) -> bool:
        return self._voice is not None and bool(self._message)

    def begin_voicemail(self):
        """A greeting is playing: go quiet, wait for its beep, then leave the message."""
        self._guard.muted = True
        self._guard._last_speech_end = self._guard._now()
        self._cancel_pending()
        self.create_task(self._leave_message())

    async def _leave_message(self):
        g = self._guard
        # Made now, ready by the beep (a customer's message is made per call: ~2-5 s).
        clip = asyncio.create_task(asyncio.to_thread(get_voicemail, self._voice, self._gemini_key, self._message))
        try:
            await self.push_interruption_task_frame_and_wait()  # her half-said opener stops here
        except Exception as e:
            logger.warning(f"[guard] could not interrupt her opener: {e}")
        waited, gave_up = 0.0, None
        while not g.beep_quiet.is_set():
            if waited >= self.VM_WAIT:
                gave_up = f"no beep in {self.VM_WAIT:.0f}s"
            elif g._beep_at is None and g.caller_quiet_for() >= self.VM_SILENT:
                gave_up = f"{self.VM_SILENT:.0f}s of quiet and no beep"
            if gave_up:
                g.record.setdefault("flags", []).append({"flag": "voicemail_no_message", "quote": gave_up})
                logger.info(f"[guard] voicemail: {gave_up}, hanging up without leaving a message")
                await self._cancel_call("voicemail")
                return
            await asyncio.sleep(0.25)
            waited += 0.25
        pcm = await clip
        if not pcm:
            g.record.setdefault("flags", []).append({"flag": "voicemail_no_message", "quote": "message clip missing"})
            await self._cancel_call("voicemail")
            return
        secs = len(pcm) / 2 / 24000
        g.record["ended_by"] = "voicemail_message"
        g.record["voicemail_message"] = self._message
        g.record.setdefault("flags", []).append({"flag": "voicemail_message_left", "quote": f"{secs:.1f}s message"})
        logger.info(f"[guard] beep heard, leaving the {secs:.1f}s message")
        self._ended = True
        await self.push_frame(OutputAudioRawFrame(audio=pcm, sample_rate=24000, num_channels=1))
        await asyncio.sleep(secs + 1.5)  # let the last word reach the recording before the line drops
        await self.push_frame(EndWorkerFrame(reason="voicemail_message"))

    def hang_up_now(self, reason: str):
        """A recording needs no goodbye: drop the line and her half-played greeting with it."""
        self._cancel_pending()
        self.create_task(self._cancel_call(reason))

    async def _cancel_call(self, reason: str):
        if self._ended:
            return
        self._ended = True
        self._guard.record["ended_by"] = reason
        logger.info(f"[guard] hanging up ({reason}) at once")
        # Cancel, not End: End would let whatever she had queued finish playing first.
        await self.push_frame(CancelWorkerFrame(reason=reason), FrameDirection.UPSTREAM)

    async def _tick(self):
        """Once a second for the first minute: a long monologue needs no new event to be noticed."""
        try:
            for _ in range(int(CallGuard.VM_WINDOW * 2) + 4):
                await asyncio.sleep(0.5)
                if self._ended or self._guard.forced:
                    return
                self._guard.check_machine()
        except asyncio.CancelledError:
            return

    def note_trigger(self):
        # If she is mid-reply, that reply is the last one; otherwise wait for the next.
        self._spoke_since_trigger = self._speaking
        self._arm(CallGuard.FALLBACK, "no reply in time")

    def _check_goodbye(self):
        g = self._guard
        if not g.forced and says_goodbye(self._reply):
            g.reason = "goodbye"

    async def process_frame(self, frame: Frame, direction: FrameDirection):
        await super().process_frame(frame, direction)
        g = self._guard
        if self._watch is None:
            self._watch = self.create_task(self._tick())
        if g.muted and direction == FrameDirection.DOWNSTREAM and isinstance(frame, self._MUTED):
            return
        if g.vm_mode:
            # Waiting for a beep, or leaving the message: the usual "her reply ended,
            # hang up" bookkeeping must stay out of the way.
            await self.push_frame(frame, direction)
            return

        if isinstance(frame, UserStartedSpeakingFrame):
            if not g.forced:
                # They are still talking, so her goodbye was not final.
                self._cancel_pending()
                g.reason = None
        elif isinstance(frame, LLMFullResponseStartFrame):
            self._reply = ""
        elif isinstance(frame, TTSTextFrame) and frame.text.strip():
            self._reply += " " + plain(frame.text.strip())
        elif isinstance(frame, LLMFullResponseEndFrame):
            if not g.forced and STOP_ACK.search(self._reply):
                g.trigger("dnc", "(her own reply) " + self._reply.strip()[:120])
            self._check_goodbye()
        elif isinstance(frame, BotStartedSpeakingFrame):
            self._speaking = True
            if g.forced:
                self._spoke_since_trigger = True
                self._cancel_pending()  # let her finish; the grace restarts when she stops
        elif isinstance(frame, BotStoppedSpeakingFrame):
            self._speaking = False
            self._check_goodbye()
            if g.forced and self._spoke_since_trigger:
                self._arm(CallGuard.FORCED_GRACE, "forced reason, reply finished")
            elif g.reason == "goodbye":
                self._arm(CallGuard.GOODBYE_GRACE, "she said goodbye")

        await self.push_frame(frame, direction)


def write_call_record(record: dict, state: dict):
    """Save one call: what was said, and how fast each reply came."""
    gaps = state.get("gaps", [])
    record["gaps_ms"] = gaps
    if gaps:
        ordered = sorted(gaps)
        record["median_gap_ms"] = ordered[len(ordered) // 2]
        record["worst_gap_ms"] = ordered[-1]
    record["ended_at"] = time.strftime("%Y-%m-%dT%H:%M:%S")
    record.setdefault("ended_by", "caller_hung_up")

    calls_dir = HERE / "calls"
    calls_dir.mkdir(exist_ok=True)
    path = calls_dir / f"{record['stream_id']}.json"
    path.write_text(json.dumps(record, indent=1))
    logger.info(f"call record written to {path}")


# Browser test page only; the phone line has its own (louder-caller) settings in phone.py.
TURN_SETTINGS = {"vad_stop": 0.2, "turn_stop": 0.5}


def build_services(record: dict, guard: "CallGuard | None" = None):
    """Return (processors between input and output, context, aggregator pair).

    `record` is the call being logged: the caller's words are caught before the model
    (Gemini sends them upstream), the agent's after it.
    """
    from pipecat.services.google.gemini_live.llm import GeminiLiveLLMService

    context = LLMContext()
    user_params = LLMUserAggregatorParams(
        vad_analyzer=SileroVADAnalyzer(params=VADParams(stop_secs=TURN_SETTINGS["vad_stop"])),
        user_turn_strategies=UserTurnStrategies(
            start=[VADUserTurnStartStrategy()],
            stop=[
                TurnAnalyzerUserTurnStopStrategy(
                    turn_analyzer=LocalSmartTurnAnalyzerV3(
                        params=SmartTurnParams(stop_secs=TURN_SETTINGS["turn_stop"])
                    )
                )
            ],
        ),
    )
    llm = GeminiLiveLLMService(
        api_key=os.environ["GEMINI_API_KEY"],
        model=os.getenv("GEMINI_LIVE_MODEL", GEMINI_LIVE_MODEL_DEFAULT),
        voice_id="Aoede",
        system_instruction=load_prompt(),
        user_audio_preroll_secs=0.6,
    )
    pair = LLMContextAggregatorPair(context, realtime_service_mode=True, user_params=user_params)
    return [
        pair.user(),
        CallLog(record, guard=guard, name="log_caller"),
        llm,
        TalkOverGate(name="gate"),
        CallLog(record, name="log_agent"),
        GuardAgent(guard, name="guard_out"),
    ], context, pair


def make_app() -> FastAPI:
    app = FastAPI()
    page = (HERE / "index.html").read_text()

    @app.get("/a")
    async def page_a(request: Request, key: str | None = None):
        if not key_ok(key, request.headers, request.client.host if request.client else None):
            return Response(status_code=403)
        return HTMLResponse(page.replace("__TOKEN__", make_token("web")))

    @app.websocket("/ws")
    async def ws_endpoint(websocket: WebSocket, t: str | None = None):
        if not token_ok(t, ("web",), websocket.headers, websocket.client.host if websocket.client else None):
            await websocket.close(code=1008)
            return
        stack = "a"
        await websocket.accept()
        logger.info("browser connected")

        transport = FastAPIWebsocketTransport(
            websocket=websocket,
            params=FastAPIWebsocketParams(
                audio_in_enabled=True,
                audio_out_enabled=True,
                audio_in_sample_rate=SAMPLE_RATE_IN,
                audio_out_sample_rate=SAMPLE_RATE_OUT,
                add_wav_header=False,
                serializer=RawPCMSerializer(),
            ),
        )

        state: dict = {}
        record = {
            "stream_id": str(uuid.uuid4()),
            "call_control_id": f"browser:{stack}",
            "started_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
            "stack": stack,
            "turns": [],
        }
        guard = CallGuard(record)  # a browser test has no callee number to protect
        middle, context, pair = build_services(record, guard)
        pipeline = Pipeline(
            [
                transport.input(),
                TurnTimer(state, stack, name="timer_in"),
                *middle,
                TurnTimer(state, stack, name="timer_out"),
                transport.output(),
                pair.assistant(),
            ]
        )

        worker = PipelineWorker(
            pipeline, params=PipelineParams(enable_metrics=True, enable_usage_metrics=True)
        )
        runner = WorkerRunner(handle_sigint=False)
        await runner.add_workers(worker)

        @transport.event_handler("on_client_connected")
        async def on_connected(transport, client):
            context.add_message(
                {"role": "user", "content": "Start the call with your opening line."}
            )
            await worker.queue_frames([LLMRunFrame()])

        finished = False

        def finish():
            # Once, however the session ended: the caller leaving and us hanging
            # up take different routes, and only the first reports a disconnect.
            nonlocal finished
            if finished:
                return
            finished = True
            guard.final_scan()
            gaps = sorted(state.get("gaps", []))
            if gaps:
                logger.info(
                    f"[{stack}] {len(gaps)} turns, median {gaps[len(gaps) // 2]} ms, "
                    f"worst {gaps[-1]} ms"
                )
            write_call_record(record, state)

        @transport.event_handler("on_client_disconnected")
        async def on_disconnected(transport, client):
            finish()
            await runner.cancel()

        try:
            await runner.run()
        finally:
            finish()

    return app


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=7860)
    args = parser.parse_args()

    uvicorn.run(make_app(), host="127.0.0.1", port=args.port, log_level="warning")
