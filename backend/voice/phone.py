"""Phone round of the trial: Stack A (Gemini Live) over a real Telnyx call.

    .venv/bin/python phone.py                  # serve, and wait for calls
    .venv/bin/python phone.py --call +1347...  # dial that number (the server takes the call)

A call that comes IN: Telnyx fetches /texml, then streams 8 kHz mu-law audio to
/telnyx. A call WE place (dial) opens that same stream before the phone starts
ringing, so the agent is connected and her opening line is already made by the
time someone picks up; Telnyx tells /telnyx-events the moment they do.

The voice agents product (product.py) runs on the same line: a customer's own
number reaches /texml and /telnyx-events with `?n=<numberId>&sig=...` instead of
the key, the app places calls through POST /calls, and the browser playground
talks to an agent over /play. A customer's VoiceLink number (Indian numbers,
voicelink.py) streams to /voicelink once a call is answered and reports to
/voicelink-events; the same serve() runs the call. A customer's Twilio number
(twilio.py) fetches /twiml and streams to /twilio; calls placed from it report to
/twilio-events.
"""

import argparse
import asyncio
import json
import re
import os
import signal
import sys
import time
import uuid
from urllib.parse import parse_qsl, quote

import aiohttp
import numpy as np
import uvicorn
from fastapi import FastAPI, Request, Response, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse
from starlette.websockets import WebSocketState
from loguru import logger

import product  # before bot: it keeps the Mongo settings the process was started with (see there)
import campaigns
import tools
import twilio
import voicelink
from bot import (  # one source of truth
    GEMINI_LIVE_MODEL_DEFAULT,
    RawPCMSerializer,
    BeepDetector,
    CallGuard,
    CallLog,
    GuardAgent,
    TalkOverGate,
    TurnSafeGeminiLive,
    TurnTimer,
    VOICELAB_KEY,
    is_local,
    is_suppressed,
    key_ok,
    make_token,
    token_ok,
    load_prompt,
    make_app as make_browser_app,
    normalize_number,
    write_call_record,
)
from fillers import VOICEMAIL_TEXT, get_filler, get_voicemail

from pipecat.audio.turn.smart_turn.base_smart_turn import SmartTurnParams
from pipecat.audio.turn.smart_turn.local_smart_turn_v3 import LocalSmartTurnAnalyzerV3
from pipecat.audio.vad.silero import SileroVADAnalyzer
from pipecat.audio.vad.vad_analyzer import VADParams
from pipecat.frames.frames import (
    BotStartedSpeakingFrame,
    BotStoppedSpeakingFrame,
    CancelFrame,
    EndFrame,
    Frame,
    InputAudioRawFrame,
    InterruptionFrame,
    LLMFullResponseEndFrame,
    LLMFullResponseStartFrame,
    LLMRunFrame,
    OutputAudioRawFrame,
    OutputTransportMessageUrgentFrame,
    SystemFrame,
    TranscriptionFrame,
    TTSTextFrame,
    UserStartedSpeakingFrame,
    UserStoppedSpeakingFrame,
)
from pipecat.processors.frame_processor import FrameDirection, FrameProcessor
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.worker import PipelineParams, PipelineWorker
from pipecat.processors.aggregators.llm_context import LLMContext
from pipecat.processors.aggregators.llm_response_universal import (
    LLMContextAggregatorPair,
    LLMUserAggregatorParams,
)
from pipecat.serializers.telnyx import TelnyxFrameSerializer
from pipecat.services.google.gemini_live.llm import GeminiLiveLLMService, GeminiVADParams
from pipecat.transports.websocket.fastapi import (
    FastAPIWebsocketParams,
    FastAPIWebsocketTransport,
)
from pipecat.turns.user_start import VADUserTurnStartStrategy
from pipecat.turns.user_stop import TurnAnalyzerUserTurnStopStrategy
from pipecat.turns.user_turn_strategies import UserTurnStrategies
from pipecat.workers.runner import WorkerRunner

# Where carriers reach this server: a host, optionally with the path prefix the proxy strips
# ("api.aixellabs.in/voice" behind Caddy's /voice/* route, set by the service's unit). Every URL handed
# out is wss://<PUBLIC_HOST>/... or https://<PUBLIC_HOST>/..., and Twilio's signature is checked against it.
# Unset (a test instance): "localhost", which the tests rewrite to the instance's own port.
PUBLIC_HOST = os.getenv("PUBLIC_HOST", "localhost").strip("/")
# Calls running at once on this box; one more is refused rather than made worse for everyone.
MAX_CALLS = int(os.getenv("MAX_CALLS", "8"))
ACTIVE: set[str] = set()
# SIGTERM (systemd stopping this slot: a deploy, once Caddy already sends everything new to the other
# slot) starts a drain instead of uvicorn's stop, which would close every WebSocket, calls included, at
# once. From then on no new call is taken (each way in refuses with code "draining", /health is 503),
# every running call goes on to its end, and the process exits when nothing is left (busy()), at most
# TimeoutStopSec later (backend/deploy/aixel-labs-voice@.service).
DRAIN = {"since": None}
# This process's port, and the ports of its service's slots (deploy.sh runs two during a deploy). A carrier
# event about a call the other slot holds (Telnyx's pickup for a call it dialled before the switch) is handed to it.
PORT: int | None = None
SLOT_PORTS = [int(p) for p in os.getenv("SLOT_PORTS", "").split() if p.isdigit()]
FORWARDED = "x-voice-forwarded"
# Calls we placed that are still ringing, by Telnyx call id: the webhook finds the
# stream here and tells it the phone was picked up (or never was).
LINES: dict[str, dict] = {}
# Lines made ready while /texml is being answered, by the token in their stream URL:
# the caller still hears ringing, and the stream Telnyx opens next finds its line here.
PREPARED: dict[str, dict] = {}
# Telnyx gives up after this long; ours is the same wait plus slack for its webhook.
RING_SECS = 30
# Her opening line is made while the phone rings and kept back until pickup, so
# it is heard with no wait on the model. An unanswered dial then
# still costs one short reply (nothing on the free tier, about $0.004 on a paid key).
OPENER_WHILE_RINGING = True
GEMINI_SAMPLE_RATE_IN = 16000
GEMINI_SAMPLE_RATE_OUT = 24000

VAD_STOP = 0.2
# Smart Turn's ceiling on silence it thinks is a mid-sentence pause. 0.8, tested
# on three replays of a real call (call3.wav, caller channel) against 0.5: the
# caller's speech was chopped into 12-13 pieces instead of 15, mid-sentence
# restarts fell from 7 to 2, silence from last word to her first sound was
# 1009 ms against 1008 ms, and she talked over nobody in either. Do not go to
# 1.0 without TalkOverGate: there a reply to the first half of a sentence
# survived the caller resuming and ran over them for up to 6.8 s.
TURN_STOP = 0.8

# A phone caller arrives far quieter than a laptop microphone: in the first
# recorded call the caller peaked at 4302 against the agent's 12664, and short
# confirmations ("yeah", "okay") never cleared the gates at all. These three
# open the door wide enough for them.
VAD_MIN_VOLUME = 0.3  # 0.6 rejected everything; 0.15 was set for an unusually quiet caller
VAD_CONFIDENCE = 0.5  # was 0.7
VAD_START = 0.1  # was 0.2, longer than a one-word answer

# Audio models spend output tokens on audio, at roughly 25 a second, so the 256
# that reads like a generous cap for text bought 7.3 seconds of speech and cut
# her off mid-word every time a reply ran long. Her brevity comes from the
# prompt; this is only a runaway guard.
MAX_OUTPUT_TOKENS = 2048

# Google's 30 prebuilt voices, with the character Google gives each one. Dial
# any of these as the SIP user -- sip:sulafat@... -- to hear it on a real call.
VOICES = {
    "zephyr": "Bright", "puck": "Upbeat", "charon": "Informative",
    "kore": "Firm", "fenrir": "Excitable", "leda": "Youthful",
    "orus": "Firm", "aoede": "Breezy", "callirrhoe": "Easy-going",
    "autonoe": "Bright", "enceladus": "Breathy", "iapetus": "Clear",
    "umbriel": "Easy-going", "algieba": "Smooth", "despina": "Smooth",
    "erinome": "Clear", "algenib": "Gravelly", "rasalgethi": "Informative",
    "laomedeia": "Upbeat", "achernar": "Soft", "alnilam": "Firm",
    "schedar": "Even", "gacrux": "Mature", "pulcherrima": "Forward",
    "achird": "Friendly", "zubenelgenubi": "Casual", "vindemiatrix": "Gentle",
    "sadachbia": "Lively", "sadaltager": "Knowledgeable", "sulafat": "Warm",
}
DEFAULT_VOICE = "aoede"


def voice_from_called_party(to: str | None) -> str:
    """Pick the voice from whatever was dialled: sip:sulafat@host -> Sulafat."""
    if not to:
        return DEFAULT_VOICE
    user = to.split("@")[0].split(":")[-1].strip().lower()
    return user if user in VOICES else DEFAULT_VOICE


def stream_parts(voice: str, callee: str | None, inbound: bool, ring: bool, number_id: str | None,
                 agent_id: str | None = None) -> tuple:
    """What a media stream's token signs: everything in its URL that decides how the call runs."""
    return ((voice, callee or "", "1" if inbound else "0") + (("ring",) if ring else ())
            + (("n", number_id) if number_id else ()) + (("a", agent_id) if agent_id else ()))


def stream_url(voice: str, callee: str | None, number_id: str | None = None, agent_id: str | None = None) -> str:
    """Where a call we place sends its audio. `ring` makes the agent wait for pickup;
    `n` says it is a customer's number, `a` which of their agents makes the call."""
    callee = callee or ""
    n = f"&n={number_id}" if number_id else ""
    a = f"&a={agent_id}" if agent_id else ""
    return (
        f"wss://{PUBLIC_HOST}/telnyx?voice={voice}&callee={quote(callee)}&ring=1{n}{a}"
        f"&t={make_token(*stream_parts(voice, callee, False, True, number_id, agent_id))}"
    )


def texml_for(voice: str, callee: str | None = None, inbound: bool = False, token: str | None = None,
              number_id: str | None = None) -> str:
    # The callee rides along so the stream knows whose number to protect if they
    # ask not to be called again. "&" must be escaped inside an XML attribute.
    callee_q = f"&amp;callee={quote(callee)}" if callee else ""
    if inbound:
        callee_q += "&amp;inbound=1"
    if number_id:
        callee_q += f"&amp;n={number_id}"
    # Only a URL handed out here is accepted by the media websocket.
    callee_q += f"&amp;t={token or make_token(*stream_parts(voice, callee, inbound, False, number_id))}"
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="wss://{PUBLIC_HOST}/telnyx?voice={voice}{callee_q}" bidirectionalMode="rtp" bidirectionalCodec="PCMU" />
  </Connect>
  <Pause length="40"/>
</Response>
"""


class LateSocket:
    """Stands in for the caller's websocket until Telnyx has opened it.

    Telnyx opens the audio stream only after it has our TeXML, and answers the
    call as it does. So the line is built around this stand-in while the caller
    still hears ringing, and the real socket is slotted in when it arrives.
    """

    def __init__(self):
        self._ws: WebSocket | None = None
        self._here = asyncio.Event()

    def attach(self, ws: "WebSocket | None"):
        """Give it the real socket, or None if the caller never arrived."""
        self._ws = ws
        self._here.set()

    @property
    def client_state(self):
        return self._ws.client_state if self._ws else (WebSocketState.DISCONNECTED if self._here.is_set() else WebSocketState.CONNECTED)

    @property
    def application_state(self):
        return self._ws.application_state if self._ws else self.client_state

    async def receive(self):
        await self._here.wait()
        return await self._ws.receive() if self._ws else {"type": "websocket.disconnect", "code": 1006}

    async def send_text(self, data):
        if self._ws:
            await self._ws.send_text(data)

    async def send_bytes(self, data):
        if self._ws:
            await self._ws.send_bytes(data)

    async def close(self, *args, **kwargs):
        if self._ws:
            await self._ws.close(*args, **kwargs)


class RingGate(FrameProcessor):
    """Silences the line for the agent until someone has picked up AND said hello.

    A call we place is connected to her before the phone rings, and the line is
    not quiet meanwhile: ringback tone, a carrier announcement. None of that is
    the person, and it must not be heard as their first words or counted as a
    voicemail greeting. Silence is sent instead of nothing because the model
    reads a stream that stops as a fault.

    After pickup she still waits: a person answers with "hello?", and a caller
    who starts talking before that sounds like a machine. `go` is set when their
    greeting has ended -- or when there plainly isn't one. The greeting itself
    is kept from the model too, so her opening line is not answered twice.
    """

    HELLO_GAP = 0.35  # quiet after their greeting before she speaks
    NO_HELLO = 3.0  # nobody said anything: she starts
    NOT_A_HELLO = 2.5  # talking this long without a breath is a recording, not a greeting

    def __init__(self, pickup: asyncio.Event, **kwargs):
        super().__init__(**kwargs)
        self._pickup = pickup
        self.go = asyncio.Event()
        self.heard = 0.0  # seconds of their greeting that were kept from the agent
        self._since: float | None = None
        self._floor = 150.0  # line noise, tracked while they are not speaking
        self._speech = self._quiet = 0.0

    async def process_frame(self, frame: Frame, direction: FrameDirection):
        await super().process_frame(frame, direction)
        if isinstance(frame, InputAudioRawFrame) and not self.go.is_set():
            if self._pickup.is_set():
                self._listen(frame)
            if not self.go.is_set():
                frame.audio = bytes(len(frame.audio))
        await self.push_frame(frame, direction)

    def _listen(self, frame: InputAudioRawFrame):
        now = time.monotonic()
        if self._since is None:
            self._since = now
        secs = len(frame.audio) / 2 / frame.sample_rate
        samples = np.frombuffer(frame.audio, dtype=np.int16).astype(np.float32)
        level = float(np.sqrt(np.mean(samples**2))) if samples.size else 0.0
        if level > max(400.0, 4 * self._floor):
            self._speech += secs
            self._quiet = 0.0
        else:
            self._quiet += secs
            self._floor = 0.95 * self._floor + 0.05 * level
        said_hello = self._speech >= 0.12 and self._quiet >= self.HELLO_GAP
        nothing = self._speech < 0.12 and now - self._since >= self.NO_HELLO
        if said_hello or nothing or self._speech >= self.NOT_A_HELLO:
            self.heard = self._speech
            why = "they said hello" if said_hello else "nobody spoke" if nothing else "they kept talking"
            logger.info(f"{why} ({self._speech:.1f}s of speech, {now - self._since:.1f}s after pickup): her turn")
            self.go.set()


class Hold(FrameProcessor):
    """Keeps what she says off the line until someone has picked up.

    Her opening line is generated while the phone rings. It waits here, and
    goes out the moment the call is answered.
    """

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self._held: list[Frame] | None = []  # None once the line is open
        self.has_sound = asyncio.Event()  # her first words exist

    async def process_frame(self, frame: Frame, direction: FrameDirection):
        await super().process_frame(frame, direction)
        if self._held is not None and direction == FrameDirection.DOWNSTREAM and not isinstance(frame, SystemFrame):
            self._held.append(frame)
            if isinstance(frame, OutputAudioRawFrame):
                self.has_sound.set()
            return
        await self.push_frame(frame, direction)

    async def release(self, first: list[Frame]):
        """Open the line: `first` goes out, then everything held, in order."""
        if self._held is None:
            return
        self._held[:0] = first
        # Popped one at a time: anything she says meanwhile joins the back of the queue.
        while self._held:
            await self.push_frame(self._held.pop(0), FrameDirection.DOWNSTREAM)
        self._held = None


class ThinkingCue(FrameProcessor):
    """Makes a small noise when the model is taking its time.

    Silence after a question is indistinguishable from a dropped call, so the
    caller says "hello?" -- which is an interruption, which discards the reply
    that was seconds from arriving. That loop cost twenty seconds of one real
    call. A short "mm" in the agent's own voice tells them the line is alive.

    It sits after the turn timer on purpose: the filler is not the agent's
    answer, and must not be counted as one.
    """

    # 1.2s fired on ordinary turns whose answer was 100ms behind it, so the
    # caller heard the cue and then the reply. Healthy turns land under 1.3s;
    # this waits past all of them and speaks only when something is wrong.
    def __init__(self, voice: str, after_secs: float = 1.8, guard: "CallGuard | None" = None,
                 gemini_key: str | None = None, **kwargs):
        super().__init__(**kwargs)
        self._voice = voice
        self._gemini_key = gemini_key  # makes the clip if this voice has none yet (None = ours, Ashish's line)
        self._guard = guard  # a muted agent (waiting out a voicemail greeting) must not "mm" into it
        self._after = after_secs
        self._pcm: bytes | None = None
        self._task: asyncio.Task | None = None
        self._replying = False
        # Fed by the output transport, which sends these upstream. Her audio
        # can all pass this processor in a burst long before it has finished
        # playing, so "has audio gone by" cannot tell us if she is mid-reply.
        self._bot_speaking = False

    async def _cancel(self):
        if self._task:
            self._task.cancel()
            self._task = None

    async def _wait_then_fill(self):
        try:
            await asyncio.sleep(self._after)
        except asyncio.CancelledError:
            return
        if self._pcm is None or self._bot_speaking or (self._guard and self._guard.muted):
            return
        logger.info(f"[{self._voice}] filling {self._after}s of silence")
        await self.push_frame(
            OutputAudioRawFrame(
                audio=self._pcm, sample_rate=GEMINI_SAMPLE_RATE_OUT, num_channels=1
            ),
            FrameDirection.DOWNSTREAM,
        )

    async def process_frame(self, frame: Frame, direction: FrameDirection):
        await super().process_frame(frame, direction)

        if isinstance(frame, UserStartedSpeakingFrame):
            # They are talking, so nothing is owed and anything pending is moot.
            self._replying = False
            await self._cancel()
        elif isinstance(frame, BotStartedSpeakingFrame):
            self._bot_speaking = True
            self._replying = False
            await self._cancel()
        elif isinstance(frame, BotStoppedSpeakingFrame):
            self._bot_speaking = False
        elif isinstance(frame, UserStoppedSpeakingFrame):
            await self._cancel()
            # A caller's sentence can be split by a pause, so a second "stopped"
            # may arrive while she is already answering the first half. Her
            # reply is underway; there is nothing to wait on or fill.
            self._replying = not self._bot_speaking
            if self._replying:
                if self._pcm is None:
                    self._pcm = await asyncio.to_thread(get_filler, self._voice, self._gemini_key)
                self._task = self.create_task(self._wait_then_fill())
        elif isinstance(frame, OutputAudioRawFrame) and self._replying:
            # The real answer has started; no cue needed.
            self._replying = False
            await self._cancel()

        await self.push_frame(frame, direction)


async def telnyx_post(path: str, body: dict, api_key: str | None = None) -> tuple[int, str]:
    """POST to the Telnyx API with our key, or a customer's. TELNYX_API_BASE points tests at a fake."""
    async with aiohttp.ClientSession() as session:
        async with session.post(
            product.TELNYX_API_BASE + path,
            json=body,
            headers={"Authorization": f"Bearer {api_key or os.environ['TELNYX_API_KEY']}"},
            timeout=aiohttp.ClientTimeout(total=15),
        ) as r:
            return r.status, await r.text()


async def start_recording(call_control_id: str, api_key: str | None = None):
    """Record both legs separately, so we can hear what each side actually got.

    Channel one is the caller, channel two is the agent. Without this the logs
    only tell us when things happened, not how they sounded. A customer's call
    is recorded in their own Telnyx account, with their key.
    """
    try:
        status, text = await telnyx_post(
            f"/v2/calls/{call_control_id}/actions/record_start", {"format": "wav", "channels": "dual"}, api_key
        )
        logger.info(f"record_start: HTTP {status} {text[:200]}")
    except Exception as e:
        logger.error(f"could not start recording: {e}")


def build_pipeline_parts(voice: str, prompt: str | None, call_tools: "tools.CallTools | None", gemini_key: str):
    """The Gemini Live half of the call, tuned for a phone line. `prompt` is a
    customer agent's; without one she runs on prompt.md. `call_tools`: the agent's
    tools (tools.py), offered to the model as functions; none = exactly as before.
    `gemini_key`: a customer call's owner's own key (product.gemini_key_for), ours only
    on Ashish's line."""
    context = LLMContext()
    user_params = LLMUserAggregatorParams(
        vad_analyzer=SileroVADAnalyzer(
            params=VADParams(
                stop_secs=VAD_STOP,
                start_secs=VAD_START,
                confidence=VAD_CONFIDENCE,
                min_volume=VAD_MIN_VOLUME,
            )
        ),
        user_turn_strategies=UserTurnStrategies(
            start=[VADUserTurnStartStrategy()],
            stop=[
                TurnAnalyzerUserTurnStopStrategy(
                    turn_analyzer=LocalSmartTurnAnalyzerV3(
                        params=SmartTurnParams(stop_secs=TURN_STOP)
                    )
                )
            ],
        ),
    )

    # TurnSafeGeminiLive (bot.py): a caller who resumes while she composes is held back
    # until her reply shows, so Gemini never discards what they said.
    llm = (tools.ToolsGeminiLive if call_tools else TurnSafeGeminiLive)(
        api_key=gemini_key,
        system_instruction=prompt or load_prompt(),
        # Callers on a phone are quiet and the voice detector is loosened to hear
        # them, so it confirms speech late and the first word used to be lost
        # ("take me off your list" -> "me off your list"). Replay 0.6 s of the
        # audio from before the confirmation; the auto-size gave only 0.2 s.
        user_audio_preroll_secs=0.6,
        settings=GeminiLiveLLMService.Settings(
            model=os.getenv("GEMINI_LIVE_MODEL", GEMINI_LIVE_MODEL_DEFAULT),
            voice=voice.capitalize(),
            # Gemini's own voice detection misreads 8 kHz phone audio, so the
            # local Silero analyser above decides when a turn ends instead.
            vad=GeminiVADParams(disabled=True),
            max_tokens=MAX_OUTPUT_TOKENS,
        ),
        **({"tools": call_tools.schema()} if call_tools else {}),
    )
    if call_tools:
        call_tools.register(llm)
        call_tools.flush = tools.ToolFlush(context, name="tool_flush")
    pair = LLMContextAggregatorPair(context, realtime_service_mode=True, user_params=user_params)
    return llm, context, pair


# What someone calling a customer's number hears when the owner's Gemini key cannot take the call
# (none saved, or Google refused it while her line was being prepared): a short apology in the
# provider's own voice, then the line drops. Less bad than a dead line or a busy tone for someone
# calling a business; the call is logged (gemini_key_error) so the owner sees who called.
UNAVAILABLE_LINE = "Sorry, we can't take your call right now. Please try again later."
UNAVAILABLE_XML = f'<?xml version="1.0" encoding="UTF-8"?><Response><Say>{UNAVAILABLE_LINE}</Say><Hangup/></Response>'


def end_on_key_error(llm, ctx: dict, record: dict, end, tell=None):
    """A customer's call whose Gemini key Google refused (invalid, API off, quota/billing): the
    problem is noted on the owner's key (the app shows it), the call is recorded as endedBy
    gemini_key_error and ended at once by `end()` (the runner's cancel: a phone call is hung up,
    a line still being prepared is dropped). `tell` sends the playground page an error event first."""

    async def refused(status: str, words: str, google: str):
        ctx["gemini_refused"] = True
        record["ended_by"] = "gemini_key_error"
        record.setdefault("flags", []).append({"flag": "gemini_key_error", "quote": f"Google refused the Gemini API key: {words}"})
        asyncio.get_running_loop().run_in_executor(
            None, product.note_key_problem, ctx["doc"]["userId"], ctx["gemini_sealed"], status, words, google)
        if tell:
            await tell({"type": "error", "code": "gemini_key_invalid", "message": words})
        # Its own task: this runs inside the model's connection task, which the cancel stops.
        asyncio.get_running_loop().create_task(end())

    llm.on_key_error = refused


def draining() -> bool:
    return DRAIN["since"] is not None


def busy() -> int:
    """What a draining process still waits for: calls (and lines being prepared), campaign calls it
    placed and has not settled, and the work it does after a call or a carrier's webhook."""
    return (len(ACTIVE) + len(PREPARED) + len(campaigns.INFLIGHT) + len(product._AFTER_CALL)
            + len(twilio._TASKS) + len(voicelink._TASKS))


DRAINING_ERROR = "The voice engine is restarting: try again in a moment."

_EVENTS: set[asyncio.Task] = set()


def to_other_slots(path: str, query: str, body: bytes):
    """Hand a carrier event this process has no call for to the service's other slot, in the background.
    Once only: the other slot never hands it back (FORWARDED)."""
    async def send(port: int):
        try:
            async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=5)) as session:
                async with session.post(f"http://127.0.0.1:{port}{path}?{query}", data=body,
                                        headers={"Content-Type": "application/json", FORWARDED: "1"}) as r:
                    logger.info(f"{path}: handed to the slot on :{port} (HTTP {r.status})")
        except Exception as e:
            logger.debug(f"{path}: the slot on :{port} is not there ({e!r})")

    for port in SLOT_PORTS:
        if port != PORT:
            task = asyncio.create_task(send(port))
            _EVENTS.add(task)
            task.add_done_callback(_EVENTS.discard)


def make_app() -> FastAPI:
    # The browser pages stay served from the same port, so /a, /b and /b2 keep
    # working while the phone round runs.
    app = make_browser_app()

    @app.get("/health")
    async def health(request: Request):
        """200 while this process takes calls; 503 when it is not set up or is draining (deploy.sh
        waits for a 200 from a new slot before sending it anything)."""
        from fillers import clip

        checks = {
            "key_set": bool(VOICELAB_KEY),
            "voicemail_clip": clip(f"voicemail-{DEFAULT_VOICE}.pcm") is not None,
            "gemini_key": bool(os.getenv("GEMINI_API_KEY")),
            "telnyx_key": bool(os.getenv("TELNYX_API_KEY")),
        }
        ok = all(checks.values()) and not draining()
        status = 200 if ok else 503
        if not is_local(request.headers, request.client.host if request.client else None):
            # the public sees up or down, nothing about the setup
            return JSONResponse({"ok": ok, **({"draining": True} if draining() else {})}, status_code=status)
        return JSONResponse({"ok": ok, "draining": draining(), "host": PUBLIC_HOST,
                             "model": os.getenv("GEMINI_LIVE_MODEL", GEMINI_LIVE_MODEL_DEFAULT),
                             "calls_running": len(ACTIVE), "busy": busy(), "max_calls": MAX_CALLS, "checks": checks,
                             "product_db": bool(product.setting("MONGODB_URI") and product.setting("MONGODB_DB_NAME")),
                             "db": product.setting("MONGODB_DB_NAME") or None},
                            status_code=status)

    @app.api_route("/texml", methods=["GET", "POST"])
    async def texml(request: Request):
        params = dict(request.query_params)
        number_id = params.get("n")
        if number_id:  # a customer's number: signed for that number, no loopback pass
            if not product.sig_ok(params.get("sig"), "number", number_id):
                logger.warning(f"texml: refused, bad signature for number {number_id}")
                return Response(status_code=403)
        elif not key_ok(params.get("key"), request.headers, request.client.host if request.client else None):
            logger.warning("texml: refused, missing or wrong key")
            return Response(status_code=403)
        if draining():  # a call coming in now would be cut off by the stop: the caller hears a short apology
            logger.warning("texml: draining, the caller hears nobody can take the call")
            return Response(content=UNAVAILABLE_XML, media_type="application/xml")
        if request.method == "POST":
            # Telnyx posts a plain urlencoded body; parsing it by hand avoids
            # needing python-multipart, whose absence turned every POST into a 500.
            params.update(dict(parse_qsl((await request.body()).decode(errors="replace"))))
        if number_id:
            return await customer_texml(number_id, params)
        voice = voice_from_called_party(params.get("To") or params.get("to"))
        # The person on the other end is "To" on a call we placed and "From" on
        # one that came in.
        inbound = str(params.get("Direction", "")).lower().startswith("inbound")
        callee = normalize_number(params.get("From") if inbound else params.get("To"))
        if callee and is_suppressed(callee):
            logger.warning(f"texml: {callee} asked not to be called, hanging up")
            return Response(
                content='<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>',
                media_type="application/xml",
            )
        logger.info(f"texml requested, called {params.get('To')!r} -> voice {voice}")
        # A real number calling IN is someone returning the voicemail; a softphone test is not.
        inbound = bool(inbound and callee)
        token = make_token(voice, callee or "", "1" if inbound else "0")
        await prepare_line(token, voice, callee, inbound)
        return Response(content=texml_for(voice, callee, inbound=inbound, token=token), media_type="application/xml")

    async def prepare_line(token: str, voice: str, callee: str | None, inbound: bool, ctx: dict | None = None) -> bool:
        """Build the line and have her first words made BEFORE answering: the
        caller hears a second more of ringing instead of a silent line. False when
        Google refused the owner's Gemini key meanwhile: the line is gone, do not answer with it."""
        if len(ACTIVE) >= MAX_CALLS:
            return True
        sock, started = LateSocket(), asyncio.get_running_loop().create_future()
        hold = Hold(name="hold")
        task = asyncio.create_task(serve(sock, voice, callee, inbound, 0, started, hold, ctx))
        PREPARED[token] = {"sock": sock, "started": started, "task": task}
        task.add_done_callback(lambda _: PREPARED.pop(token, None))
        sound = asyncio.ensure_future(hold.has_sound.wait())
        await asyncio.wait({sound, task}, timeout=2.5, return_when=asyncio.FIRST_COMPLETED)
        if not sound.done():
            sound.cancel()
            if not task.done():
                logger.warning("texml: her opening line was not ready in 2.5s, answering anyway")
        return not (ctx and ctx.get("gemini_refused"))

    async def customer_texml(number_id: str, params: dict) -> Response:
        """A call coming in to a customer's number: that number's agent answers it."""
        hang_up = Response(
            content='<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>', media_type="application/xml"
        )
        try:
            number, agent = await asyncio.to_thread(product.load_number, number_id, "INBOUND")
        except Exception as e:
            logger.error(f"texml: could not load number {number_id}: {e}")
            return hang_up
        if not number or not agent:
            logger.warning(f"texml: number {number_id} {'has no inbound agent' if number else 'not found'}, hanging up")
            return hang_up
        caller = params.get("From") or params.get("from")
        unavailable = Response(content=UNAVAILABLE_XML, media_type="application/xml")
        try:
            ctx = await asyncio.to_thread(product.phone_call, number, agent, "INBOUND", caller)
        except product.CallRefused as e:
            logger.warning(f"texml: number {number_id}: {e}, the caller hears nobody can take the call")
            await asyncio.to_thread(product.save_refused, number, agent, "INBOUND", caller, e)
            return unavailable
        except Exception as e:
            logger.error(f"texml: number {number_id}: its Telnyx key cannot be opened ({e}), hanging up")
            return hang_up
        voice = ctx["voice"] if ctx["voice"] in VOICES else DEFAULT_VOICE
        # A caller who once asked not to be called can still call in: the list is about calls we place.
        callee = normalize_number(caller)
        logger.info(f"texml: {caller!r} calling customer number {number.get('phoneNumber')} -> agent {agent['_id']} ({voice})")
        token = make_token(*stream_parts(voice, callee, False, False, number_id))
        if not await prepare_line(token, voice, callee, False, ctx):
            return unavailable
        return Response(content=texml_for(voice, callee, token=token, number_id=number_id), media_type="application/xml")

    @app.post("/telnyx-events")
    async def telnyx_events(request: Request):
        """Telnyx reports on a call we placed: picked up, or ended before anyone did."""
        number_id = request.query_params.get("n")
        if number_id:  # a customer's Call Control app
            if not product.sig_ok(request.query_params.get("sig"), "number", number_id):
                return Response(status_code=403)
        elif not key_ok(request.query_params.get("key"), request.headers, request.client.host if request.client else None):
            return Response(status_code=403)
        raw = await request.body()
        data = json.loads(raw or b"{}").get("data", {})
        kind, payload = data.get("event_type"), data.get("payload", {})
        line = LINES.get(payload.get("call_control_id"))
        if kind in ("call.answered", "call.hangup"):
            logger.info(f"telnyx: {kind} {payload.get('hangup_cause') or ''} ({'ringing here' if line else 'no stream waiting'})")
            if not line and not request.headers.get(FORWARDED):
                to_other_slots(request.url.path, request.url.query, raw)
        if line and kind == "call.answered":
            line["answered"] = True
            line["pickup"].set()
        elif line and kind == "call.hangup":
            line["cause"] = payload.get("hangup_cause") or "hangup"
            line["pickup"].set()  # wakes the waiting stream, which sees it was never answered
        return {"ok": True}

    @app.websocket("/telnyx")
    async def telnyx_stream(
        websocket: WebSocket,
        voice: str = DEFAULT_VOICE,
        callee: str | None = None,
        inbound: int = 0,
        ring: int = 0,
        n: str | None = None,
        a: str | None = None,
        t: str | None = None,
    ):
        voice = voice.lower() if voice.lower() in VOICES else DEFAULT_VOICE
        host = websocket.client.host if websocket.client else None
        parts = stream_parts(voice, callee, bool(inbound), bool(ring), n, a)
        # A customer's stream is checked even from this machine: its token says whose agent answers.
        if not token_ok(t, parts, {} if n else websocket.headers, None if n else host):
            logger.warning(f"media stream refused: bad or missing token (from {host})")
            await websocket.close(code=1008)
            return
        ready = PREPARED.pop(t, None) if t else None
        if not ready and len(ACTIVE) >= MAX_CALLS:
            logger.error(f"media stream refused: {len(ACTIVE)} calls already running (MAX_CALLS={MAX_CALLS})")
            await websocket.close(code=1013)
            return
        ctx = None
        if n and not ready:  # a call placed through /calls (or one /texml had no room to prepare)
            try:
                direction = "OUTBOUND" if ring else "INBOUND"
                number, agent = await asyncio.to_thread(product.load_number, n, direction, a)
                ctx = await asyncio.to_thread(product.phone_call, number, agent, direction, callee) if number and agent else None
            except Exception as e:
                logger.error(f"media stream for number {n}: {e}")
            if not ctx:
                logger.warning(f"media stream refused: number {n} or its agent is gone")
                await websocket.close(code=1008)
                return
        await websocket.accept()

        # Telnyx sends "connected", then "start" carrying the ids we need.
        call = None
        for _ in range(5):
            message = json.loads(await websocket.receive_text())
            if message.get("event") == "start":
                call = message
                break
        if not call:
            logger.error("no start event from Telnyx, closing")
            if ready:
                ready["sock"].attach(None)
            await websocket.close()
            return

        if ready:  # the line was built while /texml was answered; slot the caller in
            ready["started"].set_result(call)
            ready["sock"].attach(websocket)
            await ready["task"]
        else:
            started = asyncio.get_running_loop().create_future()
            started.set_result(call)
            await serve(websocket, voice, callee, inbound, ring, started, Hold(name="hold"), ctx)

    @app.websocket("/voicelink")
    async def voicelink_stream(websocket: WebSocket):
        """A call on a customer's VoiceLink number, from the moment it is answered.

        Inbound (`?n=&sig=`, the URL on the number's WebSocket bot): the number's inbound
        agent answers and speaks first. Outbound (`?n=&a=&dir=out&callee=&sig=`, the URL
        /calls gave add_lead): agent `a` waits for the callee's hello, as on Telnyx.
        """
        q = websocket.query_params
        number_id, agent_id, callee = q.get("n") or "", q.get("a") or "", q.get("callee") or ""
        out = q.get("dir") == "out"
        # Signed for that number (and agent and callee), never a loopback pass: the URL says whose agent talks.
        signed = (product.sig_ok(q.get("sig"), "voicelink-out", number_id, agent_id, callee) if out
                  else product.sig_ok(q.get("sig"), "number", number_id))
        if not number_id or not signed:
            logger.warning(f"voicelink: refused, bad signature (number {number_id!r}, {'out' if out else 'in'})")
            await websocket.close(code=1008)
            return
        if len(ACTIVE) >= MAX_CALLS or (draining() and not out):  # a call we placed is taken while draining
            logger.error(f"voicelink: refused, {'draining' if draining() else f'{len(ACTIVE)} calls already running'}")
            await websocket.close(code=1013)
            return
        await websocket.accept()
        # "start" comes first on live calls ("connected" is documented, so it is allowed for).
        # VoiceLink also opens sockets that send nothing and close: a reachability probe.
        call = None
        try:
            for _ in range(5):
                message = json.loads(await asyncio.wait_for(websocket.receive_text(), 15))
                if isinstance(message, dict) and message.get("event") == "start":
                    call = message
                    break
        except (WebSocketDisconnect, asyncio.TimeoutError, ValueError, RuntimeError, KeyError):
            pass
        if not call:
            logger.debug(f"voicelink: socket for number {number_id} closed without a call (a probe)")
            try:
                await websocket.close()
            except RuntimeError:
                pass
            return
        start = call.get("start") or {}
        custom = voicelink.custom_of(start.get("custom_parameters"))
        if not out and custom.get("aixel_agent") and custom.get("aixel_number") == number_id:
            # One of our leads on the bot's own URL: VoiceLink did not use the per-call
            # websocket_url. Its custom_parameters still say which agent places it.
            logger.warning(f"voicelink: call {start.get('call_sid')} is our outbound lead on the inbound URL")
            out, agent_id, callee = True, str(custom["aixel_agent"]), voicelink.e164(start.get("to")) or ""
        direction = "OUTBOUND" if out else "INBOUND"
        other = normalize_number(callee) if out else voicelink.e164(start.get("from"))
        ctx = None
        try:
            number, agent = await asyncio.to_thread(product.load_number, number_id, direction, agent_id or None)
            if number and agent and number.get("provider") == "VOICELINK":
                ctx = await asyncio.to_thread(product.phone_call, number, agent, direction, other)
        except product.CallRefused as e:
            logger.warning(f"voicelink: number {number_id}: {e}")
            if not out:  # someone called the business: the owner sees who
                await asyncio.to_thread(product.save_refused, number, agent, direction, other, e)
        except Exception as e:
            logger.error(f"voicelink: number {number_id}: {e}")
        if not ctx:
            logger.warning(f"voicelink: number {number_id} or its {direction.lower()} agent is gone, hanging up")
            await websocket.close(code=1008)
            return
        voice = ctx["voice"] if ctx["voice"] in VOICES else DEFAULT_VOICE
        logger.info(f"voicelink: {direction.lower()} call {start.get('call_sid')} on {ctx['doc']['from'] if out else ctx['doc']['to']}"
                    f" with {other} -> agent {ctx['doc']['agentId']} ({voice})")
        started = asyncio.get_running_loop().create_future()
        started.set_result(call)
        # The person is protected by the do-not-call list either way, as on a Telnyx customer number.
        await serve(websocket, voice, other, 0, 0, started, Hold(name="hold"), ctx)

    @app.post("/voicelink-events")
    async def voicelink_events(request: Request):
        """VoiceLink's webhooks for a customer's number: the recording, and calls that never connected.

        Always 200 once the signature is right (VoiceLink retries anything else); the work is done
        in the background."""
        number_id = request.query_params.get("n") or ""
        if not product.sig_ok(request.query_params.get("sig"), "number", number_id):
            return Response(status_code=403)
        raw = (await request.body()).decode(errors="replace")
        try:
            body = json.loads(raw) if raw.strip() else None
        except ValueError:
            body = dict(parse_qsl(raw))  # documented as JSON; a form post is taken too
        voicelink.handle_event(number_id, body)
        return {"ok": True}

    def twilio_signed(request: Request, creds: dict | None, form: dict) -> bool:
        """X-Twilio-Signature, checked when we hold the account's Auth Token (an API key cannot
        check it, and then our own URL signature is the gate). True when there is nothing to check."""
        if not creds or not creds.get("auth_token"):
            return True
        if twilio.signature_ok(creds["auth_token"], request.headers.get("x-twilio-signature"),
                               twilio.public_urls(request, PUBLIC_HOST), form):
            return True
        logger.warning(f"twilio: refused {request.url.path}: X-Twilio-Signature does not match")
        return False

    @app.api_route("/twiml", methods=["GET", "POST"])
    async def twiml(request: Request):
        """A call coming in to a customer's Twilio number (its Voice URL, `?n=&sig=`, set by the app).

        The number's inbound agent answers. As on Telnyx, her line is built and her greeting
        made BEFORE we answer (Twilio answers when it gets this TwiML), so she speaks the moment
        the stream opens. The stream URL carries nothing (Twilio drops its query): the number,
        the caller and a token ride as <Parameter>s and are checked on the stream's start."""
        number_id = request.query_params.get("n") or ""
        if not product.sig_ok(request.query_params.get("sig"), "number", number_id):
            logger.warning(f"twiml: refused, bad signature for number {number_id!r}")
            return Response(status_code=403)
        if draining():  # as /texml
            logger.warning("twiml: draining, the caller hears nobody can take the call")
            return Response(content=UNAVAILABLE_XML, media_type="application/xml")
        form = dict(parse_qsl((await request.body()).decode(errors="replace"))) if request.method == "POST" else {}
        params = {**dict(request.query_params), **form}
        reject = Response(content=twilio.REJECT, media_type="application/xml")
        try:
            number, agent = await asyncio.to_thread(product.load_number, number_id, "INBOUND")
        except Exception as e:
            logger.error(f"twiml: could not load number {number_id}: {e}")
            return reject
        if not number or number.get("provider") != "TWILIO":
            logger.warning(f"twiml: number {number_id} is not a Twilio number we have, rejecting")
            return reject
        try:
            creds = twilio.creds_of(number, product.open_secret(number["apiKeySealed"]))
        except Exception as e:
            logger.error(f"twiml: number {number_id}: its Twilio credentials cannot be opened ({e}), rejecting")
            return reject
        if not twilio_signed(request, creds, form):
            return Response(status_code=403)
        if not agent:
            logger.warning(f"twiml: number {number_id} has no inbound agent, rejecting")
            return reject
        caller = params.get("From") or params.get("Caller")
        unavailable = Response(content=UNAVAILABLE_XML, media_type="application/xml")
        try:
            ctx = await asyncio.to_thread(product.phone_call, number, agent, "INBOUND", normalize_number(caller) or caller)
        except product.CallRefused as e:
            logger.warning(f"twiml: number {number_id}: {e}, the caller hears nobody can take the call")
            await asyncio.to_thread(product.save_refused, number, agent, "INBOUND", normalize_number(caller) or caller, e)
            return unavailable
        voice = ctx["voice"] if ctx["voice"] in VOICES else DEFAULT_VOICE
        callee = normalize_number(caller) or ""
        logger.info(f"twiml: {caller!r} calling customer number {number.get('phoneNumber')} (call {params.get('CallSid')})"
                    f" -> agent {agent['_id']} ({voice})")
        token = make_token(*twilio.stream_parts(number_id, False, "", callee))
        if not await prepare_line(token, voice, callee or None, False, ctx):
            return unavailable
        return Response(content=twilio.stream_twiml(f"wss://{PUBLIC_HOST}/twilio",
                                                    {"n": number_id, "dir": "in", "a": "", "callee": callee, "t": token}),
                        media_type="application/xml")

    @app.websocket("/twilio")
    async def twilio_stream(websocket: WebSocket):
        """A Twilio media stream: a call into a customer's number (/twiml), or one /calls placed,
        from the moment it is answered. Twilio sends "connected", then "start" with our
        <Parameter>s (customParameters): the token in them is checked before anything runs."""
        await websocket.accept()
        call = None
        try:
            for _ in range(5):
                message = json.loads(await asyncio.wait_for(websocket.receive_text(), 15))
                if isinstance(message, dict) and message.get("event") == "start":
                    call = message
                    break
        except (WebSocketDisconnect, asyncio.TimeoutError, ValueError, RuntimeError, KeyError):
            pass

        async def refuse(code: int, why: str):
            logger.warning(f"twilio: stream refused: {why}")
            try:
                await websocket.close(code=code)
            except RuntimeError:
                pass

        start = (call or {}).get("start") or {}
        custom = start.get("customParameters") if isinstance(start.get("customParameters"), dict) else {}
        number_id, agent_id, callee, t = (str(custom.get(k) or "") for k in ("n", "a", "callee", "t"))
        out = custom.get("dir") == "out"
        if not call:
            return await refuse(1008, "no start message")
        # Never a loopback pass: the token says whose agent talks, to whom.
        if not number_id or not token_ok(t, twilio.stream_parts(number_id, out, agent_id, callee), {}, None):
            return await refuse(1008, f"bad or expired token (number {number_id!r}, call {start.get('callSid')})")
        ready = PREPARED.pop(t, None)
        if not ready and len(ACTIVE) >= MAX_CALLS:
            return await refuse(1013, f"{len(ACTIVE)} calls already running (MAX_CALLS={MAX_CALLS})")
        if out and start.get("callSid"):
            twilio.STREAMED.add(start["callSid"])
        if ready:  # the line was built while /twiml was answered: slot the caller in
            if not ready["started"].done():
                ready["started"].set_result(call)
            ready["sock"].attach(websocket)
            await ready["task"]
            return
        direction = "OUTBOUND" if out else "INBOUND"
        ctx = None
        try:
            number, agent = await asyncio.to_thread(product.load_number, number_id, direction, agent_id or None)
            if number and agent and number.get("provider") == "TWILIO":
                ctx = await asyncio.to_thread(product.phone_call, number, agent, direction, callee or None)
        except Exception as e:
            logger.error(f"twilio: number {number_id}: {e}")
        if not ctx:
            return await refuse(1008, f"number {number_id} or its {direction.lower()} agent is gone")
        voice = ctx["voice"] if ctx["voice"] in VOICES else DEFAULT_VOICE
        logger.info(f"twilio: {direction.lower()} call {start.get('callSid')} on {ctx['doc']['from'] if out else ctx['doc']['to']}"
                    f" with {callee or 'unknown'} -> agent {ctx['doc']['agentId']} ({voice})")
        started = asyncio.get_running_loop().create_future()
        started.set_result(call)
        # A call we place waits for the callee's hello (RingGate); one coming in is answered by her.
        await serve(websocket, voice, callee or None, 0, 0, started, Hold(name="hold"), ctx)

    @app.post("/twilio-events")
    async def twilio_events(request: Request):
        """Twilio's status callbacks for a call /calls placed (`?n=&a=&sig=`): a call nobody
        answered (no-answer, busy, failed) never opens a stream, so its record is written here.
        200 at once; the work is done in the background."""
        q = request.query_params
        number_id, agent_id = q.get("n") or "", q.get("a") or ""
        if not product.sig_ok(q.get("sig"), "twilio-events", number_id, agent_id):
            return Response(status_code=403)
        form = dict(parse_qsl((await request.body()).decode(errors="replace")))
        creds = None
        try:
            number = await asyncio.to_thread(product.find_number, number_id)
            if number and number.get("provider") == "TWILIO":
                creds = twilio.creds_of(number, product.open_secret(number["apiKeySealed"]))
        except Exception as e:
            logger.error(f"twilio-events: number {number_id}: {e}")
        if not twilio_signed(request, creds, form):
            return Response(status_code=403)
        twilio.handle_status(number_id, agent_id, form)
        return {"ok": True}

    @app.post("/calls")
    async def place_call(request: Request):
        """The app asks for a call from a customer's number: {"numberId", "to", "agentId"?, "variables"?}.

        `agentId` picks which of the owner's agents makes the call; without it, the
        number's outbound agent does. `variables` ({name: value}) fill the agent's
        `{{variables}}` on this call (product.call_variables)."""
        if not product.bearer_ok(request.headers.get("authorization")):
            return JSONResponse({"error": "unauthorized"}, status_code=401)
        if draining():  # the other slot takes it: the app (or a campaign) tries again
            return JSONResponse({"error": DRAINING_ERROR, "code": "draining"}, status_code=503)
        try:
            body = await request.json()
        except ValueError:
            body = None
        if not isinstance(body, dict):
            return JSONResponse({"error": "the body must be a JSON object"}, status_code=400)
        number_id, to = str(body.get("numberId") or ""), normalize_number(body.get("to"))
        agent_id = str(body.get("agentId") or "") or None
        if not to:
            return JSONResponse({"error": "to is not a phone number"}, status_code=400)
        variables = body.get("variables") or {}
        if not isinstance(variables, dict) or len(variables) > 30 or not all(
                product.VARIABLE_NAME.fullmatch(k) and product._value(v) is not None for k, v in variables.items()):
            return JSONResponse({"error": "variables must be up to 30 names (letters, digits, _) with text values"},
                                status_code=400)
        try:
            number, agent = await asyncio.to_thread(product.load_number, number_id, "OUTBOUND", agent_id)
        except Exception as e:
            logger.error(f"/calls: could not load number {number_id}: {e}")
            return JSONResponse({"error": "the database is unavailable"}, status_code=503)
        if not number:
            return JSONResponse({"error": "number not found"}, status_code=404)
        if not agent:
            return JSONResponse({"error": "pick an agent to make the call (this number has no outbound agent)"
                                 if not agent_id else "that agent was not found"}, status_code=409)
        # The call needs the agent's prompt and runs on the owner's own Gemini key: no prompt, no key,
        # or one Google refuses, rings nobody.
        try:
            product.require_prompt(agent)
            gemini_key, sealed = await asyncio.to_thread(product.gemini_key_for, number["userId"])
        except product.CallRefused as e:
            logger.warning(f"/calls: number {number_id}: {e}")
            return JSONResponse({"error": e.words, "code": e.code}, status_code=409)
        except Exception as e:
            logger.error(f"/calls: could not read the Gemini key of number {number_id}'s owner: {e}")
            return JSONResponse({"error": "the database is unavailable"}, status_code=503)
        problem = await product.check_gemini_key(gemini_key)
        if problem:
            status, words, google = problem
            logger.warning(f"/calls: number {number_id}: Google refused the owner's Gemini key ({status}): {google[:200]}")
            await asyncio.to_thread(product.note_key_problem, number["userId"], sealed, status, words, google)
            return JSONResponse({"error": f"Google refused the Gemini API key: {words}", "code": "gemini_key_invalid"},
                                status_code=409)
        if variables:  # picked up when the call's stream arrives (product._finish_ctx)
            product.hold_call_variables(number_id, to, variables)
        if number.get("provider") == "VOICELINK":
            return await place_voicelink_call(number, agent, to)
        if number.get("provider") == "TWILIO":
            return await place_twilio_call(number, agent, to)
        if not number.get("callControlAppId"):
            return JSONResponse({"error": "this number has no Call Control application"}, status_code=409)
        if is_suppressed(to):
            logger.warning(f"/calls: not dialling {to}: that number asked not to be called again")
            return JSONResponse({"error": "that number asked not to be called again"}, status_code=409)
        if len(ACTIVE) >= MAX_CALLS:
            return JSONResponse({"error": f"{len(ACTIVE)} calls already running, try again shortly"}, status_code=503)
        try:
            api_key = product.open_secret(number["apiKeySealed"])
        except Exception as e:
            logger.error(f"/calls: number {number_id}: its Telnyx key cannot be opened ({e})")
            return JSONResponse({"error": "the number's API key cannot be read; reconnect the number"}, status_code=409)
        voice = (agent.get("voice") or "").lower()
        voice = voice if voice in VOICES else DEFAULT_VOICE
        webhook = f"https://{PUBLIC_HOST}/telnyx-events?n={number_id}&sig={product.sign('number', number_id)}"
        body = dial_body(to, number["phoneNumber"], number["callControlAppId"], webhook, stream_url(voice, to, number_id, str(agent["_id"])))
        try:
            status, text = await telnyx_post("/v2/calls", body, api_key)
        except Exception as e:
            logger.error(f"/calls: Telnyx unreachable: {e}")
            return JSONResponse({"error": f"Telnyx is unreachable: {e}"}, status_code=PROVIDER_FAILED)
        logger.info(f"/calls: dial {to} from {number['phoneNumber']} (number {number_id}): HTTP {status} {text[:300]}")
        try:
            call_id = json.loads(text)["data"]["call_control_id"] if status < 300 else None
        except (ValueError, KeyError, TypeError):
            call_id = None
        if not call_id:
            return JSONResponse({"error": f"Telnyx refused the call: {telnyx_reason(status, text)}"}, status_code=PROVIDER_FAILED)
        return {"ok": True, "callId": call_id}

    async def place_voicelink_call(number: dict, agent: dict, to: str):
        """/calls for a VoiceLink number: add_lead with the customer's token, through the Indian proxy.

        VoiceLink queues the call and opens /voicelink when it is answered, so the stream URL
        carries a permanent signature. The reply's callId is VoiceLink's queue id; the call's
        own id (call_sid) is only known once it is answered."""
        number_id, agent_id = str(number["_id"]), str(agent["_id"])
        if not voicelink.split_number(to):
            return JSONResponse({"error": "to is not a phone number"}, status_code=400)
        if is_suppressed(to):
            logger.warning(f"/calls: not dialling {to}: that number asked not to be called again")
            return JSONResponse({"error": "that number asked not to be called again"}, status_code=409)
        if len(ACTIVE) >= MAX_CALLS:
            return JSONResponse({"error": f"{len(ACTIVE)} calls already running, try again shortly"}, status_code=503)
        try:
            token = product.open_secret(number["apiKeySealed"])
        except Exception as e:
            logger.error(f"/calls: number {number_id}: its VoiceLink token cannot be opened ({e})")
            return JSONResponse({"error": "the number's API token cannot be read; reconnect the number"}, status_code=409)
        stream = (f"wss://{PUBLIC_HOST}/voicelink?n={number_id}&a={agent_id}&dir=out&callee={quote(to)}"
                  f"&sig={product.sign('voicelink-out', number_id, agent_id, to)}")
        webhook = f"https://{PUBLIC_HOST}/voicelink-events?n={number_id}&sig={product.sign('number', number_id)}"
        body = voicelink.lead_body(number, agent_id, to, stream, webhook)
        try:
            data = await voicelink.api_post("/v1/add_lead", token, body)
        except voicelink.VoiceLinkError as e:
            logger.warning(f"/calls: VoiceLink refused {to} from {number['phoneNumber']} (number {number_id}): {e}")
            return JSONResponse({"error": f"VoiceLink refused the call: {e}"}, status_code=PROVIDER_FAILED)
        except Exception as e:
            logger.error(f"/calls: VoiceLink unreachable: {e!r}")
            return JSONResponse({"error": f"VoiceLink is unreachable: {e!r}"}, status_code=PROVIDER_FAILED)
        queue_id = data.get("outbound_queue_id")
        logger.info(f"/calls: VoiceLink lead {to} from {number['phoneNumber']} (number {number_id}): queue {queue_id} {str(data)[:200]}")
        if queue_id is None:
            logger.warning("/calls: VoiceLink took the lead but sent no outbound_queue_id")
        return {"ok": True, "callId": f"vl-queue:{queue_id if queue_id is not None else 'unknown'}"}

    async def place_twilio_call(number: dict, agent: dict, to: str):
        """/calls for a Twilio number: the Calls API with the customer's credentials and inline TwiML.

        There is no connect-while-ringing on Twilio: the TwiML (our <Connect><Stream>) runs only
        once the call is answered, so the stream opens at pickup and her opener is made while the
        callee says hello. The reply's callId is the CallSid (= providerCallId of the call's doc)."""
        number_id, agent_id = str(number["_id"]), str(agent["_id"])
        if is_suppressed(to):
            logger.warning(f"/calls: not dialling {to}: that number asked not to be called again")
            return JSONResponse({"error": "that number asked not to be called again"}, status_code=409)
        if len(ACTIVE) >= MAX_CALLS:
            return JSONResponse({"error": f"{len(ACTIVE)} calls already running, try again shortly"}, status_code=503)
        try:
            creds = twilio.creds_of(number, product.open_secret(number["apiKeySealed"]))
        except Exception as e:
            logger.error(f"/calls: number {number_id}: its Twilio credentials cannot be opened ({e})")
            return JSONResponse({"error": "the number's Twilio credentials cannot be read; reconnect the number"}, status_code=409)
        if not creds["account_sid"]:
            return JSONResponse({"error": "the number has no Twilio account saved; reconnect the number"}, status_code=409)
        token = make_token(*twilio.stream_parts(number_id, True, agent_id, to), ttl=twilio.OUT_TOKEN_TTL)
        twiml = twilio.stream_twiml(f"wss://{PUBLIC_HOST}/twilio",
                                    {"n": number_id, "dir": "out", "a": agent_id, "callee": to, "t": token})
        events = (f"https://{PUBLIC_HOST}/twilio-events?n={number_id}&a={agent_id}"
                  f"&sig={product.sign('twilio-events', number_id, agent_id)}")
        try:
            status, text = await twilio.api_post(creds, "/Calls.json", twilio.call_form(to, number["phoneNumber"], twiml, events, RING_SECS))
        except Exception as e:
            logger.error(f"/calls: Twilio unreachable: {e!r}")
            return JSONResponse({"error": f"Twilio is unreachable: {e!r}"}, status_code=PROVIDER_FAILED)
        logger.info(f"/calls: Twilio call {to} from {number['phoneNumber']} (number {number_id}): HTTP {status} {text[:300]}")
        try:
            call_sid = json.loads(text).get("sid") if status < 300 else None
        except (ValueError, AttributeError):
            call_sid = None
        if not call_sid:
            return JSONResponse({"error": f"Twilio refused the call: {twilio.reason(status, text)}"}, status_code=PROVIDER_FAILED)
        twilio.RANG.setdefault(call_sid, product.now())
        return {"ok": True, "callId": call_sid}

    @app.websocket("/play")
    async def play_socket(websocket: WebSocket, agent: str = "", user: str = "", t: str | None = None):
        """The playground: a customer talks to their agent from the browser."""
        await websocket.accept()  # accepted first, so the page sees why it was refused
        if draining():
            await websocket.send_text(json.dumps({"type": "error", "code": "draining", "message": DRAINING_ERROR}))
            await websocket.close(code=1013, reason="draining")
            return
        if not token_ok(t, ("play", agent, user), {}, None):  # no loopback pass: the token names whose agent
            logger.warning("play: refused, bad or expired token")
            await websocket.close(code=1008, reason="bad or expired token")
            return
        try:
            doc = await asyncio.to_thread(product.load_agent, agent, user)
        except Exception as e:
            logger.error(f"play: could not load agent {agent}: {e}")
            await websocket.close(code=1011, reason="database unavailable")
            return
        if not doc:
            await websocket.close(code=1008, reason="agent not found")
            return
        try:
            ctx = await asyncio.to_thread(product.play_call, doc)
        except product.CallRefused as e:
            logger.warning(f"play: agent {agent}: {e}")
            await websocket.send_text(json.dumps({"type": "error", "code": e.code, "message": e.words}))
            await websocket.close(code=1008, reason=e.code)
            return
        if len(ACTIVE) >= MAX_CALLS:
            await websocket.close(code=1013, reason="busy, try again shortly")
            return
        await play(websocket, ctx)

    # Outbound campaigns dial from this process, through /calls above (campaigns.py).
    campaigns.install(app, room=lambda: MAX_CALLS - len(ACTIVE), draining=draining)
    return app


async def serve(*args, **kwargs):
    """One call (see _serve_line). The call holds a MAX_CALLS slot from the first moment
    to the last, however it ends: a failure while the line is being built must not leak one."""
    slot = uuid.uuid4().hex
    ACTIVE.add(slot)
    try:
        await _serve_line(*args, slot=slot, **kwargs)
    finally:
        ACTIVE.discard(slot)


async def _serve_line(sock, voice: str, callee: str | None, inbound: int, ring: int, started: asyncio.Future, hold: Hold,
                      ctx: dict | None = None, *, slot: str):
    """One call, from an open line to the written record.

    `started` resolves to Telnyx's "start" message. It is already there for a
    stream that is open; for a line prepared at /texml it arrives a moment
    later, and everything that needs the call's ids waits for it.

    `ctx` is a call on a customer's number (product.phone_call): their agent's
    prompt, their Telnyx key, and a voice_calls document when it ends.

    A VoiceLink number's call (ctx provider VOICELINK) differs in three places: its
    own serializer and ids, no recording request (VoiceLink records it and sends the
    link to /voicelink-events), and the hang-up, which is closing the socket. The
    transport closes it on every end of the pipeline, so every guard's hang-up
    (goodbye, dnc, abuse, voicemail...) ends a VoiceLink call with no extra step.
    """
    vl = bool(ctx and ctx.get("provider") == "VOICELINK")
    # A Twilio number's call: Twilio's serializer with the customer's credentials (hang-up by
    # REST), the CallSid as its id, the recording asked for from their account once it is live.
    tw = bool(ctx and ctx.get("provider") == "TWILIO")
    prepared = not started.done()
    # A call that came in is already answered; one we placed is not, yet.
    line = {"pickup": asyncio.Event(), "answered": not ring, "cause": None}
    if not ring:
        line["pickup"].set()

    serializer = voicelink.VoiceLinkSerializer() if vl else twilio.TwilioSerializer(ctx["twilio"]) if tw else TelnyxFrameSerializer(
        stream_id="pending",
        call_control_id="pending",
        outbound_encoding="PCMU",
        inbound_encoding="PCMU",
        api_key=ctx["api_key"] if ctx else os.environ["TELNYX_API_KEY"],
    )
    if prepared and not vl:  # no call to hang up until the stream is bound (bind() turns it on)
        serializer._params.auto_hang_up = False
    state: dict = {}
    record = {
        "stream_id": None,
        "call_control_id": None,
        "started_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "voice": voice,
        "turns": [],
    }
    if ctx:
        ctx["opened_at"] = product.now()
        record.update(agent_id=str(ctx["doc"]["agentId"]), number_id=str(ctx["doc"]["numberId"]),
                      direction=ctx["doc"]["direction"])
    is_test = False

    def bind(call: dict):
        """The stream is open: now we know which call this is."""
        nonlocal is_test
        if vl:  # VoiceLink's start: its own ids and codec, read by its serializer
            serializer.start(call)
            # Names the call's record file: keep it a plain file name.
            record["stream_id"] = "".join(c if c.isalnum() or c in "-_.:" else "_" for c in serializer.stream_sid) or f"vl-{slot}"
            record["call_control_id"] = serializer.call_sid or None
            is_test = str(serializer.call_sid).startswith("test:")
        elif tw:  # Twilio's start: {"event": "start", "start": {"streamSid", "callSid", "customParameters", ...}}
            start = call.get("start") or {}
            serializer.bind(start)
            record["stream_id"] = "".join(c if c.isalnum() or c in "-_.:" else "_" for c in serializer._stream_sid) or f"tw-{slot}"
            record["call_control_id"] = start.get("callSid") or None
            # A made-up call id against the real Twilio: there is no call to hang up or record.
            is_test = str(start.get("callSid")).startswith("test:") and twilio.api_base() == twilio.DEFAULT_API_BASE
            serializer.auto_hang_up(not is_test)
        else:
            start = call["start"]
            record["stream_id"], record["call_control_id"] = call["stream_id"], start["call_control_id"]
            # prospect.py drives the same endpoint with a made-up id; there is no
            # real call behind it, so leave Telnyx's API alone.
            is_test = str(start["call_control_id"]).startswith("test:")
            serializer._stream_id = call["stream_id"]
            serializer._call_control_id = start["call_control_id"]
            serializer._params.outbound_encoding = start["media_format"]["encoding"]
            serializer._params.auto_hang_up = not is_test
        if ring:
            LINES[start["call_control_id"]] = line
        logger.info(
            f"{'line open, phone ringing' if ring else 'call connected'}, stream {record['stream_id']} "
            f"({len(ACTIVE)}/{MAX_CALLS} running)"
        )

    if not prepared:
        bind(started.result())

    transport = FastAPIWebsocketTransport(
        websocket=sock,
        params=FastAPIWebsocketParams(
            audio_in_enabled=True,
            audio_out_enabled=True,
            audio_in_sample_rate=GEMINI_SAMPLE_RATE_IN,
            audio_out_sample_rate=GEMINI_SAMPLE_RATE_OUT,
            add_wav_header=False,
            serializer=serializer,
        ),
    )

    call_tools = tools.CallTools(ctx, record) if ctx else None
    # A customer's call runs on its owner's key, never ours (product.gemini_key_for); ours is Ashish's line.
    gemini_key = ctx["gemini_key"] if ctx else os.environ["GEMINI_API_KEY"]
    llm, context, pair = build_pipeline_parts(voice, ctx["prompt"] if ctx else None, call_tools or None, gemini_key)
    if ctx:
        async def end_refused():
            if not started.done():
                started.cancel()  # a line being prepared: nobody will arrive, the caller hears UNAVAILABLE_LINE
            await runner.cancel()

        end_on_key_error(llm, ctx, record, end=end_refused)
    guard = CallGuard(record, callee)
    # Someone calling a customer's business expects it to answer: she speaks first, and
    # nobody's answering machine calls in, so a caller who talks at length is never taken for one.
    answers = bool(ctx and ctx["doc"]["direction"] == "INBOUND")
    if answers:
        guard.VM_WINDOW = -1.0
    gate = RingGate(line["pickup"], name="ring_gate")
    pipeline = Pipeline(
        [
            transport.input(),
            gate,
            # Listens for the beep that ends a voicemail greeting.
            BeepDetector(guard, name="beep"),
            TurnTimer(state, "phone", name="timer_in"),
            pair.user(),
            # The caller's transcription travels UPSTREAM out of the Gemini
            # service, so it is only visible before the service; the agent's
            # text goes downstream. One logger each side, same record.
            CallLog(record, guard=guard, name="log_caller"),
            # Only with tools: hands the model a tool's answer the caller talked over.
            *([call_tools.flush] if call_tools else []),
            llm,
            hold,
            # Drops a reply that starts while the caller is still talking.
            # Before the agent log, so a reply nobody heard is not recorded.
            TalkOverGate(name="gate"),
            CallLog(record, name="log_agent"),
            # Hangs up after her goodbye, or after the reply that follows a
            # stop request, a wrong number, an objection to recording, abuse.
            # On a voicemail: leave the agent's own message (its voicemail setting), or hang up.
            GuardAgent(guard, voice=voice, gemini_key=ctx and gemini_key,
                       message=ctx.get("voicemail") if ctx else VOICEMAIL_TEXT, name="guard_out"),
            TurnTimer(state, "phone", name="timer_out"),
            ThinkingCue(voice, guard=guard, gemini_key=ctx and gemini_key, name="thinking_cue"),
            transport.output(),
            pair.assistant(),
        ]
    )

    worker = PipelineWorker(pipeline, params=PipelineParams(enable_metrics=True, enable_usage_metrics=True))
    runner = WorkerRunner(handle_sigint=False)
    await runner.add_workers(worker)

    async def open_with_her_line():
        if ctx:
            first = ctx["first"]
        elif inbound:
            first = (
                "Someone is calling you back after the voicemail you left them, so this is NOT a "
                "cold call. The message they heard was: \"" + VOICEMAIL_TEXT + "\" Greet them: you "
                "are Maya, the AI assistant from Aixel Labs, and you left that message about the "
                "demo. Ask if they have a minute, and keep it short."
            )
        else:
            first = "Start the call with your opening line."
        context.add_message({"role": "user", "content": first})
        await worker.queue_frames([LLMRunFrame()])

    @transport.event_handler("on_client_connected")
    async def on_connected(transport, client):
        # Whenever the person cannot hear us yet (their phone is ringing, or
        # Telnyx has not opened the stream), her first words are made now and
        # kept back, so they go out the instant the line is live. A VoiceLink
        # stream opens only at pickup: there her opener is made while the person
        # says hello.
        early = bool(prepared or (ring and OPENER_WHILE_RINGING) or vl or tw)
        if early:
            await open_with_her_line()
        if prepared:
            try:
                bind(await asyncio.wait_for(asyncio.shield(started), 15))
            except asyncio.TimeoutError:
                logger.info("the caller was gone before the stream opened, dropping the prepared line")
                sock.attach(None)
                await runner.cancel()
                return
            except asyncio.CancelledError:
                if asyncio.current_task().cancelling():
                    raise
                sock.attach(None)  # end_refused: Google refused the owner's key, the line is being dropped
                return
        if ring:
            rang = time.monotonic()
            try:
                await asyncio.wait_for(line["pickup"].wait(), RING_SECS + 15)
            except asyncio.TimeoutError:
                line["cause"] = "no word from Telnyx"
            if not line["answered"]:
                logger.info(f"not answered ({line['cause']}), closing the line")
                await runner.cancel()
                return
            record["rang_secs"] = round(time.monotonic() - rang, 1)
            logger.info(f"picked up after {record['rang_secs']}s of ringing")
        guard.t0 = time.monotonic()  # "straight after pickup" is measured from here
        if ctx:
            ctx["live_at"] = product.now()
        if tw:
            if not is_test and record["call_control_id"]:
                asyncio.create_task(twilio.start_recording(ctx["twilio"], record["call_control_id"]))
        elif not is_test and not vl:
            asyncio.create_task(start_recording(record["call_control_id"], ctx["api_key"] if ctx else None))
        # A person says "hello?" when they pick up. She waits for it.
        if answers:
            gate.go.set()
        await gate.go.wait()
        guard.heard_before(gate.heard)
        # Her opening question is the first thing they hear from her. There is no "this call
        # is recorded" notice (Ashish, 2026-10-13: it killed the opener), though calls
        # ARE recorded: that is a risk in the US states that need everyone's consent.
        await hold.release([])
        if not early:
            await open_with_her_line()

    finished = False

    def finish():
        """Write the call record once, however the call ended (or never began)."""
        nonlocal finished
        if finished:
            return
        finished = True
        LINES.pop(record["call_control_id"], None)
        refused = bool(ctx and ctx.get("gemini_refused"))
        if record["stream_id"] is None:
            # A prepared line nobody arrived on: there was no call. Unless Google refused the owner's
            # key while it was being prepared: the caller heard so (UNAVAILABLE_LINE), the owner sees it.
            if refused:
                product.save_call(ctx, record, state)
            return
        if not line["answered"] and not refused:
            record["ended_by"] = "no_answer"
            record["hangup_cause"] = line["cause"]
        guard.final_scan()
        record["gemini_usage"] = {k: round(v, 1) if isinstance(v, float) else v for k, v in llm.usage.items()}
        gaps = sorted(state.get("gaps", []))
        if gaps:
            logger.info(f"[phone] {len(gaps)} turns, median {gaps[len(gaps) // 2]} ms, worst {gaps[-1]} ms")
        write_call_record(record, state)
        if ctx:
            product.save_call(ctx, record, state)

    @transport.event_handler("on_client_disconnected")
    async def on_disconnected(transport, client):
        finish()
        await runner.cancel()

    try:
        await runner.run()
    finally:
        finish()
        ACTIVE.discard(slot)


class PlayMessage(OutputTransportMessageUrgentFrame):
    """One JSON event for the playground page. Its own type, because Pipecat's RTVI
    observer sends transport messages of its own and the page must not get those."""


class PlaySerializer(RawPCMSerializer):
    """The playground's wire: 16 kHz PCM in, 24 kHz PCM out, and JSON events.

    On top of the test page's "clear", the page is sent transcript and turn
    events (PlayEvents), a "tool" event per tool run (tools.py), and one
    "ended" with the reason before the engine closes the socket.
    """

    def __init__(self, record: dict, **kwargs):
        super().__init__(**kwargs)
        self._record = record

    async def serialize(self, frame: Frame) -> str | bytes | None:
        if isinstance(frame, PlayMessage):
            return json.dumps(frame.message)
        if isinstance(frame, (EndFrame, CancelFrame)):  # handed over by the transport just before it closes
            return json.dumps({"type": "ended", "reason": self._record.get("ended_by") or "ended"})
        return await super().serialize(frame)


class PlayEvents(FrameProcessor):
    """Tells the playground page what was said, line by line, and how fast she answered.

    Used twice, like CallLog: before the model it catches the caller's words
    (Gemini sends them upstream), after it her replies and the turn timer's gaps.
    Her reply is sent whole, once it has finished or been cut off.
    """

    def __init__(self, state: dict, **kwargs):
        super().__init__(**kwargs)
        self._state = state
        self._reply = ""
        self._gaps = 0

    async def _send(self, message: dict):
        await self.push_frame(PlayMessage(message=message), FrameDirection.DOWNSTREAM)

    async def _flush(self):
        if self._reply.strip():
            await self._send({"type": "transcript", "role": "agent", "text": self._reply.strip()})
        self._reply = ""

    async def process_frame(self, frame: Frame, direction: FrameDirection):
        await super().process_frame(frame, direction)
        if direction == FrameDirection.UPSTREAM:
            if isinstance(frame, TranscriptionFrame) and frame.text.strip():
                await self._send({"type": "transcript", "role": "caller", "text": frame.text.strip()})
        elif isinstance(frame, TTSTextFrame) and frame.text.strip():
            self._reply += " " + frame.text.strip()
        elif isinstance(frame, (LLMFullResponseStartFrame, LLMFullResponseEndFrame, InterruptionFrame, EndFrame)):
            await self._flush()
        elif isinstance(frame, PlayMessage) and frame.message.get("type") == "tool":
            await self._flush()  # what she said before the tool ran comes first on the page
        elif isinstance(frame, OutputAudioRawFrame):
            gaps = self._state.get("gaps", [])
            if len(gaps) > self._gaps:
                self._gaps = len(gaps)
                await self._send({"type": "turn", "gapMs": gaps[-1]})
        await self.push_frame(frame, direction)


async def play(websocket: WebSocket, ctx: dict):
    """One playground session, holding a MAX_CALLS slot however it ends (see serve)."""
    slot = uuid.uuid4().hex
    ACTIVE.add(slot)
    try:
        await _play_session(websocket, ctx, slot)
    finally:
        ACTIVE.discard(slot)


async def _play_session(websocket: WebSocket, ctx: dict, slot: str):
    """One playground session: the customer's agent, in the browser, speaking first."""
    voice = ctx["voice"] if ctx["voice"] in VOICES else DEFAULT_VOICE
    ctx["opened_at"] = ctx["live_at"] = product.now()
    state: dict = {}
    record = {
        "stream_id": f"play-{slot}",
        "call_control_id": None,
        "started_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "voice": voice,
        "turns": [],
        "agent_id": str(ctx["doc"]["agentId"]),
        "direction": "PLAYGROUND",
    }
    transport = FastAPIWebsocketTransport(
        websocket=websocket,
        params=FastAPIWebsocketParams(
            audio_in_enabled=True,
            audio_out_enabled=True,
            audio_in_sample_rate=GEMINI_SAMPLE_RATE_IN,
            audio_out_sample_rate=GEMINI_SAMPLE_RATE_OUT,
            add_wav_header=False,
            serializer=PlaySerializer(record),
        ),
    )
    # The same model settings and turn taking as her phone calls, so the playground is a fair preview.
    call_tools = tools.CallTools(ctx, record)
    llm, context, pair = build_pipeline_parts(voice, ctx["prompt"], call_tools or None, ctx["gemini_key"])
    end_on_key_error(llm, ctx, record, end=lambda: runner.cancel(),
                     tell=lambda message: llm.push_frame(PlayMessage(message=message)))
    if call_tools:  # the page shows each tool run as it finishes
        call_tools.notify = lambda message: llm.push_frame(PlayMessage(message=message))
    guard = CallGuard(record)  # no callee: nothing said here goes on the do-not-call list
    pipeline = Pipeline(
        [
            transport.input(),
            TurnTimer(state, "play", name="timer_in"),
            pair.user(),
            CallLog(record, guard=guard, name="log_caller"),
            PlayEvents(state, name="events_caller"),
            *([call_tools.flush] if call_tools else []),
            llm,
            TalkOverGate(name="gate"),
            CallLog(record, name="log_agent"),
            GuardAgent(guard, name="guard_out"),  # no voice: a "voicemail" here is hung up on, no message left
            TurnTimer(state, "play", name="timer_out"),
            PlayEvents(state, name="events_agent"),
            ThinkingCue(voice, guard=guard, gemini_key=ctx["gemini_key"], name="thinking_cue"),
            transport.output(),
            pair.assistant(),
        ]
    )
    worker = PipelineWorker(pipeline, params=PipelineParams(enable_metrics=True, enable_usage_metrics=True))
    runner = WorkerRunner(handle_sigint=False)
    await runner.add_workers(worker)

    @transport.event_handler("on_client_connected")
    async def on_connected(transport, client):
        logger.info(f"play: agent {record['agent_id']} ({voice}) connected ({len(ACTIVE)}/{MAX_CALLS} running)")
        context.add_message({"role": "user", "content": ctx["first"]})
        await worker.queue_frames([LLMRunFrame()])

    finished = False

    def finish():
        nonlocal finished
        if finished:
            return
        finished = True
        record["gemini_usage"] = {k: round(v, 1) if isinstance(v, float) else v for k, v in llm.usage.items()}
        gaps = sorted(state.get("gaps", []))
        if gaps:
            logger.info(f"[play] {len(gaps)} turns, median {gaps[len(gaps) // 2]} ms, worst {gaps[-1]} ms")
        write_call_record(record, state)
        product.save_call(ctx, record, state)

    @transport.event_handler("on_client_disconnected")
    async def on_disconnected(transport, client):
        finish()
        await runner.cancel()

    try:
        await runner.run()
    finally:
        finish()
        ACTIVE.discard(slot)


# The phone provider refused or could not be reached. Not 502: Cloudflare, in front of this
# server, swaps an origin's 502 for its own HTML error page, and the app loses the reason.
PROVIDER_FAILED = 424


def telnyx_reason(status: int, text: str) -> str:
    """Telnyx's own words for a refusal ("Dialed number is not included in whitelisted countries")."""
    try:
        first = (json.loads(text).get("errors") or [{}])[0]
        detail = (first.get("detail") or first.get("title") or "").strip()
    except (ValueError, AttributeError, IndexError):
        detail = ""
    if not detail:
        return f"HTTP {status}"
    return re.sub(r"\s+D\d+\.?$", "", detail.split(". ")[0]).strip()


def dial_body(to: str, from_: str, connection_id: str, webhook_url: str, stream: str) -> dict:
    """A Call Control dial whose media stream opens before the phone rings."""
    return {
        "connection_id": connection_id,
        "to": to,
        "from": from_,
        "timeout_secs": RING_SECS,
        "webhook_url": webhook_url,
        "stream_url": stream,
        "stream_track": "inbound_track",
        "stream_bidirectional_mode": "rtp",
        "stream_bidirectional_codec": "PCMU",
        "stream_establish_before_call_originate": True,
    }


async def dial(to: str, voice: str = DEFAULT_VOICE):
    """Ask Telnyx to call `to`, with the line to the agent opened before it rings."""
    if is_suppressed(to):
        logger.warning(f"not dialling {to}: that number asked not to be called again")
        return
    app_id = os.getenv("TELNYX_CC_APP_ID")
    if not app_id:
        logger.error("TELNYX_CC_APP_ID is not set: outbound calls need a Telnyx Call Control application")
        return
    body = dial_body(
        to, os.environ["TELNYX_NUMBER"], app_id,
        f"https://{PUBLIC_HOST}/telnyx-events?key={quote(VOICELAB_KEY)}", stream_url(voice, normalize_number(to)),
    )
    status, text = await telnyx_post("/v2/calls", body)
    logger.info(f"dial {to}: HTTP {status} {text[:400]}")


async def serve_until_drained(port: int):
    """Serve on 127.0.0.1:`port`. SIGTERM drains (see DRAIN); Ctrl-C still stops at once."""
    server = uvicorn.Server(uvicorn.Config(make_app(), host="127.0.0.1", port=port, log_level="info"))
    stop_now = server.handle_exit

    def on_signal(sig, frame):  # no logging here: a signal handler must not wait on the logger's lock
        if sig != signal.SIGTERM:
            return stop_now(sig, frame)
        if not draining():
            DRAIN["since"] = time.monotonic()

    server.handle_exit = on_signal

    async def exit_when_drained():
        while not draining():
            await asyncio.sleep(0.5)
        logger.warning(f"SIGTERM: draining, no new calls; exiting once {busy()} running thing(s) finish")
        while busy():
            await asyncio.sleep(0.5)
        logger.info(f"drained after {time.monotonic() - DRAIN['since']:.0f}s, exiting")
        server.should_exit = True

    watcher = asyncio.create_task(exit_when_drained())
    try:
        await server.serve()
    finally:
        watcher.cancel()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=7860)
    parser.add_argument("--call", help="number to dial; the server must already be running")
    parser.add_argument("--voice", default=DEFAULT_VOICE, help="voice for --call")
    args = parser.parse_args()

    # Pipecat logs every frame at DEBUG; a production server wants the events, not the firehose.
    logger.remove()
    logger.add(sys.stderr, level=os.getenv("LOG_LEVEL", "DEBUG"))
    if not VOICELAB_KEY:
        logger.warning("VOICELAB_KEY is not set: only test tools on this machine can reach the agent")
    # The clips are made once and kept; make them now so no call waits for a text-to-speech request.
    if get_voicemail(DEFAULT_VOICE) is None:
        logger.error("NO VOICEMAIL MESSAGE: it could not be generated and is not on disk")

    if args.call:
        asyncio.run(dial(args.call, args.voice))
    else:
        PORT = args.port
        asyncio.run(serve_until_drained(args.port))
