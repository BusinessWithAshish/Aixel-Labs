"""The voice agents product: customers' agents, their numbers, and the record of each call.

The Aixel Labs app (Next.js, `frontend/server/voice-agent/engine.ts`) keeps three
Mongo collections, and this engine reads two of them and writes the third:

    voice_agents   name, voice, prompt, call notes          read per call
    voice_numbers  a customer's Telnyx, VoiceLink or Twilio number  read per call
    voice_calls    one document per call, however it ended  written here
    voice_bookings appointments the agent booked              written by tools.py
    voice_settings the owner's own Gemini API key             read per call
    voice_caller_memories  what an agent remembers about a caller   read per call, written by analysis.py

The shapes are `VoiceAgentDoc` / `VoiceNumberDoc` / `VoiceCallDoc` in the
backend's `src/db/types.ts`. Both sides share one secret, `VOICELAB_KEY` (the app
calls it VOICE_ENGINE_SECRET): it signs URLs and tokens, and it seals the
customers' Telnyx keys and VoiceLink tokens at rest.
"""

import asyncio
import base64
import hashlib
import hmac
import os
import re
import time
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

# bot.py and fillers.py load .env with override=True, so a test instance started as
# `MONGODB_URI=mongodb://127.0.0.1:27018 MONGODB_DB_NAME=... phone.py --port 7861` would
# silently write to production. Whatever the process was started with wins: this is
# read before bot is imported (phone.py imports this module first for that reason).
# The VoiceLink settings too, so a test instance can point them at a fake.
_STARTED_WITH = {k: os.environ[k] for k in ("MONGODB_URI", "MONGODB_DB_NAME", "VOICELINK_API_BASE", "VOICELINK_PROXY_URL",
                                               "TWILIO_API_BASE", "COMPOSIO_API_BASE", "COMPOSIO_API_KEY")
                 if k in os.environ}

from bson import ObjectId
from bson.errors import InvalidId
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from loguru import logger
from pymongo import MongoClient

from bot import VOICELAB_KEY, gemini_key_problem, normalize_number

TELNYX_API_BASE = os.getenv("TELNYX_API_BASE", "https://api.telnyx.com").rstrip("/")


def setting(name: str) -> str:
    """An env setting, the value the process was started with winning over .env (see above)."""
    return {**os.environ, **_STARTED_WITH}.get(name) or ""

# What she is told when the line opens, by who started the call.
FIRST_LINE = {
    "OUTBOUND": "Start the call with your opening line.",
    "INBOUND": "Someone has just called your number and you have picked up. Greet them with your opening line.",
    "PLAYGROUND": "Start the call with your opening line.",
}


def sign(*parts: str) -> str:
    """A permanent signature, for URLs a provider keeps (a number's webhooks)."""
    return hmac.new(VOICELAB_KEY.encode(), "|".join(parts).encode(), hashlib.sha256).hexdigest()[:32]


def sig_ok(sig: str | None, *parts: str) -> bool:
    return bool(VOICELAB_KEY and sig) and hmac.compare_digest(sig, sign(*parts))


def bearer_ok(header: str | None) -> bool:
    """The app talking to us server to server: `Authorization: Bearer <VOICELAB_KEY>`."""
    scheme, _, secret = (header or "").partition(" ")
    return bool(VOICELAB_KEY) and scheme.lower() == "bearer" and hmac.compare_digest(secret.strip(), VOICELAB_KEY)


# --- Customer keys at rest: AES-256-GCM, "v1." + base64url(iv + ciphertext + tag) ---------------


def _seal_key() -> bytes:
    return hashlib.sha256(f"aixel-voice-secrets|{VOICELAB_KEY}".encode()).digest()


def seal_secret(plain: str) -> str:
    iv = os.urandom(12)
    body = AESGCM(_seal_key()).encrypt(iv, plain.encode(), None)  # ciphertext + tag
    return "v1." + base64.urlsafe_b64encode(iv + body).decode().rstrip("=")


def open_secret(sealed: str) -> str:
    version, _, payload = (sealed or "").partition(".")
    if version != "v1" or not payload:
        raise ValueError("unknown sealed secret format")
    raw = base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4))  # Node leaves the padding off
    return AESGCM(_seal_key()).decrypt(raw[:12], raw[12:], None).decode()


# --- Mongo --------------------------------------------------------------------------------------

_db = None


def db():
    """The app's database. Connected on first use, so the legacy line runs without it."""
    global _db
    if _db is None:
        uri, name = setting("MONGODB_URI"), setting("MONGODB_DB_NAME")
        if not uri or not name:
            raise RuntimeError("MONGODB_URI / MONGODB_DB_NAME are not set")
        _db = MongoClient(uri, serverSelectionTimeoutMS=5000, appname="voicelab")[name]
    return _db


def oid(value) -> ObjectId | None:
    try:
        return value if isinstance(value, ObjectId) else ObjectId(str(value))
    except (InvalidId, TypeError):
        return None


def load_agent(agent_id, user_id) -> dict | None:
    """One user's agent; None if it is not theirs or does not exist."""
    aid, uid = oid(agent_id), oid(user_id)
    if not aid or not uid:
        return None
    return db().voice_agents.find_one({"_id": aid, "userId": uid})


def load_number(number_id, direction: str = "INBOUND", agent_id=None) -> tuple[dict | None, dict | None]:
    """A customer's number and the agent for this call (None for either that is missing).

    A call coming in is answered by the number's `inboundAgentId`; one we place uses the
    agent the app asked for, else the number's `outboundAgentId`. Numbers saved before the
    split carry a single `agentId`, which then does both.
    """
    nid = oid(number_id)
    number = db().voice_numbers.find_one({"_id": nid}) if nid else None
    agent = None
    if number:
        field = "inboundAgentId" if direction == "INBOUND" else "outboundAgentId"
        wanted = agent_id or number.get(field) or number.get("agentId")
        if wanted:
            agent = db().voice_agents.find_one({"_id": oid(wanted), "userId": number["userId"]})
    return number, agent


# --- The owner's Gemini key ---------------------------------------------------------------------
# Every customer call (Telnyx, Twilio, VoiceLink, playground) runs on its owner's own Gemini API
# key: voice_settings.gemini.keySealed, saved in the app, sealed like the number keys
# (`VoiceSettingsDoc` in the backend's types.ts). Never on ours: GEMINI_API_KEY in .env is for
# Ashish's own line only (/texml?key=, /telnyx without n, --call, /a). gemini_key_for is the one
# place that picks a customer call's key; a later "use Aixel Labs credits" option would be
# decided here (with the app's server/voice-agent/gemini-key.ts).

GEMINI_KEY_MISSING = "No Gemini API key is saved for these agents: add one on the Voice agents page of the app."
# Where /calls checks a key (list models). Tests point it at a fake.
GEMINI_API_BASE = (os.getenv("GEMINI_API_BASE") or "https://generativelanguage.googleapis.com").rstrip("/")
KEY_OK_SECS = 600  # a key Google accepted is not asked about again for this long
_KEY_OK: dict[str, float] = {}


class GeminiKeyMissing(Exception):
    """The owner has no usable Gemini API key: the call is refused before anything runs."""


def gemini_key_for(user_id) -> tuple[str, str]:
    """(key, sealed) of the owner's Gemini API key. Raises GeminiKeyMissing."""
    doc = db().voice_settings.find_one({"userId": oid(user_id)}, {"gemini.keySealed": 1})
    sealed = ((doc or {}).get("gemini") or {}).get("keySealed")
    if not sealed:
        raise GeminiKeyMissing("no Gemini API key is saved")
    try:
        return open_secret(sealed), sealed
    except Exception as e:
        raise GeminiKeyMissing(f"the saved Gemini API key cannot be opened ({e})") from e


def note_key_problem(user_id, sealed: str, status: str, words: str, google: str):
    """Tells the app Google refused the key (a VoiceGeminiKeyStatus and plain words), unless it was replaced since."""
    try:
        db().voice_settings.update_one(
            {"userId": oid(user_id), "gemini.keySealed": sealed},
            {"$set": {"gemini.status": status, "gemini.statusMessage": f"{words} (Google: {google[:160]})",
                      "gemini.checkedAt": now()}},
        )
    except Exception as e:
        logger.error(f"could not note the Gemini key problem of owner {user_id}: {e}")


async def check_gemini_key(key: str) -> tuple[str, str, str] | None:
    """Before we ring anyone: does Google accept the key? One free call (list models), an answer
    kept KEY_OK_SECS. (status, words, Google's message) when it refuses; None when it accepts or
    cannot be asked (then the call goes ahead, and a refusal mid-call ends it)."""
    import time

    import aiohttp

    digest = hashlib.sha256(key.encode()).hexdigest()
    if time.monotonic() - _KEY_OK.get(digest, -KEY_OK_SECS) < KEY_OK_SECS:
        return None
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(f"{GEMINI_API_BASE}/v1beta/models", params={"pageSize": "1"},
                                   headers={"x-goog-api-key": key}, timeout=aiohttp.ClientTimeout(total=6)) as r:
                status, text = r.status, await r.text()
    except Exception as e:
        logger.warning(f"could not check a Gemini key with Google ({e!r}); placing the call anyway")
        return None
    if status < 300:
        _KEY_OK[digest] = time.monotonic()
        return None
    problem = gemini_key_problem(text)
    if not problem and status in (400, 401, 403):
        problem = ("INVALID", "it is not a valid API key") if status == 400 else ("API_DISABLED", "Google refused it")
    return (*problem, text[:300]) if problem else None


def save_refused(number: dict, agent: dict, direction: str, other: str | None, why: str):
    """A call on a customer's number that could not run on the owner's key: a record with no
    audio (endedBy gemini_key_error), so the owner sees who called and why nobody answered."""
    at, ours = now(), number.get("phoneNumber")
    _insert({
        "tenantId": number["tenantId"], "userId": number["userId"], "agentId": agent["_id"], "numberId": number["_id"],
        "channel": "PHONE", "direction": direction,
        "from": other if direction == "INBOUND" else ours, "to": ours if direction == "INBOUND" else other,
        "voice": (agent.get("voice") or "").lower(), "startedAt": at, "endedAt": at, "durationSec": 0,
        "endedBy": "gemini_key_error", "flags": [{"flag": "gemini_key_error", "quote": why}], "turns": [], "gapsMs": [],
    })


# --- {{variables}} in the prompt, the call notes and the voicemail message --------------------------
# A call's values: the agent's defaults ("variables" on the agent), then the call's own
# (ctx["variables"]: a campaign contact's CSV columns via campaigns.tag, or POST /calls
# "variables"), then the built-ins below, which nothing overrides. Unknown names render empty.
# One pass: a value that itself contains "{{x}}" is not expanded again.

VARIABLE_NAME = re.compile(r"[A-Za-z][A-Za-z0-9_]{0,43}")
VARIABLE = re.compile(r"\{\{\s*(" + VARIABLE_NAME.pattern + r")\s*\}\}")
BUILTIN_VARIABLES = ("now", "today", "weekday", "caller_number", "agent_name", "business_timezone")
VARIABLE_MAX = 500  # characters per value (VOICE_AGENT_FEATURE_LIMITS.maxVariableLength)


def _value(v) -> str | None:
    """A variable's value on one line (a CSV cell may hold newlines), capped; None for non-scalars."""
    if isinstance(v, bool) or not isinstance(v, (str, int, float)):
        return None
    return " ".join(str(v).split())[:VARIABLE_MAX]


def business_zone(agent: dict) -> tuple[str, ZoneInfo]:
    """The agent's business timezone: the one set for appointment booking, else UTC."""
    booking = ((agent.get("tools") or {}).get("booking") or {}) if isinstance(agent.get("tools"), dict) else {}
    name = str(booking.get("timezone") or "UTC") if isinstance(booking, dict) else "UTC"
    try:
        return name, ZoneInfo(name)
    except Exception:
        return "UTC", ZoneInfo("UTC")


def call_variables(ctx: dict, agent: dict, at: datetime | None = None) -> dict[str, str]:
    """Every variable's value for this call, by lower-case name."""
    values: dict[str, str] = {}
    for source in (agent.get("variables"), ctx.get("variables")):
        for k, v in (source.items() if isinstance(source, dict) else ()):
            if (text := _value(v)) is not None:
                values[str(k).lower()] = text
    zone, tz = business_zone(agent)
    t = (at or now()).astimezone(tz)
    today = f"{t:%A} {t.day} {t:%B} {t.year}"
    values.update(
        now=f"{today}, {t.hour % 12 or 12}:{t.minute:02d} {'AM' if t.hour < 12 else 'PM'}",
        today=today,
        weekday=f"{t:%A}",
        caller_number=ctx.get("customer_phone") or "",
        agent_name=agent.get("name") or "",
        business_timezone=zone,
    )
    return values


def render(text: str, values: dict[str, str]) -> str:
    return VARIABLE.sub(lambda m: values.get(m.group(1).lower(), ""), text or "")


# Variables a POST /calls asked for, until the call's stream arrives and its context is built
# (product.phone_call). Keyed like campaigns.DIALING by (numberId, callee); memory only, so the
# stream must reach the process that placed the call (as for campaign variables).
CALL_VARIABLES: dict[tuple[str, str], tuple[dict, float]] = {}
CALL_VARIABLES_SECS = 600


def hold_call_variables(number_id: str, to: str, variables: dict):
    at = time.monotonic()
    for key in [k for k, (_, t) in CALL_VARIABLES.items() if at - t > CALL_VARIABLES_SECS]:
        CALL_VARIABLES.pop(key, None)
    CALL_VARIABLES[(str(number_id), str(to))] = (dict(variables), at)


def _take_call_variables(doc: dict) -> dict | None:
    if doc.get("channel") != "PHONE" or doc.get("direction") != "OUTBOUND":
        return None
    held = CALL_VARIABLES.pop((str(doc.get("numberId")), str(doc.get("to") or "")), None)
    return held[0] if held and time.monotonic() - held[1] <= CALL_VARIABLES_SECS else None


def agent_prompt(agent: dict, values: dict[str, str] | None = None) -> str:
    """The agent's own prompt, then the notes about this call, `{{variables}}` filled in when given."""
    prompt, notes = (agent.get("prompt") or "").strip(), (agent.get("callNotes") or "").strip()
    if values is not None:
        prompt, notes = render(prompt, values).strip(), render(notes, values).strip()
    return f"{prompt}\n\n# This call\n\n{notes}" if notes else prompt


VOICEMAIL_MAX = 500  # characters (VOICE_AGENT_FEATURE_LIMITS.voicemailMessageMax), ~30 s spoken


def voicemail_message(agent: dict, values: dict[str, str]) -> str | None:
    """What an outbound call leaves on a voicemail, or None to hang up (the default)."""
    vm = agent.get("voicemail") if isinstance(agent.get("voicemail"), dict) else {}
    if vm.get("action") != "MESSAGE":
        return None
    return " ".join(render(str(vm.get("message") or ""), values).split())[:VOICEMAIL_MAX] or None


# --- Caller memory (voice_caller_memories, written by analysis.py) ------------------------------
# Keyed by owner + agent + the caller's E.164 number: each agent remembers its own conversations only.


def memory_phone(ctx: dict) -> str | None:
    """The number a phone call's memory is kept under: the person, whichever way the call went."""
    doc = ctx.get("doc") or {}
    return normalize_number(ctx.get("customer_phone")) if doc.get("channel") == "PHONE" else None


def load_memory(doc: dict, phone: str) -> dict | None:
    return db().voice_caller_memories.find_one({"userId": doc["userId"], "agentId": doc["agentId"], "phone": phone})


def memory_section(memory: dict, tz: ZoneInfo = ZoneInfo("UTC")) -> str:
    """`# What you remember about this caller`, with the date of the last call (in the business's zone)."""
    at = memory["lastCallAt"]
    at = (at.replace(tzinfo=timezone.utc) if at.tzinfo is None else at).astimezone(tz)
    return (f"# What you remember about this caller\n\nYou last spoke with this number on {at:%A} {at.day} {at:%B} "
            f"{at.year}. Use this naturally; don't read it out, and don't claim to remember more than it says.\n\n"
            f"{memory['brief'].strip()}")


def _finish_ctx(ctx: dict, agent: dict) -> dict:
    """What every customer call adds: the voice_calls `_id`, chosen now so a booking made
    during the call can point at it; the agent's tools; and her whole system prompt
    (the agent's with its `{{variables}}` filled in, what she remembers about the caller,
    then `# Right now` and `# Your tools`, tools.prompt_sections)."""
    import analysis, campaigns, tools  # import this module: loaded on first use

    # The owner's own Gemini key, or no call (GeminiKeyMissing).
    ctx["gemini_key"], ctx["gemini_sealed"] = gemini_key_for(ctx["doc"]["userId"])
    campaigns.tag(ctx)  # a campaign's call: its contact's variables (ctx["variables"]) and links
    if "variables" not in ctx and (held := _take_call_variables(ctx["doc"])) is not None:
        ctx["variables"] = ctx["doc"]["variables"] = held  # a test call's variables (POST /calls)
    ctx["doc"] = {"_id": ObjectId(), **ctx["doc"]}
    ctx["tools"] = agent.get("tools") if isinstance(agent.get("tools"), dict) else {}
    ctx["agent_name"] = agent.get("name") or ""
    values = call_variables(ctx, agent)
    if ctx["doc"]["direction"] == "OUTBOUND":
        ctx["voicemail"] = voicemail_message(agent, values)
    ctx["analysis"] = analysis.settings(agent)
    ctx["memory_phone"] = memory_phone(ctx) if agent.get("memory") is True else None
    parts = [agent_prompt(agent, values)]
    if ctx["memory_phone"]:
        try:
            memory = load_memory(ctx["doc"], ctx["memory_phone"])
        except Exception as e:  # the call goes on without it
            logger.error(f"could not read the caller memory for {ctx['memory_phone']}: {e}")
            memory = None
        if memory and (memory.get("brief") or "").strip():
            ctx["memory_used"] = memory
            ctx["doc"]["memoryUsed"] = {"brief": memory["brief"], "lastCallAt": memory["lastCallAt"]}
            parts.append(memory_section(memory, business_zone(agent)[1]))
    parts.append(tools.prompt_sections(ctx))
    ctx["prompt"] = "\n\n".join(parts)
    return ctx


# --- One call -----------------------------------------------------------------------------------
# A call's context: what serve() needs to run it as a customer's agent, and the
# owner fields of the voice_calls document written when it ends.


def phone_call(number: dict, agent: dict, direction: str, other: str | None) -> dict:
    """A call on a customer's number. `other` is the person: who called in, or who we dial.
    Reads the owner's Gemini key (GeminiKeyMissing without one): call it off the event loop.

    `api_key` is the customer's Telnyx key (hang-up, recording). A VoiceLink call needs none
    while it runs: it is hung up by closing its socket, and VoiceLink records it. A Twilio
    call's `api_key` is the API key secret (or Auth Token), and `twilio` says how to use it
    (twilio.creds_of: account, key SID, whether Twilio's own signatures can be checked).
    """
    ours = number.get("phoneNumber")
    provider = number.get("provider") or "TELNYX"
    api_key = None if provider == "VOICELINK" else open_secret(number["apiKeySealed"])
    extra = {}
    if provider == "TWILIO":
        import twilio  # imports this module: loaded on first use

        extra["twilio"] = twilio.creds_of(number, api_key)
    return _finish_ctx({
        **extra,
        # A booking's phone when the caller gives none: theirs on a call in, the callee's on one we place.
        "customer_phone": other or None,
        "voice": (agent.get("voice") or "").lower(),
        "provider": provider,
        "api_key": api_key,
        "first": FIRST_LINE[direction],
        "doc": {
            "tenantId": number["tenantId"],
            "userId": number["userId"],
            "agentId": agent["_id"],
            "numberId": number["_id"],
            "channel": "PHONE",
            "direction": direction,
            "from": other if direction == "INBOUND" else ours,
            "to": ours if direction == "INBOUND" else other,
        },
    }, agent)


def play_call(agent: dict) -> dict:
    """A playground session in the browser: no number, no provider key. Reads the owner's Gemini
    key (GeminiKeyMissing without one): call it off the event loop."""
    return _finish_ctx({
        "customer_phone": None,
        "voice": (agent.get("voice") or "").lower(),
        "api_key": None,
        "first": FIRST_LINE["PLAYGROUND"],
        "doc": {
            "tenantId": agent["tenantId"],
            "userId": agent["userId"],
            "agentId": agent["_id"],
            "numberId": None,
            "channel": "PLAYGROUND",
            "direction": "PLAYGROUND",
        },
    }, agent)


def now() -> datetime:
    return datetime.now(timezone.utc)


def call_doc(ctx: dict, record: dict, state: dict) -> dict:
    """The voice_calls document for a finished call, from the engine's own record of it."""
    ended = now()
    live = ctx.get("live_at")  # the moment someone could hear her; never, for a call nobody answered
    doc = dict(ctx["doc"])
    doc.update(
        voice=record.get("voice") or ctx["voice"],
        startedAt=live or ctx.get("opened_at") or ended,
        endedAt=ended,
        durationSec=round((ended - live).total_seconds()) if live else 0,
        endedBy=record.get("ended_by") or "caller_hung_up",
        flags=[{"flag": f.get("flag", ""), "quote": f.get("quote", "")} for f in record.get("flags", [])],
        turns=[{"role": t["who"], "text": t["text"]} for t in record.get("turns", [])],
        gapsMs=list(state.get("gaps", [])),
    )
    if "tool_calls" in record:  # the agent had tools (an empty list: she used none)
        doc["toolCalls"] = list(record["tool_calls"])
    if record.get("voicemail_message"):
        doc["voicemailMessage"] = record["voicemail_message"]
    if doc["channel"] == "PHONE":
        doc["providerCallId"] = record.get("call_control_id")
    else:
        doc.pop("from", None), doc.pop("to", None)
    return doc


def _insert(doc: dict):
    try:
        result = db().voice_calls.insert_one(doc)
        logger.info(f"voice_calls {result.inserted_id} written ({doc['channel']} {doc['direction']}, {doc['endedBy']})")
    except Exception as e:
        logger.error(f"could not write the voice_calls document: {e}")


_AFTER_CALL: set[asyncio.Task] = set()  # running analyses, kept referenced until they finish


async def _insert_then_analyse(ctx: dict, doc: dict):
    import analysis  # imports this module: loaded on first use

    await asyncio.to_thread(_insert, doc)
    await analysis.after_call(ctx, doc)


def save_call(ctx: dict, record: dict, state: dict):
    """Write the call's document off the event loop: other calls' audio must not wait on Mongo.
    The post-call analysis (analysis.py) follows in the same background task, so the call's
    teardown never waits for the model."""
    doc = call_doc(ctx, record, state)
    try:
        task = asyncio.get_running_loop().create_task(_insert_then_analyse(ctx, doc))
    except RuntimeError:  # no loop (a test calling this directly)
        _insert(doc)
        return
    _AFTER_CALL.add(task)
    task.add_done_callback(_AFTER_CALL.discard)
