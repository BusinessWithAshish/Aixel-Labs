"""VoiceLink (voicelink.co.in, Indian numbers): its media stream, its outbound-call API, its webhooks.

A customer's VoiceLink number plays the part a Telnyx number does, with three differences
that shape everything here:

- One WebSocket per call, opened by VoiceLink only once the call is answered (no stream
  while an outbound call rings). The audio is G.711 A-law at 8 kHz on live calls, whatever
  the bot was configured with; the "start" message is the only truth, so the codec is read
  from it per call. There is no hang-up API: we end a call by closing the socket.
- Calls are placed with `POST /v1/add_lead`, through an Indian proxy: the API refuses
  connections from outside India (VOICELINK_PROXY_URL; empty = direct).
- A call nobody answered never opens the socket. The `call.completed` webhook is the only
  place we hear of it, and it is also where the recording link arrives.

Wire facts were checked against VoiceLink's docs and the MIT voicelink-sdk (written against
live calls); neither is a dependency.
"""

import asyncio
import base64
import json
import re
from datetime import timedelta

import aiohttp
from loguru import logger
from yarl import URL

from pipecat.audio.utils import (
    alaw_to_pcm,
    create_stream_resampler,
    pcm_to_alaw,
    pcm_to_ulaw,
    ulaw_to_pcm,
)
from pipecat.frames.frames import AudioRawFrame, CancelWorkerFrame, Frame, InputAudioRawFrame, InterruptionFrame
from pipecat.serializers.base_serializer import FrameSerializer

import product

DEFAULT_API_BASE = "https://app.voicelink.co.in/api"


def api_base() -> str:
    return (product.setting("VOICELINK_API_BASE") or DEFAULT_API_BASE).rstrip("/")


# --- The media stream ------------------------------------------------------------------------------

# media_format.encoding (with or without "audio/") and sample_rate -> how to decode it.
CODECS = {
    ("alaw", 8000): "alaw", ("pcma", 8000): "alaw",
    ("ulaw", 8000): "ulaw", ("mulaw", 8000): "ulaw", ("pcmu", 8000): "ulaw",
    ("l16", 8000): "l16", ("l16", 16000): "l16", ("pcm", 8000): "l16", ("pcm", 16000): "l16",
}


def codec_of(media_format: dict | None) -> tuple[str, int]:
    """The call's codec and rate from its start message. sample_rate arrives as a string."""
    media_format = media_format or {}
    name = str(media_format.get("encoding") or "audio/alaw").strip().lower().removeprefix("audio/").removeprefix("x-")
    try:
        rate = int(media_format.get("sample_rate") or 8000)
    except (TypeError, ValueError):
        rate = 8000
    kind = CODECS.get((name, rate))
    if not kind:
        # Every live call so far has been A-law 8 kHz; dropping a real caller would be worse.
        logger.error(f"voicelink: unknown media_format {media_format!r}, decoding it as A-law 8 kHz")
        return "alaw", 8000
    return kind, rate


class VoiceLinkSerializer(FrameSerializer):
    """VoiceLink's JSON media messages <-> Pipecat audio frames.

    In: `media` (the caller, track "inbound"; anything else is an echo of us), `stop`.
    Out: `media` and, on barge-in, `clear`. Both spellings of the stream id go out on
    every message, because VoiceLink itself uses both (`stream_sid` on start,
    `streamSid` on media and stop) and which one it reads is not documented.
    Nothing is sent before `start()` has been given the call's start message.
    """

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.stream_sid: str | None = None
        self.call_sid: str | None = None
        self.codec, self.rate = "alaw", 8000
        self._sample_rate = 0  # the pipeline's input rate, from setup()
        self._in = create_stream_resampler(clear_after_secs=self._params.resampler_clear_after_secs)
        self._out = create_stream_resampler(clear_after_secs=self._params.resampler_clear_after_secs)

    async def setup(self, setup):
        self._sample_rate = setup.audio_in_sample_rate

    def start(self, message: dict) -> dict:
        """Read the call's ids and codec from its start message; returns the inner `start` block."""
        start = message.get("start") or {}
        self.stream_sid = str(start.get("stream_sid") or message.get("stream_sid") or message.get("streamSid") or "")
        self.call_sid = str(start.get("call_sid") or start.get("callSid") or "")
        self.codec, self.rate = codec_of(start.get("media_format"))
        logger.info(f"voicelink: call {self.call_sid} streams {self.codec} @ {self.rate} Hz")
        return start

    async def deserialize(self, data: str | bytes) -> Frame | None:
        # Anything malformed is skipped: an exception here would end the caller's call.
        try:
            message = json.loads(data)
        except (TypeError, ValueError):
            return None
        event = message.get("event") if isinstance(message, dict) else None
        if event == "media":
            media = message.get("media") or {}
            if (media.get("track") or "inbound") != "inbound":
                return None
            try:
                raw = base64.b64decode(media.get("payload") or "")
            except ValueError:
                return None
            if self.codec == "alaw":
                pcm = await alaw_to_pcm(raw, self.rate, self._sample_rate, self._in)
            elif self.codec == "ulaw":
                pcm = await ulaw_to_pcm(raw, self.rate, self._sample_rate, self._in)
            else:
                pcm = await self._in.resample(raw, self.rate, self._sample_rate)
            return InputAudioRawFrame(audio=pcm, num_channels=1, sample_rate=self._sample_rate) if pcm else None
        if event == "start":  # a second start: the codec may have changed
            self.start(message)
        elif event == "stop":
            # The caller hung up. The socket usually closes next, but the call must not
            # depend on it: end it here.
            logger.info(f"voicelink: stop for call {self.call_sid}")
            return CancelWorkerFrame(reason="caller_hung_up")
        return None

    async def serialize(self, frame: Frame) -> str | bytes | None:
        if not self.stream_sid:
            return None
        if isinstance(frame, InterruptionFrame):
            return self._message({"event": "clear"})
        if isinstance(frame, AudioRawFrame):
            if self.codec == "alaw":
                wire = await pcm_to_alaw(frame.audio, frame.sample_rate, self.rate, self._out)
            elif self.codec == "ulaw":
                wire = await pcm_to_ulaw(frame.audio, frame.sample_rate, self.rate, self._out)
            else:
                wire = await self._out.resample(frame.audio, frame.sample_rate, self.rate)
            if not wire:
                return None
            return self._message({"event": "media", "media": {"payload": base64.b64encode(wire).decode()}})
        # EndFrame / CancelFrame: nothing to send. The transport closes the socket right
        # after, and that is VoiceLink's hang-up.
        return None

    def _message(self, message: dict) -> str:
        message["stream_sid"] = message["streamSid"] = self.stream_sid
        return json.dumps(message)


# --- Numbers --------------------------------------------------------------------------------------

def e164(number) -> str | None:
    """+<digits> for a number as VoiceLink writes it: 91XXXXXXXXXX, 0XXXXXXXXXX, XXXXXXXXXX or +91...

    A bare 10-digit number or a 0-prefixed one is Indian (VoiceLink is an Indian carrier).
    """
    text = str(number or "").strip()
    digits = re.sub(r"\D", "", text)
    if len(digits) < 7:
        return None
    if not text.startswith("+"):
        if len(digits) == 10:
            return "+91" + digits
        if len(digits) == 11 and digits[0] == "0":
            return "+91" + digits[1:]
    return "+" + digits


def last10(number) -> str:
    return re.sub(r"\D", "", str(number or ""))[-10:]


def split_number(number: str) -> tuple[str, str] | None:
    """An E.164 number as (country code, national number), which add_lead needs apart.

    The full international number with no country_code fails at VoiceLink with
    "38 - Network out of order". Country codes are prefix-free (ITU E.164): 1 and 7 are one
    digit, the two-digit ones are listed below, every other code is three digits.
    """
    digits = re.sub(r"\D", "", number or "")
    if len(digits) < 8:
        return None
    if digits[0] in "17":
        size = 1
    elif digits[:2] in TWO_DIGIT_CODES:
        size = 2
    else:
        size = 3
    return digits[:size], digits[size:]


TWO_DIGIT_CODES = set(
    "20 27 30 31 32 33 34 36 39 40 41 43 44 45 46 47 48 49 51 52 53 54 55 56 57 58 "
    "60 61 62 63 64 65 66 81 82 84 86 90 91 92 93 94 95 98".split()
)


# --- The REST API (outbound calls) ------------------------------------------------------------------

class VoiceLinkError(Exception):
    """VoiceLink answered, and said no. The message is VoiceLink's own."""


def _proxy() -> tuple[str | None, aiohttp.BasicAuth | None]:
    """VOICELINK_PROXY_URL as aiohttp wants it: the URL without credentials, and the credentials."""
    raw = product.setting("VOICELINK_PROXY_URL")
    if not raw:
        return None, None
    url = URL(raw)
    auth = aiohttp.BasicAuth(url.user or "", url.password or "") if url.user else None
    return str(url.with_user(None)), auth


async def api_post(path: str, token: str, body: dict) -> dict:
    """POST to VoiceLink as the customer (their API token); returns the unwrapped `data`.

    Raises VoiceLinkError when VoiceLink refuses, aiohttp/asyncio errors when it cannot be reached.
    """
    return await _request("POST", path, token, json=body)


async def api_get(path: str, token: str, params: dict) -> dict:
    """GET from VoiceLink as the customer, like api_post."""
    return await _request("GET", path, token, params=params)


async def _request(method: str, path: str, token: str, **kwargs) -> dict:
    proxy, proxy_auth = _proxy()
    async with aiohttp.ClientSession() as session:
        async with session.request(
            method,
            api_base() + path,
            headers={"Authorization": f"Bearer {token}", "Accept": "application/json"},
            proxy=proxy,
            proxy_auth=proxy_auth,
            timeout=aiohttp.ClientTimeout(total=20),
            **kwargs,
        ) as r:
            status, text = r.status, await r.text()
    try:
        payload = json.loads(text)
    except ValueError:
        payload = None
    # Errors come back as {"status": false, "message": ..., "errors"?: {...}}, sometimes with HTTP 200.
    if status >= 400 or (isinstance(payload, dict) and payload.get("status") is False):
        message = payload.get("message") if isinstance(payload, dict) else None
        if not isinstance(message, str) or not message:
            message = f"HTTP {status} {text[:200]}"
        if isinstance(payload, dict) and payload.get("errors"):
            message += " " + json.dumps(payload["errors"])[:300]
        raise VoiceLinkError(message)
    data = payload.get("data") if isinstance(payload, dict) and "data" in payload else payload
    return data if isinstance(data, dict) else {"data": data}


def lead_body(number: dict, agent_id: str, to: str, websocket_url: str, webhook_url: str) -> dict:
    """add_lead for one call from a customer's VoiceLink number to `to` (E.164)."""
    country, national = split_number(to)
    body = {
        "did_number": re.sub(r"\D", "", number["phoneNumber"]),
        "customer_number": national,
        "country_code": country,
        # A JSON string, not an object (VoiceLink stores malformed JSON as null). It comes
        # back on the start message and on webhooks, with VoiceLink's outboundQueueId added.
        "custom_parameters": json.dumps({"aixel_number": str(number["_id"]), "aixel_agent": agent_id}),
        "websocket_url": websocket_url,
        "webhook_url": webhook_url,
    }
    client_id = (number.get("voicelink") or {}).get("clientId")
    if client_id:
        body["client_id"] = client_id
    return body


# --- Webhooks ---------------------------------------------------------------------------------------

def custom_of(value) -> dict:
    """custom_parameters as a dict: VoiceLink hands them back as an object or as the JSON string we sent."""
    if isinstance(value, str):
        try:
            value = json.loads(value)
        except ValueError:
            return {}
    return value if isinstance(value, dict) else {}


def parse_event(body) -> dict | None:
    """One webhook, either shape: {event, call: {...}} (what live calls send) or the docs' flat one."""
    if not isinstance(body, dict) or not body.get("event"):
        return None
    call = body["call"] if isinstance(body.get("call"), dict) else body

    def pick(*keys):
        return next((call[k] for k in keys if call.get(k) not in (None, "")), None)

    custom = custom_of(pick("customParameters", "custom_parameters"))
    status = str(pick("callStatus", "call_status") or "").upper()
    try:
        duration = int(float(pick("durationSec", "duration") or 0))
    except (TypeError, ValueError):
        duration = 0
    try:
        rang = int(float(pick("ringDurationSec") or 0))
    except (TypeError, ValueError):
        rang = 0
    return {
        "event": str(body["event"]),
        "id": str(pick("id", "callId", "call_id", "call_sid") or ""),
        "direction": str(pick("direction") or "").lower(),
        "from": pick("from", "fromNumber"),
        "to": pick("to", "toNumber"),
        "status": status,
        "answered": status in ("ANSWER", "ANSWERED") or bool(pick("answeredAt")) or duration > 0,
        "duration": duration,
        "ring_secs": rang,
        "cause": pick("hangupCause", "hangupReason", "hangup_cause"),
        "recording": pick("recordingUrl", "recording_url"),
        "custom": custom,
        "queue_id": pick("outboundQueueId") or custom.get("outboundQueueId"),
    }


# Waits before each look for the call's document: the webhook can beat the end of our own call
# (its document is written when the socket closes).
LOOKS = (0, 4, 15)
_TASKS: set = set()


def handle_event(number_id: str, body) -> None:
    """Take a webhook in the background, so VoiceLink gets its 200 at once."""
    task = asyncio.create_task(_handle(number_id, body))
    _TASKS.add(task)
    task.add_done_callback(_TASKS.discard)


async def _handle(number_id: str, body):
    call = parse_event(body)
    if not call:
        logger.warning(f"voicelink-events: number {number_id}: not an event: {str(body)[:200]}")
        return
    logger.info(f"voicelink-events: {call['event']} number {number_id} call {call['id']} {call['direction']} "
                f"{call['status']} {call['cause'] or ''} {call['duration']}s{' recording' if call['recording'] else ''}")
    if call["event"] != "call.completed":
        return
    try:
        for i, wait in enumerate(LOOKS):
            await asyncio.sleep(wait)
            # An unanswered call has no document coming: there was never a socket.
            last = i == len(LOOKS) - 1 or not call["answered"]
            if await asyncio.to_thread(_settle, number_id, call, last):
                return
    except Exception as e:
        logger.error(f"voicelink-events: number {number_id} call {call['id']}: {e}")


def _settle(number_id: str, call: dict, last: bool) -> bool:
    """Give the call's document its recording, or write the document of a call that never
    reached us. False: nothing found yet, look again later."""
    db = product.db()
    nid = product.oid(number_id)
    number = db.voice_numbers.find_one({"_id": nid}) if nid else None
    if not number:
        logger.warning(f"voicelink-events: number {number_id} is gone, ignoring call {call['id']}")
        return True
    doc = _find_call(db, number, call)
    if doc:
        if call["recording"]:
            db.voice_calls.update_one({"_id": doc["_id"]}, {"$set": {"recordingUrl": call["recording"]}})
            logger.info(f"voice_calls {doc['_id']}: recording attached")
        return True
    if not last:
        return False
    outbound = call["direction"] == "outbound" or bool(call["custom"].get("aixel_number"))
    if not outbound:
        logger.warning(f"voicelink-events: call {call['id']} into {number['phoneNumber']} has no document here")
        return True
    _write_unconnected(db, number, call)
    return True


def _find_call(db, number: dict, call: dict) -> dict | None:
    """The voice_calls document of this call: by VoiceLink's id, else the same number, direction
    and other party, ended within the last half hour and still without a recording (the one
    whose length is nearest VoiceLink's, when the same person was called twice)."""
    if call["id"]:
        doc = db.voice_calls.find_one({"numberId": number["_id"], "providerCallId": call["id"]})
        if doc:
            return doc
    query = {"numberId": number["_id"], "channel": "PHONE", "recordingUrl": None,
             "endedAt": {"$gte": product.now() - timedelta(minutes=30)},
             "endedBy": {"$nin": ["no_answer", "not_connected"]}}  # those are other calls' webhooks
    outbound = call["direction"] == "outbound" or bool(call["custom"].get("aixel_number"))
    if outbound or call["direction"] == "inbound":
        query["direction"] = "OUTBOUND" if outbound else "INBOUND"
    agent = product.oid(call["custom"].get("aixel_agent"))
    if agent:
        query["agentId"] = agent
    party = last10(call["to"] if outbound else call["from"])
    docs = [d for d in db.voice_calls.find(query).sort("endedAt", -1).limit(20)
            if not party or last10(d.get("to" if d["direction"] == "OUTBOUND" else "from")) == party]
    if call["duration"] and docs:
        return min(docs, key=lambda d: abs((d.get("durationSec") or 0) - call["duration"]))  # ties: the latest
    return docs[0] if docs else None


def _write_unconnected(db, number: dict, call: dict):
    """A call we placed that never opened the socket: nobody answered (or VoiceLink could not reach us)."""
    agent_id = product.oid(call["custom"].get("aixel_agent")) or number.get("outboundAgentId") or number.get("agentId")
    agent = db.voice_agents.find_one({"_id": product.oid(agent_id), "userId": number["userId"]}) if agent_id else None
    if not agent:
        logger.warning(f"voicelink-events: call {call['id']} from {number['phoneNumber']}: no agent to file it under")
        return
    ended = product.now()
    doc = {
        "tenantId": number["tenantId"],
        "userId": number["userId"],
        "agentId": agent["_id"],
        "numberId": number["_id"],
        "channel": "PHONE",
        "direction": "OUTBOUND",
        "from": number["phoneNumber"],
        "to": e164(call["to"]),
        "voice": (agent.get("voice") or "").lower(),
        "startedAt": ended - timedelta(seconds=call["ring_secs"]),
        "endedAt": ended,
        "durationSec": 0,
        # Answered by VoiceLink but never streamed to us: the bot's "WebSocket API" toggle is
        # the known cause (it answers and hangs up without opening the socket).
        "endedBy": "not_connected" if call["answered"] else "no_answer",
        "flags": [],
        "turns": [],
        "gapsMs": [],
        "providerCallId": call["id"] or None,
        "recordingUrl": call["recording"],
    }
    if not doc["to"]:
        doc.pop("to")
    result = db.voice_calls.insert_one(doc)
    logger.info(f"voice_calls {result.inserted_id} written (PHONE OUTBOUND, {doc['endedBy']}: {call['status']} {call['cause'] or ''})")
