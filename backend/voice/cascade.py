"""The PIPELINE stack (`VoiceStackKind.PIPELINE` in the backend's types.ts): speech-to-text, a text model
and text-to-speech, each from its own provider, on the owner's own key for it. The REALTIME stack
(Gemini Live, bot.py) stays the default: phone.py takes this path only for a call whose ctx["stack"]
is a PIPELINE.

Everything around the model is shared with the REALTIME stack (phone.py): the same turn taking (Silero +
Smart Turn in the user aggregator), CallLog, the call guard, tools, speech settings, the turn timer, the
record. What differs:

    stt   in front of the user aggregator (the caller's words come DOWNSTREAM here, not up from the model)
    llm   PipelineLLM: a CallWatch note or a TalkOverGate note goes into the context and is answered,
          as Gemini Live does with them; a tool call runs to its end when the caller talks (as
          tools.ToolsGeminiLive); `usage` is the Meter's
    tts   after the model; `Meter` after it adds up what each part is billed on (costs.pipeline_cost)

Measured 2026-10-22 (research/pipeline-stack-2026-10-22.md): Gemini Live refuses text output, so a
"Gemini hears, another voice speaks" hybrid cannot be built on it; this is the full pipeline.
"""

from loguru import logger

from pipecat.frames.frames import LLMContextFrame, LLMMessagesAppendFrame, MetricsFrame, TTSAudioRawFrame
from pipecat.metrics.metrics import LLMUsageMetricsData, TTSUsageMetricsData
from pipecat.processors.frame_processor import FrameDirection, FrameProcessor

import product

# A voice for an agent that picked none of this provider's (ttsVoice absent, or another provider's).
# gemini: the agent's own Gemini Live voice, so switching stacks keeps her voice.
DEFAULT_VOICES = {
    "cartesia": "f786b574-daa5-4673-aa0c-cbe3e8534c02",  # Katie, Cartesia's voice-agent default
    "elevenlabs": "21m00Tcm4TlvDq2ExCQ3",  # Rachel, a premade voice every account has
    "openai": "coral",
}


PARTS = ("stt", "llm", "tts")


def resolve(user_id, agent: dict) -> dict | None:
    """ctx["stack"] of a customer call: its stack (product.stack_for) when it is a PIPELINE, each part with
    its opened `key` (product.key_for). None = REALTIME, today's Gemini Live path.
    Raises ProviderKeyMissing when a part has no key."""
    account = product.db().voice_accounts.find_one({"userId": product.oid(user_id)}, {"keys": 1, "stack": 1}) or {}
    stack = product.stack_for(agent, account)
    if stack.get("kind") != "PIPELINE":
        return None
    out = {"kind": "PIPELINE"}
    for name in PARTS:
        part = stack[name]
        key = product.key_for(account.get("keys"), part["provider"], part.get("keyId"))
        if not key:
            raise ProviderKeyMissing(f"no {part['provider']} API key is saved", part["provider"])
        out[name] = {"provider": part["provider"], "model": part["model"], "key": product.open_secret(key["keySealed"]),
                     "sealed": key["keySealed"]}
    return out


class ProviderKeyMissing(product.CallRefused):
    """The stack names a provider the owner has no key for: no call (product.save_refused logs it)."""
    code, ended_by, flag = "provider_key_missing", "error", "provider_key_missing"

    def __init__(self, why: str, provider: str):
        super().__init__(why)
        self.words = f"No {provider} API key is saved for this agent's voice stack: add one under Voice agent > Settings in the app."


def is_pipeline(ctx: dict | None) -> bool:
    return bool(ctx and (ctx.get("stack") or {}).get("kind") == "PIPELINE")


def voice_of(ctx: dict) -> str:
    """The TTS voice id: the agent's ttsVoice when it is the TTS part's provider's, else a default."""
    provider = ctx["stack"]["tts"]["provider"]
    picked = ctx.get("tts_voice") or {}
    if picked.get("provider") == provider and picked.get("voiceId"):
        return picked["voiceId"]
    if provider == "gemini":
        return (ctx.get("voice") or "aoede").capitalize()
    return DEFAULT_VOICES[provider]


def clip_voice(ctx: dict | None, voice: str) -> str | None:
    """The Gemini voice of her pre-made clips (the "mm" while she thinks, the voicemail message), or None
    when a PIPELINE stack speaks in another provider's voice: then there is no "mm", and a voicemail is
    hung up on without a message.
    shortcut: no clips in a Cartesia/ElevenLabs/OpenAI voice; make them with the call's TTS if owners miss them."""
    if not is_pipeline(ctx):
        return voice
    return voice_of(ctx).lower() if ctx["stack"]["tts"]["provider"] == "gemini" else None


def stt_service(part: dict):
    provider, model, key = part["provider"], part["model"], part["key"]
    if provider == "deepgram":
        from pipecat.services.deepgram.stt import DeepgramSTTService

        return DeepgramSTTService(api_key=key, settings=DeepgramSTTService.Settings(model=model))
    if provider == "gemini":
        from pipecat.services.google.gemini_live.stt import GeminiSTTService

        return GeminiSTTService(api_key=key, settings=GeminiSTTService.Settings(model=model))
    if provider == "openai":
        from pipecat.services.openai.stt import OpenAISTTService

        return OpenAISTTService(api_key=key, settings=OpenAISTTService.Settings(model=model))
    raise ValueError(f"no speech-to-text from {provider}")


def tts_service(part: dict, voice: str):
    provider, model, key = part["provider"], part["model"], part["key"]
    if provider == "cartesia":
        from pipecat.services.cartesia.tts import CartesiaTTSService

        return CartesiaTTSService(api_key=key, settings=CartesiaTTSService.Settings(model=model, voice=voice))
    if provider == "elevenlabs":
        from pipecat.services.elevenlabs.tts import ElevenLabsTTSService

        return ElevenLabsTTSService(api_key=key, settings=ElevenLabsTTSService.Settings(model=model, voice=voice))
    if provider == "openai":
        from pipecat.services.openai.tts import OpenAITTSService

        return OpenAITTSService(api_key=key, settings=OpenAITTSService.Settings(model=model, voice=voice))
    if provider == "gemini":
        from pipecat.services.google.tts import GeminiTTSService

        return GeminiTTSService(api_key=key, settings=GeminiTTSService.Settings(model=model, voice=voice))
    raise ValueError(f"no text-to-speech from {provider}")


class _PipelineLLM:
    """What phone.py and speech.py expect of `llm`, on a text model (mixed into its Pipecat service)."""

    speaks_text = True  # tools.CallTools: the SAY line goes to the TTS as text

    def attach(self, context, meter: "Meter"):
        self._call_context = context
        self.usage = meter.usage
        self.on_key_error = None  # shortcut: a refused provider key is not noted on the key (phone.end_on_key_error)

    async def process_frame(self, frame, direction):
        if isinstance(frame, LLMMessagesAppendFrame):
            # speech.CallWatch and TalkOverGate hand the model a note: into the context, and answered.
            self._call_context.add_messages(frame.messages)
            await super().process_frame(LLMContextFrame(context=self._call_context), FrameDirection.DOWNSTREAM)
            return
        await super().process_frame(frame, direction)

    async def _handle_interruptions(self, _frame):
        # A tool call runs to its end when the caller talks (tools.ToolsGeminiLive says why).
        return


def llm_service(part: dict, prompt: str):
    provider, model, key = part["provider"], part["model"], part["key"]
    if provider == "gemini":
        from pipecat.services.google.llm import GoogleLLMService as Base
    elif provider == "openai":
        from pipecat.services.openai.llm import OpenAILLMService as Base
    else:
        raise ValueError(f"no text model from {provider}")
    cls = type(f"Pipeline{Base.__name__}", (_PipelineLLM, Base), {})
    return cls(api_key=key, settings=Base.Settings(model=model, system_instruction=prompt))


class Meter(FrameProcessor):
    """Adds up what the call's text model and TTS are billed on, from Pipecat's usage metrics and the
    TTS audio. Sits after the TTS. The STT part is billed on the call's length (costs.pipeline_cost)."""

    def __init__(self, stack: dict, **kwargs):
        super().__init__(**kwargs)
        self._gemini_llm = stack["llm"]["provider"] == "gemini"
        self.usage = {
            "stack": "PIPELINE",
            "parts": {p: {"provider": stack[p]["provider"], "model": stack[p]["model"]} for p in ("stt", "llm", "tts")},
            "llm_in": 0, "llm_out": 0, "tts_chars": 0, "tts_secs": 0.0,
        }

    async def process_frame(self, frame, direction):
        await super().process_frame(frame, direction)
        u = self.usage
        if isinstance(frame, MetricsFrame):
            for d in frame.data:
                if isinstance(d, LLMUsageMetricsData):
                    u["llm_in"] += d.value.prompt_tokens or 0
                    # Gemini counts thinking apart from the reply (both bill as output); OpenAI's includes it.
                    u["llm_out"] += (d.value.completion_tokens or 0) + ((d.value.reasoning_tokens or 0) if self._gemini_llm else 0)
                elif isinstance(d, TTSUsageMetricsData):
                    u["tts_chars"] += d.value
        elif isinstance(frame, TTSAudioRawFrame) and frame.sample_rate:
            u["tts_secs"] += len(frame.audio) / (2 * frame.sample_rate * frame.num_channels)
        await self.push_frame(frame, direction)


def build(ctx: dict, prompt: str, context, call_tools):
    """The text model of a PIPELINE call, carrying its `stt`, `tts` and `meter` (phone.stack_ends).
    `context` is the call's LLMContext (the tools are on it)."""
    stack = ctx["stack"]
    meter = Meter(stack, name="meter")
    llm = llm_service(stack["llm"], prompt)
    llm.attach(context, meter)
    tts = tts_service(stack["tts"], voice_of(ctx))
    logger.info("pipeline stack: " + ", ".join(f"{p} {stack[p]['provider']}/{stack[p]['model']}" for p in ("stt", "llm", "tts")))
    if call_tools:
        call_tools.register(llm, None)  # no Gemini clip for the SAY line: her TTS says it (speaks_text)
    llm.stt, llm.tts, llm.meter = stt_service(stack["stt"]), tts, meter
    return llm
