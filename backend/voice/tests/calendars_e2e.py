"""End to end: an agent that books into the owner's own Google Calendar (through Composio), over real Gemini Live.

Needs a test instance pointed at the throwaway database and at a fake Composio this script runs on :7872:

    MONGODB_URI=mongodb://127.0.0.1:27018 MONGODB_DB_NAME=AixelLabsVoiceEngineDev \\
      COMPOSIO_API_BASE=http://127.0.0.1:7872/api/v3.1 COMPOSIO_API_KEY=ck_fake_e2e_composio_key_not_real \\
      TELNYX_API_BASE=http://127.0.0.1:8799 LOG_LEVEL=INFO .venv/bin/python phone.py --port 7875
    .venv/bin/python tests/calendars_e2e.py 7875 [google busy down]

The caller (tools_e2e's spoken lines) asks for "this Saturday at 2 pm" as Ravi Kumar in the playground:
  google  Saturday 2 pm is free in Google: the event is created there (Meet link asked for), mirrored into
          voice_bookings with `external`, availability was prefetched when the call connected; every tool ran
          in one Composio session (direct tools preset) pinned to the account, made at connect and stored on
          the connection (voice_accounts.calendars); nothing used the legacy direct-execute path.
  busy    Saturday 2 pm is busy in Google: no event and no booking at 2 pm.
  down    Composio answers 500: no times offered, no booking, she offers to take a message.
One Live session at a time; fixtures are deleted afterwards. Never production Mongo.
"""
import asyncio, os, sys, time
from datetime import timedelta, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(HERE)); sys.path.insert(0, str(HERE / "tests"))
FAKE_PORT = int(os.getenv("FAKE_COMPOSIO_PORT", "7872"))

import tools_e2e as te   # the caller, the playground client, the checks (and the db guard)
from bson import ObjectId
from fake_composio import FakeComposio
import product, scripted, testdb, tools

db, ok = te.db, te.ok
CREATED = []


def agent(name, user, tenant, destination):
    now = te.datetime.now(timezone.utc)
    booking = {"enabled": True, "timezone": te.TZ, "slotMinutes": 30, "maxDaysAhead": 14,
               "hours": {d: {"open": "09:00", "close": "18:00"} for d in ("mon", "tue", "wed", "thu", "fri", "sat")},
               "destination": destination}
    a = {"tenantId": tenant, "userId": user, "name": name, "voice": "kore", "callType": "INBOUND",
         "prompt": ("You are Priya, the receptionist at Sunrise Dental in Pune. You answer the clinic's phone and book "
                    "appointments. Keep every reply to one or two short sentences."),
         "callNotes": "", "tools": {"booking": booking, "webhooks": []}, "createdAt": now, "updatedAt": now}
    a["_id"] = db.voice_agents.insert_one(a).inserted_id
    CREATED.append(a["_id"])
    return a


def google(account):
    return {"provider": "GOOGLE_CALENDAR", "connectedAccountId": account, "calendarId": "primary", "calendarName": "Main"}


async def test_google(port, fake, user, tenant):
    print("\n== Google Calendar: book Saturday at 2 pm, mirrored ==")
    fake.account("ca_e2e_google", str(user), "GOOGLE_CALENDAR", delay=0.3)
    # As the app leaves it before sessions existed: no composioSessionId yet.
    conn = testdb.Connections(db).insert_one({
        "tenantId": tenant, "userId": user, "provider": "GOOGLE_CALENDAR", "connectedAccountId": "ca_e2e_google",
        "authConfigId": "ac_e2e", "status": "ACTIVE", "label": "ravi@example.com", "statusReason": None,
        "createdAt": te.datetime.now(timezone.utc), "updatedAt": te.datetime.now(timezone.utc)}).inserted_id
    a = agent("Booker (Google)", user, tenant, google("ca_e2e_google"))
    n0 = len(fake.requests)
    t0 = time.monotonic()
    c = await te.play_call(port, a, te.BOOK)
    await asyncio.sleep(2)
    doc = await te.wait_call({"agentId": a["_id"], "channel": "PLAYGROUND"})
    te.check_booking("google", doc, "PLAYGROUND", None, c.events)
    reqs = fake.requests[n0:]
    fb = [r for r in reqs if r.get("slug") == "GOOGLECALENDAR_FREE_BUSY_QUERY"]
    ok("google: free/busy was asked as the call connected (prefetch), for the coming week",
       fb and fb[0]["at"] - t0 < 3.0 and te.datetime.fromisoformat(fb[0]["body"]["arguments"]["timeMax"].replace("Z", "+00:00"))
       - te.datetime.fromisoformat(fb[0]["body"]["arguments"]["timeMin"].replace("Z", "+00:00")) >= timedelta(days=6),
       f"{len(fb)} free/busy, first {fb[0]['at'] - t0:.1f} s after connect" if fb else "none")
    day, start = te.saturday_2pm()
    events = [e for e in fake.events("ca_e2e_google").values() if not e.get("cancelled")]
    ok("google: exactly one event in Google, Saturday 14:00 IST, titled for Ravi", len(events) == 1 and events[0]["start"] == start
       and "ravi" in (events[0]["summary"] or "").lower(), str([(e["start"], e["summary"]) for e in events]))
    mirror = db.voice_bookings.find_one({"agentId": a["_id"], "status": "BOOKED"})
    ok("google: the voice_bookings mirror points at it", mirror and (mirror.get("external") or {}).get("eventId") == (events[0]["id"] if events else None)
       and mirror["external"]["provider"] == "GOOGLE_CALENDAR" and mirror["external"]["connectedAccountId"] == "ca_e2e_google",
       str(mirror and mirror.get("external")))
    sid = (testdb.Connections(db).find_one({"_id": conn}) or {}).get("composioSessionId")
    made = [r for r in reqs if r["kind"] == "session.create"]
    runs = [r for r in reqs if r["kind"] == "execute"]
    ok("google: one Composio session (direct tools preset, pinned to the account, the doc's auth config), stored on the connection",
       len(made) == 1 and sid and made[0].get("session_id") == sid and fake.sessions.get(sid, {}).get("account") == "ca_e2e_google"
       and made[0]["body"].get("auth_configs") == {"googlecalendar": "ac_e2e"} and made[0]["body"]["search"] == {"enable": False},
       f"{len(made)} made, stored {sid}")
    ok("google: every tool ran in that session, none through the legacy /tools/execute",
       runs and all(r["session_id"] == sid for r in runs) and not [r for r in reqs if r["kind"] == "legacy"],
       str([(r["slug"], r["session_id"]) for r in runs]))
    if doc:
        tc = doc.get("toolCalls") or []
        ms = [t["durationMs"] for t in tc]
        ok(f"google: tool calls under 1.5 s with 300 ms Composio latency: {ms}", ms and max(ms) < 1500, str(ms))


async def test_busy(port, fake, user, tenant):
    print("\n== Google Calendar: Saturday 2 pm is busy there ==")
    day, start = te.saturday_2pm()
    fake.account("ca_e2e_busy", str(user), "GOOGLE_CALENDAR", busy=[(start, start + timedelta(minutes=30))])
    a = agent("Booker (Google, busy)", user, tenant, google("ca_e2e_busy"))
    c = await te.play_call(port, a, te.BOOK)
    await asyncio.sleep(2)
    doc = await te.wait_call({"agentId": a["_id"], "channel": "PLAYGROUND"})
    if doc:
        te.show(doc)
    checks = [t for t in (doc or {}).get("toolCalls") or [] if t["name"] == "check_availability"]
    ok("busy: she checked, and 14:00 was not offered", checks and all("14:00" not in t["result"] for t in checks),
       str([t["result"][:120] for t in checks]))
    at_two = [e for e in fake.events("ca_e2e_busy").values() if e["start"] == start]
    ok("busy: nothing booked at 2 pm, in Google or in voice_bookings", not at_two
       and not db.voice_bookings.find_one({"agentId": a["_id"], "start": start, "status": "BOOKED"}))


async def test_down(port, fake, user, tenant):
    print("\n== Composio down: no times, a message instead ==")
    fake.account("ca_e2e_down", str(user), "GOOGLE_CALENDAR", fail="500")
    a = agent("Booker (Composio down)", user, tenant, google("ca_e2e_down"))
    c = await te.play_call(port, a, te.BOOK)
    await asyncio.sleep(2)
    doc = await te.wait_call({"agentId": a["_id"], "channel": "PLAYGROUND"})
    if not doc:
        ok("down: voice_calls doc written", False); return
    te.show(doc)
    tc = doc.get("toolCalls") or []
    ok("down: the tools said the calendar can't be checked", tc and all(not t["ok"] for t in tc if t["name"] in tools.BUILTIN)
       and any(t["result"] == tools.UNREACHABLE for t in tc), str([t["result"][:60] for t in tc]))
    ok("down: no booking", db.voice_bookings.count_documents({"agentId": a["_id"]}) == 0 and not fake.events("ca_e2e_down"))
    said = te.after(doc, tc[0]) if tc else ""
    ok("down: she offers to take a message (no invented time)", any(w in said for w in ("message", "pass", "call you back", "get back", "note"))
       and not any(w in said for w in ("is free", "available at", "booked")), said[:200])


async def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 7875
    testdb.engine_on(port, te.DBNAME)
    which = sys.argv[2:] or ["google", "busy", "down"]
    for line in te.BOOK:
        scripted.tts(line)
    fake = FakeComposio()
    runner = await fake.start(FAKE_PORT)
    user, tenant = ObjectId(), ObjectId()
    scripted.give_owner_key(db, tenant, user)  # every customer call runs on its owner's own Gemini key
    tests = {"google": test_google, "busy": test_busy, "down": test_down}
    try:
        for i, name in enumerate(which):
            if i:
                await asyncio.sleep(8)
            await tests[name](port, fake, user, tenant)
    finally:
        await runner.cleanup()
        db.voice_bookings.delete_many({"agentId": {"$in": CREATED}})
        db.voice_calls.delete_many({"agentId": {"$in": CREATED}})
        db.voice_agents.delete_many({"_id": {"$in": CREATED}})
        testdb.Connections(db).delete_many({"userId": user})
    passed = sum(1 for _, p in te.RESULTS if p)
    print(f"\n{passed}/{len(te.RESULTS)} passed")
    for name, p in te.RESULTS:
        if not p:
            print("  FAILED:", name)


if __name__ == "__main__":
    asyncio.run(main())
