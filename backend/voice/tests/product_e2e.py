"""End to end check of the voice agents product endpoints (/play, /texml?n=, /calls, /telnyx-events?n=).

Needs a test instance of the server pointed at a throwaway database and a fake Telnyx:

    MONGODB_URI=mongodb://127.0.0.1:27018 MONGODB_DB_NAME=AixelLabsVoiceEngineDev \\
      TELNYX_API_BASE=http://127.0.0.1:8799 LOG_LEVEL=INFO .venv/bin/python phone.py --port 7861
    .venv/bin/python tests/product_e2e.py 7861 [play texml calls]

Never point it at production Mongo: it inserts fixtures and reads back voice_calls.
Uses one Gemini Live session at a time. Nothing reaches the real Telnyx: the fake
on :8799 records what the server sent it.
"""
import asyncio, audioop, hashlib, json, os, sys, time, urllib.parse, urllib.request
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(HERE)); sys.path.insert(0, str(HERE / "tests"))
import testdb
MONGO, DBNAME = testdb.throwaway()
FAKE_PORT = int(os.getenv("FAKE_TELNYX_PORT", "8799"))   # another session may hold :8799
os.environ["TELNYX_API_BASE"] = f"http://127.0.0.1:{FAKE_PORT}"   # for the in-process record_start check

import websockets
from aiohttp import web
from bson import ObjectId
from pymongo import MongoClient
import product, bot, scripted

db = MongoClient(MONGO)[DBNAME]
LINE = scripted.CACHE
FAKE_KEY = "KEY_FAKE_CUSTOMER_0123456789"
RESULTS = []


def ok(name, cond, detail=""):
    RESULTS.append((name, bool(cond)))
    print(f"  [{'PASS' if cond else 'FAIL'}] {name}{' -- ' + detail if detail else ''}", flush=True)


def fixtures():
    """One tenant, one user, an agent with an unmistakable prompt, and three numbers."""
    now = datetime.now(timezone.utc)
    tenant, user = ObjectId(), ObjectId()
    scripted.give_owner_key(db, tenant, user)
    agent = {"tenantId": tenant, "userId": user, "name": "Test receptionist", "voice": "kore",
             "prompt": "You are Priya, the receptionist at Sunrise Dental in Austin. You answer the phone for the clinic. "
                       "Say your name and the clinic's name in your very first sentence. Keep every reply to one or two short sentences.",
             "callNotes": "The caller's next appointment is Thursday at 3 pm.", "createdAt": now, "updatedAt": now}
    agent["_id"] = db.voice_agents.insert_one(agent).inserted_id
    base = {"tenantId": tenant, "userId": user, "provider": "TELNYX", "providerNumberId": "fake-pn-1",
            "apiKeySealed": product.seal_secret(FAKE_KEY), "createdAt": now, "updatedAt": now}
    full = {**base, "phoneNumber": "+15550001111", "texmlAppId": "fake-texml-app", "callControlAppId": "fake-cc-app", "inboundAgentId": agent["_id"], "outboundAgentId": agent["_id"]}
    full["_id"] = testdb.insert_number(db, full)
    no_agent = {**base, "phoneNumber": "+15550002222", "callControlAppId": "fake-cc-app", "inboundAgentId": None, "outboundAgentId": None}
    no_agent["_id"] = testdb.insert_number(db, no_agent)
    no_cc = {**base, "phoneNumber": "+15550003333", "outboundAgentId": agent["_id"]}
    no_cc["_id"] = testdb.insert_number(db, no_cc)
    return agent, full, no_agent, no_cc


# --- a fake Telnyx API: records every request, answers like the real one ---------------------------

SEEN: list[dict] = []


async def fake_telnyx():
    async def handle(request):
        body = await request.json() if request.can_read_body else None
        SEEN.append({"path": request.path, "auth": request.headers.get("Authorization"), "body": body})
        if request.path == "/v2/calls":
            return web.json_response({"data": {"call_control_id": "v3:fake-" + os.urandom(6).hex(), "call_leg_id": "x"}})
        return web.json_response({"data": {"result": "ok"}})
    app = web.Application(); app.router.add_route("*", "/{tail:.*}", handle)
    runner = web.AppRunner(app); await runner.setup()
    await web.TCPSite(runner, "127.0.0.1", FAKE_PORT).start()
    return runner


def http(method, url, body=None, headers=None):
    req = urllib.request.Request(url, data=json.dumps(body).encode() if body is not None else None, method=method,
                                 headers={"Content-Type": "application/json", **(headers or {})})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return r.status, r.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()


async def ahttp(*args, **kwargs):   # off the loop: the fake Telnyx answers on this same loop
    return await asyncio.to_thread(http, *args, **kwargs)


def latest_call(**match):
    return db.voice_calls.find_one(match, sort=[("_id", -1)])


# --- /play -----------------------------------------------------------------------------------------

def clip16k(text):
    """A cached spoken line (8 kHz mu-law, tests/linecache) as 16 kHz Int16 LE, the browser's format."""
    pcm8 = audioop.ulaw2lin((LINE / (hashlib.sha1(text.encode()).hexdigest()[:16] + ".ulaw")).read_bytes(), 2)
    return audioop.ratecv(pcm8, 2, 1, 8000, 16000, None)[0]


async def play_session(port, agent_id, user_id, token=None, script=(), barge=None):
    """A browser: mic at 16 kHz, her audio at 24 kHz, JSON events. Returns what came back."""
    t = token or bot.make_token("play", agent_id, user_id, ttl=120)
    url = f"ws://127.0.0.1:{port}/play?agent={agent_id}&user={user_id}&t={urllib.parse.quote(t)}"
    out = {"audio": 0, "events": [], "close": None, "first_audio": None}
    heard = {"t": 0.0}; mic = asyncio.Queue(); t0 = time.perf_counter()
    async with websockets.connect(url, max_size=None) as ws:
        async def receiver():
            try:
                async for m in ws:
                    if isinstance(m, bytes):
                        out["audio"] += len(m); heard["t"] = time.perf_counter()
                        out["first_audio"] = out["first_audio"] or round(heard["t"] - t0, 2)
                    else:
                        ev = json.loads(m); ev["at"] = round(time.perf_counter() - t0, 2); out["events"].append(ev)
                        print(f"    {ev}", flush=True)
            except websockets.ConnectionClosed:
                pass
            out["close"] = (ws.close_code, ws.close_reason)
        async def sender():   # a live microphone: never stops, silence between lines
            while True:
                try: chunk = mic.get_nowait()
                except asyncio.QueueEmpty: chunk = bytes(640)
                try: await ws.send(chunk)
                except websockets.ConnectionClosed: return
                await asyncio.sleep(0.02)
        def say(pcm):
            for i in range(0, len(pcm), 640): mic.put_nowait(pcm[i:i + 640].ljust(640, b"\0"))
        async def her_turn_done(max_wait=25.0):
            end = time.perf_counter() + max_wait; start = out["audio"]
            while time.perf_counter() < end and out["close"] is None:
                await asyncio.sleep(0.1)
                if out["audio"] > start + 24000 and time.perf_counter() - heard["t"] > 1.3: return True
            return False
        rt, st = asyncio.create_task(receiver()), asyncio.create_task(sender())
        if out["close"] is None and not script and token:   # a refusal test: just wait for the close
            await asyncio.wait_for(rt, 10); st.cancel(); return out
        await her_turn_done()
        for line in script:
            if out["close"]: break
            say(clip16k(line))
            if line == barge:   # wait until she has started her reply, then talk over it
                while mic.qsize(): await asyncio.sleep(0.05)
                start = out["audio"]
                while out["audio"] < start + 48000 and out["close"] is None: await asyncio.sleep(0.05)
                await asyncio.sleep(0.6); say(clip16k("Who is this? I'm busy right now."))
            await her_turn_done()
        end = time.perf_counter() + 8
        while out["close"] is None and time.perf_counter() < end: await asyncio.sleep(0.1)
        st.cancel()
        if out["close"] is None:
            await ws.close(); await asyncio.sleep(1)
        rt.cancel()
    return out


async def test_play(port, agent):
    print("\n== /play ==")
    aid, uid = str(agent["_id"]), str(agent["userId"])
    bad = await play_session(port, aid, uid, token="123.deadbeef")
    ok("bad token refused with 1008", bad["close"] and bad["close"][0] == 1008, str(bad["close"]))
    expired = await play_session(port, aid, uid, token=bot.make_token("play", aid, uid, ttl=-5))
    ok("expired token refused with 1008", expired["close"] and expired["close"][0] == 1008, str(expired["close"]))
    other = str(ObjectId())
    wrong = await play_session(port, aid, other, token=bot.make_token("play", aid, other))
    ok("someone else's agent refused with 1008", wrong["close"] and wrong["close"][0] == 1008, str(wrong["close"]))

    dnc_before = (HERE / "suppressed.jsonl").read_text()
    t_start = datetime.now(timezone.utc)
    r = await play_session(port, aid, uid, script=["Yeah, go ahead, I've got a minute.", "Wait, are you a robot?",
                                                   "How long is this going to take?", "I said no, stop calling me."],
                           barge="Wait, are you a robot?")
    ev = r["events"]
    agent_lines = [e["text"] for e in ev if e["type"] == "transcript" and e["role"] == "agent"]
    caller_lines = [e["text"] for e in ev if e["type"] == "transcript" and e["role"] == "caller"]
    turns = [e["gapMs"] for e in ev if e["type"] == "turn"]
    ok("her audio arrived (24 kHz Int16)", r["audio"] > 48000, f"{r['audio'] / 48000:.1f} s of audio, first byte at {r['first_audio']} s")
    ok("she spoke first, as the agent's prompt says", agent_lines and ("priya" in agent_lines[0].lower() or "sunrise" in agent_lines[0].lower()), repr(agent_lines[:1]))
    ok("caller transcripts", len(caller_lines) >= 3, repr(caller_lines))
    ok("turn events", len(turns) >= 2, f"gaps {turns}")
    ok("clear on barge-in", any(e["type"] == "clear" for e in ev))
    ok("only the contract's events on the socket", all(e["type"] in ("clear", "transcript", "turn", "ended") for e in ev),
       str({e["type"] for e in ev}))
    ended = [e for e in ev if e["type"] == "ended"]
    ok("ended event before the close", ended and r["close"] is not None, f"{ended} close={r['close']}")
    await asyncio.sleep(2)
    doc = latest_call(agentId=agent["_id"], channel="PLAYGROUND", startedAt={"$gte": t_start.replace(microsecond=0)})
    ok("voice_calls doc written", doc is not None)
    if doc:
        ok("doc shape", doc["direction"] == "PLAYGROUND" and doc["numberId"] is None and "from" not in doc and "to" not in doc
           and doc["tenantId"] == agent["tenantId"] and doc["userId"] == agent["userId"] and doc["voice"] == "kore"
           and isinstance(doc["startedAt"], datetime) and doc["durationSec"] > 0 and doc["turns"] and doc["gapsMs"],
           f"endedBy={doc['endedBy']} duration={doc['durationSec']}s turns={len(doc['turns'])} gaps={doc['gapsMs']} flags={doc['flags']}")
    ok("no do-not-call write from the playground", (HERE / "suppressed.jsonl").read_text() == dnc_before)


# --- /texml?n= (a call coming in to a customer's number) --------------------------------------------

async def test_texml(port, number):
    print("\n== /texml?n= ==")
    nid = str(number["_id"])
    st, _ = await ahttp("GET", f"http://127.0.0.1:{port}/texml?n={nid}&sig=0123456789abcdef0123456789abcdef")
    ok("bad signature -> 403", st == 403, f"HTTP {st}")
    st, _ = await ahttp("GET", f"http://127.0.0.1:{port}/texml?n={nid}")
    ok("missing signature -> 403 (even from loopback)", st == 403, f"HTTP {st}")
    st, _ = await ahttp("POST", f"http://127.0.0.1:{port}/telnyx-events?n={nid}&sig=bad", {"data": {}})
    ok("/telnyx-events bad signature -> 403", st == 403, f"HTTP {st}")
    t_start = datetime.now(timezone.utc).replace(microsecond=0)
    r = await scripted.run(str(port), "busy", texml=True, number=nid, caller="+15557770000")
    await asyncio.sleep(2)
    first = r["first_sound"]   # she answers: no waiting for a "hello" (it would be 3 s of silence)
    ok("she speaks first on a call coming in (no hello wait)", first is not None and first < 1.5,
       f"first sound {first:.2f} s after the stream opened" if first is not None else "no audio")
    doc = latest_call(numberId=number["_id"], direction="INBOUND", startedAt={"$gte": t_start})
    ok("voice_calls doc written", doc is not None)
    if doc:
        agent_text = " ".join(t["text"] for t in doc["turns"] if t["role"] == "agent").lower()
        ok("doc shape", doc["channel"] == "PHONE" and doc["from"] == "+15557770000" and doc["to"] == number["phoneNumber"]
           and doc["agentId"] == number["inboundAgentId"] and doc["voice"] == "kore" and str(doc.get("providerCallId", "")).startswith("test:"),
           f"from={doc['from']} to={doc['to']} voice={doc['voice']} endedBy={doc['endedBy']} duration={doc['durationSec']}s gaps={doc['gapsMs']}")
        ok("answered as the agent (her prompt, not prompt.md)", "priya" in agent_text or "sunrise" in agent_text, agent_text[:160])

    # The owner's browser dials the number's SIP address; Telnyx may send a phone number as From: the log keeps the address.
    t_start = datetime.now(timezone.utc).replace(microsecond=0)
    address = "sip:testreceptionist-browser@aixel0a1b2c3d4e5f.sip.telnyx.com"
    await scripted.run(str(port), "busy", texml=True, number=nid, caller="+15550001111", to=address)
    await asyncio.sleep(2)
    doc = latest_call(numberId=number["_id"], direction="INBOUND", startedAt={"$gte": t_start})
    ok("a call to the number's SIP address is logged from that address, no caller phone",
       doc is not None and doc["from"] == address and not doc.get("callerPhone"), str(doc and doc.get("from")))


# --- POST /calls ---------------------------------------------------------------------------------

async def test_calls(port, number, no_agent, no_cc):
    print("\n== POST /calls ==")
    secret = os.environ["VOICELAB_KEY"]
    url = f"http://127.0.0.1:{port}/calls"
    st, body = await ahttp("POST", url, {"numberId": str(number["_id"]), "to": "+15559990000"})
    ok("no bearer -> 401", st == 401, f"HTTP {st} {body}")
    st, body = await ahttp("POST", url, {"numberId": str(number["_id"]), "to": "+15559990000"}, {"Authorization": "Bearer nope"})
    ok("wrong bearer -> 401", st == 401, f"HTTP {st} {body}")
    auth = {"Authorization": f"Bearer {secret}"}
    st, body = await ahttp("POST", url, {"numberId": str(no_agent["_id"]), "to": "+15559990000"}, auth)
    ok("number without agent -> 409", st == 409, f"HTTP {st} {body}")
    st, body = await ahttp("POST", url, {"numberId": str(no_cc["_id"]), "to": "+15559990000"}, auth)
    ok("number without Call Control app -> 409", st == 409, f"HTTP {st} {body}")
    st, body = await ahttp("POST", url, {"numberId": str(ObjectId()), "to": "+15559990000"}, auth)
    ok("unknown number -> 404", st == 404, f"HTTP {st} {body}")
    st, body = await ahttp("POST", url, {"numberId": str(number["_id"]), "to": "hello"}, auth)
    ok("bad 'to' -> 400", st == 400, f"HTTP {st} {body}")
    with (HERE / "suppressed.jsonl").open("a") as f:
        f.write(json.dumps({"number": "+15559990001", "reason": "test", "quote": "product_e2e", "stream_id": "test"}) + "\n")
    st, body = await ahttp("POST", url, {"numberId": str(number["_id"]), "to": "+1 555 999 0001"}, auth)
    ok("suppressed number -> 409, nothing sent to Telnyx", st == 409 and not SEEN, f"HTTP {st} {body}")
    st, body = await ahttp("POST", url, {"numberId": str(number["_id"]), "to": "sip:aixelsoft01@sip.telnyx.com"}, auth)
    sent = [s for s in SEEN if s["path"] == "/v2/calls"]
    ok("the owner's softphone (sip:<user>@sip.telnyx.com) is dialled as it is", st == 200 and len(sent) == 1
       and sent[0]["body"]["to"] == "sip:aixelsoft01@sip.telnyx.com", f"HTTP {st} {body}")
    st, body = await ahttp("POST", url, {"numberId": str(number["_id"]), "to": "sip:gencredAb12Cd34Ef56Gh78Ij90Kl12Mn34Op@sip.telnyx.com"}, auth)
    ok("the owner's browser phone (a telephony credential's gencred…) too", st == 200, f"HTTP {st} {body}")
    st, body = await ahttp("POST", url, {"numberId": str(number["_id"]), "to": "sip:someone@example.com"}, auth)
    ok("any other SIP URI -> 400", st == 400, f"HTTP {st} {body}")
    SEEN.clear()

    st, body = await ahttp("POST", url, {"numberId": str(number["_id"]), "to": "+15559990000"}, auth)
    ok("good request -> 200 {ok, callId}", st == 200 and json.loads(body).get("ok") and json.loads(body)["callId"].startswith("v3:fake-"), body)
    sent = [s for s in SEEN if s["path"] == "/v2/calls"]
    ok("one dial reached the fake Telnyx", len(sent) == 1, str(len(sent)))
    if not sent:
        return
    d, nid = sent[0]["body"], str(number["_id"])
    stream = urllib.parse.urlparse(d["stream_url"]); sq = dict(urllib.parse.parse_qsl(stream.query))
    hook = urllib.parse.urlparse(d["webhook_url"]); hq = dict(urllib.parse.parse_qsl(hook.query))
    ok("auth header is the customer's key", sent[0]["auth"] == f"Bearer {FAKE_KEY}", sent[0]["auth"][:20] + "...")
    ok("connection_id / from / to", d["connection_id"] == "fake-cc-app" and d["from"] == "+15550001111" and d["to"] == "+15559990000",
       f"{d['connection_id']} {d['from']} -> {d['to']}")
    ok("stream opens before the call, ring=1, the agent's voice, n=",
       d["stream_establish_before_call_originate"] is True and sq.get("ring") == "1" and sq.get("n") == nid and sq.get("voice") == "kore"
       and stream.path == "/telnyx" and sq.get("t"), d["stream_url"][:140])
    ok("webhook carries n + sig", hook.path == "/telnyx-events" and hq.get("n") == nid and hq.get("sig") == product.sign("number", nid), d["webhook_url"][:140])

    # Play Telnyx's part: open the stream it was given, ring 4 s, post call.answered to the webhook it was given.
    t_start = datetime.now(timezone.utc).replace(microsecond=0)
    await scripted.run(str(port), "human_pickup", ring=4, url=d["stream_url"], events=d["webhook_url"])
    await asyncio.sleep(2)
    doc = latest_call(numberId=number["_id"], direction="OUTBOUND", startedAt={"$gte": t_start})
    ok("outbound voice_calls doc written", doc is not None)
    if doc:
        agent_text = " ".join(t["text"] for t in doc["turns"] if t["role"] == "agent").lower()
        ok("doc shape", doc["from"] == "+15550001111" and doc["to"] == "+15559990000" and doc["channel"] == "PHONE" and doc["voice"] == "kore",
           f"endedBy={doc['endedBy']} duration={doc['durationSec']}s gaps={doc['gapsMs']} agent: {agent_text[:120]!r}")

    # record_start, as serve() calls it for a customer's call: their key, TELNYX_API_BASE.
    import phone
    SEEN.clear()
    await phone.start_recording("v3:fake-rec", product.open_secret(number["apiKeySealed"]))
    ok("record_start goes to TELNYX_API_BASE with the customer's key",
       SEEN and SEEN[0]["path"] == "/v2/calls/v3:fake-rec/actions/record_start" and SEEN[0]["auth"] == f"Bearer {FAKE_KEY}", str(SEEN[:1]))


async def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 7861
    testdb.engine_on(port, DBNAME)
    which = sys.argv[2:] or ["play", "texml", "calls"]
    fake = await fake_telnyx()
    agent, number, no_agent, no_cc = fixtures()
    print(f"fixtures in {DBNAME}: agent {agent['_id']} user {agent['userId']} number {number['_id']}")
    try:
        if "play" in which: await test_play(port, agent)
        if "texml" in which: await test_texml(port, number)
        if "calls" in which: await test_calls(port, number, no_agent, no_cc)
    finally:
        await fake.cleanup()
        dnc = HERE / "suppressed.jsonl"   # take back the fake number the /calls test listed
        dnc.write_text("".join(l + "\n" for l in dnc.read_text().splitlines() if '"quote": "product_e2e"' not in l))
    passed = sum(1 for _, p in RESULTS if p)
    print(f"\n{passed}/{len(RESULTS)} passed")
    for name, p in RESULTS:
        if not p: print("  FAILED:", name)


if __name__ == "__main__":
    asyncio.run(main())
