"""The owner's own booking apps, reached through Composio (tools.py books into them).

An agent's `tools.booking.destination` (`VoiceBookingDestination` in the backend's
src/db/types.ts) names a provider, a Composio connected account and a calendar. The
owner connected that account in the app with Composio's own managed auth (no Aixel Labs
OAuth app): Composio holds and refreshes the tokens.

We run its tools through a Composio **session** with the direct tools preset (Composio's
current interface; `POST /tools/execute/{slug}`, "direct execution", is its legacy one:
https://docs.composio.dev/docs/sessions-vs-direct-execution). One session per connected
account, made for exactly that account and exactly the slugs below, with no meta tools,
no in-chat auth, no sandbox (https://docs.composio.dev/docs/configuring-sessions#direct-tools-preset):

    POST {COMPOSIO_API_BASE}/tool_router/session                 x-api-key: COMPOSIO_API_KEY
    {"user_id": <the agent owner's _id>, "toolkits": {"enable": ["googlecalendar"]},
     "tools": {"googlecalendar": {"enable": [<TOOLS["googlecalendar"]>]}},
     "connected_accounts": {"googlecalendar": ["ca_..."]}, "auth_configs": {"googlecalendar": "ac_..."},
     "manage_connections": {"enable": false}, "workbench": {"enable": false}, "preload": {"tools": "all"},
     "search": {"enable": false}, "execute": {"enable_multi_execute": false}, "multi_account": {"enable": false}}
    -> {"session_id": "trs_...", ...}

    POST {COMPOSIO_API_BASE}/tool_router/session/{session_id}/execute
    {"tool_slug": SLUG, "arguments": {...}}   (the session is pinned to one account; Composio refuses `account`)
    -> {"result_type": "completed" | "failed" | "input_required", "data": {...}, "error": str | null, "log_id": "..."}

`result_type` decides success (a failed run can have an empty `error`). Sessions persist on
Composio's side and do not expire, so the app makes one when the owner connects and stores its
id on the voice_calendar_connections doc (`composioSessionId`); we read it once per process,
and only make one ourselves when there is none, or when Composio says the stored one is gone
(execute answers 404/410 and GET /tool_router/session/{id} agrees), then run the tool once more.
The prefetch at call connect is what resolves it, so a tool call never waits for that.

Slugs (checked against Composio's toolkit reference, toolkit versions of 2026-09/10):

    provider          free/busy                                  create                         cancel
    GOOGLE_CALENDAR   GOOGLECALENDAR_FREE_BUSY_QUERY  (busy)     GOOGLECALENDAR_CREATE_EVENT    GOOGLECALENDAR_DELETE_EVENT
    OUTLOOK           OUTLOOK_GET_CALENDAR_VIEW       (busy)     OUTLOOK_CALENDAR_CREATE_EVENT  OUTLOOK_CANCEL_EVENT (then OUTLOOK_DELETE_CALENDAR_EVENT)
    CAL_COM           CAL_GET_AVAILABLE_SLOTS_INFO    (starts)   CAL_POST_NEW_BOOKING_REQUEST   CAL_CANCEL_BOOKING_VIA_UID
    CALENDLY          CALENDLY_LIST_EVENT_TYPE_AVAILABLE_TIMES   CALENDLY_POST_INVITEE (paid    CALENDLY_CANCEL_SCHEDULED_EVENT
                      (starts, 7 days per request)               Calendly plan, Standard+)

A provider answers availability either as busy intervals (Google, Outlook: we cut the
owner's hours into slots and drop the ones that overlap) or as the start times it would
accept (Cal.com, Calendly: we keep only our slots that it lists). Either way the owner's
hours, slot length and timezone on the agent stay the rules on top.

Every Composio request is timed and logged (`[calendar] SLUG 412 ms ok`). Anything that
goes wrong raises CalendarError; tools.py turns that into "I can't check right now".
"""

import asyncio
import re
import time
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

import aiohttp
from loguru import logger

import product

DEFAULT_API_BASE = "https://backend.composio.dev/api/v3.1"
# One Composio request. A tool call should answer in well under 1.5 s; past this she gives up.
TIMEOUT = 6.0
UTC = timezone.utc


class CalendarError(Exception):
    """The booking app could not be asked, or refused for a reason that is not "taken"."""


class SlotTaken(CalendarError):
    """The app says that time is no longer free."""


def api_base() -> str:
    return (product.setting("COMPOSIO_API_BASE") or DEFAULT_API_BASE).rstrip("/")


def api_key() -> str:
    return product.setting("COMPOSIO_API_KEY")


class SessionGone(CalendarError):
    """Composio no longer has the session we ran the tool in (deleted on its side)."""


# Composio toolkit per provider, and every slug either side runs on it: the session allows exactly
# these. The app runs the LIST_* ones and the cancels through the same session, so this list is the
# same as CALENDAR_TOOLS in the app's frontend/server/voice-agent/composio.ts; keep the two equal.
TOOLKITS = {"GOOGLE_CALENDAR": "googlecalendar", "OUTLOOK": "outlook", "CAL_COM": "cal", "CALENDLY": "calendly"}
TOOLS = {
    "googlecalendar": ["GOOGLECALENDAR_FREE_BUSY_QUERY", "GOOGLECALENDAR_CREATE_EVENT", "GOOGLECALENDAR_DELETE_EVENT",
                       "GOOGLECALENDAR_LIST_CALENDARS"],
    "outlook": ["OUTLOOK_GET_CALENDAR_VIEW", "OUTLOOK_CALENDAR_CREATE_EVENT", "OUTLOOK_CANCEL_EVENT",
                "OUTLOOK_DELETE_CALENDAR_EVENT", "OUTLOOK_LIST_CALENDARS"],
    "cal": ["CAL_GET_AVAILABLE_SLOTS_INFO", "CAL_POST_NEW_BOOKING_REQUEST", "CAL_CANCEL_BOOKING_VIA_UID",
            "CAL_LIST_EVENT_TYPES"],
    "calendly": ["CALENDLY_LIST_EVENT_TYPE_AVAILABLE_TIMES", "CALENDLY_POST_INVITEE", "CALENDLY_CANCEL_SCHEDULED_EVENT",
                 "CALENDLY_GET_USER", "CALENDLY_LIST_EVENT_TYPES"],
}


def session_config(user_id: str, toolkit: str, account: str | None, auth_config: str | None = None) -> dict:
    """A direct-tools-preset session for one connected account (what the Composio SDKs send for
    `session_preset=SESSION_PRESET_DIRECT_TOOLS`): only these tools, no search, no multi-execute,
    no in-chat auth, no sandbox. Same body as sessionConfig() in the app's composio.ts."""
    body = {"user_id": user_id, "toolkits": {"enable": [toolkit]}, "tools": {toolkit: {"enable": TOOLS[toolkit]}},
            "manage_connections": {"enable": False}, "workbench": {"enable": False}, "preload": {"tools": "all"},
            "search": {"enable": False}, "execute": {"enable_multi_execute": False},
            # Composio refuses preload with multi-account on (400 code 4300, seen 2026-10-18); each
            # session runs as the one account pinned below, so multi-account is not needed.
            "multi_account": {"enable": False}}
    if account:
        body["connected_accounts"] = {toolkit: [account]}
    if auth_config:
        body["auth_configs"] = {toolkit: auth_config}
    return body


# Kept open for the whole process: a new TLS handshake to Composio costs ~150-300 ms per call.
_clients: dict[int, aiohttp.ClientSession] = {}


def _http() -> aiohttp.ClientSession:
    loop = asyncio.get_running_loop()
    s = _clients.get(id(loop))
    if s is None or s.closed:
        s = _clients[id(loop)] = aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=TIMEOUT))
    return s


async def _request(method: str, path: str, body: dict | None = None) -> tuple[int | None, object, str | None]:
    """One Composio request: (HTTP status, answer, why it failed or None)."""
    key = api_key()
    if not key:
        raise CalendarError("COMPOSIO_API_KEY is not set")
    status, data, why = None, None, None
    try:
        async with _http().request(method, f"{api_base()}{path}", json=body, headers={"x-api-key": key}) as r:
            status = r.status
            data = await r.json(content_type=None)
    except asyncio.TimeoutError:
        why = f"no answer in {TIMEOUT:.0f} s"
    except (aiohttp.ClientError, ValueError) as e:
        why = f"{type(e).__name__}: {e}"[:200]
    if why is None and not 200 <= status < 300:
        err = data.get("error") if isinstance(data, dict) else None
        why = f"HTTP {status}: {(err or {}).get('message') if isinstance(err, dict) else err or data}"[:300]
    return status, data, why


async def create_session(user_id: str, toolkit: str, account: str, auth_config: str | None = None) -> str:
    """A new session pinned to the connected account; its id."""
    t0 = time.monotonic()
    status, body, why = await _request("POST", "/tool_router/session", session_config(user_id, toolkit, account, auth_config))
    sid = body.get("session_id") if why is None and isinstance(body, dict) else None
    if why is None and not (isinstance(sid, str) and sid):
        why = "Composio did not return a session id"
    logger.info(f"[calendar] session create ({toolkit}, {account}) {round((time.monotonic() - t0) * 1000)} ms "
                + (f"ok {sid}" if why is None else "FAILED: " + why))
    if why is not None:
        raise CalendarError(why)
    return sid


async def _gone(session_id: str) -> bool:
    """Whether Composio says this session does not exist (GET /tool_router/session/{id} is 404/410)."""
    try:
        status, _, _ = await _request("GET", f"/tool_router/session/{session_id}")
    except CalendarError:
        return False
    return status in (404, 410)


async def execute(session_id: str, slug: str, arguments: dict) -> dict:
    """Runs one tool in a session (pinned to one account); its `data` when Composio says `completed`.

    No `account` field: with multi-account off Composio rejects it (HTTP 400, seen 2026-10-19).
    """
    t0 = time.monotonic()
    status, body, why = await _request("POST", f"/tool_router/session/{session_id}/execute",
                                       {"tool_slug": slug, "arguments": arguments})
    gone = why is not None and status in (404, 410) and await _gone(session_id)
    if why is None:
        kind = body.get("result_type") if isinstance(body, dict) else None
        if kind == "failed":
            why = str(body.get("error") or "the tool failed (Composio gave no reason)")[:300]
        elif kind == "input_required":
            why = "Composio asked for the user's input (an approval) first; this session runs without one"
        elif kind != "completed":
            why = f"unexpected answer from Composio: {str(body)[:200]}"
    ms = round((time.monotonic() - t0) * 1000)
    logger.info(f"[calendar] {slug} {ms} ms {'ok' if why is None else ('SESSION GONE: ' if gone else 'FAILED: ') + why}")
    if gone:
        raise SessionGone(why)
    if why is not None:
        if _taken(why):
            raise SlotTaken(why)
        raise CalendarError(why)
    data = body.get("data")
    return data if isinstance(data, dict) else {"value": data}


# (owner, connected account) -> session id, for the life of the process.
_session_ids: dict[tuple[str, str], str] = {}
_locks: dict[tuple[int, str, str], asyncio.Lock] = {}


def _connection(user_id: str, account: str) -> dict | None:
    try:
        return product.db().voice_calendar_connections.find_one(
            {"connectedAccountId": account, "userId": product.oid(user_id)}, {"composioSessionId": 1, "authConfigId": 1})
    except Exception as e:
        logger.warning(f"calendars: could not read the connection of {account}: {e}")
        return None


def _store(doc_id, old: str | None, session_id: str) -> bool:
    """Stores the session id over the one we read (the app writes it too); False when someone else stored one first."""
    try:
        r = product.db().voice_calendar_connections.update_one({"_id": doc_id, "composioSessionId": old},
                                                               {"$set": {"composioSessionId": session_id}})
        return r.matched_count == 1
    except Exception as e:
        logger.warning(f"calendars: could not store session {session_id} on connection {doc_id}: {e}")
        return True


async def session_for(user_id: str, account: str, toolkit: str, dead: str | None = None) -> str:
    """The account's session: remembered, else the one the app stored, else a new one (stored).
    `dead` is one Composio just said is gone: never handed out again."""
    key = (user_id, account)
    lock = _locks.setdefault((id(asyncio.get_running_loop()), *key), asyncio.Lock())
    async with lock:
        sid = _session_ids.get(key)
        if sid and sid != dead:
            return sid
        doc = await asyncio.to_thread(_connection, user_id, account)
        stored = (doc or {}).get("composioSessionId")
        if stored and stored != dead:
            _session_ids[key] = stored
            return stored
        sid = await create_session(user_id, toolkit, account, (doc or {}).get("authConfigId"))
        if doc and not await asyncio.to_thread(_store, doc["_id"], stored, sid):
            # The app made one meanwhile: use that, and leave no second session behind.
            winner = ((await asyncio.to_thread(_connection, user_id, account)) or {}).get("composioSessionId")
            if winner and winner != dead:
                await _request("DELETE", f"/tool_router/session/{sid}")
                sid = winner
        _session_ids[key] = sid
        return sid


def _taken(text: str) -> bool:
    """Cal.com: "User either already has booking at this time or is not available"; Calendly: "...is no longer available"."""
    return bool(re.search(r"no longer available|already has (a )?booking|already booked|not available at this time|"
                          r"slot\S* (is )?(taken|unavailable|not available)", text, re.I))


# --- Reading Composio's answers -------------------------------------------------------------------
# Composio hands back the provider's own JSON, sometimes wrapped ({"response_data": ...},
# {"data": ...}); these look for the parts we need wherever they are.


def walk(obj):
    """Every dict inside obj, depth first."""
    stack = [obj]
    while stack:
        cur = stack.pop()
        if isinstance(cur, dict):
            yield cur
            stack.extend(reversed(list(cur.values())))
        elif isinstance(cur, list):
            stack.extend(reversed(cur))


def parse_time(value, tzname: str | None = None) -> datetime | None:
    """An ISO 8601 instant ("...Z", "+05:30", fractional seconds, Graph's 7 digits) as UTC;
    a naive one is taken in tzname (UTC when none)."""
    if isinstance(value, dict):  # Graph: {"dateTime": "...", "timeZone": "UTC"}
        return parse_time(value.get("dateTime"), value.get("timeZone") or tzname)
    if not isinstance(value, str) or not value.strip():
        return None
    text = value.strip().replace("Z", "+00:00").replace("z", "+00:00")
    text = re.sub(r"(\.\d{6})\d+", r"\1", text)  # Graph sends 7 fractional digits
    try:
        t = datetime.fromisoformat(text)
    except ValueError:
        return None
    if t.tzinfo is None:
        from zoneinfo import ZoneInfo
        try:
            t = t.replace(tzinfo=ZoneInfo(tzname or "UTC"))
        except Exception:
            t = t.replace(tzinfo=UTC)
    return t.astimezone(UTC)


def zulu(t: datetime) -> str:
    return t.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def wall(t: datetime, tz) -> str:
    """Local wall time without an offset, the form Google and Graph want next to a zone name."""
    return t.astimezone(tz).strftime("%Y-%m-%dT%H:%M:%S")


# --- Availability ----------------------------------------------------------------------------------


@dataclass
class Availability:
    """What the app said about [start, end): busy intervals, or the start times it accepts."""
    start: datetime
    end: datetime
    busy: list[tuple[datetime, datetime]] | None = None
    starts: set[datetime] | None = None
    fetched: float = field(default_factory=time.monotonic)

    def covers(self, a: datetime, b: datetime) -> bool:
        return self.start <= a and b <= self.end

    def age(self) -> float:
        return time.monotonic() - self.fetched

    def add_busy(self, a: datetime, b: datetime):
        """A booking we just made: no longer free for the rest of the call."""
        if self.busy is not None:
            self.busy.append((a, b))
        if self.starts is not None:
            self.starts.discard(a)


@dataclass
class Event:
    event_id: str
    meeting_url: str | None = None


class Provider:
    """One booking app. `kind` is "busy" or "starts" (see the module docstring)."""
    name = ""
    toolkit = ""
    label = ""
    kind = "busy"
    needs_email = False
    max_span = timedelta(days=60)

    def __init__(self, user_id: str, account: str, calendar_id: str):
        self.user_id, self.account, self.calendar_id = user_id, account, calendar_id or ""

    async def session(self) -> str:
        return await session_for(self.user_id, self.account, self.toolkit)

    async def run(self, slug: str, arguments: dict) -> dict:
        sid = await self.session()
        try:
            return await execute(sid, slug, arguments)
        except SessionGone:
            # Nothing ran: a new session, then the same tool once more.
            return await execute(await session_for(self.user_id, self.account, self.toolkit, dead=sid), slug, arguments)

    async def availability(self, a: datetime, b: datetime, tz) -> Availability:
        raise NotImplementedError

    async def create(self, a: datetime, b: datetime, tz, title: str, details: str, name: str,
                     email: str | None, phone: str | None) -> Event:
        raise NotImplementedError

    async def cancel(self, event_id: str):
        raise NotImplementedError


class GoogleCalendar(Provider):
    name, label = "GOOGLE_CALENDAR", "Google Calendar"
    toolkit = "googlecalendar"

    async def availability(self, a, b, tz):
        cal = self.calendar_id or "primary"
        data = await self.run("GOOGLECALENDAR_FREE_BUSY_QUERY",
                              {"items": [cal], "timeMin": zulu(a), "timeMax": zulu(b), "timeZone": "UTC"})
        calendars = next((d["calendars"] for d in walk(data) if isinstance(d.get("calendars"), dict)), None)
        if not calendars:
            raise CalendarError("free/busy answer has no calendars")
        entry = calendars.get(cal) or (next(iter(calendars.values())) if len(calendars) == 1 else None)
        if not isinstance(entry, dict):
            raise CalendarError(f"free/busy answer has no entry for {cal}")
        if entry.get("errors"):
            # Google treats a calendar it cannot read as free: never offer times from that.
            raise CalendarError(f"Google cannot read {cal}: {entry['errors']}"[:300])
        busy = []
        for span in entry.get("busy") or []:
            s, e = parse_time(span.get("start")), parse_time(span.get("end"))
            if s and e:
                busy.append((s, e))
        return Availability(a, b, busy=busy)

    async def create(self, a, b, tz, title, details, name, email, phone):
        args = {"calendar_id": self.calendar_id or "primary", "summary": title, "description": details,
                "start_datetime": wall(a, tz), "end_datetime": wall(b, tz), "timezone": str(tz),
                "create_meeting_room": True, "send_updates": "all" if email else "none"}
        if email:
            args["attendees"] = [{"email": email, "displayName": name}]
        data = await self.run("GOOGLECALENDAR_CREATE_EVENT", args)
        ev = next((d for d in walk(data) if d.get("id") and ("htmlLink" in d or "start" in d)), None)
        if not ev:
            raise CalendarError("Google did not return the event")
        meet = ev.get("hangoutLink") or next((p.get("uri") for p in walk(ev.get("conferenceData") or {})
                                              if p.get("entryPointType") == "video"), None)
        return Event(str(ev["id"]), meet)

    async def cancel(self, event_id):
        await self.run("GOOGLECALENDAR_DELETE_EVENT",
                       {"event_id": event_id, "calendar_id": self.calendar_id or "primary", "send_updates": "all"})


class Outlook(Provider):
    name, label = "OUTLOOK", "Outlook"
    toolkit = "outlook"

    async def availability(self, a, b, tz):
        args = {"start_datetime": zulu(a), "end_datetime": zulu(b), "timezone": "UTC", "top": 250,
                "select": ["start", "end", "showAs", "isCancelled"]}
        if self.calendar_id and self.calendar_id != "primary":
            args["calendar_id"] = self.calendar_id
        data = await self.run("OUTLOOK_GET_CALENDAR_VIEW", args)
        busy = []
        for ev in walk(data):
            if not (isinstance(ev.get("start"), dict) and isinstance(ev.get("end"), dict)):
                continue
            if ev.get("isCancelled") or str(ev.get("showAs") or "busy").lower() == "free":
                continue
            s, e = parse_time(ev["start"], "UTC"), parse_time(ev["end"], "UTC")
            if s and e:
                busy.append((s, e))
        return Availability(a, b, busy=busy)

    async def create(self, a, b, tz, title, details, name, email, phone):
        args = {"subject": title, "body": details, "start_datetime": wall(a, tz), "end_datetime": wall(b, tz),
                "time_zone": str(tz), "show_as": "busy", "is_online_meeting": True,
                "online_meeting_provider": "teamsForBusiness"}
        if self.calendar_id and self.calendar_id != "primary":
            args["calendar_id"] = self.calendar_id
        if email:
            args["attendees_info"] = [{"email": email, "name": name}]
        try:
            data = await self.run("OUTLOOK_CALENDAR_CREATE_EVENT", args)
        except SlotTaken:
            raise
        except CalendarError as e:
            # Teams links exist only on work/school accounts: a personal Outlook.com one refuses them.
            if not re.search(r"online|teams|meeting", str(e), re.I):
                raise
            for k in ("is_online_meeting", "online_meeting_provider"):
                args.pop(k)
            data = await self.run("OUTLOOK_CALENDAR_CREATE_EVENT", args)
        ev = next((d for d in walk(data) if d.get("id") and ("webLink" in d or "start" in d or "onlineMeeting" in d)), None)
        if not ev:
            raise CalendarError("Outlook did not return the event")
        join = (ev.get("onlineMeeting") or {}).get("joinUrl") if isinstance(ev.get("onlineMeeting"), dict) else None
        return Event(str(ev["id"]), join or ev.get("onlineMeetingUrl"))

    async def cancel(self, event_id):
        try:
            await self.run("OUTLOOK_CANCEL_EVENT", {"user_id": "me", "event_id": event_id,
                                                    "Comment": "Cancelled from Aixel Labs."})
        except CalendarError:
            # Graph cancels only meetings the owner organises; anything else is deleted.
            await self.run("OUTLOOK_DELETE_CALENDAR_EVENT", {"user_id": "me", "event_id": event_id})


def _starts_from(data, keys=("start", "time", "start_time")) -> set[datetime]:
    out = set()
    for d in walk(data):
        if str(d.get("status") or "available").lower() not in ("available", "accepted"):
            continue
        for k in keys:
            t = parse_time(d.get(k)) if isinstance(d.get(k), str) else None
            if t:
                out.add(t)
                break
    return out


class CalCom(Provider):
    name, label, kind, needs_email = "CAL_COM", "Cal.com", "starts", True
    toolkit = "cal"

    def event_type(self) -> int:
        try:
            return int(self.calendar_id)
        except ValueError:
            raise CalendarError(f"Cal.com event type {self.calendar_id!r} is not a number")

    async def availability(self, a, b, tz):
        data = await self.run("CAL_GET_AVAILABLE_SLOTS_INFO", {"eventTypeId": self.event_type(), "startTime": zulu(a),
                                                                "endTime": zulu(b), "timeZone": "UTC", "slotFormat": "time"})
        return Availability(a, b, starts={t for t in _starts_from(data) if a <= t < b})

    async def create(self, a, b, tz, title, details, name, email, phone):
        responses = {"name": name, "email": email}
        if details:
            responses["notes"] = details
        data = await self.run("CAL_POST_NEW_BOOKING_REQUEST", {
            "eventTypeId": self.event_type(), "start": zulu(a), "timeZone": str(tz), "language": "en",
            "responses": responses, "metadata": {"source": "aixel-voice-agent"}})
        bk = next((d for d in walk(data) if d.get("uid")), None)
        if not bk:
            raise CalendarError("Cal.com did not return the booking")
        url = bk.get("meetingUrl") or (bk.get("location") if str(bk.get("location") or "").startswith("http") else None)
        return Event(str(bk["uid"]), url)

    async def cancel(self, event_id):
        await self.run("CAL_CANCEL_BOOKING_VIA_UID", {"bookingUid": event_id, "cancellationReason": "Cancelled by the business."})


class Calendly(Provider):
    name, label, kind, needs_email = "CALENDLY", "Calendly", "starts", True
    toolkit = "calendly"
    max_span = timedelta(days=7)  # Calendly's available_times limit

    async def availability(self, a, b, tz):
        # "Must be in the future": a range starting a moment ago is refused.
        lo = max(a, datetime.now(UTC) + timedelta(seconds=30))
        starts: set[datetime] = set()
        while lo < b:
            hi = min(b, lo + timedelta(days=7) - timedelta(seconds=1))
            data = await self.run("CALENDLY_LIST_EVENT_TYPE_AVAILABLE_TIMES",
                                  {"event_type": self.calendar_id, "start_time": zulu(lo), "end_time": zulu(hi)})
            starts |= _starts_from(data, ("start_time",))
            lo = hi
        return Availability(a, b, starts=starts)

    async def create(self, a, b, tz, title, details, name, email, phone):
        invitee = {"name": name, "email": email, "timezone": str(tz)}
        # The notes have nowhere to go: Calendly takes answers only to the event type's own questions.
        args = {"event_type": self.calendar_id, "start_time": zulu(a), "invitee": invitee}
        data = await self.run("CALENDLY_POST_INVITEE", args)
        uri = next((d["event"] for d in walk(data) if isinstance(d.get("event"), str) and "scheduled_events/" in d["event"]), None)
        if not uri:
            raise CalendarError("Calendly did not return the scheduled event")
        join = next((d.get("join_url") for d in walk(data) if d.get("join_url")), None)
        return Event(uri.rstrip("/").rsplit("/", 1)[-1], join)

    async def cancel(self, event_id):
        await self.run("CALENDLY_CANCEL_SCHEDULED_EVENT", {"event_uuid": event_id, "reason": "Cancelled by the business."})


PROVIDERS: dict[str, type[Provider]] = {p.name: p for p in (GoogleCalendar, Outlook, CalCom, Calendly)}


def provider_for(destination, user_id) -> Provider | None:
    """The agent's booking app, or None for the built-in calendar (or a destination we cannot use)."""
    if not isinstance(destination, dict):
        return None
    cls = PROVIDERS.get(str(destination.get("provider") or ""))
    account = str(destination.get("connectedAccountId") or "")
    if not cls or not account:
        if destination:
            logger.warning(f"calendars: unusable booking destination {destination!r}; using the built-in calendar")
        return None
    return cls(str(user_id), account, str(destination.get("calendarId") or ""))
