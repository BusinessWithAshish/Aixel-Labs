"""End to end check of agent tools (tools.py) over real Gemini Live: booking and webhooks, on every kind of call.

Needs a test instance pointed at a throwaway database and the fake Telnyx, allowed to call a tool
server on this machine:

    MONGODB_URI=mongodb://127.0.0.1:27018 MONGODB_DB_NAME=AixelLabsVoiceEngineDev \\
      TELNYX_API_BASE=http://127.0.0.1:8799 TOOLS_ALLOW_LOCAL_URLS=1 LOG_LEVEL=INFO .venv/bin/python phone.py --port 7861
    .venv/bin/python tests/tools_e2e.py 7861 [play texml calls voicelink hook hookfail slow talkover plain]

A spoken caller (Gemini TTS lines, cached in tests/linecache) asks to book "Saturday at 2 pm" as
Ravi Kumar, asks where order 4271 is, and so on. It checks what the model did (the tool runs in
voice_calls.toolCalls, the playground's tool events), what was written (voice_bookings), what the
webhook server received (body, signature) and that she used the answers. One Live session at a time.
Never point it at production Mongo: it inserts fixtures and deletes them afterwards.
"""
import asyncio, audioop, base64, hashlib, hmac, json, os, sys, time, urllib.parse, uuid
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

HERE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(HERE)); sys.path.insert(0, str(HERE / "tests"))
import testdb
MONGO, DBNAME = testdb.throwaway()
HOOK_PORT = int(os.getenv("FAKE_TOOL_PORT", "7868"))   # the app's fakes use :7863-:7864, VoiceLink's :7866-:7867

import websockets
from aiohttp import web
from bson import ObjectId
from pymongo import MongoClient
import product, bot, scripted
import product_e2e as pe   # the fake Telnyx and the /calls helpers

db = MongoClient(MONGO)[DBNAME]
RESULTS = []
TZ = "Asia/Kolkata"
SECRET = "whsec_e2e_" + os.urandom(6).hex()
CALLER, CALLEE, VL_CALLER = "+15557770000", "+15559990000", "+919876512345"
CREATED = {"agents": [], "numbers": [], "since": datetime.now(timezone.utc).replace(microsecond=0)}

BOOK = ["Hi, I'd like to book an appointment for this Saturday at 2 pm.", "My name is Ravi Kumar.",
        "Yes, that's right, please book it.", "Great, thank you. Bye."]
ORDER = ["Hi, can you tell me where my order is? The order number is 4 2 7 1.", "Okay, thanks. Bye."]
HELLO = "Hello? Who's this?"
STILL_THERE = "Hello? Are you still there?"


def ok(name, cond, detail=""):
    RESULTS.append((name, bool(cond)))
    print(f"  [{'PASS' if cond else 'FAIL'}] {name}{' -- ' + detail if detail else ''}", flush=True)


def saturday_2pm() -> tuple[date, datetime]:
    """The day a caller means by "this Saturday at 2 pm", and that moment in UTC."""
    tz, now = ZoneInfo(TZ), datetime.now(ZoneInfo(TZ))
    d = now.date() + timedelta(days=(5 - now.weekday()) % 7)
    if datetime(d.year, d.month, d.day, 14, tzinfo=tz) <= now:
        d += timedelta(days=7)
    return d, datetime(d.year, d.month, d.day, 14, tzinfo=tz).astimezone(timezone.utc)


def fixtures():
    now = datetime.now(timezone.utc)
    tenant, user = ObjectId(), ObjectId()
    scripted.give_owner_key(db, tenant, user)
    CREATED.setdefault("owners", []).append(user)
    prompt = ("You are Priya, the receptionist at Sunrise Dental in Pune. You answer the clinic's phone and book appointments. "
              "On a call you placed, say you are calling from Sunrise Dental to help book a check-up. "
              "Keep every reply to one or two short sentences.")
    booking = {"enabled": True, "timezone": TZ, "slotMinutes": 30, "maxDaysAhead": 14,
               "hours": {d: {"open": "09:00", "close": "18:00"} for d in ("mon", "tue", "wed", "thu", "fri", "sat")}}
    hook = {"id": os.urandom(4).hex(), "name": "order_status", "enabled": True,
            "description": "Look up where a customer's order is, by its order number. Use it whenever a caller asks about an order.",
            "parameters": [{"name": "order_id", "type": "string", "description": "The order number, digits only", "required": True}],
            "url": f"http://127.0.0.1:{HOOK_PORT}/order", "secretSealed": product.seal_secret(SECRET)}
    def agent(name, tools):
        a = {"tenantId": tenant, "userId": user, "name": name, "voice": "kore", "callType": "INBOUND", "prompt": prompt,
             "callNotes": "", "createdAt": now, "updatedAt": now}
        if tools is not None:
            a["tools"] = tools
        a["_id"] = db.voice_agents.insert_one(a).inserted_id
        CREATED["agents"].append(a["_id"])
        return a
    agents = {
        "book": agent("Booker", {"booking": booking, "webhooks": []}),
        "hook": agent("Order desk", {"booking": None, "webhooks": [hook]}),
        "hookfail": agent("Order desk (500)", {"webhooks": [{**hook, "url": f"http://127.0.0.1:{HOOK_PORT}/fail"}]}),
        "slow": agent("Order desk (timeout)", {"webhooks": [{**hook, "url": f"http://127.0.0.1:{HOOK_PORT}/slow"}]}),
        "talkover": agent("Order desk (5 s)", {"webhooks": [{**hook, "url": f"http://127.0.0.1:{HOOK_PORT}/slowish"}]}),
        "plain": agent("No tools", None),
    }
    base = {"tenantId": tenant, "userId": user, "providerNumberId": "fake-pn-tools", "createdAt": now, "updatedAt": now}
    def number(phone, agent_id, provider="TELNYX"):
        n = {**base, "provider": provider, "phoneNumber": phone, "apiKeySealed": product.seal_secret(pe.FAKE_KEY),
             "inboundAgentId": agent_id, "outboundAgentId": agent_id}
        if provider == "TELNYX":
            n.update(texmlAppId="fake-texml-app", callControlAppId="fake-cc-app")
        n["_id"] = db.voice_numbers.insert_one(n).inserted_id
        CREATED["numbers"].append(n["_id"])
        return n
    stamp = str(int(time.time()))[-6:]
    numbers = {"book": number("+1555100" + stamp[-4:], agents["book"]["_id"]),
               "slow": number("+1555200" + stamp[-4:], agents["slow"]["_id"]),
               "vl": number("+9180" + stamp + "11", agents["book"]["_id"], "VOICELINK")}
    return agents, numbers


# --- the tool server ------------------------------------------------------------------------------

HOOKS: list[dict] = []


async def tool_server():
    async def handle(request):
        raw = await request.read()
        HOOKS.append({"path": request.path, "headers": dict(request.headers), "raw": raw, "at": time.monotonic()})
        print(f"    [tool server] {request.path} {raw[:160]!r}", flush=True)
        if request.path == "/order":
            return web.json_response({"order_id": "4271", "status": "shipped", "carrier": "BlueDart", "arrives": "Tuesday"})
        if request.path == "/fail":
            return web.Response(status=500, text="Internal Server Error")
        if request.path == "/slow":
            await asyncio.sleep(12)
        if request.path == "/slowish":
            await asyncio.sleep(5)
            return web.json_response({"order_id": "4271", "status": "shipped", "carrier": "BlueDart", "arrives": "Tuesday"})
        return web.Response(status=404)
    app = web.Application(); app.router.add_route("*", "/{tail:.*}", handle)
    runner = web.AppRunner(app); await runner.setup()
    await web.TCPSite(runner, "127.0.0.1", HOOK_PORT).start()
    return runner


# --- callers --------------------------------------------------------------------------------------

def ulaw(text):
    return scripted.tts(text)


def pcm16k(text):
    return audioop.ratecv(audioop.ulaw2lin(ulaw(text), 2), 2, 1, 8000, 16000, None)[0]


class Caller:
    """What every caller below shares: a mic queue that never stops (silence between lines),
    what she sent back and when, and "her turn is over" = quiet for `quiet` seconds after speaking."""

    def __init__(self, chunk: int, silence: bytes):
        self.mic, self.chunk, self.silence = asyncio.Queue(), chunk, silence
        self.heard_n, self.heard_t, self.closed = 0, 0.0, asyncio.Event()
        self.t0 = time.perf_counter()
        self.events: list[dict] = []

    def say(self, audio: bytes):
        for i in range(0, len(audio), self.chunk):
            self.mic.put_nowait(audio[i:i + self.chunk].ljust(self.chunk, self.silence[:1]))

    def next_chunk(self) -> bytes:
        try:
            return self.mic.get_nowait()
        except asyncio.QueueEmpty:
            return self.silence

    def heard(self, n: int):
        self.heard_n += n; self.heard_t = time.perf_counter()

    async def drained(self):
        while not self.mic.empty() and not self.closed.is_set():
            await asyncio.sleep(0.02)

    async def her_turn(self, quiet=2.5, max_wait=35.0, min_bytes=4000) -> bool:
        end, n0 = time.perf_counter() + max_wait, self.heard_n
        while time.perf_counter() < end and not self.closed.is_set():
            await asyncio.sleep(0.1)
            tool_after_audio = self.events and self.events[-1].get("type") == "tool" and self.events[-1]["t"] > self.heard_t
            if self.heard_n > n0 + min_bytes and time.perf_counter() - self.heard_t > quiet and not tool_after_audio:
                return True
        return False

    async def wait_close(self, secs):
        try:
            await asyncio.wait_for(self.closed.wait(), secs)
        except asyncio.TimeoutError:
            pass


async def run_lines(c: Caller, lines, first_hello=False, between=None):
    """Her opener, then each line and her answer to it. `between(c, i)` runs after line i is said."""
    if first_hello:
        await asyncio.sleep(1.0); c.say(c.encode(HELLO)); await c.drained()
    await c.her_turn()
    for i, line in enumerate(lines):
        if c.closed.is_set():
            break
        c.say(c.encode(line)); await c.drained()
        if between:
            await between(c, i)
        await c.her_turn()
    await c.wait_close(8)


async def play_call(port, agent, lines, between=None):
    """The browser playground: 16 kHz in, 24 kHz out, JSON events."""
    aid, uid = str(agent["_id"]), str(agent["userId"])
    url = f"ws://127.0.0.1:{port}/play?agent={aid}&user={uid}&t={urllib.parse.quote(bot.make_token('play', aid, uid, ttl=120))}"
    c = Caller(640, bytes(640)); c.encode = pcm16k
    async with websockets.connect(url, max_size=None) as ws:
        async def receiver():
            try:
                async for m in ws:
                    if isinstance(m, bytes):
                        c.heard(len(m) // 6)   # 24 kHz Int16 -> the byte scale of 8 kHz media
                    else:
                        ev = json.loads(m); ev["t"] = time.perf_counter(); c.events.append(ev)
                        if ev["type"] != "turn":
                            print(f"    {ev['type']}: {({k: v for k, v in ev.items() if k not in ('type', 't')})}", flush=True)
            except websockets.ConnectionClosed:
                pass
            c.closed.set()
        async def sender():
            while not c.closed.is_set():
                try: await ws.send(c.next_chunk())
                except websockets.ConnectionClosed: return
                await asyncio.sleep(0.02)
        rt, st = asyncio.create_task(receiver()), asyncio.create_task(sender())
        try:
            await run_lines(c, lines, between=between)
        finally:
            st.cancel()
            if not c.closed.is_set():
                await ws.close()
            rt.cancel()
    return c


async def telnyx_call(port, ws_url, lines, events_url=None, ring=0.0, first_hello=False, between=None):
    """Telnyx's side of a media stream: 8 kHz mu-law, its start message, a fake call.answered after `ring`."""
    sid = str(uuid.uuid4()); c = Caller(160, b"\xff" * 160); c.encode = ulaw; c.sid = sid
    async with websockets.connect(ws_url, max_size=None) as ws:
        await ws.send(json.dumps({"event": "connected"}))
        await ws.send(json.dumps({"event": "start", "stream_id": sid, "start": {"call_control_id": f"test:{sid}",
                                  "media_format": {"encoding": "PCMU", "sample_rate": 8000, "channels": 1}}}))
        async def receiver():
            try:
                async for raw in ws:
                    m = json.loads(raw)
                    if m.get("event") == "media":
                        c.heard(len(base64.b64decode(m["media"]["payload"])))
            except websockets.ConnectionClosed:
                pass
            c.closed.set()
        async def sender():
            while not c.closed.is_set():
                fr = c.next_chunk()
                try: await ws.send(json.dumps({"event": "media", "stream_id": sid, "media": {"payload": base64.b64encode(fr).decode()}}))
                except websockets.ConnectionClosed: return
                await asyncio.sleep(0.02)
        rt, st = asyncio.create_task(receiver()), asyncio.create_task(sender())
        try:
            if ring:
                await asyncio.sleep(ring)
                body = {"data": {"event_type": "call.answered", "payload": {"call_control_id": f"test:{sid}"}}}
                st_, _ = await pe.ahttp("POST", events_url, body)
            await run_lines(c, lines, first_hello=first_hello, between=between)
        finally:
            st.cancel(); rt.cancel()
    return c


async def voicelink_call(port, number, lines):
    """VoiceLink's side of a call into a number: A-law 8 kHz, its own start message."""
    nid = str(number["_id"]); sid = "MZ" + uuid.uuid4().hex; call_sid = "test:" + uuid.uuid4().hex
    c = Caller(160, audioop.lin2alaw(bytes(320), 2)); c.encode = lambda t: audioop.lin2alaw(audioop.ulaw2lin(ulaw(t), 2), 2); c.sid = call_sid
    url = f"ws://127.0.0.1:{port}/voicelink?n={nid}&sig={product.sign('number', nid)}"
    async with websockets.connect(url, max_size=None) as ws:
        await ws.send(json.dumps({"event": "start", "sequence_number": 0, "stream_sid": sid, "start": {
            "stream_sid": sid, "call_sid": call_sid, "account_sid": "77", "from": "0" + VL_CALLER[3:], "to": number["phoneNumber"][1:],
            "custom_parameters": {}, "media_format": {"encoding": "audio/alaw", "sample_rate": "8000"}}}))
        async def receiver():
            try:
                async for raw in ws:
                    m = json.loads(raw)
                    if m.get("event") == "media":
                        c.heard(len(base64.b64decode(m["media"]["payload"])))
            except websockets.ConnectionClosed:
                pass
            c.closed.set()
        async def sender():
            while not c.closed.is_set():
                fr = c.next_chunk()
                msg = {"event": "media", "streamSid": sid, "media": {"track": "inbound", "payload": base64.b64encode(fr).decode()}}
                try: await ws.send(json.dumps(msg))
                except websockets.ConnectionClosed: return
                await asyncio.sleep(0.02)
        rt, st = asyncio.create_task(receiver()), asyncio.create_task(sender())
        try:
            await run_lines(c, lines)
        finally:
            st.cancel(); rt.cancel()
    return c


# --- checks ---------------------------------------------------------------------------------------

async def wait_call(query, secs=10.0):
    end = time.monotonic() + secs
    while time.monotonic() < end:
        doc = db.voice_calls.find_one({**query, "startedAt": {"$gte": CREATED["since"].replace(tzinfo=None)}}, sort=[("_id", -1)])
        if doc:
            return doc
        await asyncio.sleep(0.5)
    return None


def show(doc):
    for i, t in enumerate(doc.get("turns", [])):
        print(f"      {i:2d} {t['role']:6s} {t['text'][:150]}")
    for t in doc.get("toolCalls") or []:
        print(f"      tool after turn {t['afterTurn']}: {t['name']}({json.dumps(t['arguments'])}) ok={t['ok']} {t['durationMs']} ms -> {t['result'][:110]!r}")


def after(doc, call) -> str:
    """What she said after a tool ran."""
    return " ".join(t["text"] for t in doc["turns"][call["afterTurn"]:] if t["role"] == "agent").lower()


def check_booking(label, doc, channel, phone, events=None):
    """The booking story on one call: availability looked up, then booked, written right, and said."""
    if not doc:
        ok(f"{label}: voice_calls doc written", False)
        return
    show(doc)
    calls = doc.get("toolCalls") or []
    names = [t["name"] for t in calls]
    ok(f"{label}: check_availability then book_appointment", "check_availability" in names and "book_appointment" in names
       and names.index("check_availability") < names.index("book_appointment"), str(names))
    booked = [t for t in calls if t["name"] == "book_appointment" and t["ok"] and t.get("bookingId")]
    ok(f"{label}: a booking was made", booked, str([t["result"][:80] for t in calls if t["name"] == "book_appointment"]))
    if not booked:
        return
    b = db.voice_bookings.find_one({"_id": ObjectId(booked[0]["bookingId"])})
    day, start = saturday_2pm()
    ok(f"{label}: voice_bookings doc: Saturday 14:00 {TZ} = {start:%Y-%m-%d %H:%M}Z, 30 min",
       b and b["start"].replace(tzinfo=timezone.utc) == start and b["end"].replace(tzinfo=timezone.utc) == start + timedelta(minutes=30)
       and b["status"] == "BOOKED" and b["timezone"] == TZ, f"{b and b['start']} - {b and b['end']}")
    ok(f"{label}: booking.callId is this call's voice_calls _id", b and b["callId"] == doc["_id"], f"{b and b['callId']} vs {doc['_id']}")
    ok(f"{label}: customer Ravi Kumar, phone {phone}, channel {channel}",
       b and "ravi" in b["customerName"].lower() and b["customerPhone"] == phone and b["channel"] == channel and b["agentId"] == doc["agentId"],
       f"{b and b['customerName']!r} {b and b['customerPhone']} {b and b['channel']}")
    said = after(doc, booked[0])
    ok(f"{label}: her reply after booking mentions it", any(w in said for w in ("booked", "confirmed", "all set", "see you", "you're set", "scheduled")),
       said[:160])
    tools_args = [t["arguments"] for t in calls if t["name"] == "check_availability"]
    ok(f"{label}: she asked for the right day", any(a.get("date") == day.isoformat() for a in tools_args), str(tools_args))
    ok(f"{label}: ended normally (not a guard hang-up)", doc["endedBy"] in ("goodbye", "caller_hung_up"), doc["endedBy"])
    if events is not None:
        tev = [e for e in events if e["type"] == "tool"]
        ok(f"{label}: tool events on the socket, matching toolCalls", [e["name"] for e in tev] == names
           and all(e["ok"] == t["ok"] and e["result"] == t["result"] and e["arguments"] == t["arguments"] for e, t in zip(tev, calls)),
           str([(e["name"], e["ok"]) for e in tev]))
        ok(f"{label}: only the contract's events", all(e["type"] in ("clear", "transcript", "turn", "ended", "tool") for e in events))


def clear_bookings(agent):
    db.voice_bookings.delete_many({"agentId": agent["_id"]})


# --- the scenarios --------------------------------------------------------------------------------

async def test_play(port, agents, numbers):
    print("\n== playground: book Saturday at 2 pm ==")
    clear_bookings(agents["book"])
    c = await play_call(port, agents["book"], BOOK)
    await asyncio.sleep(2)
    check_booking("play", await wait_call({"agentId": agents["book"]["_id"], "channel": "PLAYGROUND"}), "PLAYGROUND", None, c.events)


async def test_texml(port, agents, numbers):
    print("\n== /texml?n= + Telnyx socket (a call in): book Saturday at 2 pm ==")
    clear_bookings(agents["book"])
    n = numbers["book"]; nid = str(n["_id"])
    st, xml = await pe.ahttp("GET", f"http://127.0.0.1:{port}/texml?n={nid}&sig={product.sign('number', nid)}&Direction=inbound"
                                    f"&From={urllib.parse.quote(CALLER)}&To={urllib.parse.quote(n['phoneNumber'])}")
    import re
    m = re.search(r'url="wss://[^/]+(/telnyx\?[^"]+)"', xml)
    ok("texml answered with a stream", st == 200 and m, f"HTTP {st}")
    if not m:
        return
    c = await telnyx_call(port, f"ws://127.0.0.1:{port}" + m.group(1).replace("&amp;", "&"), BOOK)
    await asyncio.sleep(2)
    check_booking("texml", await wait_call({"numberId": n["_id"], "direction": "INBOUND", "providerCallId": f"test:{c.sid}"}), "PHONE", CALLER)


async def test_calls(port, agents, numbers):
    print("\n== POST /calls + Telnyx socket (a call we place): book Saturday at 2 pm ==")
    clear_bookings(agents["book"])
    n = numbers["book"]
    pe.SEEN.clear()
    st, body = await pe.ahttp("POST", f"http://127.0.0.1:{port}/calls", {"numberId": str(n["_id"]), "to": CALLEE},
                              {"Authorization": f"Bearer {os.environ['VOICELAB_KEY']}"})
    sent = [s for s in pe.SEEN if s["path"] == "/v2/calls"]
    ok("/calls dialled through the fake Telnyx", st == 200 and sent, f"HTTP {st} {body[:100]}")
    if not sent:
        return
    d = sent[0]["body"]
    local = lambda u: urllib.parse.urlunsplit(("ws" if u.startswith("wss") else "http", f"127.0.0.1:{port}") + tuple(urllib.parse.urlsplit(u)[2:4]) + ("",))
    c = await telnyx_call(port, local(d["stream_url"]), BOOK, events_url=local(d["webhook_url"]), ring=3, first_hello=True)
    await asyncio.sleep(2)
    check_booking("calls", await wait_call({"numberId": n["_id"], "direction": "OUTBOUND", "providerCallId": f"test:{c.sid}"}), "PHONE", CALLEE)


async def test_voicelink(port, agents, numbers):
    print("\n== /voicelink (a call in to a VoiceLink number): book Saturday at 2 pm ==")
    clear_bookings(agents["book"])
    n = numbers["vl"]
    c = await voicelink_call(port, n, BOOK)
    await asyncio.sleep(2)
    check_booking("voicelink", await wait_call({"numberId": n["_id"], "providerCallId": c.sid}), "PHONE", VL_CALLER)


async def test_hook(port, agents, numbers):
    print("\n== playground: a webhook tool that answers ==")
    HOOKS.clear()
    c = await play_call(port, agents["hook"], ORDER)
    await asyncio.sleep(2)
    doc = await wait_call({"agentId": agents["hook"]["_id"]})
    if doc: show(doc)
    req = next((h for h in HOOKS if h["path"] == "/order"), None)
    ok("the tool server got one POST", req is not None and len([h for h in HOOKS if h["path"] == "/order"]) == 1, str(len(HOOKS)))
    if not req or not doc:
        return
    body = json.loads(req["raw"])
    ok("body: tool, arguments, call", body.get("tool") == "order_status" and "4271" in str(body.get("arguments", {}).get("order_id", "")).replace(" ", "")
       and body.get("call") == {"id": str(doc["_id"]), "agentId": str(agents["hook"]["_id"]), "channel": "PLAYGROUND", "direction": "PLAYGROUND",
                                "from": None, "to": None}, str(body))
    want = "sha256=" + hmac.new(SECRET.encode(), req["raw"], hashlib.sha256).hexdigest()
    ok("signed: X-Aixel-Signature = HMAC-SHA256(secret, raw body); JSON; User-Agent",
       req["headers"].get("X-Aixel-Signature") == want and req["headers"].get("Content-Type") == "application/json"
       and req["headers"].get("User-Agent") == "AixelLabs-VoiceAgent/1")
    calls = doc.get("toolCalls") or []
    ok("toolCalls has the run, ok", len(calls) == 1 and calls[0]["name"] == "order_status" and calls[0]["ok"] and "BlueDart" in calls[0]["result"], str(calls)[:200])
    said = after(doc, calls[0]) if calls else ""
    ok("she used the answer (Tuesday / BlueDart / shipped)", any(w in said for w in ("tuesday", "bluedart", "blue dart", "shipped")), said[:160])
    tev = [e for e in c.events if e["type"] == "tool"]
    ok("tool event on the socket", len(tev) == 1 and tev[0]["name"] == "order_status" and tev[0]["ok"] is True, str(tev)[:200])


async def test_hookfail(port, agents, numbers):
    print("\n== playground: a webhook tool that answers 500 ==")
    HOOKS.clear()
    c = await play_call(port, agents["hookfail"], ORDER)
    await asyncio.sleep(2)
    doc = await wait_call({"agentId": agents["hookfail"]["_id"]})
    if not doc:
        ok("voice_calls doc written", False); return
    show(doc)
    calls = doc.get("toolCalls") or []
    ok("the tool ran and failed (ok false, HTTP 500)", calls and not calls[0]["ok"] and "HTTP 500" in calls[0]["result"], str(calls)[:200])
    said = after(doc, calls[0]) if calls else ""
    ok("she says she couldn't, without inventing an answer", said and not any(w in said for w in ("tuesday", "bluedart", "shipped", "on its way"))
       and any(w in said for w in ("couldn't", "can't", "cannot", "unable", "not able", "trouble", "sorry", "right now", "isn't working", "problem")), said[:160])
    ok("no raw error spoken", "500" not in said and "http" not in said)
    ok("the call went on and ended normally", doc["endedBy"] in ("goodbye", "caller_hung_up") and len([t for t in doc["turns"] if t["role"] == "caller"]) >= 2, doc["endedBy"])


async def test_slow(port, agents, numbers):
    print("\n== /texml + Telnyx socket: a webhook that never answers (8 s timeout) ==")
    HOOKS.clear()
    n = numbers["slow"]; nid = str(n["_id"])
    st, xml = await pe.ahttp("GET", f"http://127.0.0.1:{port}/texml?n={nid}&sig={product.sign('number', nid)}&Direction=inbound"
                                    f"&From={urllib.parse.quote(CALLER)}&To={urllib.parse.quote(n['phoneNumber'])}")
    import re
    m = re.search(r'url="wss://[^/]+(/telnyx\?[^"]+)"', xml)
    if not m:
        ok("texml answered with a stream", False); return
    async def wait_out(c, i):   # the caller waits the full timeout in silence: nothing may hang up on them
        if i == 0:
            t = time.perf_counter()
            while time.perf_counter() - t < 14 and not c.closed.is_set():
                await asyncio.sleep(0.2)
    c = await telnyx_call(port, f"ws://127.0.0.1:{port}" + m.group(1).replace("&amp;", "&"), ORDER, between=wait_out)
    await asyncio.sleep(2)
    doc = await wait_call({"numberId": n["_id"], "providerCallId": f"test:{c.sid}"})
    if not doc:
        ok("voice_calls doc written", False); return
    show(doc)
    calls = doc.get("toolCalls") or []
    ok("the tool timed out after ~8 s (ok false)", calls and not calls[0]["ok"] and "no answer in 8 s" in calls[0]["result"] and 7500 < calls[0]["durationMs"] < 10000,
       str([(t["result"][:40], t["durationMs"]) for t in calls]))
    said = after(doc, calls[0]) if calls else ""
    ok("she recovers politely after the timeout", said and any(w in said for w in ("couldn't", "can't", "cannot", "unable", "not able", "trouble", "sorry", "right now", "problem")), said[:160])
    ok("the guard did not hang up during the wait; the call ended normally", doc["endedBy"] in ("goodbye", "caller_hung_up")
       and len([t for t in doc["turns"] if t["role"] == "caller"]) >= 2, f"{doc['endedBy']}, flags {doc['flags']}")


async def test_talkover(port, agents, numbers):
    print("\n== playground: the caller talks while a tool runs (5 s webhook) ==")
    HOOKS.clear()
    async def interrupt(c, i):
        if i != 0:
            return
        end = time.monotonic() + 20
        while not HOOKS and time.monotonic() < end:
            await asyncio.sleep(0.1)
        await asyncio.sleep(2.0)   # mid-call: the server answers 3 s later
        c.say(pcm16k(STILL_THERE)); await c.drained()
    c = await play_call(port, agents["talkover"], ORDER, between=interrupt)
    await asyncio.sleep(2)
    doc = await wait_call({"agentId": agents["talkover"]["_id"]})
    if not doc:
        ok("voice_calls doc written", False); return
    show(doc)
    calls = doc.get("toolCalls") or []
    ok("the run is logged even though the caller spoke over it", calls and calls[0]["name"] == "order_status" and all(c["ok"] for c in calls), str(calls)[:200])
    ok("one request reached the server however often she asked", len([h for h in HOOKS if h["path"] == "/slowish"]) == 1,
       f"{len(HOOKS)} requests for {len(calls)} runs")
    agent_after = " ".join(t["text"] for t in doc["turns"][(calls[0]["afterTurn"] if calls else 0):] if t["role"] == "agent").lower()
    ok("she did not go silent: she answered after the interruption", len(agent_after) > 10, agent_after[:160])
    ok("the call ended normally", doc["endedBy"] in ("goodbye", "caller_hung_up"), doc["endedBy"])


async def test_plain(port, agents, numbers):
    print("\n== playground: an agent with NO tools asked to book ==")
    c = await play_call(port, agents["plain"], BOOK[:2] + [BOOK[-1]])
    await asyncio.sleep(2)
    doc = await wait_call({"agentId": agents["plain"]["_id"]})
    if not doc:
        ok("voice_calls doc written", False); return
    show(doc)
    ok("no tool events, only the old events on the socket", all(e["type"] in ("clear", "transcript", "turn", "ended") for e in c.events),
       str({e["type"] for e in c.events}))
    ok("no toolCalls field, no booking", "toolCalls" not in doc and db.voice_bookings.count_documents({"agentId": agents["plain"]["_id"]}) == 0)
    ok("a normal call: she spoke first, turns and gaps recorded, ended normally",
       doc["turns"] and doc["turns"][0]["role"] == "agent" and doc["gapsMs"] and doc["endedBy"] in ("goodbye", "caller_hung_up"),
       f"{len(doc['turns'])} turns, gaps {doc['gapsMs']}, {doc['endedBy']}")


async def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 7861
    testdb.engine_on(port, DBNAME)
    which = sys.argv[2:] or ["play", "texml", "calls", "voicelink", "hook", "hookfail", "slow", "talkover", "plain"]
    for line in BOOK + ORDER + [HELLO, STILL_THERE]:
        scripted.tts(line)   # every line ready before the first call
    fake, hooks = await pe.fake_telnyx(), await tool_server()
    agents, numbers = fixtures()
    print(f"fixtures in {DBNAME}: agents {[str(a['_id']) for a in agents.values()]}")
    tests = {"play": test_play, "texml": test_texml, "calls": test_calls, "voicelink": test_voicelink, "hook": test_hook,
             "hookfail": test_hookfail, "slow": test_slow, "talkover": test_talkover, "plain": test_plain}
    try:
        for i, name in enumerate(which):
            if i:
                await asyncio.sleep(8)   # Gemini's per-minute limits: one session, then a breath
            await tests[name](port, agents, numbers)
    finally:
        await fake.cleanup(); await hooks.cleanup()
        db.voice_bookings.delete_many({"agentId": {"$in": CREATED["agents"]}})
        db.voice_calls.delete_many({"agentId": {"$in": CREATED["agents"]}})
        db.voice_numbers.delete_many({"_id": {"$in": CREATED["numbers"]}})
        db.voice_agents.delete_many({"_id": {"$in": CREATED["agents"]}})
        db.voice_settings.delete_many({"userId": {"$in": CREATED.get("owners", [])}})
    passed = sum(1 for _, p in RESULTS if p)
    print(f"\n{passed}/{len(RESULTS)} passed")
    for name, p in RESULTS:
        if not p:
            print("  FAILED:", name)


if __name__ == "__main__":
    asyncio.run(main())
