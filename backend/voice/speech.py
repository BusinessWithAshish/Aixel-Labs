"""An agent's speech settings (`VoiceAgentSpeech` in the backend's src/db/types.ts), read per call like
its tools: what she does while a tool works, how long she waits after the caller stops before answering
(phone.REPLY_WAIT), what happens when the caller goes quiet, the call's time limit, who speaks first
(phone.serve / _play_session), and her personality (`# Your style` in her prompt).

A missing or broken setting is today's behaviour, so an agent that never saved them runs as before.
"""

import asyncio

from loguru import logger
from pipecat.frames.frames import LLMMessagesAppendFrame

TOOL_WAITS = ("AGENT", "SILENT", "SAY")
REPLY_WAITS = ("QUICK", "NORMAL", "PATIENT")
# VOICE_AGENT_FEATURE_LIMITS: toolWaitLineMax, silenceSecsMin/Max, maxCallMinutesMax.
LINE_MAX = 120
SILENCE_SECS = (5, 60)
MAX_MINUTES = 120
FIRST_SPEAKERS = ("AGENT", "CALLER")
DEFAULTS = {"toolWait": "AGENT", "toolWaitLine": "", "replyWait": "NORMAL", "silenceSecs": 0, "maxCallMinutes": 0,
            "firstSpeaker": "AGENT", "tone": "DEFAULT", "pace": "NORMAL", "replyLength": "NORMAL"}

# `# Your style`: one line per personality setting that isn't its default (VoiceTone, VoicePace, VoiceReplyLength).
TONES = {
    "WARM": "warm and caring: sound glad to help, and show you understand how the caller feels.",
    "FRIENDLY": "friendly and relaxed, like a helpful neighbour; light, everyday words.",
    "PROFESSIONAL": "professional: polite, clear and to the point, without being cold.",
    "FORMAL": "formal: courteous and respectful, no slang, no jokes; address the caller politely.",
    "ENERGETIC": "upbeat and energetic: lively and enthusiastic, without rushing the caller.",
}
PACES = {
    "RELAXED": "Speak slowly and calmly, with short pauses between sentences.",
    "BRISK": "Speak at a brisk, quick pace, without sounding rushed.",
}
LENGTHS = {
    "BRIEF": "Keep every reply short: one or two sentences, then let the caller talk. Give details only when asked.",
}

# What she is told, as a user turn, when the caller goes quiet or time is up. Never in the transcript.
CHECK_IN = ("(The caller has said nothing for {secs} seconds.) In a few words, check whether they are still there. "
            "Don't mention this note.")
SILENT_GOODBYE = ("(The caller has still said nothing.) Say a short, friendly goodbye in one sentence; the call ends "
                  "after it. Don't mention this note.")
TIME_UP = ("(This call has to end now.) Wrap up in one or two sentences: say you have to go and say goodbye. Don't "
           "mention a time limit or this note.")
# The time limit waits for a gap in the talk this long at most before she wraps up.
GAP_WAIT = 20.0


def _whole(value, low: int, high: int) -> int:
    """An int within [low, high], else 0 (off)."""
    if isinstance(value, bool):
        return 0
    try:
        n = int(value)
    except (TypeError, ValueError):
        return 0
    return n if n == value and low <= n <= high else 0


def settings(agent: dict, fill=lambda text: text) -> dict:
    """The agent's speech settings, each one checked; anything else is its default. `fill` fills the
    `{{variables}}` in the line said while a tool works (product.render)."""
    raw = agent.get("speech") if isinstance(agent.get("speech"), dict) else {}
    line = " ".join(fill(str(raw.get("toolWaitLine") or "")).split())[:LINE_MAX]
    wait = raw.get("toolWait") if raw.get("toolWait") in TOOL_WAITS else "AGENT"
    return {
        "toolWait": "AGENT" if wait == "SAY" and not line else wait,
        "toolWaitLine": line,
        "replyWait": raw.get("replyWait") if raw.get("replyWait") in REPLY_WAITS else "NORMAL",
        "silenceSecs": _whole(raw.get("silenceSecs"), *SILENCE_SECS),
        "maxCallMinutes": _whole(raw.get("maxCallMinutes"), 1, MAX_MINUTES),
        # Unset: an outbound agent waits for the callee's hello, any other greets as the line opens.
        "firstSpeaker": raw.get("firstSpeaker") if raw.get("firstSpeaker") in FIRST_SPEAKERS
        else "CALLER" if agent.get("callType") == "OUTBOUND" else "AGENT",
        "tone": raw.get("tone") if raw.get("tone") in TONES else "DEFAULT",
        "pace": raw.get("pace") if raw.get("pace") in PACES else "NORMAL",
        "replyLength": raw.get("replyLength") if raw.get("replyLength") in LENGTHS else "NORMAL",
    }


def style_prompt(s: dict) -> str:
    """`# Your style`, from her personality settings; empty when all are their defaults."""
    lines = [*([f"- Your tone is {TONES[s['tone']]}"] if s.get("tone") in TONES else []),
             *([f"- {PACES[s['pace']]}"] if s.get("pace") in PACES else []),
             *([f"- {LENGTHS[s['replyLength']]}"] if s.get("replyLength") in LENGTHS else [])]
    return "\n".join(["# Your style", "", *lines]) if lines else ""


def tool_wait_prompt(s: dict) -> str:
    """The `# Your tools` line on what she says while a tool works."""
    if s.get("toolWait") == "SILENT":
        return "- While a tool works, say nothing at all; speak again once it has answered."
    if s.get("toolWait") == "SAY":
        return "- Don't say anything before or while you use a tool: a short line is played to the caller for you."
    return "- While a tool works, say nothing, or a couple of words at most (\"one moment\")."


class CallWatch:
    """One call's silence check-in and time limit (both off by default).

    Silence: Pipecat's idle timer (user_idle_timeout, set in phone.build_pipeline_parts) fires once
    she has finished speaking and the caller has said nothing for `silenceSecs`. The first time she
    checks in; if the caller still says nothing she says goodbye and the guard ends the call
    (endedBy "silence"). The time limit starts when the caller can hear her; when it is up she wraps
    up at the next gap in the talk and the call ends after that reply (endedBy "timeout").
    """

    def __init__(self, s: dict, llm, user_aggregator, guard):
        self.s, self.llm, self.guard = s, llm, guard
        self.checked_at: float | None = None  # guard time of the last check-in still unanswered
        self.timer: asyncio.Task | None = None
        if s["silenceSecs"]:
            user_aggregator.add_event_handler("on_user_turn_idle", self.on_idle)

    def start(self):
        if self.s["maxCallMinutes"] and not self.timer:
            self.timer = asyncio.get_running_loop().create_task(self._time_up(self.s["maxCallMinutes"] * 60))

    def stop(self):
        if self.timer:
            self.timer.cancel()
            self.timer = None

    async def note(self, text: str):
        # Gemini Live takes it straight from the service (as TalkOverGate's note), not through the context.
        await self.llm.queue_frame(LLMMessagesAppendFrame([{"role": "user", "content": text}]))

    async def on_idle(self, _aggregator=None):
        g = self.guard
        if g.forced or g.muted:
            return
        if self.checked_at is not None and g._last_speech_end <= self.checked_at:
            logger.info("[speech] no answer to her check-in: saying goodbye")
            g.trigger("silence", f"the caller said nothing for {self.s['silenceSecs']} s after she checked in")
            await self.note(SILENT_GOODBYE)
            return
        self.checked_at = g._now()
        logger.info(f"[speech] {self.s['silenceSecs']} s of silence: checking in")
        await self.note(CHECK_IN.format(secs=self.s["silenceSecs"]))

    async def _time_up(self, secs: float):
        await asyncio.sleep(secs)
        g, waited = self.guard, 0.0
        while waited < GAP_WAIT and (g.caller_quiet_for() == 0.0 or (g.agent and g.agent._speaking)):
            await asyncio.sleep(0.25)
            waited += 0.25
        if g.forced:
            return
        logger.info(f"[speech] time limit ({self.s['maxCallMinutes']} min) reached: wrapping up")
        g.trigger("timeout", f"the {self.s['maxCallMinutes']} minute time limit was reached")
        await self.note(TIME_UP)
