"""Agent features without a Live session: {{variables}}, the post-call analysis, caller memory, voicemail mode.

    .venv/bin/python tests/agent_features_unit.py

Uses a local throwaway database (AixelLabsVoiceEngineDev on 127.0.0.1:27018) and deletes what it wrote.
Gemini's text API is a fake on 127.0.0.1:7885 (GEMINI_API_BASE), so nothing leaves this machine.
"""
import asyncio, json, os, sys
from datetime import datetime, timezone

import testdb
MONGO, DBNAME = testdb.throwaway()
FAKE_GEMINI = 7885
os.environ["GEMINI_API_BASE"] = f"http://127.0.0.1:{FAKE_GEMINI}"
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import product  # first: keeps the settings above over .env
from aiohttp import web
from bson import ObjectId
import analysis, bot, fillers

assert product.db().name == DBNAME and product.GEMINI_API_BASE.endswith(str(FAKE_GEMINI))
RESULTS = []
UTC = timezone.utc
# Monday 19 October 2026, 16:50 in Kolkata.
AT = datetime(2026, 10, 19, 11, 20, tzinfo=UTC)


def ok(name, cond, detail=""):
    RESULTS.append((name, bool(cond)))
    print(f"  [{'PASS' if cond else 'FAIL'}] {name}{' -- ' + detail if detail else ''}", flush=True)


def owner():
    tenant, user = ObjectId(), ObjectId()
    product.db().voice_settings.insert_one({"tenantId": tenant, "userId": user,
                                            "gemini": {"keySealed": product.seal_secret("AIza-unit-test-key")}})
    return tenant, user


def cleanup(user):
    for name in ("voice_settings", "voice_calls", "voice_caller_memories"):
        product.db()[name].delete_many({"userId": user})


def variables_tests():
    print("\n== {{variables}} ==")
    agent = {"name": "Priya", "variables": {"clinic": "Smile Dental", "offer": "a free check-up", "first_name": "there"},
             "tools": {"booking": {"enabled": False, "timezone": "Asia/Kolkata"}}}
    ctx = {"customer_phone": "+919812345678", "variables": {"first_name": "Ravi", "today": "not today"}}
    v = product.call_variables(ctx, agent, AT)
    ok("built-ins: now / today / weekday in the business timezone (booking's, even when booking is off)",
       v["now"] == "Monday 19 October 2026, 4:50 PM" and v["today"] == "Monday 19 October 2026" and v["weekday"] == "Monday", v["now"])
    ok("built-ins: caller_number, agent_name, business_timezone",
       v["caller_number"] == "+919812345678" and v["agent_name"] == "Priya" and v["business_timezone"] == "Asia/Kolkata")
    ok("a call's own value beats the agent's default", v["first_name"] == "Ravi")
    ok("a built-in cannot be overridden by a call", v["today"] == "Monday 19 October 2026")
    text = "Hi {{first_name}}, {{ clinic }} here. {{Offer}}? {{unknown}}|{{ 9bad }}|{single}|{{caller_number}}"
    ok("render: names, spaces inside braces, case-insensitive, unknown -> empty, non-names untouched",
       product.render(text, v) == "Hi Ravi, Smile Dental here. a free check-up? |{{ 9bad }}|{single}|+919812345678",
       product.render(text, v))
    ok("render is one pass: a value holding {{x}} is not expanded", product.render("{{a}}", {"a": "{{b}}", "b": "x"}) == "{{b}}")
    long = product.call_variables({"variables": {"note": "line one\nline   two " + "x" * 600}}, {}, AT)["note"]
    ok("values go on one line, capped at 500", long.startswith("line one line two") and len(long) == 500)
    ok("non-text values are ignored", "bad" not in product.call_variables({"variables": {"bad": {"x": 1}}}, {}, AT))
    utc = product.call_variables({}, {"tools": None}, AT)
    ok("no booking timezone: UTC, caller_number empty", utc["business_timezone"] == "UTC" and utc["now"].endswith("11:20 AM")
       and utc["caller_number"] == "")
    p = product.agent_prompt({"prompt": "You call for {{clinic}}.", "callNotes": "Owner: {{first_name}}"}, v)
    ok("agent_prompt fills the prompt and the call notes", p == "You call for Smile Dental.\n\n# This call\n\nOwner: Ravi", p)
    ok("agent_prompt without values leaves them as written (unchanged behaviour)",
       product.agent_prompt({"prompt": "{{x}}", "callNotes": ""}) == "{{x}}")


def calls_tests():
    print("\n== variables through product.phone_call (POST /calls, defaults) ==")
    tenant, user = owner()
    try:
        agent = {"_id": ObjectId(), "tenantId": tenant, "userId": user, "name": "Maya", "voice": "kore",
                 "prompt": "Ask for {{contact}} at {{company}}. Today is {{weekday}}.", "callNotes": "Lead: {{company}}",
                 "variables": {"company": "Acme", "contact": "the owner"},
                 "voicemail": {"action": "MESSAGE", "message": "Hi {{contact}}, it's {{agent_name}} about {{company}}.\nCall back."}}
        number = {"_id": ObjectId(), "tenantId": tenant, "userId": user, "phoneNumber": "+15550001111", "provider": "TELNYX",
                  "apiKeySealed": product.seal_secret("KEY_FAKE")}
        product.hold_call_variables(str(number["_id"]), "+15559990000", {"contact": "Ravi"})
        out = product.phone_call(number, agent, "OUTBOUND", "+15559990000")
        ok("held /calls variables reach the call and its doc", out["variables"] == {"contact": "Ravi"}
           and out["doc"]["variables"] == {"contact": "Ravi"})
        ok("prompt rendered: call value, default, built-in",
           out["prompt"].startswith("Ask for Ravi at Acme. Today is ") and "# This call\n\nLead: Acme" in out["prompt"], out["prompt"][:80])
        ok("held variables are used once", product.phone_call(number, agent, "OUTBOUND", "+15559990000").get("variables") is None)
        ok("voicemail message rendered on one line", out["voicemail"] == "Hi Ravi, it's Maya about Acme. Call back.", out["voicemail"])
        inbound = product.phone_call(number, agent, "INBOUND", "+15557770000")
        ok("a call coming in has no voicemail message and takes no held variables", "voicemail" not in inbound
           and "variables" not in inbound and "Ask for the owner at Acme" in inbound["prompt"])
        hang = product.phone_call(number, {**agent, "voicemail": {"action": "HANG_UP", "message": "x"}}, "OUTBOUND", "+15550002222")
        none = product.phone_call(number, {**agent, "voicemail": None}, "OUTBOUND", "+15550002222")
        ok("voicemail HANG_UP or unset: no message (hang up)", hang["voicemail"] is None and none["voicemail"] is None)
        ok("analysis settings on the ctx (summary only by default)", out["analysis"] == analysis.settings({}))
    finally:
        cleanup(user)


def voicemail_tests():
    print("\n== voicemail mode ==")
    record = {"turns": [], "stream_id": "unit"}
    guard = bot.CallGuard(record, "+15559990000")
    ours = bot.GuardAgent(guard, voice="kore")
    ok("Ashish's line (no message given): ours, VOICEMAIL_TEXT", ours.can_leave_message() and ours._message == fillers.VOICEMAIL_TEXT)
    ok("a customer agent set to hang up: no message", not bot.GuardAgent(bot.CallGuard(dict(record)), voice="kore", message=None).can_leave_message())
    ok("a customer message: leaves it", bot.GuardAgent(bot.CallGuard(dict(record)), voice="kore", message="Hi, call back.").can_leave_message())
    ok("no voice (the playground): never", not bot.GuardAgent(bot.CallGuard(dict(record)), message="Hi").can_leave_message())
    made = []
    real = fillers._generate
    fillers._generate = lambda voice, text=fillers.FILLER_TEXT, max_seconds=0.7, api_key=None: (made.append((voice, text, max_seconds, api_key)) or b"\x01\x00" * 2400)
    try:
        a = fillers.get_voicemail("kore", "KEY", "Hi Ravi, call back.")
        b = fillers.get_voicemail("kore", "KEY", "Hi Ravi, call back.")
        fillers.get_voicemail("kore", "KEY", "Hi Asha, call back.")
        ok("a customer's message is made on the call's key, capped at 30 s, kept in memory (once per text)",
           a == b and len(made) == 2 and made[0] == ("kore", "Hi Ravi, call back.", 30.0, "KEY"), str(made))
        ok("not written to the fillers folder", not any("Ravi" in p.name for p in fillers.CACHE.glob("*")))
        for i in range(fillers.MESSAGES_KEPT + 5):
            fillers.get_voicemail("kore", "KEY", f"message {i}")
        ok("only the last few are kept", len(fillers._MESSAGES) == fillers.MESSAGES_KEPT)
    finally:
        fillers._generate = real
    ctx = {"doc": {"_id": ObjectId(), "tenantId": ObjectId(), "userId": ObjectId(), "agentId": ObjectId(), "numberId": ObjectId(),
                   "channel": "PHONE", "direction": "OUTBOUND", "from": "+1555", "to": "+1666"}, "voice": "kore",
           "live_at": product.now()}
    doc = product.call_doc(ctx, {"turns": [], "ended_by": "voicemail_message", "voicemail_message": "Hi Ravi."}, {})
    ok("the doc carries endedBy and the message left", doc["endedBy"] == "voicemail_message" and doc["voicemailMessage"] == "Hi Ravi.")
    ok("no message, no field", "voicemailMessage" not in product.call_doc(ctx, {"turns": [], "ended_by": "voicemail"}, {}))


CFG = {"summary": True, "sentiment": True, "success": True, "successDefinition": "A demo was booked.",
       "fields": [{"name": "wants_demo", "type": "boolean", "description": "Agreed to see the demo"},
                  {"name": "budget", "type": "number", "description": "Monthly budget in rupees"},
                  {"name": "next_step", "type": "text", "description": "What happens next"},
                  {"name": "interest", "type": "choice", "description": "How interested", "options": ["High", "Medium", "Low"]}]}


def parse_tests():
    print("\n== analysis: settings, schema, JSON parsing and validation ==")
    ok("no settings = summary only", analysis.settings({}) == {"summary": True, "sentiment": False, "success": False,
                                                               "successDefinition": "", "fields": []})
    s = analysis.settings({"analysis": {**CFG, "fields": CFG["fields"] + [
        {"name": "Bad Name", "type": "text"}, {"name": "x", "type": "date"}, {"name": "c", "type": "choice", "options": []}]
        + [{"name": f"f{i}", "type": "text"} for i in range(10)]}})
    ok("bad fields dropped (name, type, choice without options), at most 10 kept",
       [f["name"] for f in s["fields"]][:4] == ["wants_demo", "budget", "next_step", "interest"] and len(s["fields"]) == 10)
    ok("wanted: memory alone runs the pass; all off does not",
       analysis.wanted({**analysis.settings({}), "summary": False}, True) and not analysis.wanted({**analysis.settings({}), "summary": False}, False))
    sc = analysis.schema(analysis.settings({"analysis": CFG}), memory=True)
    ok("schema: only what was asked, all required", sc["required"] == ["summary", "sentiment", "successful", "fields", "memory"]
       and sc["properties"]["fields"]["properties"]["interest"]["enum"] == ["High", "Medium", "Low", None])
    off = analysis.schema({**analysis.settings({}), "summary": False, "sentiment": True}, memory=False)
    ok("schema: summary off, sentiment on", list(off["properties"]) == ["sentiment"])
    cfg = analysis.settings({"analysis": CFG})
    raw = json.dumps({"summary": "  Asked about pricing.\nBooked a demo. ", "sentiment": "Positive", "successful": True,
                      "fields": {"wants_demo": "yes", "budget": "5,000", "next_step": "Demo Thursday", "interest": "high"},
                      "memory": "Ravi, owns Smile Dental. " * 40, "extra": "ignored"})
    result, brief = analysis.parse(raw, cfg, memory=True)
    ok("parse: text cleaned, sentiment lower-cased, coerced bool/number, choice matched to its option",
       result == {"summary": "Asked about pricing. Booked a demo.", "sentiment": "positive", "successful": True,
                  "fields": {"wants_demo": True, "budget": 5000, "next_step": "Demo Thursday", "interest": "High"}}, str(result))
    ok("parse: memory brief capped at 600", brief and len(brief) == 600 and brief.startswith("Ravi, owns Smile Dental."))
    bad, _ = analysis.parse(json.dumps({"summary": 12, "sentiment": "angry", "successful": "maybe",
                                         "fields": {"wants_demo": 3, "budget": "lots", "interest": "Very"}}), cfg, memory=False)
    ok("parse: wrong types and answers outside the options become null",
       bad == {"summary": "12", "sentiment": None, "successful": None,
               "fields": {"wants_demo": None, "budget": None, "next_step": None, "interest": None}}, str(bad))
    only, none = analysis.parse('{"summary": "Hi.", "sentiment": "positive"}', analysis.settings({}), memory=False)
    ok("parse: only the parts asked for are kept; no memory when off", only == {"summary": "Hi."} and none is None)
    for raw in ("not json", "[1, 2]"):
        try:
            analysis.parse(raw, cfg, False)
            raised = False
        except ValueError:
            raised = True
        ok(f"parse: {raw!r} raises ValueError (recorded as the analysis error)", raised)
    doc = {"direction": "INBOUND", "turns": [{"role": "agent", "text": "Hello."}, {"role": "caller", "text": "Book me in."},
                                              {"role": "agent", "text": "Done."}],
           "toolCalls": [{"name": "book_appointment", "arguments": {"time": "14:00"}, "result": "Booked.", "afterTurn": 2}]}
    t = analysis.transcript(doc)
    ok("transcript: tool runs placed after the turn they followed",
       t == 'Agent: Hello.\nCaller: Book me in.\n[tool book_appointment {"time": "14:00"} -> Booked.]\nAgent: Done.', t)
    text = analysis.instructions(cfg, True, doc, "Priya", "Ravi likes mornings.")
    ok("instructions: the owner's success definition, each field, the earlier memory",
       "A demo was booked." in text and "fields.interest (one of: High, Medium, Low)" in text and "Earlier note: Ravi likes mornings." in text)


class FakeGemini:
    """generateContent: answers what `answer` holds (or a status), records each request."""

    def __init__(self):
        self.requests, self.answer, self.status = [], {}, 200

    async def handle(self, request):
        self.requests.append({"path": request.path, "key": request.headers.get("x-goog-api-key"), "body": await request.json()})
        if self.status != 200:
            return web.json_response({"error": {"message": "API key not valid. Please pass a valid API key."}}, status=self.status)
        return web.json_response({"candidates": [{"content": {"parts": [{"text": json.dumps(self.answer)}]}}]})

    async def start(self):
        app = web.Application()
        app.router.add_post("/v1beta/models/{model}", self.handle)
        self.runner = web.AppRunner(app)
        await self.runner.setup()
        await web.TCPSite(self.runner, "127.0.0.1", FAKE_GEMINI).start()


async def memory_tests():
    print("\n== analysis after a call + caller memory (fake Gemini) ==")
    gem = FakeGemini()
    await gem.start()
    tenant, user = owner()
    try:
        agent = {"_id": ObjectId(), "tenantId": tenant, "userId": user, "name": "Priya", "voice": "kore", "prompt": "You are Priya.",
                 "callNotes": "", "memory": True, "analysis": {"summary": True, "sentiment": True, "success": False,
                                                                 "successDefinition": "", "fields": []}}
        number = {"_id": ObjectId(), "tenantId": tenant, "userId": user, "phoneNumber": "+15550001111", "provider": "TELNYX",
                  "apiKeySealed": product.seal_secret("KEY_FAKE")}
        first = product.phone_call(number, agent, "INBOUND", "+1 (555) 777-0000")
        ok("memory key: the caller's number, normalized", first["memory_phone"] == "+15557770000")
        ok("first call: nothing remembered yet", "What you remember" not in first["prompt"] and "memoryUsed" not in first["doc"])
        first["live_at"] = product.now()
        rec = {"voice": "kore", "turns": [{"who": "agent", "text": "Hello, Smile Dental."},
                                         {"who": "caller", "text": "Hi, I'm Ravi, can I come in on Thursday?"}]}
        doc = product.call_doc(first, rec, {})
        product._insert(doc)
        gem.answer = {"summary": "Ravi asked for Thursday.", "sentiment": "neutral", "memory": "Ravi wants a Thursday slot."}
        await analysis.after_call(first, doc)
        stored = product.db().voice_calls.find_one({"_id": doc["_id"]})
        ok("analysis stored on the call", stored["analysis"] == {"summary": "Ravi asked for Thursday.", "sentiment": "neutral",
                                                                  "model": analysis.MODEL}, str(stored.get("analysis")))
        ok("ran on the call's own key, with structured JSON output", gem.requests[-1]["key"] == "AIza-unit-test-key"
           and gem.requests[-1]["body"]["generationConfig"]["responseMimeType"] == "application/json"
           and gem.requests[-1]["path"].endswith(f"{analysis.MODEL}:generateContent"))
        mem = product.db().voice_caller_memories.find_one({"userId": user})
        ok("memory keyed by owner + agent + number", mem and mem["agentId"] == agent["_id"] and mem["phone"] == "+15557770000"
           and mem["brief"] == "Ravi wants a Thursday slot." and mem["calls"] == 1 and mem["lastCallId"] == doc["_id"])
        second = product.phone_call(number, agent, "INBOUND", "+15557770000")
        p = second["prompt"]
        ok("next call: injected under '# What you remember about this caller' with the last-call date, before # Right now",
           "# What you remember about this caller" in p and "Ravi wants a Thursday slot." in p
           and p.index("# What you remember") < p.index("# Right now") and f"{doc['startedAt'].day} {doc['startedAt']:%B}" in p, p[-400:])
        ok("the call doc records what she was told", second["doc"]["memoryUsed"]["brief"] == "Ravi wants a Thursday slot.")
        other_agent = product.phone_call(number, {**agent, "_id": ObjectId()}, "INBOUND", "+15557770000")
        other_number = product.phone_call(number, agent, "INBOUND", "+15557770001")
        off = product.phone_call(number, {**agent, "memory": False}, "INBOUND", "+15557770000")
        play = product.play_call(agent)
        ok("not shared with another agent, another number, memory off, or the playground",
           all("What you remember" not in c["prompt"] for c in (other_agent, other_number, off, play))
           and off["memory_phone"] is None and play["memory_phone"] is None)
        second["live_at"] = product.now()
        doc2 = product.call_doc(second, rec, {})
        product._insert(doc2)
        gem.answer = {"summary": "Ravi confirmed.", "sentiment": "positive", "memory": "Ravi, booked Thursday 10:00."}
        await analysis.after_call(second, doc2)
        sent = gem.requests[-1]["body"]["contents"][0]["parts"][0]["text"]
        mem = product.db().voice_caller_memories.find_one({"userId": user})
        ok("second pass is given the earlier note and rewrites it", "Earlier note: Ravi wants a Thursday slot." in sent
           and mem["brief"] == "Ravi, booked Thursday 10:00." and mem["calls"] == 2
           and product.db().voice_caller_memories.count_documents({"userId": user}) == 1)
        n = len(gem.requests)
        silent = {**product.call_doc(second, {"voice": "kore", "turns": [{"who": "agent", "text": "Hello?"}]}, {}), "_id": ObjectId()}
        product._insert(silent)
        await analysis.after_call(second, silent)
        ok("a call where the caller said nothing is not analysed", len(gem.requests) == n
           and "analysis" not in product.db().voice_calls.find_one({"_id": silent["_id"]}))
        gem.status = 400
        doc3 = {**product.call_doc(second, rec, {}), "_id": ObjectId()}
        product._insert(doc3)
        await analysis.after_call(second, doc3)
        failed = product.db().voice_calls.find_one({"_id": doc3["_id"]})["analysis"]
        ok("a refused key: the failure is recorded, not raised; memory untouched", "error" in failed and failed["model"] == analysis.MODEL
           and "not a valid API key" in failed["error"] and product.db().voice_caller_memories.find_one({"userId": user})["calls"] == 2,
           failed.get("error", ""))
        gem.status = 200
        save_ctx = product.phone_call(number, agent, "INBOUND", "+15557770000")
        save_ctx["live_at"] = product.now()
        gem.answer = {"summary": "Background.", "sentiment": "neutral", "memory": "Ravi again."}
        product.save_call(save_ctx, {"voice": "kore", "turns": rec["turns"]}, {})
        ok("save_call returns at once; the analysis runs in the background", len(product._AFTER_CALL) == 1)
        await asyncio.gather(*product._AFTER_CALL)
        saved = product.db().voice_calls.find_one({"_id": save_ctx["doc"]["_id"]})
        ok("background task: doc written, then analysed", saved and saved["analysis"]["summary"] == "Background.")
    finally:
        cleanup(user)
        await gem.runner.cleanup()


async def main():
    variables_tests()
    calls_tests()
    voicemail_tests()
    parse_tests()
    await memory_tests()
    passed = sum(1 for _, p in RESULTS if p)
    print(f"\n{passed}/{len(RESULTS)} passed")
    for name, p in RESULTS:
        if not p:
            print("  FAILED:", name)


if __name__ == "__main__":
    asyncio.run(main())
