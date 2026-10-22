"""The PIPELINE stack without a provider: which stack and keys a call gets, the services built for it, where
they sit in the call, what the meter counts and what each part costs.

    MONGODB_URI=mongodb://127.0.0.1:27018 MONGODB_DB_NAME=AixelLabsVoiceEngineDev .venv/bin/python tests/cascade_unit.py

Uses a local throwaway database (testdb) for the owner's keys and deletes what it wrote. Nothing connects to a
provider: services are only constructed.
"""
import asyncio, os, sys

import testdb
MONGO, DBNAME = testdb.throwaway()
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import product  # first: keeps the settings above over .env
from bson import ObjectId
from pipecat.frames.frames import LLMContextFrame, LLMMessagesAppendFrame, MetricsFrame, TTSAudioRawFrame, TTSSpeakFrame
from pipecat.metrics.metrics import LLMTokenUsage, LLMUsageMetricsData, TTSUsageMetricsData
from pipecat.processors.frame_processor import FrameDirection
import costs, cascade, phone, speech, tools

assert product.db().name == DBNAME
RESULTS = []


def ok(name, cond, detail=""):
    RESULTS.append((name, bool(cond)))
    print(f"  [{'PASS' if cond else 'FAIL'}] {name}{' -- ' + detail if detail else ''}", flush=True)


def key(provider, secret):
    return {"_id": ObjectId(), "provider": provider, "label": provider, "keySealed": product.seal_secret(secret), "last4": secret[-4:]}


def stack(stt=("deepgram", "nova-3"), llm=("gemini", "gemini-3.5-flash-lite"), tts=("cartesia", "sonic-3.6"), ids=None):
    ids = ids or {}
    return {"kind": "PIPELINE", **{p: {"provider": v[0], "model": v[1], **({"keyId": ids[p]} if p in ids else {})}
                                   for p, v in (("stt", stt), ("llm", llm), ("tts", tts))}}


def resolve_tests(user):
    print("\n== which stack and keys a call gets ==")
    g1, g2, dg, ca = key("gemini", "AIza-one"), key("gemini", "AIza-two"), key("deepgram", "dg-1234"), key("cartesia", "sk_car_9")
    testdb.set_account(product.db(), {"userId": user, "tenantId": ObjectId(), "keys": [g1, g2, dg, ca]})
    ok("no stack anywhere: Gemini Live (None)", cascade.resolve(user, {}) is None)
    product.db().voice_accounts.update_one({"userId": user}, {"$set": {"stack": {"kind": "REALTIME", "provider": "gemini", "model": "gemini-3.8-live"}}})
    ok("the owner's REALTIME stack: Gemini Live", cascade.resolve(user, {}) is None)
    s = cascade.resolve(user, {"stack": stack(llm=("gemini", "gemini-3.5-flash-lite"))})
    ok("the agent's PIPELINE stack wins, each part with its provider's first key opened",
       s and s["stt"]["key"] == "dg-1234" and s["llm"]["key"] == "AIza-one" and s["tts"]["key"] == "sk_car_9"
       and s["llm"]["model"] == "gemini-3.5-flash-lite", str({p: s[p]["key"] for p in cascade.PARTS} if s else s))
    s = cascade.resolve(user, {"stack": stack(ids={"llm": g2["_id"]})})
    ok("a part's keyId picks that key", s["llm"]["key"] == "AIza-two")
    s = cascade.resolve(user, {"stack": stack(ids={"llm": ObjectId()})})
    ok("a keyId the owner no longer has: the provider's first key", s["llm"]["key"] == "AIza-one")
    product.db().voice_accounts.update_one({"userId": user}, {"$set": {"stack": stack()}})
    ok("no agent stack: the owner's PIPELINE stack", (cascade.resolve(user, {}) or {}).get("kind") == "PIPELINE")
    try:
        cascade.resolve(user, {"stack": stack(tts=("elevenlabs", "eleven_flash_v2_5"))})
        ok("no ElevenLabs key: refused", False)
    except product.CallRefused as e:
        ok("no ElevenLabs key: refused, in words the owner can act on", e.code == "provider_key_missing"
           and "elevenlabs" in e.words and "Settings" in e.words, e.words)


def ctx_of(s, voice="kore", tts_voice=None):
    s = {"kind": "PIPELINE", **{p: {**s[p], "key": f"{p}-key"} for p in cascade.PARTS}}
    return {"stack": s, "voice": voice, "tts_voice": tts_voice, "speech": speech.DEFAULTS}


def voice_tests():
    print("\n== her voice ==")
    ctx = ctx_of(stack(tts=("gemini", "gemini-3.8-flash-tts")))
    ok("Gemini TTS, nothing picked: her Gemini Live voice", cascade.voice_of(ctx) == "Kore")
    ok("Gemini TTS: the 'mm' and voicemail clips stay in that voice", cascade.clip_voice(ctx, "kore") == "kore")
    ctx = ctx_of(stack(), tts_voice={"provider": "cartesia", "voiceId": "abc-123", "name": "Ann"})
    ok("the picked voice of the TTS's provider", cascade.voice_of(ctx) == "abc-123")
    ok("another provider's voice: no Gemini clips", cascade.clip_voice(ctx, "kore") is None)
    ctx = ctx_of(stack(tts=("elevenlabs", "eleven_flash_v2_5")), tts_voice={"provider": "cartesia", "voiceId": "abc"})
    ok("a picked voice of another provider: that provider's default", cascade.voice_of(ctx) == cascade.DEFAULT_VOICES["elevenlabs"])
    ok("Gemini Live: clips in her voice as before", cascade.clip_voice(None, "kore") == "kore"
       and cascade.clip_voice({"stack": None}, "kore") == "kore")


def build_tests():
    print("\n== the services and where they sit ==")
    combos = [
        (stack(stt=("gemini", "gemini-3.5-transcribe-live"), tts=("gemini", "gemini-3.8-flash-lite-tts")),
         ("GeminiSTTService", "PipelineGoogleLLMService", "GeminiTTSService")),
        (stack(), ("DeepgramSTTService", "PipelineGoogleLLMService", "CartesiaTTSService")),
        (stack(stt=("openai", "gpt-4o-mini-transcribe"), llm=("openai", "gpt-4.1-mini"), tts=("elevenlabs", "eleven_flash_v2_5")),
         ("OpenAISTTService", "PipelineOpenAILLMService", "ElevenLabsTTSService")),
        (stack(tts=("openai", "gpt-4o-mini-tts")), ("DeepgramSTTService", "PipelineGoogleLLMService", "OpenAITTSService")),
    ]
    for s, want in combos:
        llm, context, pair = phone.build_pipeline_parts("kore", "You are a test.", None, "AIza-test", None, ctx_of(s))
        front, back = phone.stack_ends(llm)
        got = (type(front[0]).__name__, type(llm).__name__, type(back[0]).__name__)
        ok(f"{'/'.join(s[p]['provider'] for p in cascade.PARTS)}: {', '.join(want)}", got == want
           and isinstance(back[1], cascade.Meter) and llm._settings.model == s["llm"]["model"], str(got))
    llm, _, _ = phone.build_pipeline_parts("kore", "You are a test.", None, "AIza-test")
    ok("no ctx: Gemini Live, nothing around it", isinstance(llm, phone.TurnSafeGeminiLive) and phone.stack_ends(llm) == ([], []))
    try:
        cascade.stt_service({"provider": "cartesia", "model": "x", "key": "k"})
        ok("a provider with no STT here is refused", False)
    except ValueError:
        ok("a provider with no STT here is refused", True)


async def llm_tests():
    print("\n== notes, tools and the SAY line on a text model ==")
    ctx = ctx_of(stack())
    ctx["tools"] = {"webhooks": [{"enabled": True, "name": "lookup", "description": "Look a thing up.", "url": "https://example.com/x",
                                  "parameters": [{"name": "q", "type": "string", "required": True}]}]}
    ctx["speech"] = {**speech.DEFAULTS, "toolWait": "SAY", "toolWaitLine": "One moment."}
    ctx["doc"] = {"userId": ObjectId(), "agentId": ObjectId()}
    record = {"turns": []}
    call_tools = tools.CallTools(ctx, record, prefetch=False)
    llm, context, pair = phone.build_pipeline_parts("kore", "You are a test.", call_tools, "AIza-test", ctx["speech"], ctx)
    ok("tools reach the text model on its context, no realtime flush", context.tools.standard_tools[0].name == "lookup"
       and "lookup" in llm._functions and call_tools.flush is None)
    ok("SAY: no Gemini clip is made", call_tools._line is None)
    pushed = []

    async def push(frame, direction=FrameDirection.DOWNSTREAM):
        pushed.append(frame)
    llm.push_frame = push
    await call_tools._say_line()
    await call_tools._say_line()
    ok("SAY: the line goes to her TTS as text, once", [type(f) for f in pushed] == [TTSSpeakFrame] and pushed[0].text == "One moment."
       and record["turns"] == [], str(pushed))

    seen = []

    async def run(frame, direction):
        seen.append(frame)
    base = type(llm).__mro__[2]  # the Pipecat service under _PipelineLLM
    real = base.process_frame
    base.process_frame = lambda self, frame, direction: run(frame, direction)
    try:
        await llm.process_frame(LLMMessagesAppendFrame([{"role": "user", "content": "Check in."}]), FrameDirection.UPSTREAM)
    finally:
        base.process_frame = real
    ok("a CallWatch / TalkOverGate note joins the context and is answered", context.get_messages()[-1]["content"] == "Check in."
       and len(seen) == 1 and isinstance(seen[0], LLMContextFrame), str(seen))


async def meter_tests():
    print("\n== what the meter counts ==")
    meter = cascade.Meter(stack(), name="m")
    meter.push_frame = lambda frame, direction=FrameDirection.DOWNSTREAM: asyncio.sleep(0)
    meter._FrameProcessor__check_started = lambda frame: True
    for frame in (MetricsFrame(data=[LLMUsageMetricsData(processor="llm", value=LLMTokenUsage(prompt_tokens=1200, completion_tokens=40, total_tokens=1290, reasoning_tokens=50))]),
                  MetricsFrame(data=[TTSUsageMetricsData(processor="tts", value=88)]),
                  TTSAudioRawFrame(audio=b"\0" * 48000, sample_rate=24000, num_channels=1)):
        await cascade.Meter.process_frame(meter, frame, FrameDirection.DOWNSTREAM)
    u = meter.usage
    ok("Gemini text model: thinking counted as output", (u["llm_in"], u["llm_out"]) == (1200, 90), str(u))
    ok("TTS characters and seconds of audio", u["tts_chars"] == 88 and abs(u["tts_secs"] - 1.0) < 1e-9, str(u))


def cost_tests(user):
    print("\n== what each part costs ==")
    usage = {"stack": "PIPELINE", "parts": {"stt": {"provider": "deepgram", "model": "nova-3"},
                                            "llm": {"provider": "gemini", "model": "gemini-3.5-flash-lite"},
                                            "tts": {"provider": "cartesia", "model": "sonic-3.6"}},
             "llm_in": 20000, "llm_out": 800, "tts_chars": 1500, "tts_secs": 90.0}
    doc = {"_id": ObjectId(), "userId": user, "channel": "PHONE", "direction": "INBOUND", "durationSec": 180, "endedBy": "goodbye"}
    c = costs.call_cost(doc, usage, "TELNYX")
    s = c.get("stack") or {}
    want = {"stt": 3 * 0.0058, "llm": (20000 * 0.3 + 800 * 2.5) / 1e6, "tts": 1500 * 39 / 1e6}
    ok("Deepgram 3 min + Flash-Lite tokens + Cartesia characters", all(abs(s[p]["usd"] - v) < 1e-9 for p, v in want.items()), str(s))
    ok("no Gemini Live tokens; the total is every part", c["geminiUsd"] == 0
       and abs(c["totalUsd"] - (sum(want.values()) + c["providerUsd"])) < 1e-6, str(c))
    usage["parts"]["tts"] = {"provider": "gemini", "model": "gemini-3.8-flash-tts"}
    ok("Gemini TTS: billed on its minutes of audio", abs(costs.call_cost(doc, usage, None)["stack"]["tts"]["usd"] - 1.5 * 0.0135) < 1e-9)
    product.db().voice_accounts.update_one({"userId": user}, {"$set": {"gemini": {"tier": "free"}, "keys.$[k].tier": "free"}},
                                           array_filters=[{"k.provider": "gemini"}])
    free = costs.call_cost(doc, usage, None)["stack"]
    ok("free-tier Gemini key: its Gemini parts cost nothing, Deepgram still does",
       free["llm"]["usd"] == 0 and free["tts"]["usd"] == 0 and free["stt"]["usd"] > 0, str(free))
    usage["parts"]["llm"] = {"provider": "openai", "model": "gpt-9"}
    s = costs.call_cost(doc, usage, None)["stack"]
    ok("a model with no rate: 0 and marked unpriced", s["llm"]["usd"] == 0 and s["llm"]["priced"] is False)
    a = costs.analysis_cost({**c}, {"promptTokenCount": 1000})
    ok("the analysis adds to a total that keeps the stack", abs(a["totalUsd"] - (c["totalUsd"] + 0.0003)) < 1e-9, str(a))


async def main():
    user = ObjectId()
    try:
        resolve_tests(user)
        voice_tests()
        build_tests()
        await llm_tests()
        await meter_tests()
        cost_tests(user)
    finally:
        product.db().voice_accounts.delete_many({"userId": user})
    passed = sum(1 for _, p in RESULTS if p)
    print(f"\n{passed}/{len(RESULTS)} passed")
    for name, p in RESULTS:
        if not p:
            print("  FAILED:", name)
    sys.exit(0 if passed == len(RESULTS) else 1)


if __name__ == "__main__":
    asyncio.run(main())
