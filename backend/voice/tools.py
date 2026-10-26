"""Agent tools: what a customer's agent can do during a call besides talk.

Read from the agent's `tools` field per call (`VoiceAgentTools` in the backend's
src/db/types.ts), the same moment the prompt is read, so a change in the app applies
on the next call:

    booking    check_availability + book_appointment, against voice_bookings, in the
               opening hours / slot length / timezone the owner set on the agent; or,
               when the booking has a `destination`, against the owner's own booking
               app through Composio (calendars.py), mirrored into voice_bookings
    webhooks   the owner's own tools: the model's arguments are POSTed to their URL
               (signed when they set a secret) and the answer is handed back to her

Gemini Live calls them as functions. A synchronous handler is declared BLOCKING on a
3.8 model (Pipecat tags it), so she waits for the answer instead of talking over it.
Every run is kept in the call's record and written to its voice_calls document as
`toolCalls`; a booking points back at that document through `callId`.

What she is told back is one or two short sentences she can say almost as they are:
"Saturday 18 October (Asia/Kolkata): free at 10:00, 10:30 and 14:00."
"""

import asyncio
import hashlib
import hmac
import ipaddress
import json
import os
import re
import socket
import time
from datetime import date, datetime, timedelta, timezone
from urllib.parse import urlparse
from zoneinfo import ZoneInfo

import aiohttp
from bson import ObjectId
from loguru import logger
from pymongo.errors import DuplicateKeyError, OperationFailure

from pipecat.adapters.schemas.function_schema import FunctionSchema
from pipecat.adapters.schemas.tools_schema import ToolsSchema
from pipecat.frames.frames import (
    Frame,
    LLMContextFrame,
    OutputAudioRawFrame,
    TTSSpeakFrame,
    UserStartedSpeakingFrame,
    UserStoppedSpeakingFrame,
)
from pipecat.processors.frame_processor import FrameDirection, FrameProcessor

import calendars
import fillers
import product
import speech
from bot import TurnSafeGeminiLive

BUILTIN = ("check_availability", "book_appointment")
# Names a custom tool may not take (the app refuses them too; end_call is kept for a future hang-up tool).
RESERVED = BUILTIN + ("end_call",)
DAYS = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")
WEBHOOK_NAME = re.compile(r"^[a-z][a-z0-9_]{1,39}$")
PARAM_NAME = re.compile(r"^[a-z][a-z0-9_]{0,39}$")
WEBHOOK_TIMEOUT = 8.0
WEBHOOK_BODY_MAX = 4000  # of the server's answer, handed to the model
RESULT_MAX = 1000  # of what the model was told, kept in toolCalls
USER_AGENT = "AixelLabs-VoiceAgent/1"
# A customer's tool URL must not reach this machine or the cloud's metadata service
# (169.254.169.254 is one http GET away from instance credentials on Oracle). A test
# instance sets this to point tools at a fake server on 127.0.0.1.
ALLOW_LOCAL_URLS = os.getenv("TOOLS_ALLOW_LOCAL_URLS") == "1"

# Gemini asks again for the same thing when the caller speaks while it waits; within this long,
# the same webhook with the same arguments gets the same answer from one request.
REUSE_SECS = 20.0
# The agent's line while a tool works (speech toolWait SAY): cut at this length, and not said again
# within SAY_AGAIN_SECS (a repeat ask, or the next tool of the same answer).
LINE_SECS = 8.0
SAY_AGAIN_SECS = 15.0

FAILED = "That didn't work just now. Tell the caller you couldn't do it right now; don't try again."
# The owner's booking app (Composio) could not be reached: no times may be offered from guesswork.
UNREACHABLE = ("The calendar can't be checked right now. Tell the caller you can't check times right now and offer to "
               "take a message instead: their name, their number and when suits them. Don't suggest or agree any time.")
NOT_BOOKED_APP = ("Not booked: the calendar didn't accept it just now. Tell the caller you couldn't book it right now and "
                  "offer to take a message (name, number, the time they wanted). Don't say it is booked.")

# Booking app availability: fetched for the coming days when the call connects, then reused.
PREFETCH_DAYS = 7
CACHE_SECS = 300.0       # check_availability trusts what was fetched this long ago
RECHECK_SECS = 90.0      # book_appointment asks again when what it has is older than this
EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[a-z]{2,}$", re.I)


# --- The calendar: hours, slots, local time <-> UTC -----------------------------------------------


def _minutes(text, allow_24=False) -> int | None:
    """"HH:MM" (24 h) -> minutes after midnight; None if it is not one."""
    m = re.fullmatch(r"\s*(\d{1,2}):(\d{2})\s*", str(text or ""))
    if not m:
        return None
    h, mins = int(m.group(1)), int(m.group(2))
    if mins > 59 or h > 24 or (h == 24 and (mins or not allow_24)):
        return None
    return h * 60 + mins


def hhmm(minutes: int) -> str:
    return f"{minutes // 60:02d}:{minutes % 60:02d}"


def day_words(d: date) -> str:
    """Saturday 18 October."""
    return f"{d:%A} {d.day} {d:%B}"


def clock_words(t: datetime) -> str:
    """7:40 PM."""
    return f"{t.hour % 12 or 12}:{t.minute:02d} {'AM' if t.hour < 12 else 'PM'}"


def as_utc(t: datetime) -> datetime:
    """Mongo hands datetimes back naive (they are UTC)."""
    return t.replace(tzinfo=timezone.utc) if t.tzinfo is None else t.astimezone(timezone.utc)


class Calendar:
    """One agent's booking settings and the arithmetic on them. Every time a caller
    hears is local to `tz`; everything stored is UTC."""

    def __init__(self, cfg: dict):
        self.tzname = str(cfg.get("timezone") or "UTC")
        try:
            self.tz = ZoneInfo(self.tzname)
        except Exception:
            logger.warning(f"tools: booking timezone {self.tzname!r} is unknown, using UTC")
            self.tzname, self.tz = "UTC", ZoneInfo("UTC")
        try:
            self.step = min(240, max(15, int(cfg.get("slotMinutes") or 30)))
        except (TypeError, ValueError):
            self.step = 30
        try:
            self.max_days = min(90, max(1, int(cfg.get("maxDaysAhead") or 14)))
        except (TypeError, ValueError):
            self.max_days = 14
        self.hours: dict[str, tuple[int, int]] = {}
        for key, span in (cfg.get("hours") or {}).items():
            if key in DAYS and isinstance(span, dict):
                start, end = _minutes(span.get("open")), _minutes(span.get("close"), allow_24=True)
                if start is not None and end is not None and end > start:
                    self.hours[key] = (start, end)

    def local(self, now: datetime) -> datetime:
        return now.astimezone(self.tz)

    def open_on(self, d: date) -> tuple[int, int] | None:
        return self.hours.get(DAYS[d.weekday()])

    def last_day(self, now: datetime) -> date:
        return self.local(now).date() + timedelta(days=self.max_days)

    def next_open(self, d: date, now: datetime) -> date | None:
        last, d = self.last_day(now), d + timedelta(days=1)
        while d <= last:
            if self.open_on(d):
                return d
            d += timedelta(days=1)
        return None

    def why_not(self, d: date, now: datetime) -> str | None:
        """Why nothing can be booked that day (closed, past, too far ahead), else None."""
        today = self.local(now).date()
        if d < today:
            return f"{day_words(d)} has already passed. Today is {day_words(today)}."
        if d > self.last_day(now):
            return f"Bookings open only {self.max_days} days ahead; the last day that can be booked is {day_words(self.last_day(now))}."
        if not self.open_on(d):
            after = self.next_open(d, now)
            return f"Closed on {day_words(d)}." + (f" The next open day is {day_words(after)}." if after else "")
        return None

    def slots(self, d: date) -> list[tuple[int, datetime, datetime]]:
        """Every start time the hours allow that day: (minutes after midnight, start UTC, end UTC).

        A slot must END by closing time. A local time that does not exist (the hour a DST
        zone skips) is left out; an ambiguous one (the hour it repeats) is its first instance.
        """
        span = self.open_on(d)
        if not span:
            return []
        out, m = [], span[0]
        midnight = datetime(d.year, d.month, d.day)
        while m + self.step <= span[1]:
            wall = midnight + timedelta(minutes=m)
            start = wall.replace(tzinfo=self.tz).astimezone(timezone.utc)
            if start.astimezone(self.tz).replace(tzinfo=None) == wall:
                out.append((m, start, start + timedelta(minutes=self.step)))
            m += self.step
        return out

    def free(self, d: date, now: datetime, booked: list[tuple[datetime, datetime]],
             starts: set[datetime] | None = None) -> list[tuple[int, datetime, datetime]]:
        """The slots still bookable: not started yet, not overlapping a booking (or a busy time in
        the owner's booking app), and, when the app lists the start times it accepts (Cal.com,
        Calendly), one of those."""
        now = as_utc(now)
        busy = [(as_utc(a), as_utc(b)) for a, b in booked]
        return [s for s in self.slots(d) if s[1] > now and not any(s[1] < b and a < s[2] for a, b in busy)
                and (starts is None or s[1] in starts)]

    def day_bounds(self, d: date) -> tuple[datetime, datetime]:
        """The UTC instants a local day starts and ends (for the bookings query)."""
        a = datetime(d.year, d.month, d.day, tzinfo=self.tz).astimezone(timezone.utc)
        b = (datetime(d.year, d.month, d.day, tzinfo=self.tz) + timedelta(days=1)).astimezone(timezone.utc)
        return a, b + timedelta(hours=3)  # DST and slots that end after midnight

    def hours_words(self) -> str:
        """Mon-Fri 09:00-17:00, Sat 10:00-14:00; closed Sun."""
        groups: list[list] = []
        for key in DAYS:
            span = self.hours.get(key)
            if groups and groups[-1][2] == span:
                groups[-1][1] = key
            else:
                groups.append([key, key, span])
        name = lambda k: k.capitalize()
        opened = [f"{name(a)}{'-' + name(b) if b != a else ''} {hhmm(s[0])}-{hhmm(s[1])}" for a, b, s in groups if s]
        closed = [f"{name(a)}{'-' + name(b) if b != a else ''}" for a, b, s in groups if not s]
        if not opened:
            return "no opening hours are set, so nothing can be booked"
        return ", ".join(opened) + (f"; closed {', '.join(closed)}" if closed else "")


def times_words(minutes: list[int], step: int) -> str:
    """09:00 to 11:30 every 30 minutes, 14:00 and 15:00. Up to four slots in a row are
    listed one by one; a longer run is said as a range."""
    runs: list[list[int]] = []
    for m in minutes:
        if runs and m - runs[-1][-1] == step:
            runs[-1].append(m)
        else:
            runs.append([m])
    parts = []
    for run in runs:
        if len(run) >= 5:
            parts.append(f"{hhmm(run[0])} to {hhmm(run[-1])} every {step} minutes")
        else:
            parts.extend(hhmm(m) for m in run)
    return parts[0] if len(parts) == 1 else ", ".join(parts[:-1]) + " and " + parts[-1]


def parse_day(text) -> date | None:
    try:
        return date.fromisoformat(str(text or "").strip()[:10])
    except ValueError:
        return None


# --- voice_bookings -----------------------------------------------------------------------------

_indexed = False


def ensure_booking_index():
    """The partial unique index that makes double booking impossible. The app's indexes.ts
    creates the same one; whichever runs first wins, the other is a no-op."""
    global _indexed
    if _indexed:
        return
    coll = product.db().voice_bookings
    try:
        for ix in coll.list_indexes():
            key = {k: int(v) for k, v in dict(ix["key"]).items()}
            if key == {"agentId": 1, "start": 1} and ix.get("unique") and dict(ix.get("partialFilterExpression") or {}) == {"status": "BOOKED"}:
                _indexed = True
                return
        # Exactly the app's spec (indexes.ts), default name agentId_1_start_1: either side creating it is a no-op for the other.
        coll.create_index([("agentId", 1), ("start", 1)], unique=True, partialFilterExpression={"status": "BOOKED"})
        _indexed = True
    except OperationFailure as e:
        # An index of another shape is in the way; the overlap check below still runs.
        logger.error(f"tools: could not create the voice_bookings unique index: {e}")
        _indexed = True


def booked_between(agent_id, start: datetime, end: datetime) -> list[dict]:
    ensure_booking_index()
    return list(product.db().voice_bookings.find(
        {"agentId": agent_id, "status": "BOOKED", "start": {"$lt": end}, "end": {"$gt": start}},
        {"start": 1, "end": 1, "callId": 1, "customerName": 1},
    ))


def insert_booking(doc: dict) -> tuple[bool, dict]:
    """(True, doc with _id) when it is booked; (False, the booking in the way) when not."""
    ensure_booking_index()
    coll = product.db().voice_bookings
    clash = coll.find_one({"agentId": doc["agentId"], "status": "BOOKED", "start": {"$lt": doc["end"]}, "end": {"$gt": doc["start"]}})
    if clash:
        return False, clash
    try:
        doc["_id"] = coll.insert_one(doc).inserted_id
        return True, doc
    except DuplicateKeyError:  # another call took the same start a moment ago
        return False, coll.find_one({"agentId": doc["agentId"], "status": "BOOKED", "start": doc["start"]}) or {}


# --- Webhooks -----------------------------------------------------------------------------------


def webhooks_of(tools: dict) -> list[dict]:
    """The enabled custom tools with a usable name and URL, first of each name."""
    out, seen = [], set(RESERVED)
    for hook in tools.get("webhooks") or []:
        if not isinstance(hook, dict) or not hook.get("enabled"):
            continue
        name = str(hook.get("name") or "")
        if not WEBHOOK_NAME.match(name) or name in seen or not str(hook.get("url") or "").startswith(("https://", "http://")):
            continue
        seen.add(name)
        out.append(hook)
    return out


async def url_refusal(url: str) -> str | None:
    """Why this URL may not be called, else None: https only, and never this machine or a
    private network (the app checks too; this is the side that actually connects)."""
    u = urlparse(url)
    host = u.hostname or ""
    if not host or u.scheme not in ("https", "http"):
        return "not an http(s) URL"
    try:
        infos = await asyncio.get_running_loop().getaddrinfo(host, u.port or (443 if u.scheme == "https" else 80),
                                                             type=socket.SOCK_STREAM)
    except OSError as e:
        return f"{host} does not resolve ({e})"
    addrs = {ipaddress.ip_address(i[4][0].split("%")[0]) for i in infos}
    local = [a for a in addrs if not a.is_global]
    if local:
        if not ALLOW_LOCAL_URLS:
            return f"{host} is a private or local address ({local[0]})"
        if not all(a.is_loopback for a in local):
            return f"{host} is a private address ({local[0]}); only loopback is allowed here"
        return None  # a test server on this machine; plain http allowed
    if u.scheme != "https":
        return "only https:// URLs are allowed"
    return None


def signature(secret: str, body: bytes) -> str:
    return "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


async def post_webhook(hook: dict, payload: dict) -> tuple[bool, str]:
    """POST the call to the owner's URL. (True, their answer) on a 2xx, else (False, why)."""
    url = str(hook["url"])
    why = await url_refusal(url)
    if why:
        logger.warning(f"tools: webhook {hook['name']} not called: {why}")
        return False, f"refused: {why}"
    body = json.dumps(payload, ensure_ascii=False, separators=(",", ":"), default=str).encode()
    headers = {"Content-Type": "application/json", "User-Agent": USER_AGENT}
    if hook.get("secretSealed"):
        try:
            headers["X-Aixel-Signature"] = signature(product.open_secret(hook["secretSealed"]), body)
        except Exception as e:
            logger.error(f"tools: webhook {hook['name']}: its signing secret cannot be opened ({e}), not called")
            return False, "its signing secret cannot be read"
    try:
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=WEBHOOK_TIMEOUT)) as session:
            async with session.post(url, data=body, headers=headers, allow_redirects=False) as r:
                raw = await r.content.read(WEBHOOK_BODY_MAX * 4 + 1)
                text = raw.decode(r.charset or "utf-8", errors="replace")[:WEBHOOK_BODY_MAX].strip()
                if 200 <= r.status < 300:
                    return True, text
                return False, f"HTTP {r.status}"
    except asyncio.TimeoutError:
        return False, f"no answer in {WEBHOOK_TIMEOUT:.0f} s"
    except aiohttp.ClientError as e:
        return False, f"{type(e).__name__}: {e}"[:200]


# --- One call's tools ---------------------------------------------------------------------------


class ToolsGeminiLive(TurnSafeGeminiLive):
    """Gemini Live (with TurnSafeGeminiLive's turn hold), except that a tool call is
    NOT cancelled when the caller speaks.

    Pipecat cancels a synchronous call on every interruption, and on a phone line
    that is any "hello?", "mm" or cough while it runs. Each cancel started the
    lookup over, so a caller who kept talking kept her waiting (measured: three
    5 s lookups in a row before she said a word). The call runs to the end
    instead. Gemini itself still drops a pending call when the caller speaks and
    asks again once they stop; CallTools answers the repeat from the request
    already under way (REUSE_SECS), so she answers when the first one does.
    Used only for an agent that has tools.
    """

    async def _handle_interruptions(self, frame):
        return


class ToolFlush(FrameProcessor):
    """Hands a tool's answer to Gemini when the caller was talking as it arrived.

    The context aggregator passes a result on to the model only when the caller is
    not speaking at that moment, and in realtime mode nothing passes it on later: the
    model, waiting on a BLOCKING call, would wait for good. So once the caller stops,
    the context goes to the service again (it sends only results it has not sent).
    Sits just before the model.
    """

    def __init__(self, context, **kwargs):
        super().__init__(**kwargs)
        self._context = context
        self.user_speaking = False
        self.owed = False

    async def process_frame(self, frame: Frame, direction: FrameDirection):
        await super().process_frame(frame, direction)
        await self.push_frame(frame, direction)
        if direction != FrameDirection.DOWNSTREAM:
            return
        if isinstance(frame, UserStartedSpeakingFrame):
            self.user_speaking = True
        elif isinstance(frame, UserStoppedSpeakingFrame):
            self.user_speaking = False
            if self.owed:
                self.owed = False
                await asyncio.sleep(0.05)  # the result frame reaches the aggregator first
                logger.info("[tools] the caller spoke over a tool's answer: handing it to the model now")
                await self.push_frame(LLMContextFrame(context=self._context), FrameDirection.DOWNSTREAM)


class CallTools:
    """One call's tools: what Gemini is offered, the handlers, and the log of every run.

    `ctx` is the call (product.phone_call / play_call): the agent's `tools`, the owner
    ids, the voice_calls `_id` chosen at the start, and the caller's number. `record` is
    the engine's record of the call; its `turns` say where in the call a tool ran and
    `tool_calls` collects the runs.
    """

    def __init__(self, ctx: dict, record: dict, prefetch: bool = True):
        self.ctx, self.record = ctx, record
        tools = ctx.get("tools") or {}
        booking = tools.get("booking")
        self.cal = Calendar(booking) if isinstance(booking, dict) and booking.get("enabled") else None
        # book_appointment can be off on its own: she then tells callers free times and books nothing.
        self.books = bool(self.cal and booking.get("bookAppointment") is not False)
        # The owner's booking app (None = the built-in calendar), and what it said about free times.
        self.dest = (calendars.provider_for(booking.get("destination"), (ctx.get("doc") or {}).get("userId"))
                     if self.cal else None)
        self._seen: list[calendars.Availability] = []
        self._prefetch: asyncio.Task | None = None
        if self.dest and prefetch:
            self.start_prefetch()
        self.webhooks = {h["name"]: h for h in webhooks_of(tools)}
        self.notify = None  # async (dict) -> None: the playground page hears about each run
        self.flush: ToolFlush | None = None
        self._runs: dict[tuple, list] = {}  # (webhook, arguments) -> [its request, when it finished]
        self.speech = ctx.get("speech") or speech.DEFAULTS
        self.llm = None
        self._line: asyncio.Future | None = None  # the SAY line's audio, made when the call starts
        self._said_at = float("-inf")
        if self:
            record["tool_calls"] = []

    def __bool__(self):
        return bool(self.cal or self.webhooks)

    def builtins(self) -> list[str]:
        """The booking functions she gets: both, check_availability alone, or none."""
        return [*BUILTIN] if self.books else ["check_availability"] if self.cal else []

    # --- what the model sees ---

    def schema(self) -> ToolsSchema | None:
        if not self:
            return None
        fns = []
        if self.cal:
            fns.append(FunctionSchema(
                name="check_availability",
                description=("Free appointment start times on one day, in the business's local time. Call it before "
                             "offering or agreeing to any time."),
                properties={
                    "date": {"type": "string", "description": "The day, YYYY-MM-DD."},
                    "after": {"type": "string", "description": "Optional: only times at or after this one, HH:MM (24 h)."},
                },
                required=["date"],
            ))
        if self.books:
            fns.append(FunctionSchema(
                name="book_appointment",
                description=("Book one appointment at a start time check_availability returned. Only once the caller "
                             "has agreed the time and given their name."),
                properties={
                    "date": {"type": "string", "description": "The day, YYYY-MM-DD."},
                    "time": {"type": "string", "description": "Start time, HH:MM (24 h), local."},
                    "name": {"type": "string", "description": "The caller's name."},
                    "phone": {"type": "string", "description": "Optional: a phone number the caller gave. Leave it out to use the number they are calling from."},
                    "notes": {"type": "string", "description": "Optional: what the appointment is for, in a few words."},
                    **({"email": {"type": "string", "description": (
                        "The caller's email address, spelled back to them and confirmed."
                        + (" Required." if self.dest.needs_email else " Optional: only if they want the invite."))}}
                       if self.dest else {}),
                },
                required=["date", "time", "name"],
            ))
        for name, hook in self.webhooks.items():
            props, required = {}, []
            for p in hook.get("parameters") or []:
                if not isinstance(p, dict) or not PARAM_NAME.match(str(p.get("name") or "")):
                    continue
                kind = p.get("type") if p.get("type") in ("string", "number", "boolean") else "string"
                props[p["name"]] = {"type": kind, "description": str(p.get("description") or "")[:500]}
                if p.get("required"):
                    required.append(p["name"])
            fns.append(FunctionSchema(name=name, description=str(hook.get("description") or name)[:1000],
                                      properties=props, required=required))
        return ToolsSchema(standard_tools=fns)

    def register(self, llm, voice: str):
        # Default cancel_on_interruption=True: a synchronous call, declared BLOCKING (and not
        # cancelled by the caller speaking: see ToolsGeminiLive).
        for name in self.builtins() + list(self.webhooks):
            llm.register_function(name, self._handle, timeout_secs=WEBHOOK_TIMEOUT + 4)
        self.llm = llm
        if self.speech["toolWait"] == "SAY" and not getattr(llm, "speaks_text", False):
            # Made now, in her voice on the call's own key, so it is ready by the first tool (~2-5 s).
            self._line = asyncio.ensure_future(asyncio.to_thread(
                fillers.get_line, voice, self.speech["toolWaitLine"], self.ctx.get("gemini_key"), LINE_SECS))

    def prompt(self) -> str:
        """`# Your tools`: when to use each one. Empty when the agent has none."""
        if not self:
            return ""
        lines = ["# Your tools", "",
                 "You can do these things during the call. Never say a tool's name or how it works; just do it.", ""]
        if self.cal:
            phone = self.ctx.get("customer_phone")
            lines += [
                f"- **Appointments** ({self.cal.step} minutes each; open {self.cal.hours_words()}; times are "
                f"{self.cal.tzname}; up to {self.cal.max_days} days ahead). Use check_availability for the day the "
                "caller wants before you offer or agree to any time, and never say a time is free unless "
                "check_availability returned it. "
                + ("Before booking, ask for the caller's name"
                   + (" (their number is already on file; take another only if they offer it)" if phone else "")
                   + ". Then use book_appointment, and never say it is booked unless book_appointment answered \"Booked\". "
                   "If it says the time is taken, offer the free times it gives. Don't promise a text, email or "
                   "reminder about it" + (", except the calendar invite book_appointment says it sent." if self.dest else ".")
                   if self.books else
                   "You can't book appointments yourself: tell the caller which times are free and offer to take a "
                   "message (name, number, the time they want) so the business can confirm it."),
                "- Say days and times the way the caller would (\"Saturday at 2 pm\"), never \"14:00\" or "
                "\"2026-10-18\". Work out \"tomorrow\" or \"next Saturday\" from # Right now.",
            ]
            if self.dest and self.books and self.dest.needs_email:
                lines.append("- The booking also needs the caller's email address: ask for it, spell it back letter by "
                             "letter and pass it as email.")
            elif self.dest and self.books:
                lines.append("- If the caller wants a calendar invite, take their email address, spell it back, and "
                             "pass it as email; otherwise leave it out.")
            if self.dest:
                lines.append("- If a tool says the calendar can't be checked, don't guess any times: offer to take a "
                             "message (name, number, when suits them).")
        for name, hook in self.webhooks.items():
            what = re.sub(r"\s+", " ", str(hook.get("description") or "")).strip()[:600]
            lines.append(f"- **{name}**: {what} If it fails, tell the caller you couldn't do that right now.")
        lines.append(speech.tool_wait_prompt(self.speech))
        return "\n".join(lines)

    # --- running one ---

    async def _handle(self, params):
        name, args = params.function_name, dict(params.arguments or {})
        t0, after = time.monotonic(), len(self.record["turns"])
        self.record["turn_break"] = True  # what she says after it is its own line in the transcript
        await self._say_line()
        work = asyncio.ensure_future(self._dispatch(name, args))
        try:
            ok, result, booking_id = await asyncio.shield(work)
        except asyncio.CancelledError:
            # Pipecat gave up on it (its timeout, the call ending). The work itself is not
            # undone (a booking may already be written): it finishes and is logged.
            def done(w: asyncio.Future):
                ok, result, booking_id = w.result() if not w.cancelled() and not w.exception() else (False, FAILED, None)
                self._log(name, args, ok, result + " (she never heard this answer)", after, t0, booking_id)
            work.add_done_callback(done)
            if self.flush:
                self.flush.owed = True
            raise
        entry = self._log(name, args, ok, result, after, t0, booking_id)
        if self.flush and self.flush.user_speaking:
            self.flush.owed = True
        await params.result_callback(result)
        if self.notify:
            try:
                await self.notify({"type": "tool", "name": name, "arguments": entry["arguments"], "result": entry["result"], "ok": ok})
            except Exception as e:
                logger.warning(f"tools: could not tell the page about {name}: {e}")

    async def _say_line(self):
        """SAY: her line goes out as the tool starts (the model was told to say nothing itself). Skipped
        when its audio is not ready yet: the tool is never held up for it. Played ahead of her answer, so
        a quick tool's answer waits for the line to finish. A PIPELINE stack's TTS says it as text (cascade.py)."""
        if getattr(self.llm, "speaks_text", False):
            if time.monotonic() - self._said_at >= SAY_AGAIN_SECS:
                self._said_at = time.monotonic()
                await self.llm.push_frame(TTSSpeakFrame(self.speech["toolWaitLine"]))
            return
        line = self._line
        if not (line and line.done() and not line.cancelled() and not line.exception() and line.result()):
            return
        if time.monotonic() - self._said_at < SAY_AGAIN_SECS:
            return
        self._said_at = time.monotonic()
        self.record["turns"].append({"at": time.strftime("%H:%M:%S"), "who": "agent", "text": self.speech["toolWaitLine"]})
        await self.llm.push_frame(OutputAudioRawFrame(audio=line.result(), sample_rate=fillers.SAMPLE_RATE, num_channels=1))

    def _log(self, name, args, ok, result, after, t0, booking_id) -> dict:
        entry = {"name": name, "arguments": args, "result": result[:RESULT_MAX], "ok": bool(ok), "afterTurn": after,
                 "durationMs": round((time.monotonic() - t0) * 1000), "bookingId": booking_id}
        self.record.setdefault("tool_calls", []).append(entry)
        logger.info(f"[tools] {name}({json.dumps(args, ensure_ascii=False)[:200]}) -> {'ok' if ok else 'FAILED'} "
                    f"in {entry['durationMs']} ms: {result[:160]!r}")
        return entry

    async def _dispatch(self, name: str, args: dict) -> tuple[bool, str, str | None]:
        try:
            if name == "check_availability" and self.cal:
                return await self.check_availability(args)
            if name == "book_appointment" and self.books:
                return await self.book_appointment(args)
            if name in self.webhooks:
                return await self.call_webhook(self.webhooks[name], args)
            return False, f"There is no tool called {name}.", None
        except Exception as e:
            logger.exception(f"tools: {name} failed: {e}")
            return False, FAILED, None

    # --- the owner's booking app (Composio) ---

    def start_prefetch(self, now: datetime | None = None):
        """Asks the booking app about the coming days as soon as the call connects, so the
        first check_availability is answered from memory instead of a round trip."""
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            return  # not inside a call (building the prompt): nothing to prefetch for
        now = as_utc(now or product.now())
        today = self.cal.local(now).date()
        days = min(PREFETCH_DAYS, self.cal.max_days + 1)
        a = self.cal.day_bounds(today)[0]
        b = min(self.cal.day_bounds(today + timedelta(days=days - 1))[1], a + self.dest.max_span)
        self._prefetch = loop.create_task(self._fetch(a, b, "prefetch"))
        self._prefetch.add_done_callback(lambda t: t.cancelled() or t.exception())  # logged in _fetch

    async def _fetch(self, a: datetime, b: datetime, why: str) -> calendars.Availability:
        t0 = time.monotonic()
        try:
            got = await self.dest.availability(a, b, self.cal.tz)
        except calendars.CalendarError as e:
            logger.warning(f"[calendar] {self.dest.label} availability ({why}) failed in "
                           f"{round((time.monotonic() - t0) * 1000)} ms: {e}")
            raise
        self._seen.append(got)
        logger.info(f"[calendar] {self.dest.label} availability ({why}) {a:%Y-%m-%d %H:%M}..{b:%Y-%m-%d %H:%M} UTC in "
                    f"{round((time.monotonic() - t0) * 1000)} ms: "
                    + (f"{len(got.busy)} busy" if got.busy is not None else f"{len(got.starts or ())} open starts"))
        return got

    async def external(self, d: date, max_age: float) -> calendars.Availability:
        """What the booking app says about day d: from this call's memory when it is fresh
        enough, else asked now (waiting for the prefetch first when it is still under way)."""
        a, b = self.cal.day_bounds(d)
        if self._prefetch and not self._prefetch.done():
            try:
                await asyncio.wait_for(asyncio.shield(self._prefetch), calendars.TIMEOUT)
            except Exception:
                pass  # asked again below
        for got in reversed(self._seen):
            if got.covers(a, b) and got.age() <= max_age:
                return got
        return await self._fetch(a, b, d.isoformat())

    def _forget(self, d: date):
        a, b = self.cal.day_bounds(d)
        self._seen = [g for g in self._seen if not (g.start < b and a < g.end)]

    async def check_availability(self, args: dict, now: datetime | None = None) -> tuple[bool, str, None]:
        cal, now = self.cal, now or product.now()
        d = parse_day(args.get("date"))
        if not d:
            return False, f"{args.get('date')!r} is not a date. Ask again with date as YYYY-MM-DD.", None
        why = cal.why_not(d, now)
        if why:
            return True, why, None
        a, b = cal.day_bounds(d)
        booked = await asyncio.to_thread(booked_between, self.ctx["doc"]["agentId"], a, b)
        busy, starts = [(x["start"], x["end"]) for x in booked], None
        if self.dest:
            try:
                ext = await self.external(d, CACHE_SECS)
            except calendars.CalendarError:
                return False, UNREACHABLE, None
            busy, starts = busy + list(ext.busy or []), ext.starts
        free = cal.free(d, now, busy, starts)
        start = _minutes(args.get("after")) if args.get("after") else None
        if start is not None:
            free = [s for s in free if s[0] >= start]
        when = f"{day_words(d)} ({cal.tzname})"
        if not free:
            later = cal.next_open(d, now)
            return True, (f"{when}: no free times{' after ' + hhmm(start) if start is not None else ''}."
                          + (f" The next open day is {day_words(later)}." if later else "")), None
        return True, f"{when}: free at {times_words([s[0] for s in free], cal.step)}.", None

    async def book_appointment(self, args: dict, now: datetime | None = None) -> tuple[bool, str, str | None]:
        cal, now = self.cal, now or product.now()
        name = re.sub(r"\s+", " ", str(args.get("name") or "")).strip()[:120]
        if not name:
            return False, "Not booked: ask for the caller's name first.", None
        d, start = parse_day(args.get("date")), _minutes(args.get("time"))
        if not d or start is None:
            return False, "Not booked: date must be YYYY-MM-DD and time HH:MM.", None
        why = cal.why_not(d, now)
        if why:
            return False, f"Not booked. {why}", None
        slot = next((s for s in cal.slots(d) if s[0] == start), None)
        a, b = cal.day_bounds(d)
        if not slot or slot[1] <= as_utc(now):
            booked = await asyncio.to_thread(booked_between, self.ctx["doc"]["agentId"], a, b)
            busy, starts = [(x["start"], x["end"]) for x in booked], None
            if self.dest:
                try:
                    ext = await self.external(d, CACHE_SECS)
                    busy, starts = busy + list(ext.busy or []), ext.starts
                except calendars.CalendarError:
                    return False, UNREACHABLE, None
            free = cal.free(d, now, busy, starts)
            reason = "has already passed" if slot else "is not a start time we offer"
            return False, (f"Not booked: {hhmm(start)} on {day_words(d)} {reason}."
                           + (f" Free that day: {times_words([s[0] for s in free], cal.step)}." if free else " Nothing else is free that day.")), None
        doc_ctx = self.ctx["doc"]
        phone = re.sub(r"[^\d+]", "", str(args.get("phone") or "")) or self.ctx.get("customer_phone") or None
        notes = re.sub(r"\s+", " ", str(args.get("notes") or "")).strip()[:500] or None
        if self.dest:
            return await self._book_external(d, start, slot, name, phone, notes, args, now)
        stamp = product.now()
        doc = {
            "tenantId": doc_ctx["tenantId"], "userId": doc_ctx["userId"], "agentId": doc_ctx["agentId"],
            "callId": doc_ctx.get("_id"), "channel": doc_ctx["channel"],
            "start": slot[1], "end": slot[2], "timezone": cal.tzname,
            "customerName": name, "customerPhone": phone, "notes": notes,
            "status": "BOOKED", "createdAt": stamp, "updatedAt": stamp,
        }
        when = f"{day_words(d)} at {hhmm(start)} to {hhmm(start + cal.step)} ({cal.tzname})"
        booked_ok, got = await asyncio.to_thread(insert_booking, doc)
        if booked_ok:
            logger.info(f"[tools] booking {got['_id']}: {name} {when}, call {doc['callId']}")
            return True, f"Booked: {when} for {name}.", str(got["_id"])
        if got.get("callId") is not None and got.get("callId") == doc["callId"] and as_utc(got["start"]) == slot[1]:
            # She asked twice in one call (or the first answer was talked over): it is theirs already.
            return True, f"Booked: {when} for {got.get('customerName') or name}.", str(got["_id"])
        booked = await asyncio.to_thread(booked_between, doc_ctx["agentId"], a, b)
        free = cal.free(d, now, [(x["start"], x["end"]) for x in booked])
        return False, (f"Not booked: {hhmm(start)} on {day_words(d)} is taken."
                       + (f" Still free that day: {times_words([s[0] for s in free], cal.step)}." if free else " Nothing else is free that day.")), None

    async def _book_external(self, d: date, start: int, slot, name: str, phone, notes, args: dict,
                             now: datetime) -> tuple[bool, str, str | None]:
        """Books into the owner's app, then mirrors it into voice_bookings (the Bookings page,
        the call log, and the unique index that keeps two calls off one slot)."""
        cal, dest, doc_ctx = self.cal, self.dest, self.ctx["doc"]
        email = re.sub(r"\s+", "", str(args.get("email") or "")).strip().lower() or None
        if email and not EMAIL.match(email):
            return False, f"Not booked: {email!r} is not an email address. Ask for it again and spell it back.", None
        if dest.needs_email and not email:
            return False, ("Not booked: the booking needs the caller's email address. Ask for it, spell it back, "
                           "and book again with email."), None
        when = f"{day_words(d)} at {hhmm(start)} to {hhmm(start + cal.step)} ({cal.tzname})"
        a, b = cal.day_bounds(d)

        def taken_words(booked, ext) -> str:
            free = cal.free(d, now, [(x["start"], x["end"]) for x in booked] + list(ext.busy or []), ext.starts if ext else None)
            return (f"Not booked: {hhmm(start)} on {day_words(d)} is taken."
                    + (f" Still free that day: {times_words([s[0] for s in free], cal.step)}." if free else " Nothing else is free that day."))

        booked = await asyncio.to_thread(booked_between, doc_ctx["agentId"], a, b)
        mine = next((x for x in booked if as_utc(x["start"]) == slot[1] and x.get("callId") is not None
                     and x.get("callId") == doc_ctx.get("_id")), None)
        if mine:  # asked twice in one call: it is theirs already
            return True, f"Booked: {when} for {mine.get('customerName') or name}.", str(mine["_id"])
        try:
            ext = await self.external(d, RECHECK_SECS)
        except calendars.CalendarError:
            return False, NOT_BOOKED_APP, None
        busy = [(x["start"], x["end"]) for x in booked] + list(ext.busy or [])
        if slot[1] not in {s[1] for s in cal.free(d, now, busy, ext.starts)}:
            return False, taken_words(booked, ext), None
        title = f"{name}: appointment"
        details = "\n".join(x for x in (notes, f"Phone: {phone}" if phone else None, f"Email: {email}" if email else None,
                                         "Booked by the Aixel Labs voice agent during a call.") if x)
        try:
            event = await dest.create(slot[1], slot[2], cal.tz, title, details, name, email, phone)
        except calendars.SlotTaken:
            self._forget(d)
            try:
                return False, taken_words(booked, await self.external(d, 0)), None
            except calendars.CalendarError:
                return False, f"Not booked: {hhmm(start)} on {day_words(d)} is taken.", None
        except calendars.CalendarError:
            return False, NOT_BOOKED_APP, None
        stamp = product.now()
        doc = {
            "tenantId": doc_ctx["tenantId"], "userId": doc_ctx["userId"], "agentId": doc_ctx["agentId"],
            "callId": doc_ctx.get("_id"), "channel": doc_ctx["channel"],
            "start": slot[1], "end": slot[2], "timezone": cal.tzname,
            "customerName": name, "customerPhone": phone, "notes": notes,
            "status": "BOOKED", "createdAt": stamp, "updatedAt": stamp,
            "external": {"provider": dest.name, "eventId": event.event_id, "connectedAccountId": dest.account,
                         "calendarId": dest.calendar_id, "meetingUrl": event.meeting_url},
        }
        booked_ok, got = await asyncio.to_thread(insert_booking, doc)
        if not booked_ok:
            # Another call took this slot while the app was creating ours: give the app's one back.
            try:
                await dest.cancel(event.event_id)
            except calendars.CalendarError as e:
                logger.error(f"[calendar] could not cancel {dest.label} event {event.event_id} after a clash: {e}")
            return False, taken_words(await asyncio.to_thread(booked_between, doc_ctx["agentId"], a, b), ext), None
        ext.add_busy(slot[1], slot[2])
        logger.info(f"[tools] booking {got['_id']} in {dest.label} (event {event.event_id}): {name} {when}, call {doc['callId']}")
        return True, (f"Booked: {when} for {name}." + (f" The calendar invite is emailed to {email}." if email else "")), str(got["_id"])

    async def call_webhook(self, hook: dict, args: dict) -> tuple[bool, str, None]:
        doc = self.ctx["doc"]
        payload = {"tool": hook["name"], "arguments": args, "call": {
            "id": str(doc.get("_id") or ""), "agentId": str(doc["agentId"]), "channel": doc["channel"],
            "direction": doc["direction"], "from": doc.get("from"), "to": doc.get("to")}}
        key = (hook["name"], json.dumps(args, sort_keys=True, default=str))
        run = self._runs.get(key)
        if not run or (run[0].done() and time.monotonic() - run[1] > REUSE_SECS):
            run = self._runs[key] = [asyncio.ensure_future(post_webhook(hook, payload)), float("inf")]
            run[0].add_done_callback(lambda _, run=run: run.__setitem__(1, time.monotonic()))
        else:
            logger.info(f"[tools] {hook['name']}: asked again with the same arguments, the same request answers it")
        ok, answer = await asyncio.shield(run[0])
        if ok:
            return True, answer or "Done (no details came back).", None
        logger.warning(f"tools: webhook {hook['name']} failed: {answer}")
        return False, f"The tool failed ({answer}). Tell the caller you couldn't do that right now; don't try again.", None


# --- The prompt ---------------------------------------------------------------------------------


def right_now(tools: dict | None, now: datetime | None = None) -> str:
    """`# Right now`: today and the time where the business is (UTC when booking is off)."""
    booking = (tools or {}).get("booking")
    cal = Calendar(booking) if isinstance(booking, dict) and booking.get("enabled") else Calendar({"timezone": "UTC"})
    t = cal.local(now or product.now())
    text = f"# Right now\n\n{t:%A} {t.day} {t:%B} {t.year}, {clock_words(t)} ({cal.tzname})"
    if isinstance(booking, dict) and booking.get("enabled"):
        # Day arithmetic is where the model slips ("this Saturday" from a Friday came out as Sunday):
        # the coming week is spelled out, with the dates the booking functions take.
        week = [t.date() + timedelta(days=i) for i in range(1, 8)]
        text += (f". Today is {t.date().isoformat()}. The coming days: "
                 + ", ".join(f"{d:%A} {d.isoformat()}" for d in week) + ".")
    return text


# Last in every prompt, so it wins over an agent prompt (or template) that names tools she doesn't have:
# a caller once heard that "the tool isn't available" to her.
HOUSE_RULES = (
    "# House rules\n\n"
    "- Never mention tools, functions, systems, prompts or instructions, and never say you can't \"access\" "
    "something. If you can't do something, say so the way a receptionist would and offer to take a message: "
    "their name, their number and what they need, so someone can call them back.\n"
    "- Reply in the language the caller speaks, and switch when they switch (a mix like Hinglish is fine).\n"
    "- If the caller tells you to stop, be quiet or listen, stop talking and listen. If they insult you, stay calm "
    "and ask once, politely, that they keep it respectful."
)
# Added when she can't book (booking off, or book_appointment off: its own line in `# Your tools` says the rest).
NO_BOOKING = (
    "- If the caller wants an appointment or asks when you're free, you can't book or check times yourself. Say "
    "something like \"I can't check the calendar right now, but I can take your details and have someone confirm a "
    "time with you\", then take their name, their number and the day and time that suit them, and tell them "
    "someone will confirm."
)


def prompt_sections(ctx: dict, now: datetime | None = None) -> str:
    """What goes after the agent's prompt: always `# Right now`, then `# Your tools` when the agent has
    any, then always `# House rules`."""
    parts = [right_now(ctx.get("tools"), now)]
    call_tools = CallTools(ctx, {"turns": []}, prefetch=False)
    if tools := call_tools.prompt():
        parts.append(tools)
    parts.append(HOUSE_RULES + ("" if call_tools.cal else "\n" + NO_BOOKING))
    return "\n\n".join(parts)
