r"""The engine behind a path prefix: https://<host>/voice/<path> through Caddy's /voice/* route (prefix stripped).

Proves that HTTP, the media WebSockets and the signed webhooks work through the prefix, with the URLs
the engine hands out (PUBLIC_HOST = "<host>/voice") used exactly as a carrier would use them.

Local: a throwaway Caddy built from the repo's backend/deploy/Caddyfile (its own CA, its own data dir,
bound to 127.0.0.1, no admin port; the voice upstream points at the test engine, the api upstream at
nothing), a test engine on a throwaway database, fake Telnyx/Twilio APIs:

    C=/tmp/voice-caddy; mkdir -p $C; for s in api games; do echo "to 127.0.0.1:9" > $C/$s.upstream; done
    echo "to 127.0.0.1:8131" > $C/voice.upstream
    sed -e "s#/etc/caddy/aixel-labs-\([a-z]*\)\.upstream#$C/\1.upstream#" -e 's#^\tauto_https.*#&\n\tadmin off\n\tskip_install_trust#' \
        -e 's#^api.aixellabs.in {#https://localhost:8133 {\n\tbind 127.0.0.1#' -e 's#^\ttls /etc/caddy.*#\ttls internal#' \
        -e 's#^http://api.aixellabs.in {#http://localhost:8134 {\n\tbind 127.0.0.1#' -e 's#^http://:8002 {#http://:8135 {#' \
        ../deploy/Caddyfile > $C/Caddyfile
    XDG_DATA_HOME=$C XDG_CONFIG_HOME=$C caddy run --config $C/Caddyfile --adapter caddyfile &
    MONGODB_URI=mongodb://127.0.0.1:27018 MONGODB_DB_NAME=AixelLabsVoiceEngineDev PUBLIC_HOST=localhost:8133/voice \
      TELNYX_API_BASE=http://127.0.0.1:7880 TWILIO_API_BASE=http://127.0.0.1:7881 LOG_LEVEL=INFO \
      .venv/bin/python phone.py --port 8131 &
    MONGODB_URI=mongodb://127.0.0.1:27018 MONGODB_DB_NAME=AixelLabsVoiceEngineDev \
      .venv/bin/python tests/prefix_e2e.py 8131 https://localhost:8133/voice --cafile $C/caddy/pki/authorities/local/root.crt
        [smoke texml twiml play calls legacy]  (default: all; six Gemini Live sessions, one at a time)

Against production (no database, no Live session, nothing placed):

    .venv/bin/python tests/prefix_e2e.py - https://api.aixellabs.in/voice smoke
"""
import asyncio, base64, json, os, ssl, sys, time, urllib.error, urllib.parse, urllib.request, uuid
from datetime import datetime, timezone
from pathlib import Path
from xml.etree import ElementTree

HERE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(HERE))

args = [a for a in sys.argv[1:]]
CAFILE = None
if "--cafile" in args:
    i = args.index("--cafile"); CAFILE = args[i + 1]; del args[i:i + 2]
ENGINE_PORT, BASE = args[0], args[1].rstrip("/")
WHICH = args[2:] or ["smoke", "texml", "twiml", "play", "calls", "legacy"]
PUBLIC = BASE.split("://", 1)[1]                      # what the engine must hand out: host + prefix
ORIGIN = BASE[: len(BASE) - len(urllib.parse.urlparse(BASE).path)]
WS_BASE = "wss" + BASE[len("https"):] if BASE.startswith("https") else "ws" + BASE[len("http"):]
SSL = ssl.create_default_context(cafile=CAFILE) if CAFILE else ssl.create_default_context()
LIVE = [w for w in WHICH if w != "smoke"]

import websockets
from aiohttp import web

RESULTS = []


def ok(name, cond, detail=""):
    RESULTS.append((name, bool(cond)))
    print(f"  [{'PASS' if cond else 'FAIL'}] {name}{' -- ' + detail if detail else ''}", flush=True)


def http(method, url, body=None, headers=None, form=None):
    data = urllib.parse.urlencode(form).encode() if form is not None else (json.dumps(body).encode() if body is not None else None)
    ctype = "application/x-www-form-urlencoded" if form is not None else "application/json"
    req = urllib.request.Request(url, data=data, method=method, headers={"Content-Type": ctype, **(headers or {})})
    try:
        with urllib.request.urlopen(req, timeout=20, context=SSL if url.startswith("https") else None) as r:
            return r.status, r.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()


async def ahttp(*a, **kw):
    return await asyncio.to_thread(http, *a, **kw)


async def ws_refused(url, first=None):
    """Connect and report how the server refused: ('close', code) or ('http', status)."""
    try:
        async with websockets.connect(url, ssl=SSL if url.startswith("wss") else None, open_timeout=10) as ws:
            for m in first or ():
                await ws.send(m)
            try:
                await asyncio.wait_for(ws.recv(), 20)
            except websockets.ConnectionClosed:
                pass
            return ("close", ws.close_code)
    except websockets.InvalidStatus as e:
        return ("http", e.response.status_code)


# --- smoke: no database, no Live session; also safe against production ------------------------------

async def test_smoke():
    print(f"\n== smoke: {BASE} ==")
    st, body = await ahttp("GET", f"{BASE}/health")
    ok("GET /health through the prefix -> 200, public view only", st == 200 and set(json.loads(body)) == {"ok"}, f"HTTP {st} {body}")
    if ENGINE_PORT != "-":
        st, body = await ahttp("GET", f"http://127.0.0.1:{ENGINE_PORT}/health")
        ok("engine's own /health (loopback) names PUBLIC_HOST = host + prefix", st == 200 and json.loads(body).get("host") == PUBLIC, body[:160])
    for path in ("/docs", "/openapi.json", "/redoc"):
        st, _ = await ahttp("GET", f"{BASE}{path}")
        ok(f"{path} hidden by the proxy -> 404", st == 404, f"HTTP {st}")
    st, body = await ahttp("GET", f"{ORIGIN}/")
    ok("the rest of the host still goes to the backend, not the engine", '"detail":"Not Found"' not in body, f"HTTP {st} {body[:60]!r}")
    st, _ = await ahttp("GET", f"{BASE}/a")
    ok("GET /a without key -> 403 (a proxied request gets no loopback pass)", st == 403, f"HTTP {st}")
    st, _ = await ahttp("POST", f"{BASE}/texml", form={"To": "sip:kore@x"})
    ok("POST /texml without key -> 403", st == 403, f"HTTP {st}")
    st, _ = await ahttp("POST", f"{BASE}/texml?n=000000000000000000000000&sig=0123456789abcdef0123456789abcdef", form={})
    ok("POST /texml?n= bad signature -> 403", st == 403, f"HTTP {st}")
    st, _ = await ahttp("POST", f"{BASE}/telnyx-events", {"data": {}})
    ok("POST /telnyx-events without key -> 403", st == 403, f"HTTP {st}")
    st, _ = await ahttp("POST", f"{BASE}/twiml?n=000000000000000000000000&sig=bad", form={})
    ok("POST /twiml bad signature -> 403", st == 403, f"HTTP {st}")
    st, _ = await ahttp("POST", f"{BASE}/twilio-events?n=x&a=y&sig=bad", form={})
    ok("POST /twilio-events bad signature -> 403", st == 403, f"HTTP {st}")
    st, _ = await ahttp("POST", f"{BASE}/voicelink-events?n=x&sig=bad", {})
    ok("POST /voicelink-events bad signature -> 403", st == 403, f"HTTP {st}")
    st, _ = await ahttp("POST", f"{BASE}/calls", {"numberId": "x", "to": "+15550000000"})
    ok("POST /calls without bearer -> 401", st == 401, f"HTTP {st}")
    r = await ws_refused(f"{WS_BASE}/play?agent=a&user=u&t=1.bad")
    ok("WS /play bad token -> upgraded, then closed 1008", r == ("close", 1008), str(r))
    r = await ws_refused(f"{WS_BASE}/telnyx?voice=kore&t=1.bad")
    ok("WS /telnyx bad token -> refused", r in (("http", 403), ("close", 1008)), str(r))
    r = await ws_refused(f"{WS_BASE}/voicelink?n=x&sig=bad")
    ok("WS /voicelink bad signature -> refused", r in (("http", 403), ("close", 1008)), str(r))
    r = await ws_refused(f"{WS_BASE}/ws?t=1.bad")
    ok("WS /ws (test page) bad token -> refused", r in (("http", 403), ("close", 1008)), str(r))
    start = {"event": "start", "streamSid": "MZx", "start": {"callSid": "CAx", "customParameters": {"n": "x", "t": "1.bad"}}}
    r = await ws_refused(f"{WS_BASE}/twilio", first=[json.dumps({"event": "connected"}), json.dumps(start)])
    ok("WS /twilio bad token in start -> upgraded, then closed 1008", r == ("close", 1008), str(r))


# --- fixtures + fakes (local only) ------------------------------------------------------------------

if LIVE:
    import testdb
    MONGO, DBNAME = testdb.throwaway()
    from bson import ObjectId
    from pymongo import MongoClient
    import product, bot, twilio
    db = MongoClient(MONGO)[DBNAME]

AUTH_TOKEN = "fake_auth_token_prefix_e2e_0001"
TELNYX_KEY = "KEY_FAKE_PREFIX_E2E_0123456789"
SEEN = []


def fixtures():
    now = datetime.now(timezone.utc)
    tenant, user = ObjectId(), ObjectId()
    agent = {"tenantId": tenant, "userId": user, "name": "Prefix test receptionist", "voice": "kore",
             "prompt": "You are Priya, the receptionist at Sunrise Dental in Austin. Say your name and the clinic's name in your "
                       "very first sentence. Keep every reply to one short sentence.", "createdAt": now, "updatedAt": now}
    agent["_id"] = db.voice_agents.insert_one(agent).inserted_id
    base = {"tenantId": tenant, "userId": user, "inboundAgentId": agent["_id"], "outboundAgentId": agent["_id"], "createdAt": now, "updatedAt": now}
    tel = {**base, "provider": "TELNYX", "providerNumberId": "fake-pn-prefix", "phoneNumber": "+15550004441",
           "apiKeySealed": product.seal_secret(TELNYX_KEY), "texmlAppId": "fake-texml", "callControlAppId": "fake-cc"}
    tel["_id"] = db.voice_numbers.insert_one(tel).inserted_id
    tw = {**base, "provider": "TWILIO", "providerNumberId": "PN" + "4" * 32, "phoneNumber": "+15550004442",
          "apiKeySealed": product.seal_secret(AUTH_TOKEN), "twilio": {"accountSid": "AC" + "4" * 32, "apiKeySid": None}}
    tw["_id"] = db.voice_numbers.insert_one(tw).inserted_id
    import scripted
    scripted.give_owner_key(db, tenant, user)  # every customer call runs on its owner's own Gemini key
    return agent, tel, tw


def cleanup(agent, tel, tw, t0):
    ids = [tel["_id"], tw["_id"]]
    calls = db.voice_calls.delete_many({"$or": [{"agentId": agent["_id"]}, {"numberId": {"$in": ids}}]}).deleted_count
    db.voice_numbers.delete_many({"_id": {"$in": ids}}); db.voice_agents.delete_one({"_id": agent["_id"]})
    db.voice_settings.delete_many({"userId": agent["userId"]})
    moved = 0   # this run's call records go where test records live
    (HERE / "calls" / "_tests").mkdir(exist_ok=True)
    for f in (HERE / "calls").glob("*.json"):
        if f.stat().st_mtime >= t0 and (str(agent["_id"]) in (text := f.read_text(errors="replace")) or "test:prefix" in text
                                        or "+1555000444" in text):
            f.rename(HERE / "calls" / "_tests" / f.name); moved += 1
    print(f"cleaned up: fixtures, {calls} voice_calls docs; {moved} call records -> calls/_tests/")


async def fakes():
    async def handle(request):
        raw = await request.read()
        try: body = json.loads(raw) if raw else None
        except ValueError: body = dict(urllib.parse.parse_qsl(raw.decode()))
        SEEN.append({"path": request.path, "auth": request.headers.get("Authorization"), "body": body})
        if request.path == "/v2/calls":
            return web.json_response({"data": {"call_control_id": "v3:fake-prefix", "call_leg_id": "x"}})
        if request.path.endswith(".json"):
            return web.json_response({"sid": "RE" + "0" * 32, "status": "ok"}, status=201)
        return web.json_response({"data": {"result": "ok"}})
    runners = []
    for port in (7880, 7881):   # Telnyx, Twilio
        app = web.Application(); app.router.add_route("*", "/{tail:.*}", handle)
        r = web.AppRunner(app); await r.setup(); await web.TCPSite(r, "127.0.0.1", port).start(); runners.append(r)
    return runners


# --- a carrier's media socket (Telnyx or Twilio JSON, mu-law 8 kHz) --------------------------------

async def carrier_call(url, start, media_key, after_open=None, want_secs=1.0, max_wait=20.0):
    """Open `url` exactly as given, send connected/start and a silent line, and measure her audio."""
    got = {"bytes": 0, "first": None, "last": 0.0, "close": None}
    t0 = time.perf_counter(); sid = start.get("stream_id") or start.get("streamSid")
    async with websockets.connect(url, ssl=SSL if url.startswith("wss") else None, max_size=None) as ws:
        await ws.send(json.dumps({"event": "connected"})); await ws.send(json.dumps(start))
        async def sender():
            while True:
                m = {"event": "media", media_key: sid, "media": {"payload": base64.b64encode(b"\xff" * 160).decode()}}
                try: await ws.send(json.dumps(m))
                except websockets.ConnectionClosed: return
                await asyncio.sleep(0.02)
        async def receiver():
            try:
                async for raw in ws:
                    m = json.loads(raw)
                    if m.get("event") == "media":
                        got["bytes"] += len(base64.b64decode(m["media"]["payload"])); got["last"] = time.perf_counter()
                        got["first"] = got["first"] or round(got["last"] - t0, 2)
            except websockets.ConnectionClosed: pass
            got["close"] = ws.close_code
        st, rt = asyncio.create_task(sender()), asyncio.create_task(receiver())
        if after_open: await after_open()
        end = time.perf_counter() + max_wait
        while time.perf_counter() < end and got["close"] is None:
            await asyncio.sleep(0.1)
            if got["bytes"] >= want_secs * 8000 and time.perf_counter() - got["last"] > 1.2: break
        st.cancel()
        if media_key == "streamSid":
            try: await ws.send(json.dumps({"event": "stop", "streamSid": sid}))
            except websockets.ConnectionClosed: pass
        await ws.close(); rt.cancel()
    return got


async def test_texml(tel):
    print("\n== Telnyx call in: POST /voice/texml?n=&sig= -> TeXML -> its Stream URL ==")
    nid = str(tel["_id"])
    url = f"{BASE}/texml?n={nid}&sig={product.sign('number', nid)}"
    st, xml = await ahttp("POST", url, form={"Direction": "inbound", "From": "+15557770000", "To": tel["phoneNumber"], "CallControlId": "test:prefix-in"})
    stream = ElementTree.fromstring(xml).find(".//Stream").get("url") if st == 200 and "<Stream" in xml else ""
    ok("TeXML 200 with a Stream", bool(stream), f"HTTP {st}")
    ok("Stream URL = wss://<host>/voice/telnyx?...", stream.startswith(f"wss://{PUBLIC}/telnyx?"), stream[:90])
    if not stream: return
    sid = "prefix-" + uuid.uuid4().hex[:8]
    got = await carrier_call(stream, {"event": "start", "stream_id": sid, "start": {"call_control_id": f"test:prefix-{sid}",
                             "media_format": {"encoding": "PCMU", "sample_rate": 8000, "channels": 1}}}, "stream_id")
    ok("WebSocket through the prefix carried her greeting", got["bytes"] >= 8000, f"{got['bytes'] / 8000:.1f} s of audio, first at {got['first']} s")


async def test_twiml(tw):
    print("\n== Twilio call in: POST /voice/twiml with X-Twilio-Signature -> TwiML -> /voice/twilio ==")
    nid = str(tw["_id"])
    url = f"{BASE}/twiml?n={nid}&sig={product.sign('number', nid)}"
    form = {"CallSid": "CA" + "5" * 32, "AccountSid": tw["twilio"]["accountSid"], "From": "+15557770001", "To": tw["phoneNumber"],
            "Direction": "inbound", "CallStatus": "ringing"}
    st, _ = await ahttp("POST", url, form=form, headers={"X-Twilio-Signature": twilio.signature("not-the-token", url, form)})
    ok("X-Twilio-Signature with another token -> 403", st == 403, f"HTTP {st}")
    st, xml = await ahttp("POST", url, form=form, headers={"X-Twilio-Signature": twilio.signature(AUTH_TOKEN, url, form)})
    node = ElementTree.fromstring(xml).find(".//Stream") if st == 200 and "<Stream" in xml else None
    stream = node.get("url") if node is not None else ""
    # The engine sees /twiml (Caddy strips /voice), so only PUBLIC_HOST's prefix can rebuild the URL Twilio signed.
    ok("signature over the public /voice URL (what Twilio signs) -> 200 TwiML <Connect><Stream>", bool(stream), f"HTTP {st}")
    ok("Stream URL = wss://<host>/voice/twilio", stream == f"wss://{PUBLIC}/twilio", stream)
    if not stream: return
    params = {p.get("name"): p.get("value") for p in node.findall("Parameter")}
    sid = "MZ" + uuid.uuid4().hex
    start = {"event": "start", "sequenceNumber": "1", "streamSid": sid,
             "start": {"accountSid": form["AccountSid"], "streamSid": sid, "callSid": form["CallSid"], "tracks": ["inbound"],
                       "mediaFormat": {"encoding": "audio/x-mulaw", "sampleRate": 8000, "channels": 1}, "customParameters": params}}
    got = await carrier_call(stream, start, "streamSid")
    ok("WebSocket through the prefix carried her greeting", got["bytes"] >= 8000, f"{got['bytes'] / 8000:.1f} s of audio, first at {got['first']} s")


async def test_legacy(tel, tw):
    """During the migration a number may still point at the old tunnel host: the request arrives at the
    engine without the prefix (as cloudflared delivers it), and the stream it hands out is on the new base."""
    print("\n== old host (tunnel) still answers, and hands out the new /voice stream URL ==")
    tunnel = {"Host": "voicelab.aixellabs.in", "CF-Connecting-IP": "203.0.113.7", "X-Forwarded-For": "203.0.113.7",
              "X-Forwarded-Proto": "https"}
    nid = str(tel["_id"])
    st, xml = await ahttp("POST", f"http://127.0.0.1:{ENGINE_PORT}/texml?n={nid}&sig={product.sign('number', nid)}",
                          form={"Direction": "inbound", "From": "+15557770002", "To": tel["phoneNumber"]}, headers=tunnel)
    stream = ElementTree.fromstring(xml).find(".//Stream").get("url") if st == 200 and "<Stream" in xml else ""
    ok("old-host /texml?n= -> 200, Stream on wss://<host>/voice/telnyx", stream.startswith(f"wss://{PUBLIC}/telnyx?"), f"HTTP {st} {stream[:70]}")
    if stream:
        sid = "prefix-" + uuid.uuid4().hex[:8]
        got = await carrier_call(stream, {"event": "start", "stream_id": sid, "start": {"call_control_id": f"test:prefix-{sid}",
                                 "media_format": {"encoding": "PCMU", "sample_rate": 8000, "channels": 1}}}, "stream_id")
        ok("…and that stream works through the prefix", got["bytes"] >= 8000, f"{got['bytes'] / 8000:.1f} s of audio")
    nid = str(tw["_id"])
    old_url = f"https://voicelab.aixellabs.in/twiml?n={nid}&sig={product.sign('number', nid)}"
    form = {"CallSid": "CA" + "6" * 32, "AccountSid": tw["twilio"]["accountSid"], "From": "+15557770003", "To": tw["phoneNumber"]}
    st, xml = await ahttp("POST", f"http://127.0.0.1:{ENGINE_PORT}/twiml?n={nid}&sig={product.sign('number', nid)}", form=form,
                          headers={**tunnel, "X-Twilio-Signature": twilio.signature(AUTH_TOKEN, old_url, form)})
    ok("old-host /twiml: Twilio's signature over the OLD URL still accepted", st == 200 and "<Stream" in xml, f"HTTP {st}")


async def test_play(agent):
    print("\n== Playground: wss://<host>/voice/play ==")
    aid, uid = str(agent["_id"]), str(agent["userId"])
    url = f"{WS_BASE}/play?agent={aid}&user={uid}&t={urllib.parse.quote(bot.make_token('play', aid, uid, ttl=120))}"
    got = {"bytes": 0, "events": [], "last": 0.0}
    async with websockets.connect(url, ssl=SSL if url.startswith("wss") else None, max_size=None) as ws:
        async def sender():
            while True:
                try: await ws.send(bytes(640))
                except websockets.ConnectionClosed: return
                await asyncio.sleep(0.02)
        async def receiver():
            try:
                async for m in ws:
                    if isinstance(m, bytes): got["bytes"] += len(m); got["last"] = time.perf_counter()
                    else: got["events"].append(json.loads(m).get("type"))
            except websockets.ConnectionClosed: pass
        st, rt = asyncio.create_task(sender()), asyncio.create_task(receiver())
        end = time.perf_counter() + 20
        while time.perf_counter() < end and not (got["bytes"] >= 48000 and time.perf_counter() - got["last"] > 1.2):
            await asyncio.sleep(0.1)
        st.cancel(); await ws.close(); rt.cancel()
    ok("browser socket through the prefix: her audio (24 kHz) + transcript events", got["bytes"] >= 48000 and "transcript" in got["events"],
       f"{got['bytes'] / 48000:.1f} s, events {sorted(set(got['events']))}")


async def test_calls(tel):
    print("\n== POST /voice/calls -> Telnyx dial with /voice stream + webhook URLs; play Telnyx's part through them ==")
    nid, secret = str(tel["_id"]), os.environ.get("VOICELAB_KEY") or bot.VOICELAB_KEY
    SEEN.clear()
    st, body = await ahttp("POST", f"{BASE}/calls", {"numberId": nid, "to": "+15559990044"}, {"Authorization": f"Bearer {secret}"})
    ok("POST /calls with bearer -> 200", st == 200 and json.loads(body).get("ok"), f"HTTP {st} {body[:120]}")
    dial = next((s["body"] for s in SEEN if s["path"] == "/v2/calls"), None)
    if not dial: return ok("the dial reached the fake Telnyx", False)
    stream, hook = dial["stream_url"], dial["webhook_url"]
    ok("stream_url = wss://<host>/voice/telnyx?...ring=1", stream.startswith(f"wss://{PUBLIC}/telnyx?") and "ring=1" in stream, stream[:90])
    ok("webhook_url = https://<host>/voice/telnyx-events?n=&sig=", hook.startswith(f"https://{PUBLIC}/telnyx-events?n={nid}&sig="), hook[:90])
    st, _ = await ahttp("POST", hook.split("&sig=")[0], {"data": {}})
    ok("webhook without its signature -> 403", st == 403, f"HTTP {st}")
    sid = "prefix-" + uuid.uuid4().hex[:8]; ccid = f"test:prefix-{sid}"; answered = {}
    async def ring_then_answer():
        await asyncio.sleep(3)
        answered["st"], _ = await ahttp("POST", hook, {"data": {"event_type": "call.answered", "payload": {"call_control_id": ccid}}})
    got = await carrier_call(stream, {"event": "start", "stream_id": sid, "start": {"call_control_id": ccid,
                             "media_format": {"encoding": "PCMU", "sample_rate": 8000, "channels": 1}}}, "stream_id",
                             after_open=ring_then_answer, max_wait=25)
    ok("signed call.answered through the prefix -> 200", answered.get("st") == 200, str(answered))
    ok("after pickup + 3 s of silence she spoke over the prefixed socket", got["bytes"] >= 8000, f"{got['bytes'] / 8000:.1f} s of audio, first at {got['first']} s")


async def main():
    t0 = time.time()
    if "smoke" in WHICH: await test_smoke()
    if LIVE:
        runners = await fakes(); agent, tel, tw = fixtures()
        print(f"fixtures in {DBNAME}: agent {agent['_id']} telnyx {tel['_id']} twilio {tw['_id']}")
        try:
            if "texml" in WHICH: await test_texml(tel); await asyncio.sleep(3)
            if "twiml" in WHICH: await test_twiml(tw); await asyncio.sleep(3)
            if "play" in WHICH: await test_play(agent); await asyncio.sleep(3)
            if "calls" in WHICH: await test_calls(tel); await asyncio.sleep(3)
            if "legacy" in WHICH: await test_legacy(tel, tw); await asyncio.sleep(16)   # the prepared Twilio line expires unused
        finally:
            for r in runners: await r.cleanup()
            cleanup(agent, tel, tw, t0)
    passed = sum(1 for _, c in RESULTS if c)
    print(f"\n{passed}/{len(RESULTS)} passed")
    sys.exit(0 if passed == len(RESULTS) else 1)


asyncio.run(main())
