"""Bookings into the owner's own booking apps (calendars.py + tools.py) against a fake Composio.

    .venv/bin/python tests/calendars_unit.py

No Gemini, no network: a fake Composio (tests/fake_composio.py) runs in this process on a free port,
mirrors go to the local throwaway database (AixelLabsVoiceEngineDev on 127.0.0.1:27018) and are
deleted afterwards. Covers the time math, the provider routing (exact slugs and arguments per
provider), the Composio session (direct tools preset, made once, reused, stored on the connection
doc, made again when Composio forgets it; the legacy direct-execute path never used), the prefetch +
per-call cache, the mirror doc, double booking, cancel, the failure path, and how long each tool call
takes on our side.
"""
import asyncio, os, sys, time
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import testdb
MONGO, DBNAME = testdb.throwaway()
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__)))); sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fake_composio import FAKE_KEY, FakeComposio
os.environ["COMPOSIO_API_KEY"] = FAKE_KEY
os.environ["COMPOSIO_API_BASE"] = "http://127.0.0.1:1/api/v3.1"  # replaced with the fake's port in main()

import product  # first: keeps the settings above over .env
from bson import ObjectId
import calendars, tools

assert product.db().name == DBNAME
RESULTS = []
UTC = timezone.utc
TZ = "Asia/Kolkata"
KOL = ZoneInfo(TZ)


def ok(name, cond, detail=""):
    RESULTS.append((name, bool(cond)))
    print(f"  [{'PASS' if cond else 'FAIL'}] {name}{' -- ' + detail if detail else ''}", flush=True)


HOURS = {d: {"open": "09:00", "close": "18:00"} for d in ("mon", "tue", "wed", "thu", "fri", "sat", "sun")}


def booking(provider=None, account=None, calendar="primary"):
    b = {"enabled": True, "timezone": TZ, "slotMinutes": 30, "hours": HOURS, "maxDaysAhead": 14}
    if provider:
        b["destination"] = {"provider": provider, "connectedAccountId": account, "calendarId": calendar, "calendarName": "Main"}
    return b


def ctx(agent_id, tenant, user, bk, phone="+15557770000"):
    return {"tools": {"booking": bk}, "customer_phone": phone,
            "doc": {"_id": ObjectId(), "tenantId": tenant, "userId": user, "agentId": agent_id, "channel": "PHONE",
                    "direction": "INBOUND", "from": phone, "to": "+15550001111"}}


def at(d: date, hh: int, mm: int = 0) -> datetime:
    return datetime(d.year, d.month, d.day, hh, mm, tzinfo=KOL).astimezone(UTC)


def day_ahead(n=3) -> date:
    return datetime.now(KOL).date() + timedelta(days=n)


def time_math_tests():
    print("\n== time math ==")
    ok("parse Z", calendars.parse_time("2026-10-17T08:30:00Z") == datetime(2026, 10, 17, 8, 30, tzinfo=UTC))
    ok("parse offset", calendars.parse_time("2026-10-17T14:00:00.000+05:30") == datetime(2026, 10, 17, 8, 30, tzinfo=UTC))
    ok("parse Graph 7 digits + zone", calendars.parse_time({"dateTime": "2026-10-17T08:30:00.0000000", "timeZone": "UTC"})
       == datetime(2026, 10, 17, 8, 30, tzinfo=UTC))
    ok("naive in a named zone", calendars.parse_time("2026-10-17T14:00:00", TZ) == datetime(2026, 10, 17, 8, 30, tzinfo=UTC))
    ok("garbage is None", calendars.parse_time("next tuesday") is None and calendars.parse_time(None) is None)
    t = datetime(2026, 10, 17, 8, 30, tzinfo=UTC)
    ok("zulu", calendars.zulu(t) == "2026-10-17T08:30:00Z")
    ok("wall time in the business zone (what Google/Graph get with timezone)", calendars.wall(t, KOL) == "2026-10-17T14:00:00")
    cal = tools.Calendar(booking())
    d = date(2026, 10, 17)
    busy = [(at(d, 10), at(d, 11, 15))]
    free = [tools.hhmm(m) for m, _, _ in cal.free(d, datetime(2026, 10, 16, tzinfo=UTC), busy)]
    ok("busy 10:00-11:15 removes 10:00, 10:30, 11:00 (overlap), keeps 11:30", "10:00" not in free and "11:00" not in free and "11:30" in free and "09:30" in free, str(free[:6]))
    starts = {at(d, 9), at(d, 9, 30), at(d, 12, 15), at(d, 19)}
    free = [tools.hhmm(m) for m, _, _ in cal.free(d, datetime(2026, 10, 16, tzinfo=UTC), [], starts)]
    ok("a starts-list app (Cal.com/Calendly): only our slots it lists (12:15 is not ours, 19:00 is after hours)", free == ["09:00", "09:30"], str(free))
    ny = tools.Calendar({**booking(), "timezone": "America/New_York"})
    nov1 = date(2026, 11, 1)  # DST ends: 01:00-02:00 happens twice
    a, b = ny.day_bounds(nov1)
    ok("day bounds across a DST change are 25 h (+3 h margin)", b - a == timedelta(hours=28), str(b - a))
    av = calendars.Availability(a, b, busy=[])
    ok("Availability covers its own window only", av.covers(a, b) and not av.covers(a - timedelta(minutes=1), b))
    av.add_busy(a, a + timedelta(minutes=30))
    ok("a booking made in the call becomes busy", av.busy == [(a, a + timedelta(minutes=30))])


def routing_tests():
    print("\n== provider routing ==")
    u = ObjectId()
    for name, cls in (("GOOGLE_CALENDAR", calendars.GoogleCalendar), ("OUTLOOK", calendars.Outlook),
                      ("CAL_COM", calendars.CalCom), ("CALENDLY", calendars.Calendly)):
        p = calendars.provider_for({"provider": name, "connectedAccountId": "ca_x", "calendarId": "c1"}, u)
        ok(f"{name} -> {cls.__name__}, Composio user_id = the owner's id", isinstance(p, cls) and p.user_id == str(u) and p.account == "ca_x")
    ok("no destination = built-in", calendars.provider_for(None, u) is None and calendars.provider_for({}, u) is None)
    ok("unknown provider = built-in", calendars.provider_for({"provider": "ICLOUD", "connectedAccountId": "ca_x"}, u) is None)
    ok("no account = built-in", calendars.provider_for({"provider": "OUTLOOK", "connectedAccountId": ""}, u) is None)
    c = ctx(ObjectId(), ObjectId(), u, booking())
    ok("an agent with booking and no destination keeps the built-in calendar", tools.CallTools(c, {"turns": []}, prefetch=False).dest is None)
    c = ctx(ObjectId(), ObjectId(), u, {**booking("CAL_COM", "ca_x", "1234"), "enabled": False})
    ok("booking off: no destination either", tools.CallTools(c, {"turns": []}, prefetch=False).dest is None)
    ok("taken detection: Cal.com, Calendly", calendars._taken("User either already has booking at this time or is not available")
       and calendars._taken("The selected time is no longer available") and not calendars._taken("Calendar API not enabled"))


async def provider_tests(fake: FakeComposio):
    print("\n== each provider against the fake Composio ==")
    user = str(ObjectId())
    d = day_ahead(3)
    a, b = at(d, 0), at(d, 23, 59)
    s, e = at(d, 15), at(d, 15, 30)

    fake.account("ca_g", user, "GOOGLE_CALENDAR", busy=[(at(d, 10), at(d, 11))])
    g = calendars.GoogleCalendar(user, "ca_g", "primary")
    av = await g.availability(a, b, KOL)
    r = fake.calls("GOOGLECALENDAR_FREE_BUSY_QUERY")[-1]["body"]
    rec = fake.calls("GOOGLECALENDAR_FREE_BUSY_QUERY")[-1]
    ok("Google free/busy: slug, in a session of this user pinned to the account, RFC3339 bounds",
       rec["user_id"] == user and rec["account"] == "ca_g" and set(r) == {"tool_slug", "arguments"}
       and r["arguments"] == {"items": ["primary"], "timeMin": calendars.zulu(a), "timeMax": calendars.zulu(b), "timeZone": "UTC"}, str(r))
    ok("Google busy parsed", av.busy == [(at(d, 10), at(d, 11))], str(av.busy))
    ev = await g.create(s, e, KOL, "Ravi: appointment", "cleaning", "Ravi", "ravi@example.com", "+1555")
    args = fake.calls("GOOGLECALENDAR_CREATE_EVENT")[-1]["body"]["arguments"]
    ok("Google create: local wall times + IANA zone, attendee, Meet link asked for, invite sent",
       args["start_datetime"] == calendars.wall(s, KOL) and args["timezone"] == TZ and args["attendees"][0]["email"] == "ravi@example.com"
       and args["create_meeting_room"] is True and args["send_updates"] == "all" and args["calendar_id"] == "primary", str(args))
    ok("Google event id + Meet link back", ev.event_id in fake.events("ca_g") and ev.meeting_url and "meet.google.com" in ev.meeting_url)
    ok("the event is at the right instant", fake.events("ca_g")[ev.event_id]["start"] == s)
    await g.create(s + timedelta(hours=1), e + timedelta(hours=1), KOL, "x", "", "Asha", None, None)
    ok("Google without an email: no attendees, no emails sent", "attendees" not in fake.calls("GOOGLECALENDAR_CREATE_EVENT")[-1]["body"]["arguments"]
       and fake.calls("GOOGLECALENDAR_CREATE_EVENT")[-1]["body"]["arguments"]["send_updates"] == "none")
    await g.cancel(ev.event_id)
    ok("Google cancel = GOOGLECALENDAR_DELETE_EVENT with the calendar", fake.events("ca_g")[ev.event_id].get("cancelled")
       and fake.calls("GOOGLECALENDAR_DELETE_EVENT")[-1]["body"]["arguments"]["calendar_id"] == "primary")

    fake.account("ca_o", user, "OUTLOOK", busy=[(at(d, 12), at(d, 13))])
    o = calendars.Outlook(user, "ca_o", "AAMkCal=")
    av = await o.availability(a, b, KOL)
    args = fake.calls("OUTLOOK_GET_CALENDAR_VIEW")[-1]["body"]["arguments"]
    ok("Outlook: calendar view of the chosen calendar, UTC", args["calendar_id"] == "AAMkCal=" and args["timezone"] == "UTC", str(args))
    ok("Outlook: busy parsed, 'free' events ignored", av.busy == [(at(d, 12), at(d, 13))], str(av.busy))
    ev = await o.create(s, e, KOL, "t", "d", "Ravi", "ravi@example.com", None)
    args = fake.calls("OUTLOOK_CALENDAR_CREATE_EVENT")[-1]["body"]["arguments"]
    ok("Outlook create: Teams meeting, zone, calendar, attendee", args["is_online_meeting"] and args["online_meeting_provider"] == "teamsForBusiness"
       and args["time_zone"] == TZ and args["calendar_id"] == "AAMkCal=" and args["attendees_info"][0]["email"] == "ravi@example.com")
    ok("Outlook Teams link back", ev.meeting_url and "teams.microsoft.com" in ev.meeting_url)
    await o.cancel(ev.event_id)
    ok("Outlook cancel = OUTLOOK_CANCEL_EVENT (notifies attendees)", fake.events("ca_o")[ev.event_id].get("cancelled") and fake.calls("OUTLOOK_CANCEL_EVENT"))

    fake.account("ca_c", user, "CAL_COM", starts={at(d, 9), at(d, 9, 30), at(d, 15)})
    c = calendars.CalCom(user, "ca_c", "1234")
    av = await c.availability(a, b, KOL)
    args = fake.calls("CAL_GET_AVAILABLE_SLOTS_INFO")[-1]["body"]["arguments"]
    ok("Cal.com slots: event type id as a number, UTC range", args["eventTypeId"] == 1234 and args["startTime"] == calendars.zulu(a), str(args))
    ok("Cal.com open starts parsed", av.starts == {at(d, 9), at(d, 9, 30), at(d, 15)}, str(sorted(av.starts)))
    ev = await c.create(s, e, KOL, "t", "cleaning", "Ravi", "ravi@example.com", None)
    args = fake.calls("CAL_POST_NEW_BOOKING_REQUEST")[-1]["body"]["arguments"]
    ok("Cal.com booking: start UTC, attendee name + email, zone, language", args["start"] == calendars.zulu(s) and args["responses"]["email"] == "ravi@example.com"
       and args["timeZone"] == TZ and args["language"] == "en")
    try:
        await c.create(s, e, KOL, "t", "", "Asha", "asha@example.com", None)
        ok("Cal.com: the same slot again is SlotTaken", False)
    except calendars.SlotTaken:
        ok("Cal.com: the same slot again is SlotTaken", True)
    await c.cancel(ev.event_id)
    ok("Cal.com cancel by uid", fake.events("ca_c")[ev.event_id].get("cancelled"))

    far = day_ahead(12)
    fake.account("ca_l", user, "CALENDLY", starts={at(d, 16), at(far, 10)})
    cl = calendars.Calendly(user, "ca_l", "https://api.calendly.com/event_types/ET1")
    av = await cl.availability(at(d, 0), at(far, 23), KOL)
    n = len(fake.calls("CALENDLY_LIST_EVENT_TYPE_AVAILABLE_TIMES"))
    ok("Calendly: a range over 7 days is asked in 7-day pieces", n == 2 and av.starts == {at(d, 16), at(far, 10)}, f"{n} requests, {sorted(av.starts)}")
    ev = await cl.create(at(d, 16), at(d, 16, 30), KOL, "t", "", "Ravi", "ravi@example.com", None)
    args = fake.calls("CALENDLY_POST_INVITEE")[-1]["body"]["arguments"]
    ok("Calendly invitee: event type URI, start UTC, invitee name/email/timezone",
       args["event_type"].endswith("/ET1") and args["invitee"] == {"name": "Ravi", "email": "ravi@example.com", "timezone": TZ})
    ok("Calendly scheduled event uuid kept", ev.event_id in fake.events("ca_l"))
    await cl.cancel(ev.event_id)
    ok("Calendly cancel by event uuid", fake.events("ca_l")[ev.event_id].get("cancelled"))
    fake.account("ca_lf", user, "CALENDLY", starts={at(d, 16)}, free_plan=True)
    try:
        await calendars.Calendly(user, "ca_lf", "ET1").create(at(d, 16), at(d, 16, 30), KOL, "t", "", "R", "r@example.com", None)
        ok("Calendly free plan: booking refused (paid plan needed)", False)
    except calendars.CalendarError as ex:
        ok("Calendly free plan: booking refused (paid plan needed)", "paid" in str(ex) and not isinstance(ex, calendars.SlotTaken), str(ex))

    try:
        await calendars.GoogleCalendar(str(ObjectId()), "ca_g", "primary").availability(a, b, KOL)
        ok("another user's account is refused", False)
    except calendars.CalendarError as ex:
        ok("another user's account is refused", "not found" in str(ex).lower(), str(ex))
    key = FAKE_KEY  # not os.environ: bot.py loads .env with override=True, which holds the real key
    os.environ["COMPOSIO_API_KEY"] = "ck_wrong"; product._STARTED_WITH["COMPOSIO_API_KEY"] = "ck_wrong"
    try:
        await g.availability(a, b, KOL)
        ok("a wrong API key is an error", False)
    except calendars.CalendarError as ex:
        ok("a wrong API key is an error", "401" in str(ex), str(ex))
    finally:
        os.environ["COMPOSIO_API_KEY"] = key; product._STARTED_WITH["COMPOSIO_API_KEY"] = key


async def session_tests(fake: FakeComposio):
    print("\n== the Composio session (direct tools preset) ==")
    import aiohttp
    conns = product.db().voice_calendar_connections
    user = ObjectId()
    d = day_ahead(3)
    a, b = at(d, 0), at(d, 23, 59)
    inserted = []
    try:
        fake.account("ca_s1", str(user), "GOOGLE_CALENDAR")
        n0 = len(fake.created())
        g = calendars.GoogleCalendar(str(user), "ca_s1", "primary")
        await g.availability(a, b, KOL)
        made = fake.created()[n0:]
        cfg = made[0]["body"] if made else {}
        ok("first use: one session made, the direct tools preset for exactly this account",
           len(made) == 1 and cfg == calendars.session_config(str(user), "googlecalendar", "ca_s1")
           and cfg["toolkits"] == {"enable": ["googlecalendar"]} and cfg["connected_accounts"] == {"googlecalendar": ["ca_s1"]}
           and cfg["tools"]["googlecalendar"]["enable"] == calendars.TOOLS["googlecalendar"]
           and cfg["manage_connections"] == {"enable": False} and cfg["workbench"] == {"enable": False}
           and cfg["search"] == {"enable": False} and cfg["execute"] == {"enable_multi_execute": False}
           and cfg["preload"] == {"tools": "all"} and "auth_configs" not in cfg, str(cfg))
        sid = made[0].get("session_id") if made else None
        ok("the tool ran in that session", fake.calls("GOOGLECALENDAR_FREE_BUSY_QUERY")[-1]["session_id"] == sid)
        await g.create(at(d, 15), at(d, 15, 30), KOL, "t", "", "R", None, None)
        await calendars.GoogleCalendar(str(user), "ca_s1", "primary").availability(a, b, KOL)
        ok("reused: by the next tool, and by the next call's provider (no new session)", len(fake.created()) == n0 + 1
           and {r["session_id"] for r in fake.calls()[-2:]} == {sid})

        # The app stored one on the connection doc when the owner connected: used as is.
        fake.account("ca_s2", str(user), "OUTLOOK")
        async with aiohttp.ClientSession() as http:
            async with http.post(f"{fake.base}/tool_router/session", headers={"x-api-key": FAKE_KEY},
                                 json=calendars.session_config(str(user), "outlook", "ca_s2", "ac_out")) as r:
                app_sid = (await r.json())["session_id"]
            async with http.post(f"{fake.base}/tools/execute/OUTLOOK_GET_CALENDAR_VIEW", headers={"x-api-key": FAKE_KEY},
                                 json={"user_id": str(user), "connected_account_id": "ca_s2", "arguments": {}}) as r:
                legacy_status = r.status
        ok("the fake refuses the legacy direct-execute path (so nothing silently stays on it)", legacy_status == 410)
        fake.requests[:] = [r for r in fake.requests if r["kind"] != "legacy"]
        doc_id = conns.insert_one({"userId": user, "connectedAccountId": "ca_s2", "provider": "OUTLOOK", "authConfigId": "ac_out",
                                   "status": "ACTIVE", "composioSessionId": app_sid}).inserted_id
        inserted.append(doc_id)
        n1 = len(fake.created())
        o = calendars.Outlook(str(user), "ca_s2", "primary")
        await o.availability(a, b, KOL)
        ok("the session the app stored on voice_calendar_connections is used, none made",
           len(fake.created()) == n1 and fake.calls("OUTLOOK_GET_CALENDAR_VIEW")[-1]["session_id"] == app_sid)

        # Composio forgets it: the tool still answers, from a new session that is stored for next time.
        fake.drop_session(app_sid)
        await o.availability(a, b, KOL)
        new = fake.created()[n1:]
        stored = conns.find_one({"_id": doc_id})["composioSessionId"]
        views = fake.calls("OUTLOOK_GET_CALENDAR_VIEW")
        ok("session gone: made again (with the doc's auth config), stored on the doc, the tool run once more and answered",
           len(new) == 1 and new[0]["body"].get("auth_configs") == {"outlook": "ac_out"} and stored == new[0]["session_id"]
           and stored != app_sid and views[-2]["session_id"] == app_sid and views[-1]["session_id"] == stored,
           f"{len(new)} new, stored {stored}")
        ok("...and Composio was asked whether it is really gone first",
           any(r["kind"] == "session.get" and r["session_id"] == app_sid for r in fake.requests))

        # A connection doc with no session yet (made before sessions): one is made and stored.
        fake.account("ca_s3", str(user), "CAL_COM", starts={at(d, 9)})
        doc3 = conns.insert_one({"userId": user, "connectedAccountId": "ca_s3", "provider": "CAL_COM", "authConfigId": "ac_cal",
                                 "status": "ACTIVE"}).inserted_id
        inserted.append(doc3)
        p1, p2 = calendars.CalCom(str(user), "ca_s3", "1234"), calendars.CalCom(str(user), "ca_s3", "1234")
        n2 = len(fake.created())
        await asyncio.gather(p1.availability(a, b, KOL), p2.availability(a, b, KOL))
        ok("no session yet: two tools at once make one session between them, stored on the doc",
           len(fake.created()) == n2 + 1 and conns.find_one({"_id": doc3}).get("composioSessionId") == fake.created()[-1]["session_id"])

        # The app stores one while we were making ours: theirs wins, ours is deleted again.
        fake.account("ca_s4", str(user), "GOOGLE_CALENDAR")
        doc4 = conns.insert_one({"userId": user, "connectedAccountId": "ca_s4", "provider": "GOOGLE_CALENDAR",
                                 "authConfigId": "ac_g", "status": "ACTIVE"}).inserted_id
        inserted.append(doc4)
        real_create = calendars.create_session

        async def racing_create(*args):
            theirs = await real_create(*args)        # "the app's"
            conns.update_one({"_id": doc4}, {"$set": {"composioSessionId": theirs}})
            return await real_create(*args)          # ours
        calendars.create_session = racing_create
        try:
            await calendars.GoogleCalendar(str(user), "ca_s4", "primary").availability(a, b, KOL)
        finally:
            calendars.create_session = real_create
        theirs = conns.find_one({"_id": doc4})["composioSessionId"]
        live = [k for k, v in fake.sessions.items() if v["account"] == "ca_s4"]
        ok("a session stored by the app meanwhile wins; ours is deleted, not left behind",
           live == [theirs] and fake.calls("GOOGLECALENDAR_FREE_BUSY_QUERY")[-1]["session_id"] == theirs, f"{live} vs {theirs}")

        sid1 = await g.session()
        try:
            await calendars.execute(sid1, "GOOGLECALENDAR_EVENTS_LIST", {})
            ok("a slug outside the session's list is refused (an error, not 'session gone')", False)
        except calendars.SessionGone:
            ok("a slug outside the session's list is refused (an error, not 'session gone')", False)
        except calendars.CalendarError as e:
            ok("a slug outside the session's list is refused (an error, not 'session gone')", "not available" in str(e), str(e))
        fake.accounts["ca_s1"]["fail"] = "tool_empty"
        try:
            await g.availability(a, b, KOL)
            ok("result_type failed with an empty error is still a failure", False)
        except calendars.CalendarError as e:
            ok("result_type failed with an empty error is still a failure", "failed" in str(e), str(e))
        fake.accounts["ca_s1"]["fail"] = None
    finally:
        conns.delete_many({"_id": {"$in": inserted}})


async def call_tests(fake: FakeComposio):
    print("\n== a call booking into Google Calendar (prefetch, cache, mirror, double booking, cancel) ==")
    db = product.db()
    tenant, user, agent_id = ObjectId(), ObjectId(), ObjectId()
    d = day_ahead(2)
    fake.account("ca_call", str(user), "GOOGLE_CALENDAR", busy=[(at(d, 10), at(d, 11))], delay=0.15)
    bk = booking("GOOGLE_CALENDAR", "ca_call", "primary")
    try:
        n0 = len(fake.calls("GOOGLECALENDAR_FREE_BUSY_QUERY"))
        t = tools.CallTools(ctx(agent_id, tenant, user, bk), {"turns": []})
        ok("the destination is Google Calendar", isinstance(t.dest, calendars.GoogleCalendar))
        await asyncio.sleep(0.4)
        ok("prefetch asked once at connect, for the coming days", len(fake.calls("GOOGLECALENDAR_FREE_BUSY_QUERY")) == n0 + 1
           and t._seen and t._seen[0].end - t._seen[0].start >= timedelta(days=6))
        t0 = time.monotonic()
        r = await t.check_availability({"date": d.isoformat()})
        ms = (time.monotonic() - t0) * 1000
        ok(f"check_availability from the prefetch: no new request ({ms:.0f} ms)", len(fake.calls("GOOGLECALENDAR_FREE_BUSY_QUERY")) == n0 + 1 and ms < 300, f"{ms:.0f} ms")
        ok("busy 10:00-11:00 in Google is not offered", r[0] and r[1].endswith("free at 09:00, 09:30 and 11:00 to 17:30 every 30 minutes."), r[1])

        t0 = time.monotonic()
        ok_, text, bid = await t.book_appointment({"date": d.isoformat(), "time": "11:00", "name": "Ravi Kumar", "email": "Ravi@Example.com", "notes": "cleaning"})
        ms = (time.monotonic() - t0) * 1000
        ok(f"book_appointment into Google ({ms:.0f} ms with 150 ms fake latency)", ok_ and text.startswith("Booked:") and "invite is emailed to ravi@example.com" in text, text)
        ok("one create, no re-check (cache was fresh)", len(fake.calls("GOOGLECALENDAR_FREE_BUSY_QUERY")) == n0 + 1)
        doc = db.voice_bookings.find_one({"_id": ObjectId(bid)}) if bid else None
        ev_id = (doc or {}).get("external", {}).get("eventId")
        ok("mirror doc in voice_bookings with external {provider, eventId, connectedAccountId, calendarId, meetingUrl}",
           doc and doc["status"] == "BOOKED" and doc["external"]["provider"] == "GOOGLE_CALENDAR" and ev_id in fake.events("ca_call")
           and doc["external"]["connectedAccountId"] == "ca_call" and doc["external"]["calendarId"] == "primary"
           and "meet.google.com" in (doc["external"]["meetingUrl"] or "") and tools.as_utc(doc["start"]) == at(d, 11)
           and doc["callId"] == t.ctx["doc"]["_id"], str(doc and doc.get("external")))
        ev = fake.events("ca_call")[ev_id]
        ok("the Google event: summary, attendee, the right time", ev["summary"] == "Ravi Kumar: appointment" and ev["attendees"][0]["email"] == "ravi@example.com"
           and ev["start"] == at(d, 11) and "cleaning" in ev["args"]["description"] and "+15557770000" in ev["args"]["description"])
        r = await t.check_availability({"date": d.isoformat()})
        ok("the booked slot is no longer offered in this call", "11:00" not in r[1].split("free at")[1].split(",")[0] and "11:30" in r[1], r[1])
        ok_, text, bid2 = await t.book_appointment({"date": d.isoformat(), "time": "11:00", "name": "Ravi Kumar"})
        ok("the same call asking again: its own booking, no second event", ok_ and bid2 == bid and len([e for e in fake.events("ca_call").values() if not e.get("cancelled")]) == 1, text)

        other = tools.CallTools(ctx(agent_id, tenant, user, bk, phone="+15550002222"), {"turns": []})
        ok_, text, _ = await other.book_appointment({"date": d.isoformat(), "time": "11:00", "name": "Asha"})
        ok("another call: taken (Google shows it busy now)", not ok_ and "is taken" in text, text)
        fake.accounts["ca_call"]["busy"].append((at(d, 14), at(d, 14, 30)))   # booked in Google by someone else, mid-call
        for g in other._seen:
            g.fetched -= 120   # what this call knows is two minutes old
        ok_, text, _ = await other.book_appointment({"date": d.isoformat(), "time": "14:00", "name": "Asha"})
        ok("an old cache is checked again before booking: a slot taken in Google meanwhile is refused", not ok_ and "is taken" in text, text)

        # The race between two calls: both see 15:00 free, the first mirror wins, the loser's event is cancelled.
        r1 = tools.CallTools(ctx(agent_id, tenant, user, bk), {"turns": []}, prefetch=False)
        r2 = tools.CallTools(ctx(agent_id, tenant, user, bk), {"turns": []}, prefetch=False)
        got = await asyncio.gather(r1.book_appointment({"date": d.isoformat(), "time": "15:00", "name": "A"}),
                                   r2.book_appointment({"date": d.isoformat(), "time": "15:00", "name": "B"}))
        live = [e for e in fake.events("ca_call").values() if e["start"] == at(d, 15) and not e.get("cancelled")]
        n = db.voice_bookings.count_documents({"agentId": agent_id, "start": at(d, 15), "status": "BOOKED"})
        ok("two calls at once for one slot: one booked, one taken, one live Google event, one mirror",
           sum(g[0] for g in got) == 1 and len(live) == 1 and n == 1, f"{[g[1][:20] for g in got]}, {len(live)} live, {n} mirrors")

        print("\n== failure path ==")
        fake.accounts["ca_call"]["fail"] = "500"
        f = tools.CallTools(ctx(agent_id, tenant, user, bk), {"turns": []})
        await asyncio.sleep(0.3)
        r = await f.check_availability({"date": d.isoformat()})
        ok("Composio down: check_availability says she can't check and must offer a message, no times", not r[0] and r[1] == tools.UNREACHABLE
           and not any(ch.isdigit() for ch in r[1]), r[1])
        n_before = db.voice_bookings.count_documents({"agentId": agent_id})
        ok_, text, _ = await f.book_appointment({"date": d.isoformat(), "time": "16:00", "name": "Ravi"})
        ok("Composio down: no booking, no mirror", not ok_ and text == tools.NOT_BOOKED_APP and db.voice_bookings.count_documents({"agentId": agent_id}) == n_before, text)
        fake.accounts["ca_call"]["fail"] = "tool"
        f2 = tools.CallTools(ctx(agent_id, tenant, user, bk), {"turns": []}, prefetch=False)
        r = await f2.check_availability({"date": d.isoformat()})
        ok("an expired connection (tool error): the same", not r[0] and r[1] == tools.UNREACHABLE)
        fake.accounts["ca_call"]["fail"] = "timeout"
        old = calendars.TIMEOUT
        calendars.TIMEOUT = 1.0
        await close_sessions()
        f3 = tools.CallTools(ctx(agent_id, tenant, user, bk), {"turns": []}, prefetch=False)
        t0 = time.monotonic()
        r = await f3.check_availability({"date": d.isoformat()})
        ok("Composio not answering: gives up after the timeout", not r[0] and r[1] == tools.UNREACHABLE and time.monotonic() - t0 < 2.5, f"{time.monotonic() - t0:.1f} s")
        calendars.TIMEOUT = old
        await close_sessions()
        fake.accounts["ca_call"]["fail"] = None

        print("\n== Cal.com and Calendly need an email ==")
        fake.account("ca_cal2", str(user), "CAL_COM", starts={at(d, 9), at(d, 9, 30)})
        cc = tools.CallTools(ctx(agent_id, tenant, user, booking("CAL_COM", "ca_cal2", "1234")), {"turns": []}, prefetch=False)
        r = await cc.check_availability({"date": d.isoformat()})
        ok("Cal.com: only the starts it offers", r[1].endswith("free at 09:00 and 09:30."), r[1])
        ok_, text, _ = await cc.book_appointment({"date": d.isoformat(), "time": "09:00", "name": "Ravi"})
        ok("Cal.com without an email: asks for it", not ok_ and "email" in text, text)
        ok_, text, _ = await cc.book_appointment({"date": d.isoformat(), "time": "09:00", "name": "Ravi", "email": "ravi at example"})
        ok("a bad email: asks again", not ok_ and "not an email address" in text, text)
        ok_, text, bid3 = await cc.book_appointment({"date": d.isoformat(), "time": "09:00", "name": "Ravi", "email": "ravi@example.com"})
        ok("Cal.com books with the email", ok_ and db.voice_bookings.find_one({"_id": ObjectId(bid3)})["external"]["provider"] == "CAL_COM", text)
        prompt = cc.prompt()
        ok("the prompt asks for (and spells back) the email on Cal.com", "email address" in prompt and "spell it back" in prompt)
        sch = {f.name: f for f in cc.schema().standard_tools}
        ok("book_appointment offers an email parameter", "email" in sch["book_appointment"].properties)
        plain = tools.CallTools(ctx(agent_id, tenant, user, booking()), {"turns": []}, prefetch=False)
        ok("the built-in calendar: no email parameter, prompt unchanged", "email" not in {f.name: f for f in plain.schema().standard_tools}["book_appointment"].properties
           and "email address" not in plain.prompt() and "can't be checked" not in plain.prompt())
    finally:
        n = db.voice_bookings.delete_many({"agentId": agent_id}).deleted_count
        print(f"  (deleted {n} test bookings)")


async def latency_tests(fake: FakeComposio):
    print("\n== our own overhead per tool call (fake answers at once) ==")
    tenant, user, agent_id = ObjectId(), ObjectId(), ObjectId()
    d = day_ahead(4)
    fake.account("ca_lat", str(user), "GOOGLE_CALENDAR")
    bk = booking("GOOGLE_CALENDAR", "ca_lat", "primary")
    try:
        times = []
        for i in range(5):
            t = tools.CallTools(ctx(agent_id, tenant, user, bk), {"turns": []}, prefetch=False)
            t0 = time.monotonic(); await t.check_availability({"date": d.isoformat()}); times.append((time.monotonic() - t0) * 1000)
        ok(f"check_availability with no cache: median {sorted(times)[2]:.0f} ms (one Composio round trip + Mongo)", sorted(times)[2] < 300, str([round(x) for x in times]))
        t0 = time.monotonic()
        ok_, _, _ = await t.book_appointment({"date": d.isoformat(), "time": "12:00", "name": "Lat"})
        ok(f"book_appointment: {(time.monotonic() - t0) * 1000:.0f} ms (create + mirror)", ok_ and (time.monotonic() - t0) < 0.5)
    finally:
        product.db().voice_bookings.delete_many({"agentId": agent_id})


async def close_sessions():
    for client in calendars._clients.values():
        await client.close()
    calendars._clients.clear()


async def main():
    fake = FakeComposio()
    runner = await fake.start(0)
    os.environ["COMPOSIO_API_BASE"] = fake.base
    product._STARTED_WITH["COMPOSIO_API_BASE"] = fake.base
    product._STARTED_WITH["COMPOSIO_API_KEY"] = FAKE_KEY
    try:
        time_math_tests()
        routing_tests()
        await provider_tests(fake)
        await session_tests(fake)
        await call_tests(fake)
        await latency_tests(fake)
        ok("nothing anywhere used Composio's legacy direct execution (/tools/execute)",
           not [r for r in fake.requests if r["kind"] == "legacy"] and fake.calls())
    finally:
        await close_sessions()
        await runner.cleanup()
    passed = sum(1 for _, p in RESULTS if p)
    print(f"\n{passed}/{len(RESULTS)} passed")
    for name, p in RESULTS:
        if not p:
            print("  FAILED:", name)


if __name__ == "__main__":
    asyncio.run(main())
