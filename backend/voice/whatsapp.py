"""WhatsApp (a customer's own Meta app, WhatsApp Cloud API): the webhook, the call signalling, the chats.

A customer's WhatsApp Business number plays the part a Telnyx number does. What differs, and shapes this module:

- Meta POSTs every event of the customer's app to ONE callback, `/whatsapp?app=<appId>&sig=`, that the app
  sets when AI answering goes on: the calls and messages of all that app's numbers. Each POST
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

- A message is answered in text by the same agent (chat.py), in a conversation kept as one voice_calls
  document and closed after a quiet spell, which leaves the caller's memory like a call does (Chats, below).

Meta's payloads are parsed here, not with Pipecat's WhatsApp models: those require `from`, which Meta
leaves out for people with a username, and refuse `statuses` and `messages` payloads.

`WHATSAPP_GRAPH_BASE` points every Graph call here at a fake in tests.
"""

import asyncio
import hashlib
import hmac
import json
import os
import time

from datetime import timedelta

import aiohttp
from loguru import logger
from pymongo import ReturnDocument

import chat
import product
import tools
from bot import normalize_number

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


def _values(payload: dict, field: str) -> list[dict]:
    """The `value` of every change of one webhook field in a webhook body."""
    entries = payload.get("entry") if isinstance(payload, dict) else None
    values = []
    for entry in entries if isinstance(entries, list) else []:
        for change in (entry.get("changes") if isinstance(entry, dict) else None) or []:
            value = change.get("value") if isinstance(change, dict) else None
            if isinstance(value, dict) and change.get("field") == field:
                values.append(value)
    return values


def _number_id(value: dict) -> str:
    return str((value.get("metadata") or {}).get("phone_number_id") or "")


def calls_in(payload: dict) -> list[dict]:
    """The call events in one webhook body (field `calls`), each as
    {phone_number_id, id, event, direction, from, sdp_type, sdp, status}. Anything else is left out."""
    events = []
    for value in _values(payload, "calls"):
        for call in value.get("calls") or []:
            if not isinstance(call, dict) or not call.get("id") or not call.get("event"):
                continue
            session = call.get("session") if isinstance(call.get("session"), dict) else {}
            events.append({
                "phone_number_id": _number_id(value),
                "id": str(call["id"]),
                "event": str(call["event"]),
                "direction": str(call.get("direction") or ""),
                "from": str(call.get("from") or "") or None,
                "sdp_type": session.get("sdp_type"),
                "sdp": session.get("sdp"),
                "status": call.get("status"),
            })
    return events


def messages_in(payload: dict) -> list[dict]:
    """The messages people sent in one webhook body (field `messages`), each as
    {phone_number_id, id, from, name, type, text, media_id, mime}. `text` is what they typed or tapped (a button,
    a list row), None for anything else; a voice note carries its `media_id`. Delivery receipts (`statuses`) are left out."""
    found = []
    for value in _values(payload, "messages"):
        names = {str(c.get("wa_id")): str((c.get("profile") or {}).get("name") or "")
                 for c in value.get("contacts") or [] if isinstance(c, dict)}
        for m in value.get("messages") or []:
            if not isinstance(m, dict) or not m.get("id") or not m.get("from"):
                continue
            kind = str(m.get("type") or "")
            interactive = m.get("interactive") if isinstance(m.get("interactive"), dict) else {}
            picked = interactive.get("button_reply") or interactive.get("list_reply") or {}
            text = ((m.get("text") or {}).get("body") if kind == "text"
                    else picked.get("title") if kind == "interactive"
                    else (m.get("button") or {}).get("text") if kind == "button" else None)
            audio = m.get("audio") if kind == "audio" and isinstance(m.get("audio"), dict) else {}
            found.append({"phone_number_id": _number_id(value), "id": str(m["id"]), "from": str(m["from"]),
                          "name": names.get(str(m["from"])) or None, "type": kind,
                          "text": str(text).strip() if isinstance(text, str) and text.strip() else None,
                          "media_id": str(audio.get("id") or "") or None, "mime": audio.get("mime_type")})
    return found


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


async def graph_post(token: str, path: str, body: dict) -> tuple[int, str]:
    """POST a Graph API path (`/{phone-number-id}/calls`, `/messages`) with the number's token: (status, body);
    (0, the error) when Meta cannot be reached. Never raises."""
    url = f"{graph_base()}/{GRAPH_VERSION}{path}"
    try:
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=10)) as session:
            async with session.post(url, json=body, headers={"Authorization": f"Bearer {token}"}) as r:
                text = await r.text()
    except Exception as e:
        logger.error(f"whatsapp: {path}: Meta unreachable ({e!r})")
        return 0, str(e)
    if r.status >= 300:
        logger.warning(f"whatsapp: {path}: HTTP {r.status} {text[:300]}")
    return r.status, text


async def call_action(token: str, phone_number_id: str, call_id: str, action: str, sdp: str | None = None) -> tuple[int, str]:
    """POST /{phone-number-id}/calls: pre_accept / accept (with our SDP answer), reject, terminate."""
    body: dict = {"messaging_product": "whatsapp", "call_id": call_id, "action": action}
    if sdp is not None:
        body["session"] = {"sdp_type": "answer", "sdp": sdp}
    return await graph_post(token, f"/{phone_number_id}/calls", body)


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


# --- Chats: messages to a customer's number, answered in text by its agent -----------------------------
#
# A conversation is one voice_calls document (channel WHATSAPP, `chat`), open while messages keep coming
# and closed by the first look after IDLE_SECS of quiet (close_chat, from sweep_forever or the person's
# next message). Closing it is the end of a call: its cost, then the post-call analysis and the caller's
# memory (analysis.after_call), the same memory their phone and WhatsApp calls use.

IDLE_SECS = 15 * 60  # VOICE_CHAT_LIMITS.idleMinutes
SWEEP_SECS = 60
NOT_TEXT = "Sorry, I can only read text and voice messages for now. Could you type it?"
# shortcut: one lock per (number, person) in this process, never pruned; two slots (a deploy) may answer the same person at once.
_LOCKS: dict[tuple[str, str], asyncio.Lock] = {}


async def send_text(token: str, phone_number_id: str, to: str, text: str) -> bool:
    """A text message to `to` (their WhatsApp id): inside the 24 hours after their own message, so no template."""
    status, _ = await graph_post(token, f"/{phone_number_id}/messages", {
        "messaging_product": "whatsapp", "recipient_type": "individual", "to": to, "type": "text",
        "text": {"body": text, "preview_url": False}})
    return status == 200


async def mark_read(token: str, phone_number_id: str, message_id: str):
    """Blue ticks on their message, and "typing..." while she writes the answer."""
    await graph_post(token, f"/{phone_number_id}/messages", {
        "messaging_product": "whatsapp", "status": "read", "message_id": message_id,
        "typing_indicator": {"type": "text"}})


async def graph_get(token: str, path_or_url: str) -> tuple[int, bytes, str]:
    """GET a Graph path, or a media URL Meta handed out (it wants the token too): (status, body, content type)."""
    url = path_or_url if path_or_url.startswith("http") else f"{graph_base()}/{GRAPH_VERSION}{path_or_url}"
    try:
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=30)) as session:
            async with session.get(url, headers={"Authorization": f"Bearer {token}"}) as r:
                return r.status, await r.read(), r.headers.get("Content-Type", "")
    except Exception as e:
        logger.error(f"whatsapp: GET {path_or_url[:80]}: {e!r}")
        return 0, b"", ""


async def download_media(token: str, media_id: str) -> tuple[bytes | None, str]:
    """A voice note's audio: Meta names its short-lived URL first, then serves it with the same token."""
    status, body, _ = await graph_get(token, f"/{media_id}")
    try:
        meta = json.loads(body) if status == 200 else {}
    except ValueError:
        meta = {}
    if not meta.get("url"):
        return None, ""
    status, audio, kind = await graph_get(token, meta["url"])
    return (audio if status == 200 and audio else None), (meta.get("mime_type") or kind)


async def send_voice(token: str, phone_number_id: str, to: str, ogg: bytes) -> bool:
    """A voice note (OGG/Opus) to `to`: uploaded to Meta first, then sent as audio that plays as a voice note."""
    form = aiohttp.FormData()
    form.add_field("messaging_product", "whatsapp")
    form.add_field("type", "audio/ogg")
    form.add_field("file", ogg, filename="reply.ogg", content_type="audio/ogg")
    try:
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=30)) as session:
            async with session.post(f"{graph_base()}/{GRAPH_VERSION}/{phone_number_id}/media", data=form,
                                    headers={"Authorization": f"Bearer {token}"}) as r:
                media = await r.json(content_type=None) if r.status == 200 else {}
    except Exception as e:
        logger.error(f"whatsapp: uploading a voice reply: {e!r}")
        return False
    if not media.get("id"):
        return False
    status, _ = await graph_post(token, f"/{phone_number_id}/messages", {
        "messaging_product": "whatsapp", "recipient_type": "individual", "to": to, "type": "audio",
        "audio": {"id": media["id"], "voice": True}})
    return status == 200


def _open_chat(number: dict, agent: dict, phone: str, turn: dict, name: str | None) -> dict:
    """The person's chat with the number, their message added: the open one, or a new one, which takes over
    the conversation's state (a team member's takeover, a request for a person) from their last chat."""
    calls, now = product.db().voice_calls, product.now()
    doc = calls.find_one_and_update(
        {"numberId": number["_id"], "callerPhone": phone, "chat.open": True,
         "chat.lastMessageAt": {"$gte": now - timedelta(seconds=IDLE_SECS)}},
        {"$push": {"turns": turn}, "$set": {"chat.lastMessageAt": now, "endedAt": now, **({"chat.name": name} if name else {})},
         "$inc": {"chat.unread": 1}},
        return_document=ReturnDocument.AFTER)
    if doc:
        return doc
    last = calls.find_one({"numberId": number["_id"], "callerPhone": phone, "channel": "WHATSAPP"},
                          {"chat": 1}, sort=[("startedAt", -1)]) or {}
    kept = {k: v for k, v in (last.get("chat") or {}).items() if k in ("human", "needsHuman", "name") and v}
    doc = {"tenantId": number["tenantId"], "userId": number["userId"], "agentId": agent["_id"], "numberId": number["_id"],
           "channel": "WHATSAPP", "direction": "INBOUND", "from": phone, "to": number.get("phoneNumber"), "voice": "",
           "startedAt": now, "endedAt": now, "durationSec": 0, "endedBy": "chat_open", "flags": [], "turns": [turn],
           "gapsMs": [], "callerPhone": phone,
           "chat": {**kept, **({"name": name} if name else {}), "open": True, "lastMessageAt": now, "unread": 1,
                    "model": chat.model_of(agent), "tokens": {"textIn": 0, "textOut": 0}}}
    doc["_id"] = calls.insert_one(doc).inserted_id
    logger.info(f"whatsapp: chat {doc['_id']} started with {phone} on {number.get('phoneNumber')}")
    return doc


def _stale_chats(match: dict) -> list:
    """Open chats quiet for IDLE_SECS or more, among `match`."""
    cutoff = product.now() - timedelta(seconds=IDLE_SECS)
    return [d["_id"] for d in product.db().voice_calls.find(
        {**match, "chat.open": True, "chat.lastMessageAt": {"$lt": cutoff}}, {"_id": 1}).limit(50)]


def _claim_close(chat_id) -> dict | None:
    """Marks the chat closed, once: None when another look (or slot) already did."""
    doc = product.db().voice_calls.find_one({"_id": chat_id, "chat.open": True})
    if not doc:
        return None
    started, last = tools.as_utc(doc["startedAt"]), tools.as_utc(doc["chat"]["lastMessageAt"])
    return product.db().voice_calls.find_one_and_update(
        {"_id": chat_id, "chat.open": True},
        {"$set": {"chat.open": False, "endedBy": "chat_ended", "endedAt": last,
                  "durationSec": max(0, round((last - started).total_seconds()))}},
        return_document=ReturnDocument.AFTER)


async def close_chat(chat_id):
    """Closes a quiet chat: its cost, then the analysis and the caller's memory. Never raises."""
    import analysis, costs  # import this module: loaded on first use

    try:
        doc = await asyncio.to_thread(_claim_close, chat_id)
        if not doc:
            return
        number, agent = await asyncio.to_thread(product.load_number, doc["numberId"], "INBOUND", doc["agentId"])
        if not number or not agent:
            return logger.warning(f"whatsapp: chat {chat_id} closed; its number or agent is gone, no analysis")
        ctx = await asyncio.to_thread(product.phone_call, number, agent, "INBOUND", doc.get("callerPhone"), "WHATSAPP")
        ctx["doc"]["_id"] = doc["_id"]
        doc["cost"] = await asyncio.to_thread(costs.chat_cost, doc, (doc.get("chat") or {}).get("tokens") or {},
                                              ctx.get("gemini_sealed"), (doc.get("chat") or {}).get("model"),
                                              (doc.get("chat") or {}).get("voice"))
        await asyncio.to_thread(product.db().voice_calls.update_one, {"_id": doc["_id"]}, {"$set": {"cost": doc["cost"]}})
        logger.info(f"whatsapp: chat {chat_id} closed ({len(doc.get('turns') or [])} messages)")
        await analysis.after_call(ctx, doc)
    except product.CallRefused as e:
        logger.warning(f"whatsapp: chat {chat_id} closed without analysis: {e}")
    except Exception as e:
        logger.error(f"whatsapp: closing chat {chat_id}: {e!r}")


async def answer_message(number: dict, message: dict):
    """A message to a customer's number: kept in the person's chat, and answered by the number's agent. Never raises."""
    phone = normalize_number(message["from"])
    if not phone:
        return
    lock = _LOCKS.setdefault((str(number["_id"]), phone), asyncio.Lock())
    async with lock:
        try:
            await _answer(number, message, phone)
        except Exception as e:
            logger.error(f"whatsapp: message {message['id']} to {number.get('phoneNumber')}: {e!r}")


async def _answer(number: dict, message: dict, phone: str):
    token, pnid = product.open_secret(number["apiKeySealed"]), number["providerNumberId"]
    _, agent = await asyncio.to_thread(product.load_number, number["_id"], "INBOUND")
    if not agent:
        return logger.info(f"whatsapp: message to {number.get('phoneNumber')}, which has no inbound agent: not answered")
    # A chat gone quiet is closed first, so this one starts from the memory it leaves.
    for stale in await asyncio.to_thread(_stale_chats, {"numberId": number["_id"], "callerPhone": phone}):
        await close_chat(stale)
    try:
        ctx = await asyncio.to_thread(product.phone_call, number, agent, "INBOUND", phone, "WHATSAPP")
    except product.CallRefused as e:  # no prompt, no Gemini key: kept for the inbox, not answered
        ctx = None
        logger.warning(f"whatsapp: message to {number.get('phoneNumber')}: not answered: {e}")
    text, heard = message["text"], {}
    if message["media_id"] and ctx:
        audio, mime = await download_media(token, message["media_id"])
        if audio:
            text, heard = await chat.transcribe(ctx, audio, mime or message.get("mime") or "audio/ogg")
    voice = bool(message["media_id"])
    turn = {"role": "caller", "text": text or f"[{message['type'] or 'message'}]", "at": product.now(), **({"voice": True} if voice else {})}
    doc = await asyncio.to_thread(_open_chat, number, agent, phone, turn, message.get("name"))
    usage, runs, spent = {"textIn": heard.get("textIn", 0), "textOut": heard.get("textOut", 0)}, [], {}
    if heard.get("secs"):
        spent = {"chat.voice.sttSecs": heard["secs"]}
    state = doc.get("chat") or {}
    if not ctx or state.get("human") or state.get("needsHuman"):
        reply = None  # a person has it (or was asked for): the AI stays quiet
    elif text is None:
        reply = NOT_TEXT
    else:
        ctx["doc"]["_id"] = doc["_id"]
        record = {"turns": doc["turns"]}
        call_tools = tools.CallTools(ctx, record, prefetch=False)
        settings = agent.get("whatsapp") if isinstance(agent.get("whatsapp"), dict) else {}

        async def handoff(reason: str) -> str:
            await asyncio.to_thread(product.db().voice_calls.update_one, {"_id": doc["_id"]},
                                    {"$set": {"chat.needsHuman": {"since": product.now(), "reason": reason or "asked for a person"}}})
            logger.info(f"whatsapp: chat {doc['_id']} handed to a person: {reason!r}")
            return "Done: the team has been told. Tell the person a team member will reply here soon; don't promise a time."

        spawn(mark_read(token, pnid, message["id"]))
        reply, got = await chat.reply(ctx, doc["turns"], call_tools or None, chat.model_of(agent),
                                      handoff if settings.get("handoff", True) is not False else None)
        usage = {k: usage[k] + got.get(k, 0) for k in usage}
        runs = record.get("tool_calls") or []
    sent = spoken = False
    if reply and voice and ctx and (agent.get("whatsapp") or {}).get("voiceReplies", True) is not False:
        if ogg := await chat.speak(ctx, reply):
            spoken = sent = await send_voice(token, pnid, message["from"], ogg)
            if spoken:
                spent["chat.voice.ttsSecs"] = await asyncio.to_thread(chat.audio_secs, ogg)
    if reply and not sent:
        sent = await send_text(token, pnid, message["from"], reply)
    # Google billed the tokens and the tools ran, whether or not Meta took the message.
    update: dict = {"$set": {"chat.lastMessageAt": product.now(), **({"chat.voice.sttModel": heard["model"]} if heard.get("model") else {})},
                    "$inc": {"chat.tokens.textIn": usage["textIn"], "chat.tokens.textOut": usage["textOut"], **spent}}
    agent_turn = {"role": "agent", "text": reply, "at": product.now(), **({"voice": True} if spoken else {})}
    push = {**({"turns": agent_turn} if sent else {}), **({"toolCalls": {"$each": runs}} if runs else {})}
    if push:
        update["$push"] = push
        update["$set"]["chat.unread"] = 0  # the AI answered: nothing waits for a person
    await asyncio.to_thread(product.db().voice_calls.update_one, {"_id": doc["_id"]}, update)


async def sweep_forever(draining=lambda: False):
    """Closes quiet chats, every SWEEP_SECS, until the process drains."""
    while not draining():
        await asyncio.sleep(SWEEP_SECS)
        try:
            for chat_id in await asyncio.to_thread(_stale_chats, {}):
                await close_chat(chat_id)
        except Exception as e:
            logger.error(f"whatsapp: chat sweep: {e!r}")


def install(app, draining=lambda: False):
    """Runs sweep_forever for as long as the app runs (with a database to sweep)."""
    from contextlib import asynccontextmanager

    previous = app.router.lifespan_context

    @asynccontextmanager
    async def lifespan(a):
        async with previous(a) as state:
            task = (asyncio.create_task(sweep_forever(draining))
                    if product.setting("MONGODB_URI") and product.setting("MONGODB_DB_NAME") else None)
            try:
                yield state
            finally:
                if task:
                    task.cancel()

    app.router.lifespan_context = lifespan
