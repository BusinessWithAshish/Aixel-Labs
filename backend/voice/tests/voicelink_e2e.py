"""End to end check of VoiceLink numbers (/voicelink, /voicelink-events, POST /calls for a VoiceLink number).

Needs a test instance pointed at a throwaway database, a fake VoiceLink API and a local proxy
(both run by this script, on :7866 and :7867; the app's own e2e fakes use :7863-:7864):

    MONGODB_URI=mongodb://127.0.0.1:27018 MONGODB_DB_NAME=AixelLabsVoiceEngineDev \\
      VOICELINK_API_BASE=http://127.0.0.1:7866/api VOICELINK_PROXY_URL=http://vl:secret@127.0.0.1:7867 \\
      TELNYX_API_BASE=http://127.0.0.1:8799 LOG_LEVEL=INFO .venv/bin/python phone.py --port 7861
    .venv/bin/python tests/voicelink_e2e.py 7861 [unit rest inbound outbound events]

`direct` (not in the default set) checks add_lead with no proxy: start the server WITHOUT
VOICELINK_PROXY_URL and run `... 7861 direct`.

Never point it at production Mongo. Uses one Gemini Live session at a time (inbound, outbound).
Plays VoiceLink's part with its own protocol: a JSON start (sample_rate a string), A-law 8 kHz
media on track "inbound", stop. Nothing reaches the real VoiceLink.
"""
import asyncio, audioop, base64, hashlib, json, os, sys, time, urllib.parse, uuid
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(HERE)); sys.path.insert(0, str(HERE / "tests"))
import testdb
MONGO, DBNAME = testdb.throwaway()
API_PORT, PROXY_PORT = int(os.getenv("FAKE_VOICELINK_PORT", "7866")), int(os.getenv("FAKE_PROXY_PORT", "7867"))

import websockets
from aiohttp import web
from bson import ObjectId
from pymongo import MongoClient
import product, scripted

db = MongoClient(MONGO)[DBNAME]
FAKE_TOKEN = "VL_FAKE_CUSTOMER_TOKEN_0123456789"
RESULTS = []
CALLER = "+91987650" + os.urandom(2).hex()[:4].translate(str.maketrans("abcdef", "123456"))   # who calls in (gets DNC'd)
CALLEE = "+91912340" + os.urandom(2).hex()[:4].translate(str.maketrans("abcdef", "123456"))   # who we call
CREATED = {"numbers": [], "agents": [], "calls_since": datetime.now(timezone.utc).replace(microsecond=0)}


def ok(name, cond, detail=""):
    RESULTS.append((name, bool(cond)))
    print(f"  [{'PASS' if cond else 'FAIL'}] {name}{' -- ' + detail if detail else ''}", flush=True)


def fixtures():
    """One owner, one agent with an unmistakable prompt, a VoiceLink number (reseller client 77) and one without agents."""
    now = datetime.now(timezone.utc)
    tenant, user = ObjectId(), ObjectId()
    scripted.give_owner_key(db, tenant, user)
    CREATED.setdefault("owners", []).append(user)
    agent = {"tenantId": tenant, "userId": user, "name": "Test receptionist", "voice": "kore", "callType": "INBOUND",
             "prompt": "You are Priya, the receptionist at Sunrise Dental in Pune. You answer the phone for the clinic. "
                       "Say your name and the clinic's name in your very first sentence. Keep every reply to one or two short sentences.",
             "callNotes": "The caller's next appointment is Thursday at 3 pm.", "createdAt": now, "updatedAt": now}
    agent["_id"] = db.voice_agents.insert_one(agent).inserted_id
    did = "+9180" + str(int(time.time()))[-8:]
    base = {"tenantId": tenant, "userId": user, "provider": "VOICELINK", "providerNumberId": "4711",
            "apiKeySealed": product.seal_secret(FAKE_TOKEN), "createdAt": now, "updatedAt": now}
    number = {**base, "phoneNumber": did, "inboundAgentId": agent["_id"], "outboundAgentId": agent["_id"],
              "voicelink": {"clientId": 77, "botId": 501, "routingId": 9001, "previousRouting": None}}
    number["_id"] = db.voice_numbers.insert_one(number).inserted_id
    bare = {**base, "phoneNumber": did[:-1] + str((int(did[-1]) + 1) % 10), "inboundAgentId": None, "outboundAgentId": None,
            "voicelink": {"clientId": None, "botId": 502}}
    bare["_id"] = db.voice_numbers.insert_one(bare).inserted_id
    CREATED["numbers"] += [number["_id"], bare["_id"]]; CREATED["agents"].append(agent["_id"])
    return agent, number, bare


# --- a fake VoiceLink API, and a proxy in front of it ------------------------------------------------

SEEN: list[dict] = []
PROXIED: list[str] = []


async def fake_voicelink():
    async def handle(request):
        body = await request.json() if request.can_read_body else None
        SEEN.append({"path": request.path, "auth": request.headers.get("Authorization"), "body": body})
        if request.path == "/api/v1/add_lead":
            national = (body or {}).get("customer_number")
            if national == "9000000000":   # what VoiceLink says when the DID's outbound half is not on an active bot
                return web.json_response({"status": False, "message": "Outbound websocket bot is not active for this DID"})
            if national == "9000000001":
                return web.json_response({"message": "Unauthenticated."}, status=401)
            return web.json_response({"status": True, "message": "Lead added", "data": {"outbound_queue_id": 4242, "bot_id": 501}})
        return web.json_response({"status": False, "message": "not faked"}, status=404)
    app = web.Application(); app.router.add_route("*", "/{tail:.*}", handle)
    runner = web.AppRunner(app); await runner.setup()
    await web.TCPSite(runner, "127.0.0.1", API_PORT).start()
    return runner


async def fake_proxy():
    """A forward proxy that needs Basic auth vl:secret: absolute-form requests and CONNECT."""
    want = "Basic " + base64.b64encode(b"vl:secret").decode()

    async def pipe(r, w):
        try:
            while data := await r.read(65536):
                w.write(data); await w.drain()
        except Exception:
            pass
        finally:
            w.close()

    async def client(reader, writer):
        head = await reader.readuntil(b"\r\n\r\n")
        lines = head.decode(errors="replace").split("\r\n")
        method, target, _ = lines[0].split(" ", 2)
        headers = {l.split(":", 1)[0].lower(): l.split(":", 1)[1].strip() for l in lines[1:] if ":" in l}
        PROXIED.append(f"{method} {target} auth={'ok' if headers.get('proxy-authorization') == want else 'missing'}")
        if headers.get("proxy-authorization") != want:
            writer.write(b"HTTP/1.1 407 Proxy Authentication Required\r\nContent-Length: 0\r\n\r\n"); await writer.drain(); writer.close(); return
        if method == "CONNECT":
            host, port = target.rsplit(":", 1)
            ur, uw = await asyncio.open_connection(host, int(port))
            writer.write(b"HTTP/1.1 200 Connection established\r\n\r\n"); await writer.drain()
        else:
            u = urllib.parse.urlsplit(target)
            ur, uw = await asyncio.open_connection(u.hostname, u.port or 80)
            rest = [l for l in lines[1:] if l and not l.lower().startswith(("proxy-", "connection:"))]
            uw.write((f"{method} {u.path or '/'}{'?' + u.query if u.query else ''} HTTP/1.1\r\n" + "\r\n".join(rest)
                      + "\r\nConnection: close\r\n\r\n").encode()); await uw.drain()
        await asyncio.gather(pipe(reader, uw), pipe(ur, writer))

    return await asyncio.start_server(client, "127.0.0.1", PROXY_PORT)


def http(method, url, body=None, headers=None, raw=None):
    import urllib.request
    data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
    req = urllib.request.Request(url, data=data, method=method, headers={"Content-Type": "application/json", **(headers or {})})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, r.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()


async def ahttp(*args, **kwargs):   # off the loop: the fakes answer on this same loop
    return await asyncio.to_thread(http, *args, **kwargs)


def local(url, port):
    """A wss:// / https:// URL the engine handed out, pointed at the test instance."""
    u = urllib.parse.urlsplit(url)
    return urllib.parse.urlunsplit(("ws" if u.scheme == "wss" else "http", f"127.0.0.1:{port}", u.path, u.query, ""))


# --- the fake VoiceLink caller --------------------------------------------------------------------

def alaw(text):
    """A cached spoken line (tests/linecache, 8 kHz mu-law) as VoiceLink sends it: A-law 8 kHz."""
    return audioop.lin2alaw(audioop.ulaw2lin(scripted.tts(text), 2), 2)


ALAW_SILENCE = audioop.lin2alaw(bytes(320), 2)   # 160 samples, 20 ms


async def voicelink_call(url, start, script=(), barge=None, hello=None, echo=False, stop_at_end=False, wait_close=0.0):
    """Speak VoiceLink's protocol at `url`. Returns what came back and when."""
    out = {"media": [], "clears": [], "bad_keys": 0, "first_audio": None, "closed_by_server": False, "close": None, "hello_end": None}
    sid = start["start"]["stream_sid"]; outbox = asyncio.Queue(); heard = {"t": 0.0, "n": 0}; closed = asyncio.Event()
    async with websockets.connect(url, max_size=None) as ws:
        t0 = time.perf_counter(); chunk = [0]
        await ws.send(json.dumps(start))

        async def sender():
            while True:
                try: fr = outbox.get_nowait()
                except asyncio.QueueEmpty: fr = ALAW_SILENCE
                chunk[0] += 1
                msg = {"event": "media", "streamSid": sid, "media": {"track": "inbound", "payload": base64.b64encode(fr).decode(),
                                                                       "chunk": chunk[0], "timestamp": int(time.time() * 1000)}}
                try:
                    await ws.send(json.dumps(msg))
                    if echo and chunk[0] < 60:   # loud noise on another track: must never be heard as the caller
                        noise = audioop.lin2alaw(os.urandom(320), 2)
                        await ws.send(json.dumps({"event": "media", "streamSid": sid, "media": {"track": "outbound", "payload": base64.b64encode(noise).decode()}}))
                except websockets.ConnectionClosed:
                    closed.set(); return
                await asyncio.sleep(0.02)

        async def receiver():
            try:
                async for raw in ws:
                    m = json.loads(raw)
                    if m.get("stream_sid") != sid or m.get("streamSid") != sid:
                        out["bad_keys"] += 1
                    if m.get("event") == "media":
                        pk = base64.b64decode(m["media"]["payload"])
                        heard["t"] = time.perf_counter(); heard["n"] += len(pk)
                        out["first_audio"] = out["first_audio"] or round(heard["t"] - t0, 2)
                        out["media"].append((heard["t"] - t0, pk))
                    elif m.get("event") == "clear":
                        out["clears"].append(round(time.perf_counter() - t0, 2))
            except websockets.ConnectionClosed:
                pass
            out["closed_by_server"] = not stopping.is_set()
            out["close"] = ws.close_code
            closed.set()

        stopping = asyncio.Event()

        def say(pcm):
            for i in range(0, len(pcm), 160): outbox.put_nowait(pcm[i:i + 160].ljust(160, b"\xd5"))

        async def drained():
            while not outbox.empty() and not closed.is_set(): await asyncio.sleep(0.02)

        async def her_turn_done(max_wait=25.0):
            end = time.perf_counter() + max_wait; seen0 = heard["n"]
            while time.perf_counter() < end and not closed.is_set():
                await asyncio.sleep(0.1)
                if heard["n"] > seen0 + 4000 and time.perf_counter() - heard["t"] > 1.3: return True
            return False

        st, rt = asyncio.create_task(sender()), asyncio.create_task(receiver())
        try:
            if hello:
                await asyncio.sleep(1.2); say(alaw(hello)); await drained()
                out["hello_end"] = round(time.perf_counter() - t0, 2)
            await her_turn_done()
            for line in script:
                if closed.is_set(): break
                say(alaw(line)); await drained()
                if line == barge:   # wait for her reply to start, then talk over it
                    n0 = heard["n"]
                    while heard["n"] < n0 + 8000 and not closed.is_set(): await asyncio.sleep(0.05)
                    await asyncio.sleep(0.6); say(alaw("Who is this? I'm busy right now.")); await drained()
                await her_turn_done()
            if wait_close:
                end = time.perf_counter() + wait_close
                while not closed.is_set() and time.perf_counter() < end: await asyncio.sleep(0.1)
            if stop_at_end and not closed.is_set():
                stopping.set(); t_stop = time.perf_counter()
                await ws.send(json.dumps({"event": "stop", "streamSid": sid, "stop": {"callSid": start["start"]["call_sid"]}}))
                try: await asyncio.wait_for(closed.wait(), 6)
                except asyncio.TimeoutError: pass
                out["stop_to_close"] = round(time.perf_counter() - t_stop, 2) if closed.is_set() else None
        finally:
            stopping.set(); st.cancel(); rt.cancel()
    return out


def start_message(call_sid, frm, to, custom=None, encoding="audio/alaw"):
    sid = "MZ" + uuid.uuid4().hex
    return {"event": "start", "sequence_number": 0, "stream_sid": sid,
            "start": {"stream_sid": sid, "call_sid": call_sid, "account_sid": "77", "from": frm, "to": to,
                      "custom_parameters": custom or {}, "media_format": {"encoding": encoding, "sample_rate": "8000"}}}


def law_check(media):
    """Her audio is A-law: decoded as A-law its quiet frames are near zero; decoded as mu-law they are not."""
    pk = b"".join(p for _, p in media)
    frames = [pk[i:i + 160] for i in range(0, len(pk) - 160, 160)]
    a = sorted(audioop.rms(audioop.alaw2lin(f, 2), 2) for f in frames)
    u = sorted(audioop.rms(audioop.ulaw2lin(f, 2), 2) for f in frames)
    q = max(1, len(frames) // 10)
    return sum(a[:q]) / q, sum(u[:q]) / q, sum(a) / len(a)


async def wait_doc(query, secs=8.0):
    end = time.monotonic() + secs
    while time.monotonic() < end:
        doc = db.voice_calls.find_one(query, sort=[("_id", -1)])
        if doc: return doc
        await asyncio.sleep(0.5)
    return None


# --- unit: the serializer and the helpers, no server needed ----------------------------------------

async def test_unit():
    print("\n== unit ==")
    import voicelink
    from pipecat.frames.frames import CancelWorkerFrame, EndFrame, InputAudioRawFrame, InterruptionFrame, OutputAudioRawFrame

    class Setup:  # what the transport hands serializer.setup()
        audio_in_sample_rate = 16000

    tone = audioop.mul(b"".join(int(8000 * __import__("math").sin(i / 3)).to_bytes(2, "little", signed=True) for i in range(160)), 2, 1.0)

    async def run(encoding, rate, wire, wire_rate):
        s = voicelink.VoiceLinkSerializer(); await s.setup(Setup())
        s.start({"event": "start", "start": {"stream_sid": "S1", "call_sid": "C1", "media_format": {"encoding": encoding, "sample_rate": str(rate)}}})
        pcm_in = b""
        for _ in range(25):
            f = await s.deserialize(json.dumps({"event": "media", "media": {"track": "inbound", "payload": base64.b64encode(wire).decode()}}))
            if f: pcm_in += f.audio; assert isinstance(f, InputAudioRawFrame) and f.sample_rate == 16000
        sent = b""
        for _ in range(25):
            m = await s.serialize(OutputAudioRawFrame(audio=bytes(1920), sample_rate=24000, num_channels=1))
            if m:
                m = json.loads(m); sent += base64.b64decode(m["media"]["payload"])
                assert m["event"] == "media" and m["stream_sid"] == m["streamSid"] == "S1"
        return s, len(pcm_in), len(sent)

    alaw8 = audioop.lin2alaw(tone, 2)
    s, n_in, n_out = await run("audio/alaw", 8000, alaw8, 8000)
    # 25 x 20 ms in -> ~0.5 s at 16 kHz (the stream resampler holds a little back); 25 x 40 ms out at 24 kHz -> 1 s of 8 kHz A-law.
    ok("alaw 8k: in to 16 kHz PCM, out to 8 kHz A-law", s.codec == "alaw" and 12000 <= n_in <= 16000 and 7000 <= n_out <= 8000, f"in {n_in} B, out {n_out} B")
    _, n_in, n_out = await run("audio/ulaw", 8000, audioop.lin2ulaw(tone, 2), 8000)
    ok("ulaw 8k", 12000 <= n_in <= 16000 and 7000 <= n_out <= 8000, f"in {n_in} B, out {n_out} B")
    _, n_in, n_out = await run("audio/l16", 8000, tone, 8000)
    ok("l16 8k", 12000 <= n_in <= 16000 and 14000 <= n_out <= 16000, f"in {n_in} B, out {n_out} B")
    s, n_in, n_out = await run("audio/l16", 16000, tone + tone, 16000)
    ok("l16 16k", s.rate == 16000 and 12000 <= n_in <= 16000 and 30000 <= n_out <= 32000, f"in {n_in} B, out {n_out} B")
    s, _, _ = await run("audio/opus", 48000, alaw8, 8000)
    ok("unknown media_format falls back to A-law 8k (no dropped call)", (s.codec, s.rate) == ("alaw", 8000))

    s = voicelink.VoiceLinkSerializer(); await s.setup(Setup())
    ok("nothing is sent before start", await s.serialize(OutputAudioRawFrame(audio=bytes(1920), sample_rate=24000, num_channels=1)) is None
       and await s.serialize(InterruptionFrame()) is None)
    s.start({"event": "start", "stream_sid": "S2", "start": {"call_sid": "C2", "media_format": {"encoding": "audio/alaw", "sample_rate": "8000"}}})
    clear = json.loads(await s.serialize(InterruptionFrame()))
    ok("clear carries both stream id spellings", clear == {"event": "clear", "stream_sid": "S2", "streamSid": "S2"}, str(clear))
    echo = await s.deserialize(json.dumps({"event": "media", "media": {"track": "outbound", "payload": base64.b64encode(alaw8).decode()}}))
    ok("another track is ignored", echo is None)
    stop = await s.deserialize(json.dumps({"event": "stop", "streamSid": "S2", "stop": {"callSid": "C2"}}))
    ok("stop ends the call", isinstance(stop, CancelWorkerFrame))
    junk = [await s.deserialize(x) for x in ("not json", "[]", '{"event":"mark","mark":{"name":"x"}}', '{"event":"media","media":{"payload":"%%%"}}', b"\x00\x01")]
    ok("junk, marks and bad payloads are skipped", all(j is None for j in junk))
    ok("EndFrame sends nothing (the socket close is the hang-up)", await s.serialize(EndFrame()) is None)

    ok("split_number", voicelink.split_number("+919876543210") == ("91", "9876543210") and voicelink.split_number("+14155550100") == ("1", "4155550100")
       and voicelink.split_number("+447700900123") == ("44", "7700900123") and voicelink.split_number("+971501234567") == ("971", "501234567")
       and voicelink.split_number("+12") is None)
    ok("e164", voicelink.e164("09876543210") == "+919876543210" and voicelink.e164("9876543210") == "+919876543210"
       and voicelink.e164("919876543210") == "+919876543210" and voicelink.e164("+14155550100") == "+14155550100" and voicelink.e164("") is None)
    nested = voicelink.parse_event({"event": "call.completed", "call": {"id": "c1", "direction": "outbound", "callStatus": "NO ANSWER",
                                    "durationSec": 0, "customParameters": {"aixel_agent": "a"}, "to": "9876543210"}, "legs": []})
    flat = voicelink.parse_event({"event": "call.completed", "callId": "1764828073.53871", "fromNumber": "0987654321", "toNumber": "1234567890",
                                  "direction": "inbound", "callStatus": "ANSWER", "duration": 8, "recordingUrl": "https://x/r.wav",
                                  "customParameters": '{"campaignName": "Fall_Promo"}'})
    os.environ["VOICELINK_PROXY_URL"] = "http://127.0.0.1:9"   # nothing listens there
    try:
        await voicelink.api_post("/v1/add_lead", "t", {}); unreachable = None
    except voicelink.VoiceLinkError as e:
        unreachable = e
    except Exception as e:
        unreachable = e
    finally:
        os.environ.pop("VOICELINK_PROXY_URL")
    ok("a dead proxy is 'unreachable' (424 in /calls), not a VoiceLink refusal",
       unreachable is not None and not isinstance(unreachable, voicelink.VoiceLinkError), repr(unreachable)[:120])
    ok("webhook shapes: nested and flat", nested["id"] == "c1" and not nested["answered"] and nested["custom"] == {"aixel_agent": "a"}
       and flat["id"] == "1764828073.53871" and flat["answered"] and flat["recording"] == "https://x/r.wav" and flat["custom"] == {"campaignName": "Fall_Promo"},
       f"{nested} / {flat}")


# --- POST /calls for a VoiceLink number ------------------------------------------------------------

async def test_rest(port, agent, number, bare, proxy=True):
    print(f"\n== POST /calls (VoiceLink, {'through the proxy' if proxy else 'direct'}) ==")
    secret = os.environ["VOICELAB_KEY"]; url = f"http://127.0.0.1:{port}/calls"; auth = {"Authorization": f"Bearer {secret}"}
    nid, aid = str(number["_id"]), str(agent["_id"])
    SEEN.clear(); PROXIED.clear()
    st, body = await ahttp("POST", url, {"numberId": nid, "to": CALLEE})
    ok("no bearer -> 401", st == 401, f"HTTP {st}")
    st, body = await ahttp("POST", url, {"numberId": str(bare["_id"]), "to": CALLEE}, auth)
    ok("number without agent -> 409", st == 409, f"HTTP {st} {body}")
    with (HERE / "suppressed.jsonl").open("a") as f:
        f.write(json.dumps({"number": "+919000000009", "reason": "test", "quote": "voicelink_e2e", "stream_id": "test"}) + "\n")
    st, body = await ahttp("POST", url, {"numberId": nid, "to": "+91 90000 00009"}, auth)
    ok("suppressed number -> 409, nothing sent to VoiceLink", st == 409 and not SEEN, f"HTTP {st} {body}")
    st, body = await ahttp("POST", url, {"numberId": nid, "to": "+919000000000"}, auth)
    ok("VoiceLink says no (status false) -> 424 with its message", st == 424 and "Outbound websocket bot is not active" in body, f"HTTP {st} {body}")
    st, body = await ahttp("POST", url, {"numberId": nid, "to": "+919000000001"}, auth)
    ok("VoiceLink HTTP 401 -> 424 with its message", st == 424 and "Unauthenticated." in body, f"HTTP {st} {body}")

    SEEN.clear(); PROXIED.clear()
    st, body = await ahttp("POST", url, {"numberId": nid, "to": CALLEE}, auth)
    ok("good request -> 200 {ok, callId: vl-queue:<id>}", st == 200 and json.loads(body) == {"ok": True, "callId": "vl-queue:4242"}, body)
    sent = [s for s in SEEN if s["path"] == "/api/v1/add_lead"]
    ok("one add_lead reached the fake VoiceLink (VOICELINK_API_BASE + /v1/add_lead)", len(sent) == 1, str(len(sent)))
    if not sent:
        return None
    d = sent[0]["body"]
    ok("Bearer is the customer's token", sent[0]["auth"] == f"Bearer {FAKE_TOKEN}", (sent[0]["auth"] or "")[:16] + "...")
    ok("did_number digits, national customer_number + country_code",
       d["did_number"] == number["phoneNumber"][1:] and d["customer_number"] == CALLEE[3:] and d["country_code"] == "91",
       f"{d['did_number']} -> {d['country_code']} {d['customer_number']}")
    custom = json.loads(d["custom_parameters"]) if isinstance(d.get("custom_parameters"), str) else None
    ok("custom_parameters is a JSON string {aixel_number, aixel_agent}", custom == {"aixel_number": nid, "aixel_agent": aid}, repr(d.get("custom_parameters")))
    ok("client_id from number.voicelink.clientId", d.get("client_id") == 77, str(d.get("client_id")))
    ws = urllib.parse.urlsplit(d["websocket_url"]); wq = dict(urllib.parse.parse_qsl(ws.query))
    ok("websocket_url: wss /voicelink n, a, dir=out, callee, sig = sign(voicelink-out, n, a, callee)",
       ws.scheme == "wss" and ws.path == "/voicelink" and wq.get("n") == nid and wq.get("a") == aid and wq.get("dir") == "out"
       and wq.get("callee") == CALLEE and wq.get("sig") == product.sign("voicelink-out", nid, aid, CALLEE), d["websocket_url"])
    hook = urllib.parse.urlsplit(d["webhook_url"]); hq = dict(urllib.parse.parse_qsl(hook.query))
    ok("webhook_url: https /voicelink-events n + sig(number)", hook.scheme == "https" and hook.path == "/voicelink-events"
       and hq.get("n") == nid and hq.get("sig") == product.sign("number", nid), d["webhook_url"])
    if proxy:
        ok("went through VOICELINK_PROXY_URL with its credentials",
           any(p.startswith(f"POST http://127.0.0.1:{API_PORT}/api/v1/add_lead") and p.endswith("auth=ok") for p in PROXIED), str(PROXIED[-3:]))
    else:
        ok("direct: the proxy saw nothing", not PROXIED, str(PROXIED))
    # Telnyx numbers are unchanged: the Telnyx /calls checks run in tests/product_e2e.py.
    return d


# --- /voicelink, a call coming in -----------------------------------------------------------------

async def test_inbound(port, agent, number, bare):
    print("\n== /voicelink inbound ==")
    nid = str(number["_id"]); good = f"ws://127.0.0.1:{port}/voicelink?n={nid}&sig={product.sign('number', nid)}"
    for name, url in [("bad signature", f"ws://127.0.0.1:{port}/voicelink?n={nid}&sig=0123456789abcdef0123456789abcdef"),
                      ("no signature (even from loopback)", f"ws://127.0.0.1:{port}/voicelink?n={nid}"),
                      ("outbound URL with a changed callee", f"ws://127.0.0.1:{port}/voicelink?n={nid}&a={agent['_id']}&dir=out&callee=%2B911111111111"
                       f"&sig={product.sign('voicelink-out', nid, str(agent['_id']), CALLEE)}")]:
        try:
            async with websockets.connect(url) as ws:
                await ws.recv(); refused = False
        except websockets.InvalidStatus as e:
            refused = e.response.status_code == 403
        except websockets.ConnectionClosed as e:
            refused = e.rcvd and e.rcvd.code == 1008
        ok(f"{name} refused", refused)

    before = db.voice_calls.count_documents({"numberId": number["_id"]})
    async with websockets.connect(good) as ws:   # a probe: opens, says nothing, goes
        pass
    async with websockets.connect(good) as ws:   # a probe that says "connected" and goes
        await ws.send(json.dumps({"event": "connected"}))
    await asyncio.sleep(1.0)
    st, health = await ahttp("GET", f"http://127.0.0.1:{port}/health")
    ok("idle probes are harmless (no call, no record, server fine)", st == 200 and json.loads(health)["calls_running"] == 0
       and db.voice_calls.count_documents({"numberId": number["_id"]}) == before, health[:120])

    bid = str(bare["_id"])
    try:
        async with websockets.connect(f"ws://127.0.0.1:{port}/voicelink?n={bid}&sig={product.sign('number', bid)}") as ws:
            await ws.send(json.dumps(start_message("test:" + uuid.uuid4().hex, "09876543210", bare["phoneNumber"][1:])))
            await asyncio.wait_for(ws.recv(), 10); code = None
    except websockets.ConnectionClosed as e:
        code = e.rcvd.code if e.rcvd else None
    ok("a number whose AI answering is off: closed 1008 after start", code == 1008, str(code))

    call_sid = "test:" + uuid.uuid4().hex
    t_start = datetime.now(timezone.utc).replace(microsecond=0)
    # VoiceLink writes the caller without the +: 0-prefixed national here.
    r = await voicelink_call(good, start_message(call_sid, "0" + CALLER[3:], number["phoneNumber"][1:]),
                             script=["Wait, are you a robot?", "Take me off your list. Don't ever call this number again."], barge="Wait, are you a robot?", wait_close=15)
    secs = sum(len(p) for _, p in r["media"]) / 8000
    ok("her audio came back", secs > 2, f"{secs:.1f} s of audio, first at {r['first_audio']} s")
    ok("she speaks first on a call coming in", r["first_audio"] is not None and r["first_audio"] < 4.0, f"first audio {r['first_audio']} s after start")
    quiet_a, quiet_u, mean_a = law_check(r["media"]) if r["media"] else (1e9, 0, 0)
    ok("her audio is A-law (quiet frames ~0 decoded as A-law, not as mu-law)", quiet_a < 150 and quiet_u > 4 * max(quiet_a, 50),
       f"quietest 10% rms: A-law {quiet_a:.0f}, as mu-law {quiet_u:.0f}; mean A-law rms {mean_a:.0f}")
    ok("every message carries stream_sid and streamSid", r["bad_keys"] == 0, f"{r['bad_keys']} without")
    ok("clear on barge-in", len(r["clears"]) >= 1, f"clears at {r['clears']}")
    ok("dnc hang-up closes the socket (VoiceLink's hang-up)", r["closed_by_server"], f"close code {r['close']}")
    doc = await wait_doc({"numberId": number["_id"], "providerCallId": call_sid})
    ok("voice_calls doc written", doc is not None)
    if doc:
        agent_text = " ".join(t["text"] for t in doc["turns"] if t["role"] == "agent").lower()
        ok("doc shape", doc["channel"] == "PHONE" and doc["direction"] == "INBOUND" and doc["from"] == CALLER and doc["to"] == number["phoneNumber"]
           and doc["agentId"] == agent["_id"] and doc["voice"] == "kore" and doc["tenantId"] == number["tenantId"] and doc["userId"] == number["userId"]
           and doc["durationSec"] > 0 and doc["startedAt"] >= t_start.replace(tzinfo=None),
           f"from={doc['from']} to={doc['to']} endedBy={doc['endedBy']} duration={doc['durationSec']}s gaps={doc['gapsMs']}")
        ok("ended by the do-not-call guard", doc["endedBy"] == "dnc", doc["endedBy"])
        ok("answered as the agent", "priya" in agent_text or "sunrise" in agent_text, agent_text[:160])
    return call_sid


# --- /voicelink, a call we placed -------------------------------------------------------------------

async def test_outbound(port, agent, number, lead):
    print("\n== /voicelink outbound ==")
    if not lead:
        ok("outbound needs the add_lead body from the rest test", False); return None
    call_sid = "test:out-" + uuid.uuid4().hex
    custom = {**json.loads(lead["custom_parameters"]), "outboundQueueId": 4242}   # VoiceLink hands them back on start
    r = await voicelink_call(local(lead["websocket_url"], port), start_message(call_sid, lead["did_number"], lead["customer_number"], custom),
                             hello="Hello?", script=["Go on, I've got a minute."], echo=True, stop_at_end=True)
    early = [t for t, p in r["media"] if t < (r["hello_end"] or 0)]
    ok("she waits for the hello (nothing before it, echo on another track ignored)", r["hello_end"] and not early,
       f"hello ended at {r['hello_end']} s, {len(early)} packets before it")
    gap = round(r["first_audio"] - r["hello_end"], 2) if r["first_audio"] and r["hello_end"] else None
    ok("then she speaks", gap is not None and gap < 4.0, f"first audio {gap} s after the hello ended")
    ok("stop from VoiceLink ends the call", r.get("stop_to_close") is not None and r["stop_to_close"] < 5, f"closed {r.get('stop_to_close')} s after stop")
    doc = await wait_doc({"numberId": number["_id"], "providerCallId": call_sid})
    ok("voice_calls doc written", doc is not None)
    if doc:
        ok("doc shape", doc["direction"] == "OUTBOUND" and doc["from"] == number["phoneNumber"] and doc["to"] == CALLEE
           and doc["agentId"] == agent["_id"] and doc["endedBy"] == "caller_hung_up" and doc["durationSec"] > 0,
           f"from={doc['from']} to={doc['to']} endedBy={doc['endedBy']} duration={doc['durationSec']}s")

    # Its call.completed, in the docs' flat shape, with an id that is NOT the call_sid: found by number + callee + time.
    nid = str(number["_id"]); events = f"http://127.0.0.1:{port}/voicelink-events?n={nid}&sig={product.sign('number', nid)}"
    st, _ = await ahttp("POST", events, {"event": "call.completed", "callId": "1764828073.53871", "fromNumber": number["phoneNumber"][1:],
                        "toNumber": CALLEE[3:], "direction": "outbound", "callStatus": "ANSWER", "duration": (doc or {}).get("durationSec", 0) + 1,
                        "recordingUrl": "https://rec.example/out.wav",
                        "customParameters": {"aixel_number": nid, "aixel_agent": str(agent["_id"]), "outboundQueueId": 4242}})
    found = await wait_doc({"providerCallId": call_sid, "recordingUrl": "https://rec.example/out.wav"})
    ok("flat call.completed: recordingUrl attached by number + callee + time", st == 200 and found is not None, f"HTTP {st}")

    # If VoiceLink ever ignores the per-call websocket_url, our lead arrives on the bot's inbound URL:
    # its custom_parameters still make it the outbound call it is.
    sid2 = "test:out-" + uuid.uuid4().hex
    r = await voicelink_call(f"ws://127.0.0.1:{port}/voicelink?n={nid}&sig={product.sign('number', nid)}",
                             start_message(sid2, lead["did_number"], lead["customer_number"], custom), hello="Hello?", stop_at_end=True)
    doc = await wait_doc({"numberId": number["_id"], "providerCallId": sid2})
    early = [t for t, p in r["media"] if t < (r["hello_end"] or 0)]
    ok("our lead on the inbound URL still runs as outbound (hello wait, agent, callee)", doc and doc["direction"] == "OUTBOUND"
       and doc["to"] == CALLEE and doc["agentId"] == agent["_id"] and not early and r["media"],
       f"{doc and doc['direction']} to={doc and doc.get('to')} early={len(early)} audio={len(r['media'])}")
    return call_sid


# --- /voicelink-events --------------------------------------------------------------------------------

async def test_events(port, agent, number, inbound_sid, outbound_sid):
    print("\n== /voicelink-events ==")
    nid = str(number["_id"]); url = f"http://127.0.0.1:{port}/voicelink-events?n={nid}&sig={product.sign('number', nid)}"
    st, _ = await ahttp("POST", f"http://127.0.0.1:{port}/voicelink-events?n={nid}&sig=bad", {"event": "call.completed"})
    ok("bad signature -> 403", st == 403, f"HTTP {st}")
    st, _ = await ahttp("POST", url, raw=b"not json at all")
    ok("garbage -> 200", st == 200, f"HTTP {st}")
    st, _ = await ahttp("POST", url, {"event": "call.ringing", "call": {"id": "x", "direction": "outbound"}})
    ok("other events -> 200", st == 200, f"HTTP {st}")

    if inbound_sid:   # nested shape, VoiceLink's id is the stream's call_sid
        st, _ = await ahttp("POST", url, {"event": "call.completed", "call": {"id": inbound_sid, "direction": "inbound", "from": "0" + CALLER[3:],
                            "to": number["phoneNumber"][1:], "status": "completed", "callStatus": "ANSWER", "durationSec": 30,
                            "recordingUrl": "https://rec.example/in.wav", "customParameters": {}}, "legs": []})
        doc = await wait_doc({"providerCallId": inbound_sid, "recordingUrl": "https://rec.example/in.wav"})
        ok("nested call.completed: recordingUrl attached by providerCallId", st == 200 and doc is not None, f"HTTP {st}")
    # An outbound lead nobody answered: no socket ever opened, the webhook is all there is.
    vid, never = "1764900000." + uuid.uuid4().hex[:6], "+9191111" + str(int(time.time()))[-5:]
    hook = {"event": "call.completed", "call": {"id": vid, "direction": "outbound", "callType": "outbound", "from": number["phoneNumber"][1:],
            "to": never[1:], "status": "failed", "callStatus": "NO ANSWER", "hangupCause": "NO_ANSWER", "ringDurationSec": 30, "durationSec": 0,
            "customParameters": json.dumps({"aixel_number": nid, "aixel_agent": str(agent["_id"]), "outboundQueueId": 4243}), "outboundQueueId": 4243}}
    st, _ = await ahttp("POST", url, hook)
    doc = await wait_doc({"providerCallId": vid})
    ok("no answer: a doc with endedBy no_answer", st == 200 and doc and doc["endedBy"] == "no_answer", f"HTTP {st} {doc and doc.get('endedBy')}")
    if doc:
        ok("no-answer doc shape", doc["direction"] == "OUTBOUND" and doc["channel"] == "PHONE" and doc["from"] == number["phoneNumber"]
           and doc["to"] == never and doc["agentId"] == agent["_id"] and doc["durationSec"] == 0 and doc["turns"] == [] and doc["voice"] == "kore"
           and doc["tenantId"] == number["tenantId"] and (doc["endedAt"] - doc["startedAt"]).total_seconds() == 30,
           f"to={doc['to']} agent={doc['agentId']} {doc['startedAt']} -> {doc['endedAt']}")
    st, _ = await ahttp("POST", url, hook)   # VoiceLink retries: still one document
    await asyncio.sleep(2)
    ok("a retried webhook writes no second doc", db.voice_calls.count_documents({"providerCallId": vid}) == 1)


async def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 7861
    testdb.engine_on(port, DBNAME)
    which = sys.argv[2:] or ["unit", "rest", "inbound", "outbound", "events"]
    api, proxy = await fake_voicelink(), await fake_proxy()
    agent, number, bare = fixtures()
    print(f"fixtures in {DBNAME}: agent {agent['_id']} number {number['_id']} ({number['phoneNumber']}) caller {CALLER} callee {CALLEE}")
    inbound_sid = outbound_sid = lead = None
    try:
        if "unit" in which: await test_unit()
        if "direct" in which: await test_rest(port, agent, number, bare, proxy=False)
        if "rest" in which or "outbound" in which: lead = await test_rest(port, agent, number, bare)
        if "inbound" in which: inbound_sid = await test_inbound(port, agent, number, bare)
        if "outbound" in which: outbound_sid = await test_outbound(port, agent, number, lead)
        if "events" in which: await test_events(port, agent, number, inbound_sid, outbound_sid)
    finally:
        await api.cleanup(); proxy.close()
        dnc = HERE / "suppressed.jsonl"   # take back what this test put on the list: its fake numbers
        dnc.write_text("".join(l + "\n" for l in dnc.read_text().splitlines()
                               if '"quote": "voicelink_e2e"' not in l and CALLER not in l and CALLEE not in l))
        db.voice_numbers.delete_many({"_id": {"$in": CREATED["numbers"]}}); db.voice_agents.delete_many({"_id": {"$in": CREATED["agents"]}})
        db.voice_calls.delete_many({"numberId": {"$in": CREATED["numbers"]}})
        db.voice_settings.delete_many({"userId": {"$in": CREATED.get("owners", [])}})
    passed = sum(1 for _, p in RESULTS if p)
    print(f"\n{passed}/{len(RESULTS)} passed")
    for name, p in RESULTS:
        if not p: print("  FAILED:", name)


if __name__ == "__main__":
    asyncio.run(main())
