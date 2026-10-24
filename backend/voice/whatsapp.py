"""WhatsApp (a customer's own Meta app, WhatsApp Cloud API Calling): the webhook, the call signalling.

A customer's WhatsApp Business number plays the part a Telnyx number does. What differs, and shapes this module:

- Meta POSTs every event of the customer's app to ONE callback, `/whatsapp?app=<appId>&sig=`, that the app
  sets when AI answering goes on: the calls of all that app's numbers (and later its messages). Each POST
  is signed with the app's secret (X-Hub-Signature-256), which every number of the app carries
  (`whatsapp.appSecretSealed`). Meta may send an event twice, or out of order: `fresh()` drops repeats.
- A call coming in is a `connect` event with Meta's WebRTC offer (SDP). We answer through the Graph API
  with our own SDP (`pre_accept`, then `accept`): no phone line and no media socket, the audio is WebRTC
  (Opus 48 kHz) between Meta and the engine (Pipecat's SmallWebRTCConnection, aiortc). We are the
  ICE-controlling side against Meta's ICE-lite, so no TURN server or open port is needed here.
- A call ends with our `terminate` (always sent, even after the caller hung up) or Meta's `terminate`
  event (the caller hung up).
- Business-initiated (outbound) calls are not built yet. They are a `connect` WE send with an offer, the
  answer coming back as a `connect` event with direction BUSINESS_INITIATED, once the person granted call
  permission. `calls_in` keeps `direction` and `sdp_type` so that path slots in here.

Meta's payloads are parsed here, not with Pipecat's WhatsApp models: those require `from`, which Meta
leaves out for people with a username, and refuse `statuses` and `messages` payloads.

`WHATSAPP_GRAPH_BASE` points every Graph call here at a fake in tests.
"""

import asyncio
import hashlib
import hmac
import os
import time

import aiohttp
from loguru import logger

import product

# The app's frontend/server/voice-agent/whatsapp.ts uses the same version.
GRAPH_VERSION = "v23.0"
DEFAULT_GRAPH_BASE = "https://graph.facebook.com"
# Meta retries a webhook it got no 200 for, and sometimes sends one twice anyway.
SEEN_SECS = 600
_SEEN: dict[tuple[str, str], float] = {}
# Calls this process runs, by Meta's call id: a `terminate` event hangs up its WebRTC connection.
CALLS: dict[str, object] = {}
# Background work (answering a call, sending terminate): a draining process waits for it (phone.busy).
_TASKS: set[asyncio.Task] = set()


def graph_base() -> str:
    return (os.getenv("WHATSAPP_GRAPH_BASE") or DEFAULT_GRAPH_BASE).rstrip("/")


def verify_ok(app_id: str, token: str | None) -> bool:
    """The token Meta echoes when it checks the callback: the app's signParts('whatsapp-verify', appId)."""
    return product.sig_ok(token, "whatsapp-verify", app_id)


def signature_ok(secret: str, raw: bytes, header: str | None) -> bool:
    """X-Hub-Signature-256 is `sha256=<hex HMAC-SHA256 of the raw body with the app secret>`."""
    if not secret or not header or not header.startswith("sha256="):
        return False
    want = hmac.new(secret.encode(), raw, hashlib.sha256).hexdigest()
    return hmac.compare_digest(want, header[len("sha256="):])


def signed(numbers: list[dict], raw: bytes, header: str | None) -> bool:
    """The body was signed by the app these numbers are on. Each number keeps the secret it was imported
    with, so after a secret change some may still hold the old one: any of them will do."""
    secrets = set()
    for number in numbers:
        try:
            secrets.add(product.open_secret(number["whatsapp"]["appSecretSealed"]))
        except Exception as e:
            logger.error(f"whatsapp: number {number.get('_id')}: its app secret cannot be opened ({e})")
    return any(signature_ok(secret, raw, header) for secret in secrets)


def calls_in(payload: dict) -> list[dict]:
    """The call events in one webhook body (field `calls`), each as
    {phone_number_id, id, event, direction, from, sdp_type, sdp, status}. Anything else is left out."""
    events = []
    entries = payload.get("entry") if isinstance(payload, dict) else None
    for entry in entries if isinstance(entries, list) else []:
        for change in (entry.get("changes") if isinstance(entry, dict) else None) or []:
            value = change.get("value") if isinstance(change, dict) else None
            if not isinstance(value, dict) or change.get("field") != "calls":
                continue
            phone_number_id = str((value.get("metadata") or {}).get("phone_number_id") or "")
            for call in value.get("calls") or []:
                if not isinstance(call, dict) or not call.get("id") or not call.get("event"):
                    continue
                session = call.get("session") if isinstance(call.get("session"), dict) else {}
                events.append({
                    "phone_number_id": phone_number_id,
                    "id": str(call["id"]),
                    "event": str(call["event"]),
                    "direction": str(call.get("direction") or ""),
                    "from": str(call.get("from") or "") or None,
                    "sdp_type": session.get("sdp_type"),
                    "sdp": session.get("sdp"),
                    "status": call.get("status"),
                })
    return events


def fresh(call_id: str, event: str) -> bool:
    """False for an event already seen here in the last SEEN_SECS."""
    now = time.monotonic()
    for key in [k for k, at in _SEEN.items() if now - at > SEEN_SECS]:
        del _SEEN[key]
    if (call_id, event) in _SEEN:
        return False
    _SEEN[(call_id, event)] = now
    return True


def for_whatsapp(sdp: str) -> str:
    """Meta takes SHA-256 fingerprints only: aiortc also offers sha-384 / sha-512 ones."""
    lines = [line for line in sdp.splitlines()
             if not line.startswith("a=fingerprint:") or line.startswith("a=fingerprint:sha-256")]
    return "\r\n".join(lines) + "\r\n"


async def call_action(token: str, phone_number_id: str, call_id: str, action: str, sdp: str | None = None) -> tuple[int, str]:
    """POST /{phone-number-id}/calls: pre_accept / accept (with our SDP answer), reject, terminate."""
    body: dict = {"messaging_product": "whatsapp", "call_id": call_id, "action": action}
    if sdp is not None:
        body["session"] = {"sdp_type": "answer", "sdp": sdp}
    url = f"{graph_base()}/{GRAPH_VERSION}/{phone_number_id}/calls"
    try:
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=10)) as session:
            async with session.post(url, json=body, headers={"Authorization": f"Bearer {token}"}) as r:
                text = await r.text()
    except Exception as e:
        logger.error(f"whatsapp: {action} call {call_id}: Meta unreachable ({e!r})")
        return 0, str(e)
    if r.status >= 300:
        logger.warning(f"whatsapp: {action} call {call_id}: HTTP {r.status} {text[:300]}")
    return r.status, text


def spawn(coro) -> asyncio.Task:
    """Run `coro` in the background, kept until it ends (a draining process waits for it)."""
    task = asyncio.create_task(coro)
    _TASKS.add(task)
    task.add_done_callback(_TASKS.discard)
    return task


def end(ctx: dict, call_id: str):
    """Our side of a call's end: `terminate`, whoever hung up (Meta asks for it even after the caller's)."""
    CALLS.pop(call_id, None)
    spawn(call_action(ctx["api_key"], ctx["whatsapp"]["phone_number_id"], call_id, "terminate"))


async def hang_up(call_id: str) -> bool:
    """Meta's `terminate` event: close that call's WebRTC connection (its pipeline ends with it).
    False when this process does not run the call."""
    connection = CALLS.pop(call_id, None)
    if connection is None:
        return False
    await connection.disconnect()
    return True
