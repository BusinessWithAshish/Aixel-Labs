"""A fake Composio REST API (v3.1 sessions, direct tools preset) for the calendar tests. Never a real account.

    from fake_composio import FakeComposio
    fake = FakeComposio(); runner = await fake.start(7872)       # or port 0 for any free one
    fake.account("ca_g1", "user-id", "GOOGLE_CALENDAR", busy=[(start, end)])

    .venv/bin/python tests/fake_composio.py 7872                  # standalone, for a phone.py test instance

Answers the session endpoints calendars.py uses, like Composio:
    POST   /api/v3.1/tool_router/session                 -> {"session_id": "trs_...", "config", ...}
    GET    /api/v3.1/tool_router/session/{id}            -> 200, or 404 once dropped (`drop_session`)
    DELETE /api/v3.1/tool_router/session/{id}
    POST   /api/v3.1/tool_router/session/{id}/execute    -> {"result_type", "data", "error", "log_id"}
A session must be the direct tools preset (no search / multi-execute / connection manager / sandbox,
preload "all") for one toolkit with an explicit tool list, and pin a connected account of its user;
anything else is refused, so the tests fail if we drift off it. Executing a slug outside the session's
list, or with another account, is refused too. The legacy `POST /tools/execute/{slug}` answers 410.
Each connected account belongs to one user_id, holds its own events, and can be told to fail
(`fail="500"|"timeout"|"tool"|"tool_empty"`), to be slow (`delay`), or (Calendly) to be on the free plan.
Every request is kept in `requests` (`kind`: session.create | session.get | session.delete | execute | legacy).
"""
import asyncio, json, sys, time, uuid
from datetime import datetime, timedelta, timezone
from aiohttp import web

UTC = timezone.utc
FAKE_KEY = "ck_fake_e2e_composio_key_not_real"


def iso(t: datetime) -> str:
    return t.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def parse(s) -> datetime | None:
    if isinstance(s, dict):
        s = s.get("dateTime")
    if not isinstance(s, str):
        return None
    t = datetime.fromisoformat(s.replace("Z", "+00:00"))
    return t.replace(tzinfo=UTC) if t.tzinfo is None else t.astimezone(UTC)


def local(s: str, tz: str) -> datetime:
    from zoneinfo import ZoneInfo
    t = datetime.fromisoformat(s)
    return (t.replace(tzinfo=ZoneInfo(tz)) if t.tzinfo is None else t).astimezone(UTC)


TOOLKIT = {"GOOGLE_CALENDAR": "googlecalendar", "OUTLOOK": "outlook", "CAL_COM": "cal", "CALENDLY": "calendly"}
# The toolkit's tools this fake knows (Composio refuses a session naming any other slug).
KNOWN = {
    "googlecalendar": {"GOOGLECALENDAR_FREE_BUSY_QUERY", "GOOGLECALENDAR_CREATE_EVENT", "GOOGLECALENDAR_DELETE_EVENT",
                       "GOOGLECALENDAR_LIST_CALENDARS", "GOOGLECALENDAR_EVENTS_LIST"},
    "outlook": {"OUTLOOK_GET_CALENDAR_VIEW", "OUTLOOK_CALENDAR_CREATE_EVENT", "OUTLOOK_CANCEL_EVENT",
                "OUTLOOK_DELETE_CALENDAR_EVENT", "OUTLOOK_LIST_CALENDARS"},
    "cal": {"CAL_GET_AVAILABLE_SLOTS_INFO", "CAL_POST_NEW_BOOKING_REQUEST", "CAL_CANCEL_BOOKING_VIA_UID", "CAL_LIST_EVENT_TYPES"},
    "calendly": {"CALENDLY_LIST_EVENT_TYPE_AVAILABLE_TIMES", "CALENDLY_POST_INVITEE", "CALENDLY_CANCEL_SCHEDULED_EVENT",
                 "CALENDLY_GET_USER", "CALENDLY_LIST_EVENT_TYPES"},
}
PRESET = {"manage_connections": {"enable": False}, "workbench": {"enable": False}, "preload": {"tools": "all"},
          "search": {"enable": False}, "execute": {"enable_multi_execute": False}}


def error(status, message, slug="Error"):
    return web.json_response({"error": {"message": message, "code": status, "slug": slug, "status": status}}, status=status)


class FakeComposio:
    def __init__(self):
        self.accounts: dict[str, dict] = {}
        self.sessions: dict[str, dict] = {}
        self.requests: list[dict] = []

    def account(self, account_id, user_id, provider, busy=(), starts=(), delay=0.0, fail=None, free_plan=False):
        self.accounts[account_id] = {"user_id": str(user_id), "provider": provider, "toolkit": TOOLKIT[provider],
                                     "busy": list(busy), "starts": set(starts), "delay": delay, "fail": fail,
                                     "free_plan": free_plan, "events": {}}
        return self.accounts[account_id]

    def calls(self, slug=None):
        return [r for r in self.requests if r["kind"] == "execute" and (slug is None or r["slug"] == slug)]

    def created(self):
        """Every session create request (accepted or not)."""
        return [r for r in self.requests if r["kind"] == "session.create"]

    def drop_session(self, sid):
        """Composio forgets a session (deleted on its side)."""
        self.sessions.pop(sid, None)

    def events(self, account_id):
        return self.accounts[account_id]["events"]

    async def start(self, port=0, host="127.0.0.1"):
        app = web.Application()
        app.router.add_post("/api/v3.1/tool_router/session", self.create_session)
        app.router.add_get("/api/v3.1/tool_router/session/{sid}", self.get_session)
        app.router.add_delete("/api/v3.1/tool_router/session/{sid}", self.delete_session)
        app.router.add_post("/api/v3.1/tool_router/session/{sid}/execute", self.execute)
        app.router.add_post("/api/v3.1/tools/execute/{slug}", self.legacy)
        app.router.add_post("/api/v3/tools/execute/{slug}", self.legacy)
        app.router.add_get("/health", lambda r: web.json_response({"ok": True}))
        runner = web.AppRunner(app)
        await runner.setup()
        site = web.TCPSite(runner, host, port)
        await site.start()
        self.port = site._server.sockets[0].getsockname()[1]
        self.base = f"http://{host}:{self.port}/api/v3.1"
        return runner

    async def record(self, request, kind, **extra):
        body = await request.json() if request.can_read_body else None
        rec = {"kind": kind, "key": request.headers.get("x-api-key"), "body": body, "at": time.monotonic(), **extra}
        self.requests.append(rec)
        return rec

    def bad_key(self, rec):
        return error(401, "Invalid API key", "Auth_Invalid") if rec["key"] != FAKE_KEY else None

    async def legacy(self, request):
        rec = await self.record(request, "legacy", slug=request.match_info["slug"])
        return self.bad_key(rec) or error(410, "fake Composio: direct execution (/tools/execute) is legacy; run tools in a session")

    async def create_session(self, request):
        rec = await self.record(request, "session.create")
        if bad := self.bad_key(rec):
            return bad
        body = rec["body"] or {}
        user = str(body.get("user_id") or "")
        toolkits = (body.get("toolkits") or {}).get("enable") if isinstance(body.get("toolkits"), dict) else None
        if not user or not isinstance(toolkits, list) or len(toolkits) != 1:
            return error(400, "fake: a session is for one user and one toolkit ({enable: [toolkit]})")
        tk = toolkits[0]
        # Real Composio (2026-10-18): 400 code 4300 "preload is not supported when multi-account is enabled".
        if (body.get("multi_account") or {}).get("enable") and body.get("preload"):
            return error(400, "preload is not supported when multi-account is enabled for this session. Disable multi-account or remove preload.")
        for k, v in PRESET.items():
            if body.get(k) != v:
                return error(400, f"fake: not the direct tools preset: {k} must be {v}, got {body.get(k)}")
        enabled = ((body.get("tools") or {}).get(tk) or {}).get("enable")
        known = KNOWN.get(tk, set())
        if not isinstance(enabled, list) or not enabled:
            return error(400, f"fake: list the tools to enable for {tk}")
        if bad := [t for t in enabled if t not in known]:
            return error(400, f"Invalid tool slugs for toolkit {tk}: {', '.join(bad)}")
        pinned = (body.get("connected_accounts") or {}).get(tk) or []
        if len(pinned) != 1:
            return error(400, "fake: pin exactly one connected account")
        acct = self.accounts.get(pinned[0])
        if not acct or acct["user_id"] != user or acct["toolkit"] != tk:
            return error(400, f"Connected account {pinned[0]} not found for this user and toolkit", "ConnectedAccount_NotFound")
        sid = "trs_" + uuid.uuid4().hex[:12]
        self.sessions[sid] = {"user_id": user, "toolkit": tk, "tools": set(enabled), "account": pinned[0], "config": body}
        rec["session_id"] = sid
        return web.json_response({"session_id": sid, "mcp": {"type": "http", "url": f"https://fake.composio/{sid}/mcp"},
                                  "tool_router_tools": sorted(enabled), "config": body, "config_version": 1}, status=201)

    async def get_session(self, request):
        sid = request.match_info["sid"]
        rec = await self.record(request, "session.get", session_id=sid)
        if bad := self.bad_key(rec):
            return bad
        sess = self.sessions.get(sid)
        if not sess:
            return error(404, "Tool router session not found", "ToolRouter_SessionNotFound")
        return web.json_response({"session_id": sid, "config": sess["config"], "config_version": 1})

    async def delete_session(self, request):
        sid = request.match_info["sid"]
        rec = await self.record(request, "session.delete", session_id=sid)
        if bad := self.bad_key(rec):
            return bad
        if not self.sessions.pop(sid, None):
            return error(404, "Tool router session not found", "ToolRouter_SessionNotFound")
        return web.json_response({"session_id": sid, "deleted": True})

    async def execute(self, request):
        sid = request.match_info["sid"]
        body = await request.json()
        slug = str(body.get("tool_slug") or "")
        sess = self.sessions.get(sid)
        rec = {"kind": "execute", "slug": slug, "session_id": sid, "key": request.headers.get("x-api-key"), "body": body,
               "user_id": sess and sess["user_id"], "account": sess and sess["account"], "at": time.monotonic()}
        self.requests.append(rec)
        if bad := self.bad_key(rec):
            return bad
        if not sess:
            return error(404, "Tool router session not found", "ToolRouter_SessionNotFound")
        if slug not in sess["tools"]:
            return error(400, f"Tool {slug} is not available in this session", "ToolRouter_ToolNotInSession")
        if "account" in body and not ((sess["config"].get("multi_account") or {}).get("enable")):
            # Real Composio (2026-10-19): HTTP 400 when a single-account session is sent `account`.
            return error(400, "The 'account' parameter is not supported for this project. Multi-account selection is not enabled.")
        acct = self.accounts.get(sess["account"])
        if not acct or acct["user_id"] != sess["user_id"]:
            return error(400, "Connected account not found for this user", "ConnectedAccount_NotFound")
        if acct["delay"]:
            await asyncio.sleep(acct["delay"])
        if acct["fail"] == "500":
            return error(500, "Internal server error", "Internal")
        if acct["fail"] == "timeout":
            await asyncio.sleep(30)
        if acct["fail"] == "tool":
            return self.answer(None, "401 Unauthorized: the access token has expired")
        if acct["fail"] == "tool_empty":
            return self.answer(None, "")
        args = body.get("arguments") or {}
        handler = getattr(self, slug.lower(), None)
        if not handler:
            return self.answer(None, f"fake: no tool {slug}")
        try:
            data, err = handler(acct, args)
        except (KeyError, TypeError, ValueError) as e:
            return self.answer(None, f"fake: bad arguments for {slug}: {e}")
        return self.answer(data, err)

    def answer(self, data, err):
        # Composio's v3.1 session answer: result_type decides; a failed run may carry an empty error.
        return web.json_response({"result_type": "completed" if err is None else "failed",
                                  "data": data if err is None else {}, "error": err,
                                  "log_id": "log_" + uuid.uuid4().hex[:12]})

    # --- helpers ---

    def busy_of(self, acct, a, b):
        spans = list(acct["busy"]) + [(e["start"], e["end"]) for e in acct["events"].values() if not e.get("cancelled")]
        return [(s, e) for s, e in spans if s < b and a < e]

    def open_starts(self, acct, a, b, length=timedelta(minutes=30)):
        return sorted(t for t in acct["starts"] if a <= t < b and not self.busy_of(acct, t, t + length))

    def new_event(self, acct, start, end, **extra):
        eid = uuid.uuid4().hex[:20]
        acct["events"][eid] = {"id": eid, "start": start, "end": end, **extra}
        return eid

    def cancel(self, acct, eid):
        ev = acct["events"].get(eid)
        if not ev or ev.get("cancelled"):
            return None, "404 Not Found"
        ev["cancelled"] = True
        return {}, None

    # --- Google Calendar ---

    def googlecalendar_free_busy_query(self, acct, args):
        a, b = parse(args["timeMin"]), parse(args["timeMax"])
        cal = args["items"][0] if isinstance(args["items"][0], str) else args["items"][0]["id"]
        busy = [{"start": iso(s), "end": iso(e)} for s, e in self.busy_of(acct, a, b)]
        return {"response_data": {"kind": "calendar#freeBusy", "timeMin": iso(a), "timeMax": iso(b),
                                  "calendars": {cal: {"busy": busy}}}}, None

    def googlecalendar_create_event(self, acct, args):
        tz = args.get("timezone") or "UTC"
        s, e = local(args["start_datetime"], tz), local(args["end_datetime"], tz)
        eid = self.new_event(acct, s, e, summary=args.get("summary"), attendees=args.get("attendees") or [],
                             calendar=args.get("calendar_id"), args=args)
        meet = "https://meet.google.com/abc-defg-hij" if args.get("create_meeting_room", True) else None
        return {"response_data": {"id": eid, "htmlLink": f"https://calendar.google.com/event?eid={eid}",
                                  "hangoutLink": meet, "start": {"dateTime": iso(s)}, "end": {"dateTime": iso(e)}}}, None

    def googlecalendar_delete_event(self, acct, args):
        return self.cancel(acct, args["event_id"])

    def googlecalendar_list_calendars(self, acct, args):
        return {"calendars": [{"id": "primary@example.com", "summary": "Ravi's calendar", "primary": True, "accessRole": "owner"},
                              {"id": "clinic@group.calendar.google.com", "summary": "Clinic", "accessRole": "writer"}]}, None

    # --- Outlook ---

    def outlook_get_calendar_view(self, acct, args):
        a, b = parse(args["start_datetime"]), parse(args["end_datetime"])
        value = [{"start": {"dateTime": s.strftime("%Y-%m-%dT%H:%M:%S.0000000"), "timeZone": "UTC"},
                  "end": {"dateTime": e.strftime("%Y-%m-%dT%H:%M:%S.0000000"), "timeZone": "UTC"},
                  "showAs": "busy", "isCancelled": False} for s, e in self.busy_of(acct, a, b)]
        value.append({"start": {"dateTime": iso(a)[:-1] + ".0000000", "timeZone": "UTC"},
                      "end": {"dateTime": iso(b)[:-1] + ".0000000", "timeZone": "UTC"}, "showAs": "free", "isCancelled": False})
        return {"value": value}, None

    def outlook_calendar_create_event(self, acct, args):
        tz = args["time_zone"]
        s, e = local(args["start_datetime"], tz), local(args["end_datetime"], tz)
        eid = self.new_event(acct, s, e, summary=args.get("subject"), attendees=args.get("attendees_info") or [], args=args)
        return {"response_data": {"id": eid, "webLink": f"https://outlook.office.com/calendar/item/{eid}",
                                  "onlineMeeting": {"joinUrl": "https://teams.microsoft.com/l/meetup-join/fake"} if args.get("is_online_meeting") else None}}, None

    def outlook_list_calendars(self, acct, args):
        return {"value": [{"id": "AAMkCal=", "name": "Calendar", "isDefaultCalendar": True, "canEdit": True}]}, None

    def outlook_cancel_event(self, acct, args):
        return self.cancel(acct, args["event_id"])

    def outlook_delete_calendar_event(self, acct, args):
        return self.cancel(acct, args["event_id"])

    # --- Cal.com ---

    def cal_get_available_slots_info(self, acct, args):
        a, b = parse(args["startTime"]), parse(args["endTime"])
        days: dict[str, list] = {}
        for t in self.open_starts(acct, a, b):
            days.setdefault(t.strftime("%Y-%m-%d"), []).append({"start": t.strftime("%Y-%m-%dT%H:%M:%S.000Z")})
        return {"status": "success", "data": days}, None

    def cal_post_new_booking_request(self, acct, args):
        if not (args.get("responses") or {}).get("email"):
            return None, "400: responses.email is required"
        s = parse(args["start"])
        if s not in self.open_starts(acct, s, s + timedelta(seconds=1)):
            return None, "400 Bad Request: User either already has booking at this time or is not available"
        uid = self.new_event(acct, s, s + timedelta(minutes=30), attendee=args["responses"], args=args)
        return {"status": "success", "data": {"id": 101, "uid": uid, "status": "accepted",
                                              "meetingUrl": "https://app.cal.com/video/" + uid, "start": iso(s)}}, None

    def cal_cancel_booking_via_uid(self, acct, args):
        return self.cancel(acct, args["bookingUid"])

    def cal_list_event_types(self, acct, args):
        return {"status": "success", "data": [{"id": 1234, "title": "30 min consultation", "slug": "consult", "lengthInMinutes": 30}]}, None

    # --- Calendly ---

    def calendly_list_event_type_available_times(self, acct, args):
        a, b = parse(args["start_time"]), parse(args["end_time"])
        if b - a > timedelta(days=7):
            return None, "400: The range cannot exceed 7 days"
        if a < datetime.now(UTC):
            return None, "400: start_time must be in the future"
        return {"collection": [{"status": "available", "start_time": iso(t), "invitees_remaining": 1,
                                "scheduling_url": "https://calendly.com/fake/30min"} for t in self.open_starts(acct, a, b)]}, None

    def calendly_post_invitee(self, acct, args):
        if acct["free_plan"]:
            return None, "403 Forbidden: This feature requires a paid Calendly plan (Standard or above)"
        s = parse(args["start_time"])
        if s not in self.open_starts(acct, s, s + timedelta(seconds=1)):
            return None, "400: The selected time is no longer available"
        ev = self.new_event(acct, s, s + timedelta(minutes=30), invitee=args["invitee"], args=args)
        return {"resource": {"uri": f"https://api.calendly.com/scheduled_events/{ev}/invitees/inv1",
                             "event": f"https://api.calendly.com/scheduled_events/{ev}", "status": "active"}}, None

    def calendly_get_user(self, acct, args):
        return {"resource": {"uri": "https://api.calendly.com/users/U1", "name": "Ravi"}}, None

    def calendly_list_event_types(self, acct, args):
        return {"collection": [{"uri": "https://api.calendly.com/event_types/ET1", "name": "30 min", "duration": 30}]}, None

    def calendly_cancel_scheduled_event(self, acct, args):
        return self.cancel(acct, args["event_uuid"])


async def _main(port):
    fake = FakeComposio()
    await fake.start(port)
    print(f"fake Composio on {fake.base} (key {FAKE_KEY})", flush=True)
    await asyncio.Event().wait()


if __name__ == "__main__":
    asyncio.run(_main(int(sys.argv[1]) if len(sys.argv) > 1 else 7872))
