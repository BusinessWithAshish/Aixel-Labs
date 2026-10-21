"""Outbound campaigns (campaigns.py) without a phone or Gemini: the calling window, retries,
concurrency, the runner lease, pause, the do-not-call list, restarts, a deploy's drain, and the call hook.

    .venv/bin/python tests/campaigns_unit.py

Runs against its own throwaway database (AixelLabsVoiceCampaignUnit on 127.0.0.1:27018, dropped at
the end): a running engine elsewhere must never see these campaigns. Calls are a fake `dial`.
"""
import asyncio, os, sys
from datetime import datetime, timedelta, timezone

os.environ["MONGODB_URI"] = MONGO = os.getenv("TEST_MONGODB_URI", "mongodb://127.0.0.1:27018")
os.environ["MONGODB_DB_NAME"] = DBNAME = "AixelLabsVoiceCampaignUnit"
assert "127.0.0.1" in MONGO
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import product  # first: keeps the database settings above over .env
from bson import ObjectId
import campaigns as C
import testdb

db = product.db()
assert db.name == DBNAME
UTC = timezone.utc
RESULTS = []


def ok(name, cond, detail=""):
    RESULTS.append((name, bool(cond)))
    print(f"  [{'PASS' if cond else 'FAIL'}] {name}{' -- ' + detail if detail else ''}", flush=True)


# --- the calling window -----------------------------------------------------------------------

WEEKDAYS = ["mon", "tue", "wed", "thu", "fri"]
IST = {"days": WEEKDAYS, "start": "09:00", "end": "18:00", "timezone": "Asia/Kolkata"}


def ist(y, mo, d, h, mi):  # a wall-clock time in Kolkata (UTC+5:30, no DST) as UTC
    return datetime(y, mo, d, h, mi, tzinfo=UTC) - timedelta(hours=5, minutes=30)


def window_tests():
    print("\n== calling window ==")
    # Friday 16 October 2026.
    ok("08:59 Kolkata: not yet", not C.in_window(IST, ist(2026, 10, 16, 8, 59)))
    ok("09:00 Kolkata: open (start included)", C.in_window(IST, ist(2026, 10, 16, 9, 0)))
    ok("17:59 Kolkata: open", C.in_window(IST, ist(2026, 10, 16, 17, 59)))
    ok("18:00 Kolkata: closed (end excluded)", not C.in_window(IST, ist(2026, 10, 16, 18, 0)))
    ok("Saturday 11:00 Kolkata: not a calling day", not C.in_window(IST, ist(2026, 10, 17, 11, 0)))
    # Monday 00:30 in Kolkata is still Sunday 19:00 in UTC: the day is the campaign's own.
    late = {"days": ["mon"], "start": "00:00", "end": "01:00", "timezone": "Asia/Kolkata"}
    at = ist(2026, 10, 19, 0, 30)
    ok("the day is read on the campaign's clock (UTC says Sunday)", at.weekday() == 6 and C.in_window(late, at), at.isoformat())
    ok("...and the UTC day does not count", not C.in_window({**late, "days": ["sun"]}, at))
    ny = {"days": ["sun"], "start": "09:00", "end": "10:00", "timezone": "America/New_York"}
    # 8 March 2026: New York springs forward at 02:00. 13:30 UTC is 09:30 EDT (it was 08:30 EST the day before).
    ok("DST spring forward: 13:30 UTC is 09:30 EDT -> open", C.in_window(ny, datetime(2026, 3, 8, 13, 30, tzinfo=UTC)))
    ok("...and a week earlier (EST) 13:30 UTC is 08:30 -> closed", not C.in_window(ny, datetime(2026, 3, 1, 13, 30, tzinfo=UTC)))
    # 1 November 2026: 01:00-02:00 happens twice in New York (EDT, then EST).
    fall = {"days": ["sun"], "start": "01:00", "end": "02:00", "timezone": "America/New_York"}
    ok("DST fall back: the first 01:30 (05:30 UTC) is open", C.in_window(fall, datetime(2026, 11, 1, 5, 30, tzinfo=UTC)))
    ok("...and the repeated 01:30 (06:30 UTC) too", C.in_window(fall, datetime(2026, 11, 1, 6, 30, tzinfo=UTC)))
    ok("...07:30 UTC is 02:30 EST -> closed", not C.in_window(fall, datetime(2026, 11, 1, 7, 30, tzinfo=UTC)))
    allday = {"days": ["fri"], "start": "00:00", "end": "24:00", "timezone": "UTC"}
    ok("00:00-24:00 covers 23:59", C.in_window(allday, datetime(2026, 10, 16, 23, 59, tzinfo=UTC)))
    ok("unknown timezone: never open", not C.in_window({**IST, "timezone": "Mars/Base"}, ist(2026, 10, 16, 10, 0)))
    ok("start after end: never open", not C.in_window({**IST, "start": "18:00", "end": "09:00"}, ist(2026, 10, 16, 10, 0)))
    ok("no days: never open", not C.in_window({**IST, "days": []}, ist(2026, 10, 16, 10, 0)))
    ok("no window: never open", not C.in_window(None, ist(2026, 10, 16, 10, 0)))


# --- what an attempt's outcome does -----------------------------------------------------------

def rules_tests():
    print("\n== outcomes and retries ==")
    at = datetime(2026, 10, 16, 6, 0, tzinfo=UTC)
    camp = {"status": "RUNNING", "retry": {"maxRetries": 2, "delayMinutes": 30, "on": ["no_answer", "busy"]}}
    ok("goodbye / dnc / caller_hung_up are answered",
       all(C.outcome_kind(e) == "answered" for e in ("goodbye", "dnc", "caller_hung_up", "abuse")))
    ok("voicemail_message and ivr count as voicemail", C.outcome_kind("voicemail_message") == C.outcome_kind("ivr") == "voicemail")
    ok("not_connected counts as no answer", C.outcome_kind("not_connected") == "no_answer")
    s = C.next_step({"attempts": 1}, camp, "no_answer", at)
    ok("no answer, attempt 1 of 3: back in the queue, due in 30 min",
       s["status"] == "PENDING" and s["nextAttemptAt"] == at + timedelta(minutes=30), str(s))
    s = C.next_step({"attempts": 3}, camp, "busy", at)
    ok("busy on the last attempt (3 = 1 + 2 retries): unreached", s["status"] == "UNREACHED" and s["nextAttemptAt"] is None)
    s = C.next_step({"attempts": 1}, camp, "voicemail", at)
    ok("voicemail when only no-answer/busy are retried: unreached at once", s["status"] == "UNREACHED")
    s = C.next_step({"attempts": 1}, camp, "goodbye", at)
    ok("answered: final", s["status"] == "ANSWERED" and s["finishedAt"] == at)
    s = C.next_step({"attempts": 1}, camp, "failed", at)
    ok("the provider's 'failed': failed, not retried", s["status"] == "FAILED")
    s = C.next_step({"attempts": 1}, {**camp, "retry": {"maxRetries": 1, "delayMinutes": 5, "on": []}}, C.INTERRUPTED, at)
    ok("an interrupted attempt is retried while attempts remain", s["status"] == "PENDING")
    s = C.next_step({"attempts": 2}, {**camp, "retry": {"maxRetries": 1, "delayMinutes": 5, "on": []}}, C.INTERRUPTED, at)
    ok("...and fails when none remain", s["status"] == "FAILED")
    s = C.next_step({"attempts": 1}, {**camp, "status": "CANCELLED"}, "no_answer", at)
    ok("a cancelled campaign retries nothing", s["status"] == "UNREACHED")
    s = C.next_step({"attempts": 1}, {"status": "RUNNING"}, "no_answer", at)
    ok("no retry settings: no retries", s["status"] == "UNREACHED")


# --- the runner, against the throwaway database ------------------------------------------------

class Clock:
    def __init__(self, at):
        self.at = at

    def __call__(self):
        return self.at

    def advance(self, **kw):
        self.at += timedelta(**kw)


class FakeEngine:
    """POST /calls: records each dial and answers as told (200 by default)."""

    def __init__(self):
        self.dials, self.answers = [], {}

    async def dial(self, number_id, to, agent_id):
        self.dials.append((number_id, to, agent_id))
        status, body = self.answers.get(to, (200, None))
        return status, body or {"ok": True, "callId": f"v3:fake-{len(self.dials)}"}

    def phones(self):
        return [d[1] for d in self.dials]


# Friday 16 October 2026, 10:00 in Kolkata.
T0 = ist(2026, 10, 16, 10, 0)
OWNER = {"tenantId": ObjectId(), "userId": ObjectId()}


def reset():
    for name in ("voice_campaigns", "voice_campaign_contacts", "voice_calls", "voice_accounts"):
        db[name].delete_many({})
    C.INFLIGHT.clear(); C.DIALING.clear()


def campaign(n_contacts, *, max_concurrent=2, retry=None, window=IST, status="RUNNING", number=None, phones=None):
    number = number or ObjectId()
    doc = {**OWNER, "name": "Test", "agentId": ObjectId(), "numberId": number, "status": status, "window": window,
           "maxConcurrent": max_concurrent, "retry": retry or {"maxRetries": 0, "delayMinutes": 30, "on": []},
           "defaultCountry": "IN", "variableKeys": ["company"], "createdAt": T0, "updatedAt": T0}
    doc["_id"] = db.voice_campaigns.insert_one(doc).inserted_id
    phones = phones or [f"+9198765{i:05d}" for i in range(n_contacts)]
    db.voice_campaign_contacts.insert_many([
        {**OWNER, "campaignId": doc["_id"], "phone": p, "name": f"Person {i}", "variables": {"company": f"Co {i}"},
         "row": i + 2, "status": "PENDING", "attempts": 0, "nextAttemptAt": None, "booked": False, "callIds": [],
         "createdAt": T0, "updatedAt": T0} for i, p in enumerate(phones)])
    return doc


def contact(phone):
    return db.voice_campaign_contacts.find_one({"phone": phone})


def end_call(c, ended_by, at, tagged=True, **extra):
    """The voice_calls document the engine writes when the contact's call ends."""
    doc = {**OWNER, "agentId": ObjectId(), "numberId": c["numberId"], "channel": "PHONE", "direction": "OUTBOUND",
           "from": "+15550001111", "to": c["phone"], "voice": "kore", "startedAt": at, "endedAt": at, "durationSec": 0,
           "endedBy": ended_by, "flags": [], "turns": [], "gapsMs": [], **extra}
    if tagged:
        doc.update(campaignId=c["campaignId"], campaignContactId=c["_id"])
    return db.voice_calls.insert_one(doc).inserted_id


def runner(engine, clock, room=8, suppressed=(), owner=None):
    return C.Runner(db, engine.dial, lambda: room, lambda: set(suppressed), clock=clock, owner=owner or C.PROCESS_ID)


def status_counts(camp_id):
    out = {}
    for c in db.voice_campaign_contacts.find({"campaignId": camp_id}):
        out[c["status"]] = out.get(c["status"], 0) + 1
    return out


async def concurrency_tests():
    print("\n== concurrency ==")
    reset(); clock = Clock(T0); eng = FakeEngine(); r = runner(eng, clock)
    camp = campaign(5, max_concurrent=2)
    await r.tick()
    ok("max 2 at once: the first tick dials 2", len(eng.dials) == 2, str(eng.phones()))
    ok("in row order", eng.phones() == ["+919876500000", "+919876500001"])
    clock.advance(seconds=5); await r.tick()
    ok("nothing ended: nobody else is dialled", len(eng.dials) == 2)
    ok("dialled through the campaign's number and agent",
       all(d[0] == str(camp["numberId"]) and d[2] == str(camp["agentId"]) for d in eng.dials))
    end_call(contact("+919876500000"), "goodbye", clock())
    clock.advance(seconds=3); await r.tick()
    ok("one ended: one more is dialled", len(eng.dials) == 3 and status_counts(camp["_id"]).get("CALLING") == 2,
       str(status_counts(camp["_id"])))

    reset(); clock = Clock(T0); eng = FakeEngine(); r = runner(eng, clock, room=3)
    campaign(5, max_concurrent=5)
    await r.tick()
    ok("engine room 3 - 2 kept for calls coming in: 1 dial", len(eng.dials) == 1, str(len(eng.dials)))

    reset(); clock = Clock(T0); eng = FakeEngine(); r = runner(eng, clock, room=50)
    number = ObjectId()
    a = campaign(5, max_concurrent=5, number=number, phones=[f"+1415555{i:04d}" for i in range(5)])
    b = campaign(5, max_concurrent=5, number=number, phones=[f"+1415666{i:04d}" for i in range(5)])
    await r.tick()
    ok(f"two campaigns on one number: {C.NUMBER_MAX_CONCURRENT} at once in all", len(eng.dials) == C.NUMBER_MAX_CONCURRENT,
       f"{len(eng.dials)} ({status_counts(a['_id'])} / {status_counts(b['_id'])})")


async def retry_tests():
    print("\n== retries ==")
    reset(); clock = Clock(T0); eng = FakeEngine(); r = runner(eng, clock)
    camp = campaign(1, max_concurrent=1, retry={"maxRetries": 1, "delayMinutes": 30, "on": ["no_answer", "busy"]})
    phone = "+919876500000"
    await r.tick()
    first = end_call(contact(phone), "no_answer", clock())
    clock.advance(seconds=3); await r.tick()
    c = contact(phone)
    ok("no answer: queued again in 30 min", c["status"] == "PENDING" and c["attempts"] == 1
       and C.aware(c["nextAttemptAt"]) == clock() + timedelta(minutes=30), f"{c['status']} {c.get('nextAttemptAt')}")
    ok("the call is linked to the contact", c["lastCallId"] == first and c["callIds"] == [first] and c["lastOutcome"] == "no_answer")
    clock.advance(minutes=29); await r.tick()
    ok("not before the delay", len(eng.dials) == 1)
    clock.advance(minutes=2); await r.tick()
    ok("after the delay: dialled again", len(eng.dials) == 2 and contact(phone)["attempts"] == 2)
    end_call(contact(phone), "busy", clock())
    clock.advance(seconds=3); await r.tick()
    c = contact(phone)
    ok("busy on the last attempt: unreached, two calls linked", c["status"] == "UNREACHED" and len(c["callIds"]) == 2, str(c["status"]))
    camp_doc = db.voice_campaigns.find_one({"_id": camp["_id"]})
    ok("nothing left: the campaign is completed", camp_doc["status"] == "COMPLETED" and camp_doc.get("completedAt"))

    reset(); clock = Clock(T0); eng = FakeEngine(); r = runner(eng, clock)
    campaign(1, max_concurrent=1, retry={"maxRetries": 3, "delayMinutes": 10, "on": ["no_answer"]})
    await r.tick()
    end_call(contact(phone), "voicemail", clock())
    clock.advance(seconds=3); await r.tick()
    ok("voicemail, not retried by this campaign: unreached", contact(phone)["status"] == "UNREACHED")


async def outcome_tests():
    print("\n== outcomes, bookings, links ==")
    reset(); clock = Clock(T0); eng = FakeEngine(); r = runner(eng, clock)
    camp = campaign(2, max_concurrent=2)
    await r.tick()
    a, b = contact("+919876500000"), contact("+919876500001")
    end_call(a, "goodbye", clock(), toolCalls=[{"name": "book_appointment", "ok": True, "bookingId": str(ObjectId())}])
    untagged = end_call(b, "no_answer", clock(), tagged=False)   # a Twilio/VoiceLink call nobody answered
    clock.advance(seconds=3); await r.tick()
    a, b = contact("+919876500000"), contact("+919876500001")
    ok("answered with a booking: ANSWERED + booked", a["status"] == "ANSWERED" and a["booked"] is True)
    ok("an untagged unanswered call is found by number + person", b["status"] == "UNREACHED" and b["lastCallId"] == untagged)
    call = db.voice_calls.find_one({"_id": untagged})
    ok("...and linked to the campaign and contact, with the variables",
       call["campaignId"] == camp["_id"] and call["campaignContactId"] == b["_id"] and call["variables"] == {"company": "Co 1"})
    ok("the providers' call id is kept on the contact", a.get("providerCallId", "").startswith("v3:fake-"))


async def window_runner_tests():
    print("\n== the window, pause, cancel ==")
    reset(); clock = Clock(ist(2026, 10, 16, 8, 0)); eng = FakeEngine(); r = runner(eng, clock)
    camp = campaign(3, max_concurrent=1)
    await r.tick()
    ok("08:00 Kolkata, window opens at 09:00: no dials", not eng.dials)
    clock.at = ist(2026, 10, 16, 9, 0); await r.tick()
    ok("09:00: dialling", len(eng.dials) == 1)
    db.voice_campaigns.update_one({"_id": camp["_id"]}, {"$set": {"status": "PAUSED"}})
    end_call(contact("+919876500000"), "goodbye", clock())
    clock.advance(seconds=3); await r.tick()
    ok("paused: the call already placed is still settled", contact("+919876500000")["status"] == "ANSWERED")
    clock.advance(seconds=3); await r.tick()
    ok("paused: nobody new is dialled", len(eng.dials) == 1 and status_counts(camp["_id"]).get("PENDING") == 2)
    ok("paused with contacts left: not completed", db.voice_campaigns.find_one({"_id": camp["_id"]})["status"] == "PAUSED")
    db.voice_campaigns.update_one({"_id": camp["_id"]}, {"$set": {"status": "RUNNING"}})
    clock.advance(seconds=3); await r.tick()
    ok("resumed: dialling again", len(eng.dials) == 2)
    clock.at = ist(2026, 10, 16, 18, 0)
    end_call(contact("+919876500001"), "goodbye", clock())
    await r.tick()
    ok("18:00: the window closed, the last call is settled but not followed", len(eng.dials) == 2
       and contact("+919876500001")["status"] == "ANSWERED")

    reset(); clock = Clock(T0); eng = FakeEngine(); r = runner(eng, clock)
    camp = campaign(2, max_concurrent=1, retry={"maxRetries": 2, "delayMinutes": 1, "on": ["no_answer"]})
    await r.tick()
    db.voice_campaigns.update_one({"_id": camp["_id"]}, {"$set": {"status": "CANCELLED"}})
    end_call(contact("+919876500000"), "no_answer", clock())
    clock.advance(minutes=5); await r.tick()
    ok("cancelled mid-call: the call is settled and not retried", contact("+919876500000")["status"] == "UNREACHED"
       and len(eng.dials) == 1)


async def dnc_tests():
    print("\n== do-not-call list ==")
    reset(); clock = Clock(T0); eng = FakeEngine()
    r = runner(eng, clock, suppressed={"+919876500001"})
    camp = campaign(3, max_concurrent=3)
    await r.tick()
    c = contact("+919876500001")
    ok("a listed number is skipped, never dialled", "+919876500001" not in eng.phones() and c["status"] == "SKIPPED_DNC"
       and c["attempts"] == 0 and c["lastOutcome"] == "dnc_list", f"{eng.phones()} {c['status']}")
    ok("the others are dialled", sorted(eng.phones()) == ["+919876500000", "+919876500002"])
    # Listed after the campaign's sweep (e.g. by another call a moment ago): /calls refuses it.
    reset(); clock = Clock(T0); eng = FakeEngine(); r = runner(eng, clock)
    campaign(1, max_concurrent=1)
    eng.answers["+919876500000"] = (409, {"error": "that number asked not to be called again"})
    await r.tick()
    c = contact("+919876500000")
    ok("/calls says the number asked not to be called: skipped, not failed", c["status"] == "SKIPPED_DNC" and c["attempts"] == 0, c["status"])


async def error_tests():
    print("\n== refusals ==")
    reset(); clock = Clock(T0); eng = FakeEngine(); r = runner(eng, clock)
    camp = campaign(2, max_concurrent=2)
    eng.answers["+919876500000"] = (404, {"error": "number not found"})
    await r.tick()
    c, cd = contact("+919876500000"), db.voice_campaigns.find_one({"_id": camp["_id"]})
    ok("the number is gone: the campaign pauses with the reason", cd["status"] == "PAUSED" and cd["lastError"] == "number not found")
    ok("...and the contact is back in the queue untouched", c["status"] == "PENDING" and c["attempts"] == 0 and len(eng.dials) == 1)

    reset(); clock = Clock(T0); eng = FakeEngine(); r = runner(eng, clock)
    camp = campaign(2, max_concurrent=2)
    eng.answers["+919876500000"] = (503, {"error": "8 calls already running"})
    await r.tick()
    ok("the engine is full: released, the campaign keeps running",
       contact("+919876500000")["status"] == "PENDING" and contact("+919876500000")["attempts"] == 0
       and db.voice_campaigns.find_one({"_id": camp["_id"]})["status"] == "RUNNING")

    reset(); clock = Clock(T0); eng = FakeEngine(); r = runner(eng, clock)
    camp = campaign(5, max_concurrent=5)
    for i in range(5):
        eng.answers[f"+9198765{i:05d}"] = (424, {"error": "Telnyx refused the call: insufficient balance"})
    await r.tick()
    cd = db.voice_campaigns.find_one({"_id": camp["_id"]})
    ok(f"{C.MAX_PROVIDER_FAILURES} refusals in a row: those fail, the campaign pauses",
       status_counts(camp["_id"]).get("FAILED") == C.MAX_PROVIDER_FAILURES and cd["status"] == "PAUSED"
       and "insufficient balance" in cd["lastError"], f"{status_counts(camp['_id'])} {cd['status']}")
    ok("a refused contact keeps the provider's reason", "insufficient balance" in (contact("+919876500000")["lastError"] or ""))


async def lease_tests():
    print("\n== two processes ==")
    reset(); clock = Clock(T0); eng = FakeEngine()
    a, b = runner(eng, clock, owner="proc-a"), runner(eng, clock, owner="proc-b")
    camp = campaign(6, max_concurrent=3)
    await a.tick()
    await b.tick()
    ok("A holds the campaign: B dials nothing", len(eng.dials) == 3 and db.voice_campaigns.find_one({"_id": camp["_id"]})["runner"]["owner"] == "proc-a")
    # Both at once, many rounds, calls ending as they go: nobody is ever dialled twice.
    for _ in range(6):
        for c in db.voice_campaign_contacts.find({"campaignId": camp["_id"], "status": "CALLING"}):
            end_call(c, "goodbye", clock())
        clock.advance(seconds=3)
        await asyncio.gather(a.tick(), b.tick())
    phones = eng.phones()
    ok("all six dialled exactly once", sorted(phones) == sorted(set(phones)) and len(phones) == 6, str(len(phones)))
    ok("all answered, campaign completed", status_counts(camp["_id"]) == {"ANSWERED": 6}
       and db.voice_campaigns.find_one({"_id": camp["_id"]})["status"] == "COMPLETED")

    # A stops (its lease is not renewed); B takes the campaign over after the lease runs out.
    reset(); clock = Clock(T0); eng = FakeEngine()
    a, b = runner(eng, clock, owner="proc-a"), runner(eng, clock, owner="proc-b")
    camp = campaign(3, max_concurrent=1)
    await a.tick()
    clock.advance(seconds=C.LEASE_SECS - 1); await b.tick()
    ok("within A's lease B waits", len(eng.dials) == 1)
    clock.advance(seconds=2); await b.tick()
    ok("A's lease ran out: B drives the campaign (its call still counts against max 1)",
       db.voice_campaigns.find_one({"_id": camp["_id"]})["runner"]["owner"] == "proc-b" and len(eng.dials) == 1)


async def restart_tests():
    print("\n== restart ==")
    reset(); clock = Clock(T0); eng = FakeEngine()
    old = runner(eng, clock, owner="before-restart")
    camp = campaign(2, max_concurrent=2, retry={"maxRetries": 1, "delayMinutes": 0, "on": []})
    await old.tick()
    # The process restarts: its memory is gone. One call had ended and was written; the other died with it.
    end_call(contact("+919876500000"), "goodbye", clock())
    new = runner(eng, clock, owner="after-restart")
    clock.advance(seconds=C.LEASE_SECS + 1); await new.tick()
    ok("after the restart: the written call is settled from its document", contact("+919876500000")["status"] == "ANSWERED")
    ok("...the lost one waits for its document a while", contact("+919876500001")["status"] == "CALLING")
    clock.advance(seconds=C.ORPHAN_SECS + 1); await new.tick()
    c = contact("+919876500001")
    ok("no document after the grace: interrupted, retried (attempts remain)", c["status"] in ("PENDING", "CALLING") and c["lastOutcome"] == "interrupted",
       f"{c['status']} {c.get('lastOutcome')}")
    ok("...and dialled again by the new process", eng.phones().count("+919876500001") == 2 and c["attempts"] == 2)


async def stream_tests():
    print("\n== a call that never reports back ==")
    reset(); clock = Clock(T0); eng = FakeEngine(); r = runner(eng, clock)
    campaign(1, max_concurrent=1, retry={"maxRetries": 1, "delayMinutes": 0, "on": ["no_answer"]})
    await r.tick()
    clock.advance(seconds=C.NO_STREAM_SECS + 1); await r.tick()
    c = contact("+919876500000")
    ok("no stream, no record after the wait: counted as not connected (no answer) and retried",
       c["lastOutcome"] == "not_connected" and c["attempts"] == 2 and len(eng.dials) == 2, f"{c['status']} {c.get('lastOutcome')}")


async def drain_tests():
    print("\n== a deploy: the old slot drains, the new one takes over ==")
    reset(); clock = Clock(T0); eng = FakeEngine(); stopping = []
    old = C.Runner(db, eng.dial, lambda: 8, lambda: set(), clock=clock, owner="slot-old", draining=lambda: bool(stopping))
    new = runner(eng, clock, owner="slot-new")
    camp = campaign(4, max_concurrent=2)
    p0, p1 = "+919876500000", "+919876500001"
    await old.tick()
    stopping.append(True)  # SIGTERM
    clock.advance(seconds=3); await old.tick()
    ok("draining: dials nobody and lets go of the campaign at once",
       len(eng.dials) == 2 and db.voice_campaigns.find_one({"_id": camp["_id"]})["runner"] is None)
    await new.tick()
    ok("the new slot drives the campaign straight away; the old slot's 2 calls still count against max 2",
       db.voice_campaigns.find_one({"_id": camp["_id"]})["runner"]["owner"] == "slot-new" and len(eng.dials) == 2)
    # The old slot's call to p1 is answered after the switch, so its stream opens on the new slot.
    ctx = {"doc": {"channel": "PHONE", "direction": "OUTBOUND", "numberId": camp["numberId"], "to": p1}}
    C.tag(ctx)
    ok("a call the old slot placed, streamed into the new one, gets its contact's variables",
       ctx.get("variables") == {"name": "Person 1", "company": "Co 1"} and ctx["doc"]["campaignContactId"] == contact(p1)["_id"]
       and contact(p1).get("streamedAt") is not None, str(ctx.get("variables")))
    end_call(contact(p0), "goodbye", clock())
    clock.advance(seconds=C.NO_STREAM_SECS + 1); await old.tick()
    ok("the old slot settles its call that ended, and keeps the streamed one (not 'never connected')",
       contact(p0)["status"] == "ANSWERED" and contact(p1)["status"] == "CALLING"
       and contact(p1)["lease"]["owner"] == "slot-old", f"{contact(p0)['status']} {contact(p1)['status']}")
    end_call(contact(p1), "goodbye", clock())
    clock.advance(seconds=3); await old.tick()
    ok("...settles it when it ends: nothing left, the old slot may exit", not old.inflight and contact(p1)["status"] == "ANSWERED")
    for _ in range(4):
        for c in db.voice_campaign_contacts.find({"campaignId": camp["_id"], "status": "CALLING"}):
            end_call(c, "goodbye", clock())
        clock.advance(seconds=3); await new.tick()
    phones = eng.phones()
    ok("the new slot calls the rest: every contact dialled exactly once", sorted(phones) == sorted(set(phones)) and len(phones) == 4
       and status_counts(camp["_id"]) == {"ANSWERED": 4}, f"{phones} {status_counts(camp['_id'])}")


def hook_tests():
    print("\n== the call hook (product._finish_ctx) ==")
    number, cid, camp = ObjectId(), ObjectId(), ObjectId()
    C.INFLIGHT[str(cid)] = {"contact_id": cid, "campaign_id": camp, "number_id": str(number), "phone": "+919876500000",
                            "variables": {"company": "Acme", "city": "Pune"}, "dialed_at": T0, "streamed": False}
    C.DIALING[(str(number), "+919876500000")] = str(cid)
    ctx = {"doc": {"channel": "PHONE", "direction": "OUTBOUND", "numberId": number, "to": "+919876500000"}}
    C.tag(ctx)
    ok("variables on ctx['variables'] (a dict)", ctx.get("variables") == {"company": "Acme", "city": "Pune"})
    ok("the voice_calls doc names the campaign, contact and variables",
       ctx["doc"]["campaignId"] == camp and ctx["doc"]["campaignContactId"] == cid and ctx["doc"]["variables"]["company"] == "Acme")
    ok("the call counts as live (its stream opened)", C.INFLIGHT[str(cid)]["streamed"] is True)
    other = {"doc": {"channel": "PHONE", "direction": "OUTBOUND", "numberId": number, "to": "+919876500099"}}
    C.tag(other)
    ok("a call to someone else is left alone", "variables" not in other and "campaignId" not in other["doc"])
    inbound = {"doc": {"channel": "PHONE", "direction": "INBOUND", "numberId": number, "to": "+919876500000"}}
    C.tag(inbound)
    ok("a call coming in is left alone", "variables" not in inbound)
    # The whole context, as product builds it for /calls.
    agent = {"_id": ObjectId(), "voice": "kore", "prompt": "Hi.", "callNotes": ""}
    num = {"_id": number, "tenantId": ObjectId(), "userId": ObjectId(), "phoneNumber": "+15550001111", "provider": "VOICELINK"}
    # Calls run on the owner's own Gemini key (product.gemini_key_for): give this owner one.
    testdb.set_account(db, {"userId": num["userId"], "tenantId": num["tenantId"],
                                  "gemini": {"keySealed": product.seal_secret("AIza-unit-fake"), "last4": "fake"}})
    ctx = product.phone_call(num, agent, "OUTBOUND", "+919876500000")
    ok("product.phone_call carries them through _finish_ctx",
       ctx.get("variables", {}).get("city") == "Pune" and ctx["doc"]["campaignContactId"] == cid and "_id" in ctx["doc"])
    C.INFLIGHT.clear(); C.DIALING.clear()


async def main():
    try:
        window_tests()
        rules_tests()
        await concurrency_tests()
        await retry_tests()
        await outcome_tests()
        await window_runner_tests()
        await dnc_tests()
        await error_tests()
        await lease_tests()
        await restart_tests()
        await stream_tests()
        await drain_tests()
        hook_tests()
    finally:
        db.client.drop_database(DBNAME)
    passed = sum(1 for _, p in RESULTS if p)
    print(f"\n{passed}/{len(RESULTS)} passed")
    for name, p in RESULTS:
        if not p:
            print("  FAILED:", name)


if __name__ == "__main__":
    asyncio.run(main())
