"""Outbound campaigns: this engine calls a campaign's contacts itself, from inside this process.

The Aixel Labs app (`frontend/app/actions/voice-campaign-actions.ts`) writes two collections
and this module works through them (shapes: `VoiceCampaignDoc` / `VoiceCampaignContactDoc` in
the backend's `src/db/types.ts`):

    voice_campaigns          name, agent, from-number, calling window, concurrency, retries, status
    voice_campaign_contacts  one person to call: phone (E.164), name, variables, status, attempts

`install(app)` starts a loop with the app. Every TICK_SECS it:
  1. settles the calls it placed: finds each one's voice_calls document, links it to the
     campaign and contact, and moves the contact on (answered / retry later / unreached / failed);
  2. settles calls another process placed whose lease ran out (it stopped or restarted): the
     same, or, with no document after ORPHAN_SECS, the attempt counts as interrupted;
  3. for every RUNNING campaign whose lease it holds (or can take): marks contacts on the
     do-not-call list as skipped, then, inside the calling window and under every concurrency
     limit, claims due contacts one at a time (find-and-modify, so two processes never dial the
     same one) and dials each through POST /calls, in process: the same checks and code as a
     call the app asks for;
  4. marks a RUNNING campaign with nothing left to call or settle COMPLETED.
PAUSED or CANCELLED stops step 3; calls already ringing finish and are settled as usual.

A process that is draining (phone.py: SIGTERM, a deploy) dials nobody and lets go of its campaign
leases at once, so the slot taking over carries the campaigns on; it keeps renewing and settling the
calls it already placed, and exits only once they are settled. Contacts are claimed one at a time by
find-and-modify (PENDING -> CALLING), so the two slots of a deploy never dial the same contact.

A contact's variables reach the call through `tag(ctx)`, which product._finish_ctx calls for
every call context: on a call this process placed for a campaign it sets `ctx["variables"]`
(a dict) and puts campaignId, campaignContactId and variables on the voice_calls document.
A document written without a context (a Twilio or VoiceLink call nobody answered) is linked in
step 1 instead. A call whose stream reaches another process than the one that dialled it (a
deploy's other slot) is found in the database there: it gets the variables too, and its contact is
marked `streamedAt` so the dialling process does not take it for a call that never connected.
"""

import asyncio
import os
import socket
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from loguru import logger
from pymongo import ReturnDocument

import product

TICK_SECS = float(os.getenv("CAMPAIGN_TICK_SECS", "3"))
# A campaign's runner lease, and a placed call's lease: renewed every tick by the process that holds it.
LEASE_SECS = float(os.getenv("CAMPAIGN_LEASE_SECS", "30"))
# A call nobody's stream ever opened for: the provider's own "never answered" record comes
# within about a minute (Twilio's status callback, VoiceLink's call.completed); past this, none is coming.
NO_STREAM_SECS = float(os.getenv("CAMPAIGN_NO_STREAM_SECS", "300"))
# A call that did open: its document is written when it ends. Past this, the process lost it.
MAX_CALL_SECS = 3 * 3600
# A call another process placed and stopped renewing: its document gets this long to show up.
ORPHAN_SECS = float(os.getenv("CAMPAIGN_ORPHAN_SECS", "120"))
# Engine slots left for calls coming in to customers' numbers while campaigns dial out.
INBOUND_RESERVE = int(os.getenv("CAMPAIGN_INBOUND_RESERVE", "2"))
# The most calls one number places at once across every campaign (= VOICE_CAMPAIGN_MAX_CONCURRENT in the app).
NUMBER_MAX_CONCURRENT = 6
# The provider refusing this many calls in a row pauses the campaign (a spent balance, a blocked account).
MAX_PROVIDER_FAILURES = 3

DAYS = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")

# VoiceCampaignStatus / VoiceCampaignContactStatus in types.ts.
RUNNING, PAUSED, COMPLETED, CANCELLED = "RUNNING", "PAUSED", "COMPLETED", "CANCELLED"
PENDING, CALLING, ANSWERED, UNREACHED, FAILED, SKIPPED_DNC = (
    "PENDING", "CALLING", "ANSWERED", "UNREACHED", "FAILED", "SKIPPED_DNC")

# How a call's `endedBy` counts. Anything not listed was answered by a person (goodbye, dnc, ...).
# The retry kinds are VoiceCampaignRetryOutcome in types.ts.
NOT_ANSWERED = {
    "no_answer": "no_answer", "not_connected": "no_answer",
    "busy": "busy",
    "voicemail": "voicemail", "voicemail_message": "voicemail", "ivr": "voicemail",
}
CALL_FAILED = {"failed", "error"}
# An attempt whose call this engine lost (it stopped mid-call): retried while attempts remain.
INTERRUPTED = "interrupted"

PROCESS_ID = f"{socket.gethostname()}:{os.getpid()}:{uuid.uuid4().hex[:6]}"

# Calls this process placed and has not settled, by contact id. The key that tag() looks up:
# (numberId, E.164 callee) -> contact id.
INFLIGHT: dict[str, dict] = {}
DIALING: dict[tuple[str, str], str] = {}


def now() -> datetime:
    return datetime.now(timezone.utc)


def aware(value: datetime | None) -> datetime | None:
    """pymongo hands dates back naive (UTC)."""
    return value.replace(tzinfo=timezone.utc) if value is not None and value.tzinfo is None else value


# --- Pure rules (tests/campaigns_unit.py) -------------------------------------------------------


def minutes_of(hhmm: str) -> int | None:
    try:
        h, m = (int(x) for x in str(hhmm).split(":"))
    except ValueError:
        return None
    return h * 60 + m if 0 <= h <= 24 and 0 <= m < 60 and h * 60 + m <= 1440 else None


def in_window(window: dict | None, at: datetime) -> bool:
    """True when `at` falls in the campaign's calling window: one of its days, from `start`
    (included) to `end` (not included), both "HH:MM" on the clock of `timezone`. An unknown
    zone or a malformed window is never open (nothing is dialled by mistake)."""
    if not window:
        return False
    try:
        zone = ZoneInfo(window.get("timezone") or "")
    except Exception:
        return False
    start, end = minutes_of(window.get("start")), minutes_of(window.get("end"))
    if start is None or end is None or start >= end:
        return False
    local = at.astimezone(zone)
    if DAYS[local.weekday()] not in (window.get("days") or []):
        return False
    return start <= local.hour * 60 + local.minute < end


def outcome_kind(ended_by: str | None) -> str:
    """"answered", "failed", or the retry kind of a call nobody answered."""
    ended_by = ended_by or ""
    if ended_by in NOT_ANSWERED:
        return NOT_ANSWERED[ended_by]
    if ended_by in CALL_FAILED:
        return "failed"
    return "answered"


def booked(call: dict) -> bool:
    return any(t.get("bookingId") for t in call.get("toolCalls") or [])


def next_step(contact: dict, campaign: dict, ended_by: str, at: datetime) -> dict:
    """The contact's fields once an attempt ended with `ended_by`.

    Retried (back to PENDING, due after the delay) when the campaign retries that kind of
    outcome and attempts remain (1 + maxRetries in all); an interrupted attempt is retried while
    attempts remain whatever the settings say. A cancelled campaign retries nothing."""
    retry = campaign.get("retry") or {}
    allowed = 1 + max(0, int(retry.get("maxRetries") or 0))
    attempts_left = int(contact.get("attempts") or 0) < allowed
    live = campaign.get("status") != CANCELLED
    kind = INTERRUPTED if ended_by == INTERRUPTED else outcome_kind(ended_by)
    fields = {"lastOutcome": ended_by, "updatedAt": at}
    if kind == "answered":
        return {**fields, "status": ANSWERED, "nextAttemptAt": None, "finishedAt": at}
    retried = live and attempts_left and (kind == INTERRUPTED or kind in (retry.get("on") or []))
    if retried:
        delay = max(0.0, float(retry.get("delayMinutes") or 0))
        return {**fields, "status": PENDING, "nextAttemptAt": at + timedelta(minutes=delay)}
    final = FAILED if kind in ("failed", INTERRUPTED) else UNREACHED
    return {**fields, "status": final, "nextAttemptAt": None, "finishedAt": at}


# --- The hook on every call context -------------------------------------------------------------


def contact_variables(contact: dict) -> dict:
    """The contact's name is a variable too ({{name}}), unless a CSV column already set one."""
    return {**({"name": contact["name"]} if contact.get("name") else {}), **(contact.get("variables") or {})}


def tag(ctx: dict):
    """A campaign call: hand its contact's variables to the call (`ctx["variables"]`) and link the
    voice_calls document. Runs in a worker thread (product.phone_call), so the database may be read:
    a call another process placed (the other slot of a deploy) is found there."""
    doc = ctx.get("doc") or {}
    if doc.get("channel") != "PHONE" or doc.get("direction") != "OUTBOUND":
        return
    contact_id = DIALING.get((str(doc.get("numberId")), str(doc.get("to") or "")))
    info = INFLIGHT.get(contact_id) if contact_id else None
    if not info:
        info = _placed_elsewhere(doc.get("numberId"), str(doc.get("to") or ""))
        if not info:
            return
    info["streamed"] = True
    variables = dict(info.get("variables") or {})
    ctx["variables"] = variables
    doc.update(campaignId=info["campaign_id"], campaignContactId=info["contact_id"], variables=variables)


def _placed_elsewhere(number_id, phone: str) -> dict | None:
    """The contact another process is calling on this number, marked as streamed (here)."""
    if not number_id or not phone:
        return None
    try:
        contact = product.db().voice_campaign_contacts.find_one_and_update(
            {"status": CALLING, "numberId": number_id, "phone": phone, "streamedAt": None},
            {"$set": {"streamedAt": now()}}, sort=[("dialedAt", -1)], return_document=ReturnDocument.AFTER)
    except Exception as e:
        logger.error(f"campaigns: could not look up a call to {phone}: {e!r}")
        return None
    if not contact:
        return None
    return {"contact_id": contact["_id"], "campaign_id": contact["campaignId"], "variables": contact_variables(contact)}


# --- The runner ---------------------------------------------------------------------------------


class Runner:
    """One process's scheduler. `dial(number_id, to, agent_id) -> (status, body)` places a call;
    `room()` is how many more calls the engine takes; `suppressed()` the do-not-call numbers;
    `draining()` true once the process is stopping."""

    def __init__(self, db, dial, room, suppressed, clock=now, owner: str = PROCESS_ID, draining=lambda: False):
        self.db, self.dial, self.room, self.suppressed, self.clock, self.owner = db, dial, room, suppressed, clock, owner
        self.draining = draining
        self.inflight = INFLIGHT if owner == PROCESS_ID else {}
        self.dialing = DIALING if owner == PROCESS_ID else {}
        self.provider_failures: dict[str, int] = {}

    # -- one pass --

    async def tick(self):
        at = self.clock()
        await asyncio.to_thread(self._renew, at)
        await asyncio.to_thread(self._settle_mine, at)
        await asyncio.to_thread(self._settle_orphans, at)
        if self.draining():  # dial nobody; the other slot takes the campaigns now, not when the leases run out
            await asyncio.to_thread(self.db.voice_campaigns.update_many, {"runner.owner": self.owner}, {"$set": {"runner": None}})
            return
        for campaign in await asyncio.to_thread(self._running, at):
            try:
                await self._run_campaign(campaign)
            except Exception as e:
                logger.exception(f"campaign {campaign['_id']}: {e}")
        await asyncio.to_thread(self._complete, at)

    def _renew(self, at: datetime):
        until = at + timedelta(seconds=LEASE_SECS)
        if self.inflight:
            ids = [product.oid(cid) for cid in self.inflight]
            self.db.voice_campaign_contacts.update_many(
                {"_id": {"$in": ids}, "status": CALLING, "lease.owner": self.owner}, {"$set": {"lease.until": until}})

    def _running(self, at: datetime) -> list[dict]:
        """RUNNING campaigns this process drives this tick: their lease is free, expired or ours."""
        held = []
        for campaign in self.db.voice_campaigns.find({"status": RUNNING}, {"_id": 1}):
            doc = self.db.voice_campaigns.find_one_and_update(
                {"_id": campaign["_id"], "status": RUNNING,
                 "$or": [{"runner": None}, {"runner.until": {"$lt": at}}, {"runner.owner": self.owner}]},
                {"$set": {"runner": {"owner": self.owner, "until": at + timedelta(seconds=LEASE_SECS)}}},
                return_document=ReturnDocument.AFTER)
            if doc:
                held.append(doc)
        return held

    # -- settling --

    def _find_call(self, contact: dict) -> dict | None:
        """The voice_calls document of the contact's current attempt: tagged by tag(), or one
        written without a context (an unanswered Twilio / VoiceLink call) to the same person."""
        since = aware(contact.get("dialedAt")) - timedelta(seconds=5)
        seen = {"$nin": contact.get("callIds") or []}  # earlier attempts' calls
        tagged = self.db.voice_calls.find_one(
            {"campaignContactId": contact["_id"], "endedAt": {"$gte": since}, "_id": seen}, sort=[("endedAt", 1)])
        if tagged:
            return tagged
        if not contact.get("numberId"):
            return None
        return self.db.voice_calls.find_one(
            {"numberId": contact["numberId"], "direction": "OUTBOUND", "to": contact["phone"],
             "endedAt": {"$gte": since}, "campaignContactId": None, "_id": seen}, sort=[("endedAt", 1)])

    def _settle(self, contact: dict, ended_by: str, call: dict | None, at: datetime, error: str | None = None):
        campaign = self.db.voice_campaigns.find_one({"_id": contact["campaignId"]}) or {}
        fields = next_step(contact, campaign, ended_by, at)
        fields.update(lease=None, lastError=error)
        update: dict = {"$set": fields}
        if call:
            fields["lastCallId"] = call["_id"]
            if booked(call):
                fields["booked"] = True
            update["$addToSet"] = {"callIds": call["_id"]}
            if call.get("campaignContactId") is None:
                self.db.voice_calls.update_one({"_id": call["_id"]}, {"$set": {
                    "campaignId": contact["campaignId"], "campaignContactId": contact["_id"],
                    "variables": contact.get("variables") or {}}})
        done = self.db.voice_campaign_contacts.update_one({"_id": contact["_id"], "status": CALLING}, update)
        cid = str(contact["_id"])
        info = self.inflight.pop(cid, None)
        if info:
            self.dialing.pop((info["number_id"], info["phone"]), None)
        if done.modified_count:
            logger.info(f"campaign {contact['campaignId']}: {contact['phone']} {ended_by} -> {fields['status']}"
                        f"{' (booked)' if fields.get('booked') else ''}"
                        f"{' retry at ' + fields['nextAttemptAt'].isoformat() if fields.get('nextAttemptAt') else ''}")

    def _settle_mine(self, at: datetime):
        for cid, info in list(self.inflight.items()):
            contact = self.db.voice_campaign_contacts.find_one({"_id": product.oid(cid)})
            if not contact or contact.get("status") != CALLING:
                self.inflight.pop(cid, None)
                self.dialing.pop((info["number_id"], info["phone"]), None)
                continue
            call = self._find_call(contact)
            waited = (at - info["dialed_at"]).total_seconds()
            if call:
                self._settle(contact, call.get("endedBy") or "", call, at)
            elif not (info.get("streamed") or contact.get("streamedAt")) and waited > NO_STREAM_SECS:
                self._settle(contact, "not_connected", None, at, "No word from the phone provider about this call")
            elif waited > MAX_CALL_SECS:
                self._settle(contact, INTERRUPTED, None, at, "The call's record never arrived")

    def _settle_orphans(self, at: datetime):
        """Calls another process placed and stopped renewing (or this one, before a restart)."""
        for contact in self.db.voice_campaign_contacts.find(
                {"status": CALLING, "lease.until": {"$lt": at}, "lease.owner": {"$ne": self.owner}}).limit(200):
            call = self._find_call(contact) if contact.get("dialedAt") else None
            if call:
                self._settle(contact, call.get("endedBy") or "", call, at)
                continue
            dialed = aware(contact.get("dialedAt")) or at
            lease_end = aware((contact.get("lease") or {}).get("until")) or at
            if (at - max(dialed, lease_end)).total_seconds() > ORPHAN_SECS:
                self._settle(contact, INTERRUPTED, None, at, "The engine restarted during this call")

    def _complete(self, at: datetime):
        for campaign in self.db.voice_campaigns.find({"status": RUNNING, "runner.owner": self.owner}, {"_id": 1}):
            left = self.db.voice_campaign_contacts.count_documents(
                {"campaignId": campaign["_id"], "status": {"$in": [PENDING, CALLING]}}, limit=1)
            if not left:
                done = self.db.voice_campaigns.update_one(
                    {"_id": campaign["_id"], "status": RUNNING},
                    {"$set": {"status": COMPLETED, "completedAt": at, "updatedAt": at, "runner": None}})
                if done.modified_count:
                    logger.info(f"campaign {campaign['_id']}: completed")

    # -- dialling --

    def _pause(self, campaign: dict, reason: str):
        at = self.clock()
        self.db.voice_campaigns.update_one(
            {"_id": campaign["_id"], "status": RUNNING},
            {"$set": {"status": PAUSED, "lastError": reason, "updatedAt": at, "runner": None}})
        logger.warning(f"campaign {campaign['_id']}: paused: {reason}")

    def _skip_dnc(self, campaign: dict, at: datetime):
        numbers = list(self.suppressed())
        if numbers:
            skipped = self.db.voice_campaign_contacts.update_many(
                {"campaignId": campaign["_id"], "status": PENDING, "phone": {"$in": numbers}},
                {"$set": {"status": SKIPPED_DNC, "nextAttemptAt": None, "finishedAt": at, "updatedAt": at,
                          "lastOutcome": "dnc_list"}})
            if skipped.modified_count:
                logger.info(f"campaign {campaign['_id']}: {skipped.modified_count} on the do-not-call list, skipped")

    def _free_slots(self, campaign: dict) -> int:
        coll = self.db.voice_campaign_contacts
        mine = coll.count_documents({"campaignId": campaign["_id"], "status": CALLING})
        on_number = coll.count_documents({"numberId": campaign["numberId"], "status": CALLING})
        not_yet_live = sum(1 for i in self.inflight.values() if not i.get("streamed"))
        engine = self.room() - INBOUND_RESERVE - not_yet_live
        return min(int(campaign.get("maxConcurrent") or 1) - mine, NUMBER_MAX_CONCURRENT - on_number, engine)

    def _claim(self, campaign: dict, at: datetime) -> dict | None:
        if not self.db.voice_campaigns.count_documents({"_id": campaign["_id"], "status": RUNNING}, limit=1):
            return None  # paused or cancelled since this tick began
        return self.db.voice_campaign_contacts.find_one_and_update(
            {"campaignId": campaign["_id"], "status": PENDING,
             "$or": [{"nextAttemptAt": None}, {"nextAttemptAt": {"$lte": at}}]},
            {"$set": {"status": CALLING, "dialedAt": at, "numberId": campaign["numberId"], "streamedAt": None,
                      "lease": {"owner": self.owner, "until": at + timedelta(seconds=LEASE_SECS)},
                      "lastError": None, "updatedAt": at},
             "$inc": {"attempts": 1}},
            sort=[("nextAttemptAt", 1), ("row", 1)], return_document=ReturnDocument.AFTER)

    def _release(self, contact: dict, at: datetime, error: str | None = None):
        """Back to the queue as it was: the attempt never happened."""
        self.db.voice_campaign_contacts.update_one(
            {"_id": contact["_id"], "status": CALLING},
            {"$set": {"status": PENDING, "lease": None, "updatedAt": at, "lastError": error},
             "$inc": {"attempts": -1}})

    def _finish_unplaced(self, contact: dict, status: str, outcome: str, error: str | None, at: datetime):
        self.db.voice_campaign_contacts.update_one(
            {"_id": contact["_id"], "status": CALLING},
            {"$set": {"status": status, "lease": None, "lastOutcome": outcome, "lastError": error,
                      "nextAttemptAt": None, "finishedAt": at, "updatedAt": at},
             **({"$inc": {"attempts": -1}} if status == SKIPPED_DNC else {})})

    async def _run_campaign(self, campaign: dict):
        at = self.clock()
        await asyncio.to_thread(self._skip_dnc, campaign, at)
        if not in_window(campaign.get("window"), at):
            return
        free = await asyncio.to_thread(self._free_slots, campaign)
        cid = str(campaign["_id"])
        suppressed = None
        while free > 0:
            contact = await asyncio.to_thread(self._claim, campaign, self.clock())
            if not contact:
                return
            if suppressed is None:
                suppressed = set(self.suppressed())
            if contact["phone"] in suppressed:
                await asyncio.to_thread(self._finish_unplaced, contact, SKIPPED_DNC, "dnc_list", None, self.clock())
                continue
            key = (str(campaign["numberId"]), contact["phone"])
            if key in self.dialing:  # this person is on the line from this number already (another campaign)
                await asyncio.to_thread(self._release, contact, self.clock())
                return
            info = {"contact_id": contact["_id"], "campaign_id": campaign["_id"], "number_id": key[0],
                    "phone": contact["phone"], "variables": contact_variables(contact),
                    "dialed_at": aware(contact["dialedAt"]), "streamed": False}
            self.inflight[str(contact["_id"])], self.dialing[key] = info, str(contact["_id"])
            try:
                status, body = await self.dial(key[0], contact["phone"], str(campaign["agentId"]))
            except Exception as e:
                status, body = 503, {"error": f"the engine could not place the call: {e!r}"}
            error = str((body or {}).get("error") or "") or None
            at = self.clock()
            if status == 200:
                self.provider_failures.pop(cid, None)
                await asyncio.to_thread(self.db.voice_campaign_contacts.update_one, {"_id": contact["_id"]},
                                        {"$set": {"providerCallId": (body or {}).get("callId")}})
                logger.info(f"campaign {cid}: dialling {contact['phone']} (attempt {contact['attempts']})")
                free -= 1
                continue
            self.inflight.pop(str(contact["_id"]), None)
            self.dialing.pop(key, None)
            logger.warning(f"campaign {cid}: {contact['phone']}: /calls {status} {error}")
            if status == 409 and error and "asked not to be called" in error:
                await asyncio.to_thread(self._finish_unplaced, contact, SKIPPED_DNC, "dnc_list", None, at)
            elif status == 400:
                await asyncio.to_thread(self._finish_unplaced, contact, FAILED, "invalid_number", error, at)
            elif status == 503:  # the engine is full, or its database blinked: try again next tick
                await asyncio.to_thread(self._release, contact, at)
                return
            elif status in (401, 404, 409):  # the number or agent cannot place calls: nothing else will work
                await asyncio.to_thread(self._release, contact, at)
                await asyncio.to_thread(self._pause, campaign, error or f"The engine refused the call (HTTP {status})")
                return
            else:  # the provider refused this call
                await asyncio.to_thread(self._finish_unplaced, contact, FAILED, "failed", error, at)
                failures = self.provider_failures[cid] = self.provider_failures.get(cid, 0) + 1
                if failures >= MAX_PROVIDER_FAILURES:
                    self.provider_failures.pop(cid, None)
                    await asyncio.to_thread(self._pause, campaign,
                                            f"{failures} calls in a row were refused. Last reason: {error}")
                    return


# --- Wiring into the engine ---------------------------------------------------------------------


def suppressed_numbers() -> set[str]:
    """Every number on the do-not-call list (bot.SUPPRESSED, the same file is_suppressed reads)."""
    import json

    from bot import SUPPRESSED, normalize_number

    if not SUPPRESSED.exists():
        return set()
    out = set()
    for line in SUPPRESSED.read_text().splitlines():
        try:
            number = normalize_number(json.loads(line).get("number"))
        except ValueError:
            continue
        if number:
            out.add(number)
    return out


def enabled() -> bool:
    return (os.getenv("CAMPAIGNS", "on").lower() not in ("off", "0", "false")
            and bool(product.setting("MONGODB_URI") and product.setting("MONGODB_DB_NAME")))


async def _loop(runner: Runner):
    logger.info(f"campaigns: runner {runner.owner} started (tick {TICK_SECS}s)")
    while True:
        try:
            await runner.tick()
        except asyncio.CancelledError:
            raise
        except Exception as e:  # the database blinked: the next tick tries again
            logger.error(f"campaigns: tick failed: {e!r}")
        await asyncio.sleep(TICK_SECS)


def install(app, room, draining=lambda: False):
    """Runs the campaign loop for as long as the app runs. Calls are placed through the app's
    own POST /calls, in process (no network): the same checks, providers and limits."""
    import httpx

    from bot import VOICELAB_KEY

    async def dial(number_id: str, to: str, agent_id: str):
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://engine.internal", timeout=60) as client:
            r = await client.post("/calls", json={"numberId": number_id, "to": to, "agentId": agent_id},
                                  headers={"Authorization": f"Bearer {VOICELAB_KEY}"})
        try:
            body = r.json()
        except ValueError:
            body = {"error": r.text[:300]}
        return r.status_code, body

    previous = app.router.lifespan_context

    @asynccontextmanager
    async def lifespan(a):
        async with previous(a) as state:
            task = None
            if enabled():
                task = asyncio.create_task(_loop(Runner(product.db(), dial, room, suppressed_numbers, draining=draining)))
            else:
                logger.info("campaigns: runner off (CAMPAIGNS=off or no MONGODB_URI / MONGODB_DB_NAME)")
            try:
                yield state
            finally:
                if task:
                    task.cancel()

    app.router.lifespan_context = lifespan
