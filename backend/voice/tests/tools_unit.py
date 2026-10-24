"""Agent tools (tools.py) without Gemini: the calendar, voice_bookings, webhooks, the prompt, the call doc.

    .venv/bin/python tests/tools_unit.py

Books into a local throwaway database (AixelLabsVoiceEngineDev on 127.0.0.1:27018) and deletes what
it wrote; a webhook server runs on this machine. No network beyond that, no Live sessions.
"""
import asyncio, hashlib, hmac, json, os, sys, threading, time
from datetime import date, datetime, timedelta, timezone
from types import SimpleNamespace

import testdb
MONGO, DBNAME = testdb.throwaway()
os.environ["TOOLS_ALLOW_LOCAL_URLS"] = "1"   # the fake webhook server is on 127.0.0.1
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import product  # first: keeps the database settings above over .env
from aiohttp import web
from bson import ObjectId
import bot, tools

assert product.db().name == DBNAME
RESULTS = []


def ok(name, cond, detail=""):
    RESULTS.append((name, bool(cond)))
    print(f"  [{'PASS' if cond else 'FAIL'}] {name}{' -- ' + detail if detail else ''}", flush=True)


UTC = timezone.utc
IST_HOURS = {"mon": {"open": "09:00", "close": "17:00"}, "tue": {"open": "09:00", "close": "17:00"},
             "wed": {"open": "09:00", "close": "17:00"}, "thu": {"open": "09:00", "close": "17:00"},
             "fri": {"open": "09:00", "close": "17:00"}, "sat": {"open": "10:00", "close": "14:00"}}
BOOKING = {"enabled": True, "timezone": "Asia/Kolkata", "slotMinutes": 30, "hours": IST_HOURS, "maxDaysAhead": 14}
# Friday 16 October 2026, 19:10 in Kolkata (13:40 UTC): the clinic closed at 17:00.
EVENING = datetime(2026, 10, 16, 13, 40, tzinfo=UTC)
MORNING = datetime(2026, 10, 16, 4, 35, tzinfo=UTC)   # 10:05 in Kolkata


def calendar_tests():
    print("\n== calendar (Asia/Kolkata, no DST) ==")
    cal = tools.Calendar(BOOKING)
    sat = date(2026, 10, 17)
    s = cal.slots(sat)
    ok("Saturday 10:00-14:00 in 30 min slots: 10:00 .. 13:30", [tools.hhmm(m) for m, _, _ in s] == ["10:00", "10:30", "11:00", "11:30", "12:00", "12:30", "13:00", "13:30"],
       str([tools.hhmm(m) for m, _, _ in s]))
    ok("slot at closing time is not offered (14:00 would end after close)", all(m < 14 * 60 for m, _, _ in s))
    ok("10:00 IST is 04:30 UTC, ends 05:00", s[0][1] == datetime(2026, 10, 17, 4, 30, tzinfo=UTC) and s[0][2] == datetime(2026, 10, 17, 5, 0, tzinfo=UTC))
    ok("closed day (Sunday) says so, and the next open day",
       cal.why_not(date(2026, 10, 18), EVENING) == "Closed on Sunday 18 October. The next open day is Monday 19 October.", cal.why_not(date(2026, 10, 18), EVENING))
    ok("yesterday has passed", "has already passed" in (cal.why_not(date(2026, 10, 15), EVENING) or ""))
    ok("today is bookable in principle", cal.why_not(date(2026, 10, 16), EVENING) is None)
    ok("maxDaysAhead 14: the 14th day is allowed", cal.why_not(date(2026, 10, 30), EVENING) is None)
    ok("maxDaysAhead 14: the 15th day is refused", "only 14 days ahead" in (cal.why_not(date(2026, 10, 31), EVENING) or ""), cal.why_not(date(2026, 10, 31), EVENING))
    ok("today after closing: nothing free", cal.free(date(2026, 10, 16), EVENING, []) == [])
    morning = [tools.hhmm(m) for m, _, _ in cal.free(date(2026, 10, 16), MORNING, [])]
    ok("today at 10:05: past slots dropped (first free 10:30)", morning[:2] == ["10:30", "11:00"] and "10:00" not in morning, str(morning[:3]))
    busy = [(datetime(2026, 10, 17, 8, 30, tzinfo=UTC), datetime(2026, 10, 17, 9, 0, tzinfo=UTC))]   # 14:00-14:30 IST: after close, no effect
    busy += [(datetime(2026, 10, 17, 5, 0), datetime(2026, 10, 17, 5, 30))]   # naive, as Mongo returns it: 10:30-11:00 IST
    free = [tools.hhmm(m) for m, _, _ in cal.free(sat, EVENING, busy)]
    ok("a booked slot is not free (naive UTC from Mongo handled)", "10:30" not in free and "10:00" in free and "11:00" in free, str(free))
    ok("long runs said as ranges", tools.times_words([600, 630, 660, 840, 870, 900, 930, 960], 30) == "10:00, 10:30, 11:00 and 14:00 to 16:00 every 30 minutes",
       tools.times_words([600, 630, 660, 840, 870, 900, 930, 960], 30))
    ok("short lists said whole", tools.times_words([600, 630, 840], 30) == "10:00, 10:30 and 14:00", tools.times_words([600, 630, 840], 30))
    ok("hours in words", cal.hours_words() == "Mon-Fri 09:00-17:00, Sat 10:00-14:00; closed Sun", cal.hours_words())
    ok("a bad timezone falls back to UTC", tools.Calendar({**BOOKING, "timezone": "Mars/Base"}).tzname == "UTC")
    ok("24:00 close accepted, open after close ignored",
       tools.Calendar({**BOOKING, "hours": {"mon": {"open": "20:00", "close": "24:00"}, "tue": {"open": "18:00", "close": "09:00"}}}).hours == {"mon": (1200, 1440)})
    ok("slot length clamped to 15..240", tools.Calendar({**BOOKING, "slotMinutes": 5}).step == 15 and tools.Calendar({**BOOKING, "slotMinutes": 999}).step == 240)

    print("\n== calendar (America/New_York, DST) ==")
    ny = tools.Calendar({"enabled": True, "timezone": "America/New_York", "slotMinutes": 60, "maxDaysAhead": 90,
                         "hours": {d: {"open": "00:00", "close": "04:00"} for d in tools.DAYS}})
    back = ny.slots(date(2026, 11, 1))   # clocks go back at 02:00 EDT -> 01:00 EST
    ok("fall back: 00:00 EDT=04:00Z, 01:00 (first, EDT)=05:00Z, 02:00 EST=07:00Z, 03:00 EST=08:00Z",
       [s[1].hour for s in back] == [4, 5, 7, 8], str([s[1].isoformat() for s in back]))
    fwd = ny.slots(date(2027, 3, 14))    # 02:00 does not exist
    ok("spring forward: the missing 02:00 is not offered", [tools.hhmm(m) for m, _, _ in fwd] == ["00:00", "01:00", "03:00"], str([tools.hhmm(m) for m, _, _ in fwd]))
    ny2 = tools.Calendar({"enabled": True, "timezone": "America/New_York", "slotMinutes": 30, "maxDaysAhead": 60,
                          "hours": {"sat": {"open": "09:00", "close": "17:00"}}})
    ok("14:00 EDT (October) is 18:00Z", next(s for s in ny2.slots(date(2026, 10, 17)) if s[0] == 840)[1] == datetime(2026, 10, 17, 18, 0, tzinfo=UTC))
    ok("14:00 EST (November) is 19:00Z", next(s for s in ny2.slots(date(2026, 11, 7)) if s[0] == 840)[1] == datetime(2026, 11, 7, 19, 0, tzinfo=UTC))
    # 23:30 on Friday in New York is already Saturday in UTC: "today" is the business's day.
    late = datetime(2026, 10, 17, 3, 30, tzinfo=UTC)
    ok("'today' is local: Friday 23:30 EDT is still Friday", ny2.local(late).date() == date(2026, 10, 16) and ny2.why_not(date(2026, 10, 16), late) is not None
       and "Closed on Friday" in ny2.why_not(date(2026, 10, 16), late), ny2.why_not(date(2026, 10, 16), late))


def prompt_tests():
    print("\n== prompt sections ==")
    now = datetime(2026, 10, 16, 14, 10, tzinfo=UTC)
    ok("# Right now in the booking timezone, the coming week spelled out", tools.right_now({"booking": BOOKING}, now).startswith("# Right now\n\nFriday 16 October 2026, 7:40 PM (Asia/Kolkata). Today is 2026-10-16. The coming days: Saturday 2026-10-17, Sunday 2026-10-18,"),
       tools.right_now({"booking": BOOKING}, now))
    ok("# Right now in UTC when booking is off", tools.right_now({"booking": {**BOOKING, "enabled": False}}, now).endswith("Friday 16 October 2026, 2:10 PM (UTC)"))
    bare = {"tools": {}, "doc": {"agentId": ObjectId()}}
    s = tools.prompt_sections(bare, now)
    ok("no tools: # Right now and the house rules, no # Your tools", s.startswith("# Right now") and "# Your tools" not in s
       and s.endswith(tools.HOUSE_RULES + "\n" + tools.NO_BOOKING), s)
    ok("the house rules: never mention tools, functions, systems or prompts; offer a message instead",
       all(w in tools.HOUSE_RULES for w in ("Never mention tools, functions, systems, prompts", "can't \"access\"", "take a message")))
    ok("booking off: a scheduling request gets the receptionist's fallback (details taken, someone confirms)",
       all(w in tools.NO_BOOKING for w in ("I can't check the calendar right now", "their name, their number", "someone will confirm")))
    hook = {"id": "a1", "name": "order_status", "description": "Look up an order by its number.", "enabled": True,
            "url": "https://example.com/hook", "parameters": [{"name": "order_id", "type": "string", "description": "The order number", "required": True},
                                                            {"name": "rush", "type": "boolean", "description": "Rush it", "required": False}]}
    full = {"tools": {"booking": BOOKING, "webhooks": [hook, {**hook, "id": "a2", "name": "disabled_one", "enabled": False},
                                                       {**hook, "id": "a3", "name": "book_appointment"}, {**hook, "id": "a5", "name": "end_call"}, {**hook, "id": "a4"}]},
            "doc": {"agentId": ObjectId()}, "customer_phone": "+15557770000"}
    s = tools.prompt_sections(full, now)
    ok("booking on: the house rules come last, without the no-booking fallback",
       s.index("# Your tools") < s.index("# House rules") and s.endswith(tools.HOUSE_RULES), s[-300:])
    ok("# Your tools after # Right now, with booking rules and the webhook", s.index("# Right now") < s.index("# Your tools")
       and "never say a time is free unless check_availability" in s and "ask for the caller's name" in s and "order_status" in s
       and "Mon-Fri 09:00-17:00" in s and "already on file" in s, s)
    ct = tools.CallTools(full, {"turns": []})
    names = [f.name for f in ct.schema().standard_tools]
    ok("functions: the two built-ins + enabled, unique, non-reserved webhooks", names == ["check_availability", "book_appointment", "order_status"], str(names))
    hs = ct.schema().standard_tools[2]
    ok("webhook parameters -> schema", hs.properties == {"order_id": {"type": "string", "description": "The order number"}, "rush": {"type": "boolean", "description": "Rush it"}}
       and hs.required == ["order_id"], f"{hs.properties} {hs.required}")
    ok("no tools -> CallTools is falsy, no schema, no record field", not tools.CallTools(bare, rec := {"turns": []}) and tools.CallTools(bare, rec).schema() is None and "tool_calls" not in rec)
    look = {**full, "tools": {"booking": {**BOOKING, "bookAppointment": False}}}
    ct = tools.CallTools(look, {"turns": []})
    s = tools.prompt_sections(look, now)
    ok("book_appointment off: check_availability alone, in the schema and registered",
       [f.name for f in ct.schema().standard_tools] == ["check_availability"] == ct.builtins())
    ok("book_appointment off: its own line covers it, so the house rules carry no second fallback",
       s.endswith(tools.HOUSE_RULES) and tools.NO_BOOKING not in s)
    ok("...she is told to give free times and take a message, never to book", "You can't book appointments yourself" in s
       and "book_appointment" not in s and "check_availability returned it" in s, s)
    off = {"tools": {"booking": {**BOOKING, "enabled": False}, "webhooks": [{**hook, "enabled": False}]}, "doc": {"agentId": ObjectId()}}
    ok("everything disabled = no tools", not tools.CallTools(off, {"turns": []}))


def product_tests():
    print("\n== product: call id, tools, customer phone, the doc ==")
    tenant, user = ObjectId(), ObjectId()
    # Every customer call runs on its owner's own Gemini key (product.gemini_key_for): saved as the app saves it.
    testdb.set_account(product.db(), {"tenantId": tenant, "userId": user, "keys": testdb.gemini_keys(product.seal_secret("AIza-unit-test-key"))})
    agent = {"_id": ObjectId(), "tenantId": tenant, "userId": user, "voice": "kore", "prompt": "You are Priya.", "callNotes": "Note.",
             "tools": {"booking": BOOKING}}
    number = {"_id": ObjectId(), "tenantId": tenant, "userId": user, "phoneNumber": "+15550001111", "provider": "TELNYX",
              "apiKeySealed": product.seal_secret("KEY_FAKE")}
    inbound = product.phone_call(number, agent, "INBOUND", "+15557770000")
    outbound = product.phone_call(number, agent, "OUTBOUND", "+15559990000")
    play = product.play_call(agent)
    test_in = product.phone_call(number, {**agent, "callType": "INBOUND"}, "OUTBOUND", "+15559990000")
    ok("an inbound agent on a call we place (a test call) is told to answer as if called; others get their line",
       test_in["first"] == product.FIRST_LINE["TEST_INBOUND"] and outbound["first"] == product.FIRST_LINE["OUTBOUND"]
       and inbound["first"] == product.FIRST_LINE["INBOUND"])
    ok("customer phone: the caller on a call in, the callee on one we place, none in the playground",
       inbound["customer_phone"] == "+15557770000" and outbound["customer_phone"] == "+15559990000" and play["customer_phone"] is None)
    ok("each call gets its own voice_calls _id at the start", all(isinstance(c["doc"]["_id"], ObjectId) for c in (inbound, outbound, play))
       and len({c["doc"]["_id"] for c in (inbound, outbound, play)}) == 3)
    p = inbound["prompt"]
    ok("prompt = agent prompt, # Right now, # Your tools (in that order); old call notes ignored",
       p.startswith("You are Priya.") and "Note." not in p and p.index("# Right now") < p.index("# Your tools"), p[:120])
    plain = {**agent, "tools": None}
    pc = product.play_call(plain)
    ok("an agent without tools: prompt, # Right now and the house rules", "# Right now" in pc["prompt"] and "# Your tools" not in pc["prompt"]
       and pc["prompt"].endswith(tools.HOUSE_RULES + "\n" + tools.NO_BOOKING) and pc["tools"] == {})
    # A template that names the booking tools, on an agent whose booking is off (Maya, 2026-10-23): on a phone
    # call and in the playground, whatever the stack (both run on ctx["prompt"]), the last word is the house rules.
    maya = {**agent, "callType": "INBOUND", "prompt": "You are Maya. Use check_availability, then book_appointment.",
            "tools": {"booking": {**BOOKING, "enabled": False}}}
    for c in (product.phone_call(number, maya, "INBOUND", "+15557770000"), product.play_call(maya)):
        ok(f"{c['doc']['channel']}: booking off under a prompt that names it: the no-booking fallback ends her prompt",
           c["prompt"].startswith("You are Maya.") and "# Your tools" not in c["prompt"]
           and c["prompt"].endswith(tools.HOUSE_RULES + "\n" + tools.NO_BOOKING))
    ok("every call runs on the owner's own Gemini key", inbound["gemini_key"] == outbound["gemini_key"] == play["gemini_key"] == "AIza-unit-test-key")
    try:
        product.play_call({**agent, "userId": ObjectId()})
        refused = False
    except product.GeminiKeyMissing:
        refused = True
    ok("an owner with no Gemini key gets no call (GeminiKeyMissing, never our key)", refused)
    for blank in ("", "  \n", None):
        try:
            product.phone_call(number, {**agent, "prompt": blank}, "INBOUND", "+15557770000")
            refused = False
        except product.AgentNoPrompt as e:
            refused = e.code == "agent_no_prompt" and e.words == product.AGENT_NO_PROMPT
        ok(f"an agent with no prompt ({blank!r}) gets no call (AgentNoPrompt), call notes or not", refused)
    product.db().voice_accounts.delete_many({"userId": user})
    rec = {"turns": [{"who": "agent", "text": "Hi"}], "voice": "kore", "tool_calls": [{"name": "check_availability"}]}
    inbound["live_at"] = product.now()
    doc = product.call_doc(inbound, rec, {"gaps": [900]})
    ok("doc carries the chosen _id and toolCalls", doc["_id"] == inbound["doc"]["_id"] and doc["toolCalls"] == [{"name": "check_availability"}])
    doc2 = product.call_doc(pc, {"turns": [], "voice": "kore"}, {})
    ok("no tools: no toolCalls field (doc as before, plus the _id)", "toolCalls" not in doc2 and doc2["_id"] == pc["doc"]["_id"])


async def calllog_tests():
    print("\n== transcript: a tool run splits her reply ==")
    from pipecat.frames.frames import TTSTextFrame
    from pipecat.processors.frame_processor import FrameDirection
    rec = {"turns": []}
    log = bot.CallLog(rec)
    async def feed(*texts):
        for t in texts:
            f = TTSTextFrame(text=t, aggregated_by="sentence")
            log.push_frame = lambda *a, **k: asyncio.sleep(0)   # no pipeline around it
            await bot.CallLog.process_frame(log, f, FrameDirection.DOWNSTREAM)
    async def go():
        from pipecat.processors.frame_processor import FrameProcessorSetup
        await feed("One moment.")
        rec["turn_break"] = True
        await feed("Saturday at two is free.", "Shall I book it?")
    try:
        await go()
        ok("one line before the tool, one after", [t["text"] for t in rec["turns"]] == ["One moment.", "Saturday at two is free. Shall I book it?"], str(rec["turns"]))
    except Exception as e:
        ok("CallLog turn_break", False, repr(e))


# --- voice_bookings against the dev database ---------------------------------------------------------

def call_ctx(agent_id, tenant, user, channel="PHONE", phone="+15557770000"):
    return {"tools": {"booking": BOOKING}, "customer_phone": phone,
            "doc": {"_id": ObjectId(), "tenantId": tenant, "userId": user, "agentId": agent_id, "channel": channel,
                    "direction": "INBOUND", "from": phone, "to": "+15550001111"}}


async def booking_tests():
    print("\n== booking (voice_bookings in the dev database) ==")
    db = product.db()
    tenant, user, agent_id = ObjectId(), ObjectId(), ObjectId()
    try:
        a = tools.CallTools(call_ctx(agent_id, tenant, user), {"turns": []})
        looks = tools.CallTools({**call_ctx(agent_id, tenant, user), "tools": {"booking": {**BOOKING, "bookAppointment": False}}}, {"turns": []})
        r = await looks._dispatch("book_appointment", {"date": "2026-10-17", "time": "10:00", "name": "A"})
        ok("book_appointment off: one she makes up anyway is refused", not r[0] and "no tool called" in r[1], r[1])
        r = await a.check_availability({"date": "2026-10-17"}, now=EVENING)
        ok("check_availability: Saturday, speakable", r == (True, "Saturday 17 October (Asia/Kolkata): free at 10:00 to 13:30 every 30 minutes.", None), r[1])
        r = await a.check_availability({"date": "2026-10-17", "after": "12:00"}, now=EVENING)
        ok("check_availability after 12:00", r[1] == "Saturday 17 October (Asia/Kolkata): free at 12:00, 12:30, 13:00 and 13:30.", r[1])
        r = await a.check_availability({"date": "2026-10-18"}, now=EVENING)
        ok("check_availability on a closed day", r[0] and r[1].startswith("Closed on Sunday 18 October"), r[1])
        r = await a.check_availability({"date": "tomorrow"}, now=EVENING)
        ok("check_availability with a non-date", not r[0] and "YYYY-MM-DD" in r[1], r[1])
        r = await a.check_availability({"date": "2026-10-16"}, now=EVENING)
        ok("check_availability today after closing", r[1].startswith("Friday 16 October (Asia/Kolkata): no free times.") and "Saturday 17 October" in r[1], r[1])

        ixs = list(db.voice_bookings.list_indexes())
        ok("partial unique index {agentId,start} where BOOKED exists, default name (as the app's indexes.ts)",
           any(i["name"] == "agentId_1_start_1" and dict(i["key"]) == {"agentId": 1, "start": 1} and i.get("unique") and dict(i.get("partialFilterExpression") or {}) == {"status": "BOOKED"} for i in ixs),
           str([dict(i["key"]) for i in ixs]))
        tools._indexed = False
        tools.ensure_booking_index()
        ok("ensuring it again is a no-op", len(list(db.voice_bookings.list_indexes())) == len(ixs))

        ok_, text, bid = await a.book_appointment({"date": "2026-10-17", "time": "14:00", "name": "Ravi Kumar"}, now=EVENING)
        ok("a slot starting at closing time is refused", not ok_ and "is not a start time we offer" in text and "13:30" in text, text)
        ok_, text, bid = await a.book_appointment({"date": "2026-10-17", "time": "11:15", "name": "Ravi Kumar"}, now=EVENING)
        ok("a time between slots is refused, free times offered", not ok_ and "not a start time" in text and "10:00 to 13:30" in text, text)
        ok_, text, bid = await a.book_appointment({"date": "2026-10-18", "time": "11:00", "name": "Ravi Kumar"}, now=EVENING)
        ok("booking on a closed day is refused", not ok_ and "Closed on Sunday" in text, text)
        ok_, text, bid = await a.book_appointment({"date": "2026-10-16", "time": "10:00", "name": "Ravi Kumar"}, now=MORNING)
        ok("booking a slot that has passed today is refused", not ok_ and "has already passed" in text, text)
        ok_, text, bid = await a.book_appointment({"date": "2026-10-17", "time": "13:00", "name": ""}, now=EVENING)
        ok("no name, no booking", not ok_ and "name" in text, text)

        ok_, text, bid = await a.book_appointment({"date": "2026-10-17", "time": "13:30", "name": "Ravi  Kumar", "notes": "cleaning"}, now=EVENING)
        ok("the last slot (13:30-14:00) books", ok_ and text == "Booked: Saturday 17 October at 13:30 to 14:00 (Asia/Kolkata) for Ravi Kumar." and bid, text)
        doc = db.voice_bookings.find_one({"_id": ObjectId(bid)})
        ok("booking doc: UTC start/end, call id, channel, phone defaults to the caller, status",
           doc and tools.as_utc(doc["start"]) == datetime(2026, 10, 17, 8, 0, tzinfo=UTC) and tools.as_utc(doc["end"]) == datetime(2026, 10, 17, 8, 30, tzinfo=UTC)
           and doc["callId"] == a.ctx["doc"]["_id"] and doc["channel"] == "PHONE" and doc["customerPhone"] == "+15557770000"
           and doc["customerName"] == "Ravi Kumar" and doc["notes"] == "cleaning" and doc["status"] == "BOOKED" and doc["timezone"] == "Asia/Kolkata"
           and doc["tenantId"] == tenant and doc["userId"] == user, str({k: doc.get(k) for k in ("start", "end", "customerPhone", "callId")}) if doc else "missing")
        ok_, text, bid2 = await a.book_appointment({"date": "2026-10-17", "time": "13:30", "name": "Ravi Kumar"}, now=EVENING)
        ok("the same call asking again gets the same booking back", ok_ and bid2 == bid and text.startswith("Booked:"), text)
        b = tools.CallTools(call_ctx(agent_id, tenant, user, phone="+15550009999"), {"turns": []})
        ok_, text, _ = await b.book_appointment({"date": "2026-10-17", "time": "13:30", "name": "Asha"}, now=EVENING)
        ok("another call: taken, with what is still free", not ok_ and "is taken" in text and "13:00" in text and "13:30" not in text.split("Still free")[1], text)
        r = await b.check_availability({"date": "2026-10-17"}, now=EVENING)
        ok("availability no longer offers the booked slot", "13:30" not in r[1] and "10:00 to 13:00" in r[1], r[1])
        ok_, text, bid3 = await b.book_appointment({"date": "2026-10-17", "time": "12:00", "name": "Asha", "phone": "+91 98765 43210"}, now=EVENING)
        ok("a phone the caller gives wins over the line's number", ok_ and db.voice_bookings.find_one({"_id": ObjectId(bid3)})["customerPhone"] == "+919876543210")
        db.voice_bookings.update_one({"_id": ObjectId(bid3)}, {"$set": {"status": "CANCELLED"}})
        r = await b.check_availability({"date": "2026-10-17"}, now=EVENING)
        ok("a CANCELLED booking frees its slot", "12:00" in r[1] or "10:00 to 13:00" in r[1], r[1])
        ok_, text, bid4 = await b.book_appointment({"date": "2026-10-17", "time": "12:00", "name": "Asha"}, now=EVENING)
        ok("and it can be booked again", ok_ and bid4 != bid3, text)

        # The race: twelve calls, one slot, at the same moment, each in its own thread.
        start = datetime(2026, 10, 19, 4, 30, tzinfo=UTC)   # Monday 10:00 IST
        barrier, wins, losses = threading.Barrier(12), [], []
        def racer(i):
            d = {"tenantId": tenant, "userId": user, "agentId": agent_id, "callId": ObjectId(), "channel": "PHONE", "start": start,
                 "end": start + timedelta(minutes=30), "timezone": "Asia/Kolkata", "customerName": f"racer {i}", "customerPhone": None,
                 "notes": None, "status": "BOOKED", "createdAt": product.now(), "updatedAt": product.now()}
            barrier.wait()
            (wins if tools.insert_booking(d)[0] else losses).append(i)
        threads = [threading.Thread(target=racer, args=(i,)) for i in range(12)]
        [t.start() for t in threads]; [t.join() for t in threads]
        n = db.voice_bookings.count_documents({"agentId": agent_id, "start": start, "status": "BOOKED"})
        ok("double-booking race: 12 at once, exactly one wins", len(wins) == 1 and len(losses) == 11 and n == 1, f"wins {wins}, {n} BOOKED")
        # The same race through book_appointment, on the event loop.
        many = [tools.CallTools(call_ctx(agent_id, tenant, user), {"turns": []}) for _ in range(8)]
        got = await asyncio.gather(*(c.book_appointment({"date": "2026-10-19", "time": "10:30", "name": f"caller {i}"}, now=EVENING) for i, c in enumerate(many)))
        ok("8 concurrent book_appointment calls: one 'Booked', seven 'taken'", sum(g[0] for g in got) == 1 and sum("is taken" in g[1] for g in got) == 7,
           str([g[1][:30] for g in got]))
        play = tools.CallTools(call_ctx(agent_id, tenant, user, channel="PLAYGROUND", phone=None), {"turns": []})
        ok_, text, pb = await play.book_appointment({"date": "2026-10-19", "time": "11:00", "name": "Test"}, now=EVENING)
        pdoc = db.voice_bookings.find_one({"_id": ObjectId(pb)}) if pb else None
        ok("playground booking: channel PLAYGROUND, no phone", ok_ and pdoc["channel"] == "PLAYGROUND" and pdoc["customerPhone"] is None)
    finally:
        n = db.voice_bookings.delete_many({"agentId": agent_id}).deleted_count
        print(f"  (deleted {n} test bookings)")


# --- webhooks ------------------------------------------------------------------------------------

async def webhook_tests():
    print("\n== webhooks (a server on this machine) ==")
    got = []
    async def handle(request):
        raw = await request.read()
        got.append({"path": request.path, "headers": dict(request.headers), "raw": raw})
        if request.path == "/ok":
            return web.json_response({"status": "shipped", "eta": "Monday"})
        if request.path == "/text":
            return web.Response(text="x" * 9000)
        if request.path == "/fail":
            return web.Response(status=500, text="boom")
        if request.path == "/slow":
            await asyncio.sleep(12)
            return web.Response(text="late")
        if request.path == "/redirect":
            raise web.HTTPFound("http://169.254.169.254/latest/meta-data/")
        return web.Response(status=404)
    app = web.Application(); app.router.add_route("*", "/{tail:.*}", handle)
    runner = web.AppRunner(app); await runner.setup()
    site = web.TCPSite(runner, "127.0.0.1", 0); await site.start()
    port = site._server.sockets[0].getsockname()[1]
    base = f"http://127.0.0.1:{port}"
    secret = "whsec_test_0123456789"
    hook = {"id": "h1", "name": "order_status", "description": "Look up an order.", "enabled": True, "url": base + "/ok",
            "parameters": [{"name": "order_id", "type": "string", "description": "", "required": True}], "secretSealed": product.seal_secret(secret)}
    ctx = call_ctx(ObjectId(), ObjectId(), ObjectId())
    ctx["tools"] = {"webhooks": [hook, {**hook, "id": "h2", "name": "slow_tool", "url": base + "/slow", "secretSealed": None},
                                 {**hook, "id": "h3", "name": "failing_tool", "url": base + "/fail"},
                                 {**hook, "id": "h4", "name": "long_tool", "url": base + "/text", "secretSealed": None},
                                 {**hook, "id": "h5", "name": "redirect_tool", "url": base + "/redirect"}]}
    record = {"turns": [{"who": "agent", "text": "Hi"}, {"who": "caller", "text": "Where is my order 42?"}]}
    ct = tools.CallTools(ctx, record)
    sent, told = [], []
    async def notify(m): sent.append(m)
    ct.notify = notify
    async def callback(result, properties=None): told.append(result)
    try:
        await ct._handle(SimpleNamespace(function_name="order_status", arguments={"order_id": "42"}, result_callback=callback))
        req = got[-1]; body = json.loads(req["raw"])
        ok("POST body: tool, arguments, call {id, agentId, channel, direction, from, to}",
           body == {"tool": "order_status", "arguments": {"order_id": "42"}, "call": {"id": str(ctx["doc"]["_id"]), "agentId": str(ctx["doc"]["agentId"]),
                    "channel": "PHONE", "direction": "INBOUND", "from": "+15557770000", "to": "+15550001111"}}, str(body))
        want_sig = "sha256=" + hmac.new(secret.encode(), req["raw"], hashlib.sha256).hexdigest()
        ok("headers: JSON, User-Agent, X-Aixel-Signature = HMAC-SHA256(secret, raw body)",
           req["headers"].get("Content-Type") == "application/json" and req["headers"].get("User-Agent") == "AixelLabs-VoiceAgent/1"
           and req["headers"].get("X-Aixel-Signature") == want_sig, req["headers"].get("X-Aixel-Signature", "")[:20])
        ok("the answer goes back to the model", told[-1] == '{"status": "shipped", "eta": "Monday"}', told[-1])
        e = record["tool_calls"][-1]
        ok("logged: name, arguments, result, ok, afterTurn, durationMs", e["name"] == "order_status" and e["arguments"] == {"order_id": "42"} and e["ok"]
           and e["afterTurn"] == 2 and isinstance(e["durationMs"], int) and e["bookingId"] is None, str(e))
        ok("the playground event", sent[-1] == {"type": "tool", "name": "order_status", "arguments": {"order_id": "42"}, "result": told[-1], "ok": True}, str(sent[-1]))
        ok("a turn break is set for the transcript", record.get("turn_break") is True)

        n0 = len(got)
        await asyncio.gather(*(ct._handle(SimpleNamespace(function_name="order_status", arguments={"order_id": "77"}, result_callback=callback)) for _ in range(3)))
        ok("asked three times at once with the same arguments: one request, three answers", len(got) - n0 == 1 and told[-3:] == [told[-1]] * 3,
           f"{len(got) - n0} requests")
        await ct._handle(SimpleNamespace(function_name="order_status", arguments={"order_id": "78"}, result_callback=callback))
        ok("other arguments: a new request", len(got) - n0 == 2)

        await ct._handle(SimpleNamespace(function_name="long_tool", arguments={"order_id": "1"}, result_callback=callback))
        ok("a long answer: model gets 4000 chars, toolCalls keeps 1000", len(told[-1]) == 4000 and len(record["tool_calls"][-1]["result"]) == 1000,
           f"{len(told[-1])} / {len(record['tool_calls'][-1]['result'])}")
        ok("no secret: no signature header", "X-Aixel-Signature" not in got[-1]["headers"])

        await ct._handle(SimpleNamespace(function_name="failing_tool", arguments={"order_id": "1"}, result_callback=callback))
        ok("HTTP 500: the model is told it failed and to say so", "HTTP 500" in told[-1] and "couldn't do that right now" in told[-1] and not record["tool_calls"][-1]["ok"], told[-1])

        t0 = time.monotonic()
        await ct._handle(SimpleNamespace(function_name="slow_tool", arguments={"order_id": "1"}, result_callback=callback))
        took = time.monotonic() - t0
        ok("a server that never answers: given up after 8 s", 7.5 < took < 9.5 and "no answer in 8 s" in told[-1] and not record["tool_calls"][-1]["ok"], f"{took:.1f} s: {told[-1]}")

        await ct._handle(SimpleNamespace(function_name="redirect_tool", arguments={"order_id": "1"}, result_callback=callback))
        ok("redirects are not followed", "HTTP 302" in told[-1], told[-1])

        # Cancelled mid-call (Pipecat gave up on it): the request still finishes and is logged.
        n0 = len(record["tool_calls"])
        ct.webhooks["order_status"] = {**hook, "url": base + "/ok"}
        task = asyncio.create_task(ct._handle(SimpleNamespace(function_name="slow_tool", arguments={"order_id": "c"}, result_callback=callback)))
        await asyncio.sleep(0.3); task.cancel()
        try: await task
        except asyncio.CancelledError: pass
        ok("cancelled: nothing logged yet (the work goes on)", len(record["tool_calls"]) == n0)
        await asyncio.sleep(9)
        ok("cancelled: logged once it finished", len(record["tool_calls"]) == n0 + 1 and "never heard this answer" in record["tool_calls"][-1]["result"], str(record["tool_calls"][-1]))

        bad_secret = tools.CallTools({**ctx, "tools": {"webhooks": [{**hook, "secretSealed": "v1.garbage"}]}}, {"turns": []})
        r = await bad_secret.call_webhook(bad_secret.webhooks["order_status"], {})
        ok("an unreadable secret: not called, failure", not r[0] and "secret" in r[1], r[1])

        print("  -- URL rules --")
        tools.ALLOW_LOCAL_URLS = False
        for url, want in [("http://169.254.169.254/latest/meta-data/", "private or local"), ("https://127.0.0.1:9/x", "private or local"),
                          ("https://10.1.2.3/x", "private or local"), ("http://localhost:9/x", "private or local"),
                          ("http://example.com/x", "only https"), ("ftp://example.com/x", "not an http"), ("https://no-such-host.invalid/x", "does not resolve")]:
            why = await tools.url_refusal(url)
            ok(f"refused: {url}", why and want in why, str(why))
        ok("allowed: https://example.com", await tools.url_refusal("https://example.com/hook") is None)
        tools.ALLOW_LOCAL_URLS = True
        ok("test instance: loopback allowed", await tools.url_refusal(base + "/ok") is None)
        ok("test instance: private networks still refused", "only loopback" in (await tools.url_refusal("http://10.1.2.3/x") or ""))
    finally:
        await runner.cleanup()


async def main():
    calendar_tests()
    prompt_tests()
    product_tests()
    await calllog_tests()
    await booking_tests()
    await webhook_tests()
    passed = sum(1 for _, p in RESULTS if p)
    print(f"\n{passed}/{len(RESULTS)} passed")
    for name, p in RESULTS:
        if not p:
            print("  FAILED:", name)


if __name__ == "__main__":
    asyncio.run(main())
