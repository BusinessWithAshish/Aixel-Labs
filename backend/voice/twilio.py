"""Twilio (a customer's own account): the call's TwiML, its media stream, the REST calls, its status callbacks.

A customer's Twilio number plays the part a Telnyx number does. What differs, and shapes this module:

- A call coming in: Twilio POSTs the number's Voice URL (`/twiml?n=&sig=`, set by the app) and we
  answer `<Connect><Stream>`. Twilio does NOT pass a query string on to a `<Connect><Stream>` URL, so
  everything the stream needs (number, direction, callee, a signed token) rides in `<Parameter>`s and
  arrives on the stream's `start` message as `customParameters`: the socket is accepted first and
  checked on `start`.
- A call we place: `POST /Calls.json` with inline TwiML (the same `<Connect><Stream>`). There is no
  connect-while-ringing: Twilio runs the TwiML only once the call is answered, so the stream opens at
  pickup (her opener is made while the callee says hello, as on VoiceLink). Calls nobody answered never
  open a stream: the status callback (`/twilio-events`) is where we hear of them.
- Audio is G.711 mu-law 8 kHz both ways (Pipecat's TwilioFrameSerializer). Hang-up is a REST call
  (`Status=completed`) with the customer's credentials; closing the socket also ends the call, since
  nothing follows `<Connect>` in our TwiML.
- Credentials: an API key (SK… + secret, recommended) or the account's Auth Token, sealed in
  `apiKeySealed`; the Account SID and the key SID are on the number (`twilio.accountSid` /
  `twilio.apiKeySid`). Twilio's request signature (X-Twilio-Signature) can only be checked with the
  Auth Token, so it is checked when that is what we hold; our own URL signature is checked always.

`TWILIO_API_BASE` points every REST call here (and the hang-up) at a fake in tests.
"""

import asyncio
import base64
import hashlib
import hmac
import json
from xml.sax.saxutils import quoteattr

import aiohttp
from loguru import logger

from pipecat.frames.frames import CancelWorkerFrame, Frame
from pipecat.serializers.twilio import TwilioFrameSerializer

import product

DEFAULT_API_BASE = "https://api.twilio.com"
# How long the stream token of a call we place stays good: Twilio may queue a call before it rings
# (accounts default to one call per second), then it rings for up to RING_SECS before the stream opens.
OUT_TOKEN_TTL = 600
# CallStatus of a call we placed that never reached anyone -> endedBy (the app has words for these).
UNANSWERED = {"no-answer": "no_answer", "busy": "busy", "failed": "failed", "canceled": "no_answer"}


def api_base() -> str:
    return (product.setting("TWILIO_API_BASE") or DEFAULT_API_BASE).rstrip("/")


def creds_of(number: dict, secret: str) -> dict:
    """How to call Twilio as the number's owner. `secret` is the opened `apiKeySealed`."""
    state = number.get("twilio") or {}
    key_sid = state.get("apiKeySid") or None
    return {
        "account_sid": state.get("accountSid") or "",
        "user": key_sid or state.get("accountSid") or "",
        "secret": secret,
        # Only the Auth Token signs Twilio's requests; with an API key there is nothing to check them with.
        "auth_token": None if key_sid else secret,
    }


def _auth(creds: dict) -> aiohttp.BasicAuth:
    return aiohttp.BasicAuth(creds["user"], creds["secret"])


def account_url(creds: dict, rest: str) -> str:
    return f"{api_base()}/2010-04-01/Accounts/{creds['account_sid']}{rest}"


async def api_post(creds: dict, rest: str, form: list[tuple[str, str]]) -> tuple[int, str]:
    """POST a form to the customer's account (`rest` is the path after /Accounts/{AC}). Raises when unreachable."""
    async with aiohttp.ClientSession() as session:
        async with session.post(account_url(creds, rest), data=form, auth=_auth(creds),
                                timeout=aiohttp.ClientTimeout(total=15)) as r:
            return r.status, await r.text()


def reason(status: int, text: str) -> str:
    """Twilio's own words for a refusal ("The number +1... is unverified. Trial accounts may only make calls to verified numbers.")."""
    try:
        body = json.loads(text)
        code, message = body.get("code"), (body.get("message") or "").strip()
    except (ValueError, AttributeError):
        code, message = None, ""
    if code == 20003 or status == 401:
        return "it rejected the number's credentials (reconnect the number with a working API key)"
    return message or f"HTTP {status}"


def stream_parts(number_id: str, out: bool, agent_id: str, callee: str) -> tuple:
    """What a Twilio stream's token signs (bot.make_token): whose number, which way, which agent, who."""
    return ("twilio", number_id or "", "out" if out else "in", agent_id or "", callee or "")


def call_form(to: str, from_: str, twiml: str, status_url: str, timeout: int) -> list[tuple[str, str]]:
    """`POST /Calls.json`: ring `to` from the customer's number and run `twiml` once answered.
    The status callback hears every step, so a call nobody answered still gets its record."""
    return [("To", to), ("From", from_), ("Twiml", twiml), ("Timeout", str(timeout)),
            ("StatusCallback", status_url), ("StatusCallbackMethod", "POST"),
            *[("StatusCallbackEvent", e) for e in ("initiated", "ringing", "answered", "completed")]]


# --- TwiML ---------------------------------------------------------------------------------------------

def stream_twiml(url: str, params: dict) -> str:
    """`<Connect><Stream>` to `url`, with `params` as `<Parameter>`s (Twilio drops a stream URL's query string).
    Nothing follows `<Connect>`, so the call ends when the stream does."""
    lines = "".join(f"\n      <Parameter name={quoteattr(k)} value={quoteattr(str(v))} />" for k, v in params.items())
    return (f'<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n  <Connect>\n    <Stream url={quoteattr(url)}>{lines}\n'
            f"    </Stream>\n  </Connect>\n</Response>\n")


REJECT = '<?xml version="1.0" encoding="UTF-8"?><Response><Reject /></Response>'


# --- Twilio's request signature ------------------------------------------------------------------------

def signature(auth_token: str, url: str, params: dict) -> str:
    """X-Twilio-Signature: base64(HMAC-SHA1(auth token, url + every POST param's name and value, sorted by name))."""
    data = url + "".join(k + params[k] for k in sorted(params))
    return base64.b64encode(hmac.new(auth_token.encode(), data.encode(), hashlib.sha1).digest()).decode()


def signature_ok(auth_token: str, header: str | None, urls: list[str], params: dict) -> bool:
    """True when the header matches the signature of any of `urls` (the public URL Twilio called, as
    we wrote it, and as this server saw it): Cloudflare in front of us may change how the URL looks."""
    if not header:
        return False
    return any(hmac.compare_digest(signature(auth_token, u, params), header) for u in dict.fromkeys(urls))


def public_urls(request, public_host: str) -> list[str]:
    """The URLs Twilio may have signed: https://<public host><path>?<query>, then this request's own."""
    query = request.url.query
    return [f"https://{public_host}{request.url.path}{'?' + query if query else ''}", str(request.url)]


# --- The media stream -----------------------------------------------------------------------------------

class TwilioSerializer(TwilioFrameSerializer):
    """Pipecat's Twilio serializer, with what a customer's call needs on top:

    - the ids are bound late (`bind`), from the stream's `start` (the line can be built before it);
    - the hang-up uses the customer's credentials, an API key or the Auth Token, at TWILIO_API_BASE
      (Pipecat's own sends the account SID as the user, which an API key cannot use);
    - Twilio's `stop` (the call is over) ends the pipeline at once, without a hang-up request;
    - a malformed message is skipped instead of ending the call.
    """

    def __init__(self, creds: dict):
        super().__init__(stream_sid="pending", call_sid="pending", account_sid=creds["account_sid"] or "pending",
                         auth_token=creds["secret"] or "pending")
        self._creds = creds

    def bind(self, start: dict) -> None:
        self._stream_sid = start.get("streamSid") or ""
        self._call_sid = start.get("callSid") or ""

    def auto_hang_up(self, on: bool) -> None:
        self._params.auto_hang_up = on

    async def _hang_up_call(self):
        call_sid = self._call_sid
        try:
            status, text = await api_post(self._creds, f"/Calls/{call_sid}.json", [("Status", "completed")])
        except Exception as e:
            logger.error(f"twilio: could not hang up call {call_sid}: {e!r}")
            return
        if status < 300:
            logger.info(f"twilio: hung up call {call_sid}")
        elif status == 404:
            logger.debug(f"twilio: call {call_sid} was already over")
        else:
            logger.error(f"twilio: hang-up of {call_sid} refused: HTTP {status} {text[:200]}")

    async def deserialize(self, data: str | bytes) -> Frame | None:
        try:
            message = json.loads(data)
        except (TypeError, ValueError):
            return None
        if not isinstance(message, dict):
            return None
        if message.get("event") == "stop":
            logger.info(f"twilio: stop for call {self._call_sid}")
            self._hangup_attempted = True  # the call is already over: nothing to hang up
            return CancelWorkerFrame(reason="caller_hung_up")
        try:
            return await super().deserialize(data)
        except (KeyError, TypeError, ValueError):
            return None


async def start_recording(creds: dict, call_sid: str):
    """Record the call in the customer's own account, both sides on their own channel (caller, agent)."""
    try:
        status, text = await api_post(creds, f"/Calls/{call_sid}/Recordings.json",
                                      [("RecordingChannels", "dual"), ("RecordingTrack", "both")])
        logger.info(f"twilio: recording for {call_sid}: HTTP {status} {text[:200]}")
    except Exception as e:
        logger.error(f"twilio: could not start recording {call_sid}: {e!r}")


# --- Status callbacks (calls we placed) ------------------------------------------------------------------

# CallSid -> when it started ringing (UTC), for the record of a call nobody answered.
RANG: dict[str, object] = {}
# CallSids whose media stream reached us: those write their own document when they end.
STREAMED: set[str] = set()
LOOKS = (0, 4, 15)
_TASKS: set = set()


def handle_status(number_id: str, agent_id: str, form: dict) -> None:
    """Take a status callback in the background, so Twilio gets its 200 at once."""
    task = asyncio.create_task(_handle(number_id, agent_id, form))
    _TASKS.add(task)
    task.add_done_callback(_TASKS.discard)


async def _handle(number_id: str, agent_id: str, form: dict):
    call_sid, status = form.get("CallSid") or "", (form.get("CallStatus") or "").lower()
    logger.info(f"twilio-events: {status} number {number_id} call {call_sid} {form.get('ErrorCode') or ''}")
    if not call_sid:
        return
    if status in ("initiated", "ringing", "queued"):
        RANG.setdefault(call_sid, product.now())
        return
    if status in UNANSWERED:
        await asyncio.to_thread(_write_unanswered, number_id, agent_id, form, UNANSWERED[status])
    elif status == "completed" and call_sid not in STREAMED:
        # Answered but our stream never opened (a trial account's key press nobody made, a refused
        # socket): no document is coming from a call, so this is the record. Looked for a while first:
        # the stream's own document is written when its socket closes, which can be after this.
        for i, wait in enumerate(LOOKS):
            await asyncio.sleep(wait)
            if call_sid in STREAMED or await asyncio.to_thread(_has_doc, call_sid):
                break
            if i == len(LOOKS) - 1:
                await asyncio.to_thread(_write_unanswered, number_id, agent_id, form, "not_connected")
    if status in ("completed", *UNANSWERED):
        RANG.pop(call_sid, None)
        STREAMED.discard(call_sid)


def _has_doc(call_sid: str) -> bool:
    return product.db().voice_calls.count_documents({"providerCallId": call_sid}, limit=1) > 0


def _write_unanswered(number_id: str, agent_id: str, form: dict, ended_by: str):
    """The record of a call we placed whose stream never opened. Once per CallSid (Twilio retries)."""
    db = product.db()
    call_sid = form.get("CallSid")
    if _has_doc(call_sid):
        return
    number = product.find_number(number_id)
    if not number:
        logger.warning(f"twilio-events: number {number_id} is gone, ignoring call {call_sid}")
        return
    agent = db.voice_agents.find_one({"_id": product.oid(agent_id), "userId": number["userId"]}) if product.oid(agent_id) else None
    if not agent:
        logger.warning(f"twilio-events: call {call_sid}: agent {agent_id} is gone, no record")
        return
    ended = product.now()
    rang = RANG.get(call_sid)
    doc = {
        "tenantId": number["tenantId"],
        "userId": number["userId"],
        "agentId": agent["_id"],
        "numberId": number["_id"],
        "channel": "PHONE",
        "direction": "OUTBOUND",
        "from": number["phoneNumber"],
        "to": form.get("To") or form.get("Called") or None,
        "voice": (agent.get("voice") or "").lower(),
        "startedAt": rang if rang and rang <= ended else ended,
        "endedAt": ended,
        "durationSec": 0,
        "endedBy": ended_by,
        "flags": [],
        "turns": [],
        "gapsMs": [],
        "providerCallId": call_sid,
    }
    if not doc["to"]:
        doc.pop("to")
    result = db.voice_calls.insert_one(doc)
    logger.info(f"voice_calls {result.inserted_id} written (PHONE OUTBOUND, {ended_by}, Twilio {form.get('CallStatus')})")

