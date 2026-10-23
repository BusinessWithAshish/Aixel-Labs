"""An agent's speech settings without a Live session: reading them, the tool-wait prompt and line, the reply
wait presets, the silence check-in and the time limit.

    MONGODB_URI=mongodb://127.0.0.1:27018 MONGODB_DB_NAME=AixelLabsVoiceEngineDev .venv/bin/python tests/speech_unit.py

Uses a local throwaway database (testdb) for one play_call and deletes what it wrote. No Gemini, no phone:
the line's audio is a stand-in and the model is a stub that records what it is sent.
"""
import asyncio, os, sys

import testdb
MONGO, DBNAME = testdb.throwaway()
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import product  # first: keeps the settings above over .env
from bson import ObjectId
from pipecat.frames.frames import LLMMessagesAppendFrame, OutputAudioRawFrame
import bot, fillers, phone, speech, tools

assert product.db().name == DBNAME
RESULTS = []


def ok(name, cond, detail=""):
    RESULTS.append((name, bool(cond)))
    print(f"  [{'PASS' if cond else 'FAIL'}] {name}{' -- ' + detail if detail else ''}", flush=True)


class StubLLM:
    """What CallWatch and CallTools hand the model: notes (queue_frame) and audio (push_frame)."""

    def __init__(self):
        self.queued, self.pushed, self.functions = [], [], []

    async def queue_frame(self, frame):
        self.queued.append(frame)

    async def push_frame(self, frame):
        self.pushed.append(frame)

    def register_function(self, name, handler, **kwargs):
        self.functions.append(name)


def notes(llm):
    return [f.messages[0]["content"] for f in llm.queued if isinstance(f, LLMMessagesAppendFrame)]


def settings_tests():
    print("\n== reading the settings ==")
    ok("never set: today's behaviour", speech.settings({}) == speech.DEFAULTS and speech.settings({"speech": None}) == speech.DEFAULTS)
    good = {"toolWait": "SAY", "toolWaitLine": "  One   moment,\n {{name}}  ", "replyWait": "PATIENT", "silenceSecs": 20, "maxCallMinutes": 15}
    s = speech.settings({"speech": good}, lambda t: t.replace("{{name}}", "Ravi"))
    ok("valid values kept; the line's variables filled in and its spaces squeezed",
       s == {**speech.DEFAULTS, "toolWait": "SAY", "toolWaitLine": "One moment, Ravi", "replyWait": "PATIENT", "silenceSecs": 20,
             "maxCallMinutes": 15}, str(s))
    bad = speech.settings({"speech": {"toolWait": "SING", "replyWait": "SLOW", "silenceSecs": 3, "maxCallMinutes": 500,
                                      "firstSpeaker": "NOBODY", "tone": "GRUMPY", "pace": "LUDICROUS", "replyLength": "ESSAY"}})
    ok("unknown choices and out-of-range numbers fall back to the defaults", bad == speech.DEFAULTS, str(bad))
    odd = speech.settings({"speech": {"silenceSecs": 20.5, "maxCallMinutes": True}})
    ok("a fraction or a boolean is not a number of seconds/minutes", odd["silenceSecs"] == 0 and odd["maxCallMinutes"] == 0, str(odd))
    ok("SAY with no line (or one that fills in empty) is the agent deciding",
       speech.settings({"speech": {"toolWait": "SAY", "toolWaitLine": "{{x}}"}}, lambda t: "")["toolWait"] == "AGENT")
    first = lambda call_type, chosen=None: speech.settings({"callType": call_type, "speech": {"firstSpeaker": chosen}})["firstSpeaker"]
    ok("who speaks first, unset: an inbound agent greets, an outbound one waits for the hello",
       (first("INBOUND"), first("OUTBOUND"), first(None)) == ("AGENT", "CALLER", "AGENT"))
    ok("...and the owner's choice wins either way",
       (first("INBOUND", "CALLER"), first("OUTBOUND", "AGENT")) == ("CALLER", "AGENT"))
    ok("the line is cut at its limit", len(speech.settings({"speech": {"toolWait": "SAY", "toolWaitLine": "a" * 500}})["toolWaitLine"]) == speech.LINE_MAX)


def prompt_tests():
    print("\n== # Your tools: what she says while a tool works ==")
    hook = {"id": "a1", "name": "order_status", "description": "Look up an order.", "enabled": True, "url": "https://example.com/h", "parameters": []}
    base = {"tools": {"webhooks": [hook]}, "doc": {"agentId": ObjectId()}}
    prompts = {w: tools.CallTools({**base, "speech": {**speech.DEFAULTS, "toolWait": w, "toolWaitLine": "One moment."}}, {"turns": []},
                                  prefetch=False).prompt() for w in speech.TOOL_WAITS}
    ok("AGENT: the line every agent had before", 'say nothing, or a couple of words at most ("one moment")' in prompts["AGENT"])
    ok("no speech in the call (Ashish's line, old callers): the same line",
       tools.CallTools(base, {"turns": []}, prefetch=False).prompt() == prompts["AGENT"])
    ok("SILENT: say nothing at all", "say nothing at all" in prompts["SILENT"] and "one moment" not in prompts["SILENT"])
    ok("SAY: she says nothing herself, a line is played", "a short line is played to the caller for you" in prompts["SAY"])


async def tool_line_tests():
    print("\n== SAY: the line as a tool starts ==")
    hook = {"id": "a1", "name": "order_status", "description": "Look up an order.", "enabled": True, "url": "https://example.com/h", "parameters": []}
    made = []
    real = fillers.get_line
    fillers.get_line = lambda voice, text, key=None, secs=30.0: made.append((voice, text, key, secs)) or b"\x01\x00" * 2400
    try:
        ctx = {"tools": {"webhooks": [hook]}, "doc": {"agentId": ObjectId()}, "gemini_key": "AIza-test",
               "speech": {**speech.DEFAULTS, "toolWait": "SAY", "toolWaitLine": "One moment, checking."}}
        record = {"turns": [{"at": "10:00:00", "who": "caller", "text": "Where is my order?"}]}
        ct, llm = tools.CallTools(ctx, record), StubLLM()
        ct.register(llm, "kore")
        await ct._line
        ok("made once when the call starts, in her voice on the call's key, capped",
           made == [("kore", "One moment, checking.", "AIza-test", tools.LINE_SECS)] and llm.functions == ["order_status"], str(made))
        await ct._say_line()
        audio = [f for f in llm.pushed if isinstance(f, OutputAudioRawFrame)]
        ok("played as the tool starts, at the Live API's rate", len(audio) == 1 and audio[0].sample_rate == 24000 and len(audio[0].audio) == 4800)
        ok("in the transcript as her own line", record["turns"][-1]["who"] == "agent" and record["turns"][-1]["text"] == "One moment, checking.")
        await ct._say_line()
        ok("not again for a repeat ask within SAY_AGAIN_SECS", len(llm.pushed) == 1 and len(record["turns"]) == 2)
        ct._said_at -= tools.SAY_AGAIN_SECS + 1
        await ct._say_line()
        ok("again for a later tool", len(llm.pushed) == 2)

        slow = tools.CallTools(ctx, {"turns": []})
        slow._line, slow.llm = asyncio.get_running_loop().create_future(), StubLLM()
        await slow._say_line()
        ok("audio not ready yet: the tool is not held up and nothing plays", slow.llm.pushed == [])

        plain_ctx = {**ctx, "speech": {**ctx["speech"], "toolWait": "AGENT"}}
        plain, made[:] = tools.CallTools(plain_ctx, {"turns": []}), []
        plain.register(StubLLM(), "kore")
        await plain._say_line()
        ok("AGENT / SILENT: no clip is made or played", plain._line is None and made == [] and plain.llm.pushed == [])
    finally:
        fillers.get_line = real


def pipeline_tests():
    print("\n== reply wait and the silence timer reach Pipecat ==")
    ok("NORMAL is the phone line's turn settings as they were", phone.REPLY_WAIT["NORMAL"] == (phone.VAD_STOP, phone.TURN_STOP))
    ok("a preset for every choice the app offers", set(phone.REPLY_WAIT) == set(speech.REPLY_WAITS))
    ok("QUICK < NORMAL < PATIENT in the longest wait (VAD stop + Smart Turn stop)",
       sum(phone.REPLY_WAIT["QUICK"]) < sum(phone.REPLY_WAIT["NORMAL"]) < sum(phone.REPLY_WAIT["PATIENT"]))
    for name, s in (("default", None), ("PATIENT + 20 s silence", {**speech.DEFAULTS, "replyWait": "PATIENT", "silenceSecs": 20})):
        llm, context, pair = phone.build_pipeline_parts("kore", "You are a test.", None, "AIza-test", s)
        user = pair.user()
        vad = user._params.vad_analyzer.params.stop_secs
        turn = user._params.user_turn_strategies.stop[0]._turn_analyzer.params.stop_secs
        want = phone.REPLY_WAIT[(s or speech.DEFAULTS)["replyWait"]]
        ok(f"{name}: VAD and Smart Turn stop, idle timeout", (vad, turn) == want
           and user._params.user_idle_timeout == (s or speech.DEFAULTS)["silenceSecs"], f"{vad} {turn} {user._params.user_idle_timeout}")


async def watch_tests():
    print("\n== silence check-in and time limit ==")
    s = {**speech.DEFAULTS, "silenceSecs": 15, "maxCallMinutes": 1}

    class Aggregator:
        def __init__(self):
            self.handlers = {}

        def add_event_handler(self, name, fn):
            self.handlers[name] = fn

    agg, llm, record = Aggregator(), StubLLM(), {"stream_id": "t", "turns": []}
    guard = bot.CallGuard(record)
    watch = speech.CallWatch(s, llm, agg, guard)
    ok("the idle event is handled when silence is on", agg.handlers.get("on_user_turn_idle") == watch.on_idle)
    ok("...and not when it is off", "on_user_turn_idle" not in (lambda a: (speech.CallWatch(speech.DEFAULTS, llm, a, guard), a.handlers)[1])(Aggregator()))

    await watch.on_idle()
    ok("first silence: she checks in", notes(llm) == [speech.CHECK_IN.format(secs=15)] and not guard.forced)
    guard.on_speech_started()
    guard.on_speech_stopped()  # they answered
    await watch.on_idle()
    ok("the caller answered, so the next silence is a fresh check-in", len(notes(llm)) == 2 and not guard.forced)
    await watch.on_idle()
    ok("still nothing: goodbye, and the guard ends the call as silence",
       notes(llm)[-1] == speech.SILENT_GOODBYE and guard.forced and guard.reason == "silence"
       and record["flags"][-1]["flag"] == "silence", str(record.get("flags")))
    await watch.on_idle()
    ok("nothing more once the call is ending", len(notes(llm)) == 3)

    muted = speech.CallWatch(s, StubLLM(), Aggregator(), bot.CallGuard({"stream_id": "m", "turns": []}))
    muted.guard.muted = True  # waiting out a voicemail greeting
    await muted.on_idle()
    ok("silent while waiting for a voicemail beep", muted.llm.queued == [])

    timed = speech.CallWatch(s, StubLLM(), Aggregator(), bot.CallGuard({"stream_id": "x", "turns": []}))
    timed.guard.on_speech_started()  # the caller is mid-sentence when time is up
    task = asyncio.get_running_loop().create_task(timed._time_up(0.01))
    await asyncio.sleep(0.4)
    ok("time up while the caller talks: she waits for a gap", timed.llm.queued == [] and not timed.guard.forced)
    timed.guard.on_speech_stopped()
    await asyncio.wait_for(task, 2)
    ok("then wraps up, and the call ends as timeout", notes(timed.llm) == [speech.TIME_UP] and timed.guard.reason == "timeout")

    off = speech.CallWatch(speech.DEFAULTS, StubLLM(), Aggregator(), bot.CallGuard({"stream_id": "o", "turns": []}))
    off.start()
    ok("no limit: no timer", off.timer is None)
    on = speech.CallWatch(s, StubLLM(), Aggregator(), bot.CallGuard({"stream_id": "o2", "turns": []}))
    on.start()
    started = on.timer is not None and not on.timer.done()
    on.stop()
    await asyncio.sleep(0)
    ok("a limit starts a timer when the line is live, and the call's end stops it", started and on.timer is None)


def style_tests():
    print("\n== personality: # Your style ==")
    ok("all defaults: no section, so her prompt is as it was", speech.style_prompt(speech.DEFAULTS) == "")
    s = speech.settings({"speech": {"tone": "WARM", "pace": "RELAXED", "replyLength": "BRIEF"}})
    text = speech.style_prompt(s)
    ok("tone, pace and length each add their line", text.startswith("# Your style") and "warm and caring" in text
       and "relaxed, unhurried pace" in text and "one or two sentences" in text, text)
    ok("only what is set is said", speech.style_prompt({**speech.DEFAULTS, "pace": "BRISK"}).count("\n- ") == 1)
    ok("a line for every choice the app offers but its default",
       set(speech.TONES) | {"DEFAULT"} == {"DEFAULT", "WARM", "FRIENDLY", "PROFESSIONAL", "FORMAL", "ENERGETIC"}
       and set(speech.PACES) | {"NORMAL"} == {"RELAXED", "NORMAL", "BRISK"} and set(speech.LENGTHS) | {"NORMAL"} == {"BRIEF", "NORMAL"})


async def product_tests():
    print("\n== a call reads them from the agent ==")
    tenant, user = ObjectId(), ObjectId()
    testdb.set_account(product.db(), {"tenantId": tenant, "userId": user, "keys": testdb.gemini_keys(product.seal_secret("AIza-unit-test-key"))})
    try:
        agent = {"_id": ObjectId(), "tenantId": tenant, "userId": user, "name": "Priya", "voice": "kore", "prompt": "You are Priya.",
                 "callNotes": "", "speech": {"toolWait": "SAY", "toolWaitLine": "{{agent_name}} here, one moment.", "replyWait": "QUICK",
                                             "silenceSecs": 10, "maxCallMinutes": 5}}
        ctx = await asyncio.to_thread(product.play_call, agent)
        ok("play_call: speech checked, variables filled in", ctx["speech"] == {**speech.DEFAULTS, "toolWait": "SAY", "toolWaitLine": "Priya here, one moment.",
                                                                               "replyWait": "QUICK", "silenceSecs": 10, "maxCallMinutes": 5}, str(ctx["speech"]))
        ok("no personality set: no # Your style in her prompt", "# Your style" not in ctx["prompt"])
        styled = await asyncio.to_thread(product.play_call, {**agent, "speech": {**agent["speech"], "tone": "FORMAL", "replyLength": "BRIEF"}})
        ok("personality set: # Your style after her own prompt, before # Right now",
           styled["prompt"].index("You are Priya.") < styled["prompt"].index("# Your style") < styled["prompt"].index("# Right now")
           and "formal" in styled["prompt"], styled["prompt"][:400])
        bare = await asyncio.to_thread(product.play_call, {**agent, "speech": None})
        ok("an agent that never set them: the defaults", bare["speech"] == speech.DEFAULTS)
    finally:
        product.db().voice_accounts.delete_many({"userId": user})


async def main():
    settings_tests()
    prompt_tests()
    style_tests()
    await tool_line_tests()
    pipeline_tests()
    await watch_tests()
    await product_tests()
    passed = sum(1 for _, p in RESULTS if p)
    print(f"\n{passed}/{len(RESULTS)} passed")
    for name, p in RESULTS:
        if not p:
            print("  FAILED:", name)
    sys.exit(0 if passed == len(RESULTS) else 1)


if __name__ == "__main__":
    asyncio.run(main())
