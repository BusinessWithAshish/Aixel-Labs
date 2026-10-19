"""End to end check of Twilio numbers (/twiml, /twilio, /twilio-events, POST /calls for a Twilio number).

Needs a test instance pointed at a throwaway database and the fake Twilio REST API this script runs
(:7871 by default; the app's own e2e fakes use :7863-:7865, VoiceLink's :7866-:7867, the tool server :7868):

    MONGODB_URI=mongodb://127.0.0.1:27018 MONGODB_DB_NAME=AixelLabsVoiceEngineDev \\
      TWILIO_API_BASE=http://127.0.0.1:7871 TELNYX_API_BASE=http://127.0.0.1:8799 \\
      LOG_LEVEL=INFO .venv/bin/python phone.py --port 7867
    .venv/bin/python tests/twilio_e2e.py 7867 [unit rest twiml inbound outbound events]

Never point it at production Mongo and never at the real Twilio: it inserts its own agents and numbers
(fake Account SIDs, a fake API key and Auth Token), plays Twilio's part of a media stream (JSON
`connected` / `start` with customParameters / `media` mu-law 8 kHz / `stop`), and deletes it all
afterwards. Two Gemini Live sessions, one at a time: a caller books "Saturday at 2 pm" on a call IN
(the booking tool, tools.py), and a call we place waits for the callee's hello.
"""
import asyncio, base64, json, os, re, sys, time, urllib.parse, uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from xml.etree import ElementTree

HERE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(HERE)); sys.path.insert(0, str(HERE / "tests"))
import testdb
MONGO, DBNAME = testdb.throwaway()
TWILIO_PORT = int(os.getenv("FAKE_TWILIO_PORT", "7871"))

import websockets
from aiohttp import web
from bson import ObjectId
import product, bot
import tools_e2e as te   # the spoken caller, the booking checks, the cached lines

db = te.db
ok = te.ok
RESULTS = te.RESULTS
PUBLIC_HOST = os.getenv("PUBLIC_HOST", "localhost")

# Fake credentials, nothing real: an API-key account and an Auth-Token account.
AC_KEY, SK, KEY_SECRET = "AC" + "a1" * 16, "SK" + "b2" * 16, "fake_api_key_secret_" + os.urandom(4).hex()
AC_TOK, AUTH_TOKEN = "AC" + "c3" * 16, "fake_auth_token_" + os.urandom(4).hex()
TRIAL_BLOCKED = "+15005550001"   # the fake answers like Twilio does for an unverified number on a trial account
CALLER = "+1555" + str(int(time.time()))[-7:]
CALLEE = "+1556" + str(int(time.time()))[-7:]
CREATED = {"agents": [], "numbers": []}


def fixtures():
    agents, _ = te.fixtures()   # Booker (booking tool, Asia/Kolkata) and friends; their Telnyx numbers are not used here
    book = agents["book"]
    now = datetime.now(timezone.utc)
    out = {"tenantId": book["tenantId"], "userId": book["userId"], "name": "Twilio caller", "voice": "puck", "callType": "OUTBOUND",
           "prompt": "You are Priya from Sunrise Dental in Pune, calling to help the person book a check-up. "
                     "Say your name and the clinic in your first sentence. Keep every reply to one short sentence.",
           "callNotes": "", "createdAt": now, "updatedAt": now}
    out["_id"] = db.voice_agents.insert_one(out).inserted_id
    CREATED["agents"].append(out["_id"])
    base = {"tenantId": book["tenantId"], "userId": book["userId"], "provider": "TWILIO", "createdAt": now, "updatedAt": now}
    stamp = str(int(time.time()))[-6:]

    def number(phone, secret, twilio_state, inbound, outbound):
        n = {**base, "phoneNumber": phone, "providerNumberId": "PN" + uuid.uuid4().hex, "apiKeySealed": product.seal_secret(secret),
             "inboundAgentId": inbound, "outboundAgentId": outbound, "twilio": twilio_state}
        n["_id"] = db.voice_numbers.insert_one(n).inserted_id
        CREATED["numbers"].append(n["_id"])
        return n
    numbers = {
        # API key: Twilio's request signatures cannot be checked, our URL signature is the gate.
        "key": number("+1557100" + stamp[-4:], KEY_SECRET, {"accountSid": AC_KEY, "apiKeySid": SK}, book["_id"], out["_id"]),
        # Auth Token: X-Twilio-Signature is checked too.
        "token": number("+1557200" + stamp[-4:], AUTH_TOKEN, {"accountSid": AC_TOK, "apiKeySid": None}, book["_id"], out["_id"]),
        "bare": number("+1557300" + stamp[-4:], KEY_SECRET, {"accountSid": AC_KEY, "apiKeySid": SK}, None, None),
    }
    return {**agents, "out": out}, numbers


# --- a fake Twilio REST API -----------------------------------------------------------------------

SEEN: list[dict] = []
GOOD_AUTH = {AC_KEY: (SK, KEY_SECRET), AC_TOK: (AC_TOK, AUTH_TOKEN)}


async def fake_twilio():
    async def handle(request):
        form = list((await request.post()).items()) if request.can_read_body else []
        m = re.match(r"^/2010-04-01/Accounts/(AC\w+)(/.*)$", request.path)
        user = password = None
        header = request.headers.get("Authorization") or ""
        if header.startswith("Basic "):
            user, _, password = base64.b64decode(header[6:]).decode().partition(":")
        SEEN.append({"method": request.method, "path": request.path, "user": user, "form": form})
        if not m:
            return web.json_response({"code": 20404, "message": "The requested resource was not found", "status": 404}, status=404)
        account, rest = m.group(1), m.group(2)
        if GOOD_AUTH.get(account) != (user, password):
            return web.json_response({"code": 20003, "message": "Authenticate", "status": 401}, status=401)
        f = dict(form)
        if rest == "/Calls.json":
            if f.get("To") == TRIAL_BLOCKED:
                return web.json_response({"code": 21219, "status": 400, "message": f"The number {TRIAL_BLOCKED} is unverified. "
                                          "Trial accounts may only make calls to verified numbers."}, status=400)
            return web.json_response({"sid": "CA" + uuid.uuid4().hex, "status": "queued", "to": f.get("To"), "from": f.get("From")}, status=201)
        if re.match(r"^/Calls/CA\w+/Recordings\.json$", rest):
            return web.json_response({"sid": "RE" + uuid.uuid4().hex, "status": "in-progress", "channels": 2}, status=201)
        if re.match(r"^/Calls/CA\w+\.json$", rest):
            return web.json_response({"sid": rest.split("/")[2][:-5], "status": f.get("Status") or "in-progress"})
        return web.json_response({"code": 20404, "message": "not faked", "status": 404}, status=404)
    app = web.Application(); app.router.add_route("*", "/{tail:.*}", handle)
    runner = web.AppRunner(app); await runner.setup()
    await web.TCPSite(runner, "127.0.0.1", TWILIO_PORT).start()
    return runner


def seen(path_end, call_sid=None):
    return [s for s in SEEN if s["path"].endswith(path_end) and (call_sid is None or call_sid in s["path"])]


def http(method, url, body=None, headers=None, form=None):
    import urllib.request
    if form is not None:
        data, ctype = urllib.parse.urlencode(form).encode(), "application/x-www-form-urlencoded"
    else:
        data, ctype = (json.dumps(body).encode() if body is not None else None), "application/json"
    req = urllib.request.Request(url, data=data, method=method, headers={"Content-Type": ctype, **(headers or {})})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, r.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()


async def ahttp(*args, **kwargs):   # off the loop: the fake answers on this same loop
    return await asyncio.to_thread(http, *args, **kwargs)


def twilio_sig(token, path_and_query, form):
    """X-Twilio-Signature as Twilio computes it, for the public URL it called."""
    import twilio
    return twilio.signature(token, f"https://{PUBLIC_HOST}{path_and_query}", dict(form))


def stream_of(xml):
    """(stream path, {parameter: value}) from our <Connect><Stream> TwiML."""
    root = ElementTree.fromstring(xml)
    s = root.find("./Connect/Stream")
    if s is None:
        return None, {}
    return urllib.parse.urlsplit(s.get("url")), {p.get("name"): p.get("value") for p in s.findall("Parameter")}


# --- Twilio's side of a media stream ------------------------------------------------------------------

def start_message(call_sid, account, custom):
    sid = "MZ" + uuid.uuid4().hex
    return {"event": "start", "sequenceNumber": "1", "streamSid": sid,
            "start": {"accountSid": account, "streamSid": sid, "callSid": call_sid, "tracks": ["inbound"],
                      "mediaFormat": {"encoding": "audio/x-mulaw", "sampleRate": 8000, "channels": 1}, "customParameters": custom}}


async def twilio_call(port, start, lines, first_hello=False, stop_at_end=False):
    """Speak Twilio's Media Streams protocol at /twilio. Returns the Caller with what came back."""
    c = te.Caller(160, b"\xff" * 160); c.encode = te.ulaw
    sid = start["streamSid"]; c.sid = start["start"]["callSid"]
    c.media, c.clears, c.bad_sid, c.close_code, c.first_audio, c.hello_end, c.stopped = [], [], 0, None, None, None, False
    async with websockets.connect(f"ws://127.0.0.1:{port}/twilio", max_size=None) as ws:
        await ws.send(json.dumps({"event": "connected", "protocol": "Call", "version": "1.0.0"}))
        await ws.send(json.dumps(start)); t0 = time.perf_counter(); seq = [1]

        async def receiver():
            try:
                async for raw in ws:
                    m = json.loads(raw)
                    if m.get("streamSid") != sid:
                        c.bad_sid += 1
                    if m.get("event") == "media":
                        pk = base64.b64decode(m["media"]["payload"]); c.heard(len(pk))
                        c.first_audio = c.first_audio or round(time.perf_counter() - t0, 2)
                        c.media.append((time.perf_counter() - t0, len(pk)))
                    elif m.get("event") == "clear":
                        c.clears.append(round(time.perf_counter() - t0, 2))
            except websockets.ConnectionClosed:
                pass
            c.close_code = ws.close_code
            c.closed.set()

        async def sender():
            while not c.closed.is_set():
                fr = c.next_chunk(); seq[0] += 1
                msg = {"event": "media", "sequenceNumber": str(seq[0]), "streamSid": sid,
                       "media": {"track": "inbound", "chunk": str(seq[0]), "timestamp": str(int((time.perf_counter() - t0) * 1000)),
                                 "payload": base64.b64encode(fr).decode()}}
                try: await ws.send(json.dumps(msg))
                except websockets.ConnectionClosed: return
                await asyncio.sleep(0.02)
        rt, st = asyncio.create_task(receiver()), asyncio.create_task(sender())
        try:
            if first_hello:
                await asyncio.sleep(1.0); c.say(c.encode(te.HELLO)); await c.drained()
                c.hello_end = round(time.perf_counter() - t0, 2)
            await te.run_lines(c, lines)
            if stop_at_end and not c.closed.is_set():
                c.stopped = True; t_stop = time.perf_counter()
                await ws.send(json.dumps({"event": "stop", "sequenceNumber": str(seq[0] + 1), "streamSid": sid,
                                          "stop": {"accountSid": start["start"]["accountSid"], "callSid": c.sid}}))
                await c.wait_close(6)
                c.stop_to_close = round(time.perf_counter() - t_stop, 2) if c.closed.is_set() else None
        finally:
            st.cancel(); rt.cancel()
    return c


async def refused(port, start):
    """Opens /twilio with this start message; the close code the server answered with (None = not closed)."""
    try:
        async with websockets.connect(f"ws://127.0.0.1:{port}/twilio") as ws:
            await ws.send(json.dumps({"event": "connected"})); await ws.send(json.dumps(start))
            await asyncio.wait_for(ws.recv(), 10)
            return None
    except websockets.ConnectionClosed as e:
        return e.rcvd.code if e.rcvd else None
    except asyncio.TimeoutError:
        return None


async def wait_doc(query, secs=10.0):
    end = time.monotonic() + secs
    while time.monotonic() < end:
        doc = db.voice_calls.find_one(query, sort=[("_id", -1)])
        if doc: return doc
        await asyncio.sleep(0.5)
    return None


# --- unit: the module, no server needed ---------------------------------------------------------------

async def test_unit():
    print("\n== unit ==")
    import twilio
    from pipecat.frames.frames import CancelWorkerFrame, EndFrame, InputAudioRawFrame, InterruptionFrame, OutputAudioRawFrame

    # Twilio's own documented example (twilio-python's test suite): url + sorted params, HMAC-SHA1, base64.
    p = {"CallSid": "CA1234567890ABCDE", "Caller": "+14158675309", "Digits": "1234", "From": "+14158675309", "To": "+18005551212"}
    url = "https://mycompany.com/myapp.php?foo=1&bar=2"
    ok("X-Twilio-Signature matches Twilio's documented example", twilio.signature("12345", url, p) == "RSOYDt4T1cUTdK1PDd93/VVr8B8=")
    ok("signature_ok: right / wrong header / changed param / missing",
       twilio.signature_ok("12345", "RSOYDt4T1cUTdK1PDd93/VVr8B8=", ["https://other/x", url], p)
       and not twilio.signature_ok("12345", "RSOYDt4T1cUTdK1PDd93/VVr8B8x", [url], p)
       and not twilio.signature_ok("12345", "RSOYDt4T1cUTdK1PDd93/VVr8B8=", [url], {**p, "Digits": "1235"})
       and not twilio.signature_ok("12345", None, [url], p))

    xml = twilio.stream_twiml("wss://h/twilio", {"n": "abc", "callee": "+1 & <x>", "t": '1.2"3'})
    path, params = stream_of(xml)
    ok("stream TwiML: <Connect><Stream>, parameters escaped, nothing after <Connect>",
       path and path.path == "/twilio" and params == {"n": "abc", "callee": "+1 & <x>", "t": '1.2"3'}
       and len(ElementTree.fromstring(xml)) == 1, xml.replace("\n", " ")[:200])
    ok("Reject TwiML parses", ElementTree.fromstring(twilio.REJECT).find("Reject") is not None)

    key = twilio.creds_of({"twilio": {"accountSid": AC_KEY, "apiKeySid": SK}}, KEY_SECRET)
    tok = twilio.creds_of({"twilio": {"accountSid": AC_TOK, "apiKeySid": None}}, AUTH_TOKEN)
    ok("creds: API key -> user SK, no signature check; Auth Token -> user AC, signature checked",
       key["user"] == SK and key["auth_token"] is None and key["account_sid"] == AC_KEY
       and tok["user"] == AC_TOK and tok["auth_token"] == AUTH_TOKEN)
    form = dict((k, v) for k, v in twilio.call_form("+1", "+2", "<Response/>", "https://e", 30) if k != "StatusCallbackEvent")
    events = [v for k, v in twilio.call_form("+1", "+2", "<Response/>", "https://e", 30) if k == "StatusCallbackEvent"]
    ok("Calls form: To, From, Twiml, Timeout, StatusCallback POST, every status event",
       form == {"To": "+1", "From": "+2", "Twiml": "<Response/>", "Timeout": "30", "StatusCallback": "https://e", "StatusCallbackMethod": "POST"}
       and events == ["initiated", "ringing", "answered", "completed"])
    ok("refusal reasons: Twilio's words; 20003 in plain words",
       "Trial accounts" in twilio.reason(400, json.dumps({"code": 21219, "message": "x Trial accounts may only make calls to verified numbers."}))
       and "credentials" in twilio.reason(401, json.dumps({"code": 20003, "message": "Authenticate"})) and twilio.reason(500, "") == "HTTP 500")

    class Setup:
        audio_in_sample_rate = 16000
    s = twilio.TwilioSerializer(key); await s.setup(Setup())
    s.bind({"streamSid": "MZ1", "callSid": "CA" + "0" * 32})
    tone = bytes([0x7f, 0xff] * 80)
    frames = [await s.deserialize(json.dumps({"event": "media", "media": {"payload": base64.b64encode(tone).decode()}, "streamSid": "MZ1"}))
              for _ in range(25)]
    got = [f for f in frames if f]
    ok("media in: mu-law 8 kHz -> 16 kHz PCM", got and all(isinstance(f, InputAudioRawFrame) and f.sample_rate == 16000 for f in got)
       and 12000 <= sum(len(f.audio) for f in got) <= 16000, f"{sum(len(f.audio) for f in got)} B from 25 x 20 ms")
    out = [await s.serialize(OutputAudioRawFrame(audio=bytes(1920), sample_rate=24000, num_channels=1)) for _ in range(25)]
    msgs = [json.loads(m) for m in out if m]
    sent = sum(len(base64.b64decode(m["media"]["payload"])) for m in msgs)
    ok("media out: streamSid + mu-law 8 kHz payload (25 x 40 ms at 24 kHz -> ~8000 bytes)",
       msgs and all(m["event"] == "media" and m["streamSid"] == "MZ1" for m in msgs) and 7000 <= sent <= 8000, f"{sent} B")
    ok("clear on barge-in", json.loads(await s.serialize(InterruptionFrame())) == {"event": "clear", "streamSid": "MZ1"})
    junk = [await s.deserialize(x) for x in ("not json", "[]", '{"event":"mark","mark":{"name":"x"}}', '{"event":"media"}')]
    ok("junk and marks are skipped", all(j is None for j in junk))
    SEEN.clear()
    await s.serialize(EndFrame())
    hang = seen(f"/Calls/{'CA' + '0' * 32}.json")
    ok("EndFrame hangs up by REST: POST Calls/{CallSid}.json Status=completed, as the API key, at TWILIO_API_BASE",
       len(hang) == 1 and dict(hang[0]["form"]) == {"Status": "completed"} and hang[0]["user"] == SK, str(hang))
    s2 = twilio.TwilioSerializer(tok); await s2.setup(Setup()); s2.bind({"streamSid": "MZ2", "callSid": "CA" + "1" * 32})
    stop = await s2.deserialize(json.dumps({"event": "stop", "streamSid": "MZ2", "stop": {"callSid": "CA" + "1" * 32}}))
    SEEN.clear(); await s2.serialize(EndFrame())
    ok("stop ends the call without a hang-up request (it is already over)", isinstance(stop, CancelWorkerFrame) and not SEEN)


# --- POST /calls for a Twilio number ------------------------------------------------------------------

async def test_rest(port, agents, numbers):
    print("\n== POST /calls (Twilio) ==")
    url = f"http://127.0.0.1:{port}/calls"; auth = {"Authorization": f"Bearer {os.environ['VOICELAB_KEY']}"}
    n = numbers["key"]; nid, aid = str(n["_id"]), str(agents["out"]["_id"])
    st, _ = await ahttp("POST", url, {"numberId": nid, "to": CALLEE})
    ok("no bearer -> 401", st == 401, f"HTTP {st}")
    st, body = await ahttp("POST", url, {"numberId": str(numbers["bare"]["_id"]), "to": CALLEE}, auth)
    ok("number without an outbound agent -> 409", st == 409, f"HTTP {st} {body}")
    with (HERE / "suppressed.jsonl").open("a") as f:
        f.write(json.dumps({"number": "+15550000009", "reason": "test", "quote": "twilio_e2e", "stream_id": "test"}) + "\n")
    SEEN.clear()
    st, body = await ahttp("POST", url, {"numberId": nid, "to": "+1 555 000 0009"}, auth)
    ok("suppressed number -> 409, nothing sent to Twilio", st == 409 and not SEEN, f"HTTP {st} {body}")
    st, body = await ahttp("POST", url, {"numberId": nid, "to": TRIAL_BLOCKED}, auth)
    ok("trial account, unverified number -> 424 with Twilio's words", st == 424 and "Twilio refused the call" in body
       and "Trial accounts may only make calls to verified numbers" in body, f"HTTP {st} {body}")
    wrong = db.voice_numbers.insert_one({**{k: v for k, v in n.items() if k != "_id"}, "phoneNumber": n["phoneNumber"] + "9",
                                         "apiKeySealed": product.seal_secret("not-the-secret")}).inserted_id
    CREATED["numbers"].append(wrong)
    st, body = await ahttp("POST", url, {"numberId": str(wrong), "to": CALLEE}, auth)
    ok("rejected credentials -> 424 in plain words", st == 424 and "rejected the number's credentials" in body, f"HTTP {st} {body}")

    SEEN.clear()
    st, body = await ahttp("POST", url, {"numberId": nid, "to": CALLEE, "agentId": aid}, auth)
    res = json.loads(body) if st == 200 else {}
    ok("good request -> 200 {ok, callId: CallSid}", st == 200 and res.get("ok") and str(res.get("callId", "")).startswith("CA"), body)
    sent = seen("/Calls.json")
    ok("one Calls request reached the fake Twilio, as the API key", len(sent) == 1 and sent[0]["user"] == SK
       and sent[0]["path"] == f"/2010-04-01/Accounts/{AC_KEY}/Calls.json", str([(s['path'], s['user']) for s in SEEN]))
    if not sent:
        return None
    form = sent[0]["form"]; f = dict(form)
    ok("To / From / Timeout", f["To"] == CALLEE and f["From"] == n["phoneNumber"] and f["Timeout"] == "30", str({k: f[k] for k in ('To', 'From', 'Timeout')}))
    cb = urllib.parse.urlsplit(f["StatusCallback"]); q = dict(urllib.parse.parse_qsl(cb.query))
    ok("StatusCallback: https /twilio-events, n + a + sig(twilio-events, n, a), POST, every event",
       cb.scheme == "https" and cb.netloc == PUBLIC_HOST and cb.path == "/twilio-events" and q.get("n") == nid and q.get("a") == aid
       and q.get("sig") == product.sign("twilio-events", nid, aid) and f["StatusCallbackMethod"] == "POST"
       and [v for k, v in form if k == "StatusCallbackEvent"] == ["initiated", "ringing", "answered", "completed"], f["StatusCallback"])
    path, params = stream_of(f["Twiml"])
    ok("Twiml: <Connect><Stream url=wss://<host>/twilio> (no query), parameters n, a, dir=out, callee, t",
       path and path.scheme == "wss" and path.netloc == PUBLIC_HOST and path.path == "/twilio" and not path.query
       and {k: params.get(k) for k in ("n", "a", "dir", "callee")} == {"n": nid, "a": aid, "dir": "out", "callee": CALLEE}
       and params.get("t"), f["Twiml"].replace("\n", " ")[:300])
    exp = int(params["t"].split(".")[0]) - time.time()
    ok("stream token lasts ~10 minutes (a call may queue, then ring)", 500 < exp <= 600, f"{exp:.0f} s")
    return {"callSid": res["callId"], "params": params}


# --- /twiml ----------------------------------------------------------------------------------------------

async def test_twiml(port, agents, numbers):
    print("\n== /twiml ==")
    n = numbers["token"]; nid = str(n["_id"]); q = f"/twiml?n={nid}&sig={product.sign('number', nid)}"
    form = {"CallSid": "CA" + uuid.uuid4().hex, "AccountSid": AC_TOK, "From": CALLER, "To": n["phoneNumber"], "Direction": "inbound", "CallStatus": "ringing"}
    st, _ = await ahttp("POST", f"http://127.0.0.1:{port}/twiml?n={nid}&sig=0123456789abcdef0123456789abcdef", form=form)
    ok("bad signature -> 403", st == 403, f"HTTP {st}")
    st, _ = await ahttp("POST", f"http://127.0.0.1:{port}/twiml?n={nid}", form=form)
    ok("no signature (even from loopback) -> 403", st == 403, f"HTTP {st}")
    st, _ = await ahttp("POST", f"http://127.0.0.1:{port}{q}", form=form)
    ok("Auth Token number: no X-Twilio-Signature -> 403", st == 403, f"HTTP {st}")
    st, _ = await ahttp("POST", f"http://127.0.0.1:{port}{q}", form=form, headers={"X-Twilio-Signature": twilio_sig("wrong", q, form)})
    ok("Auth Token number: a wrong X-Twilio-Signature -> 403", st == 403, f"HTTP {st}")
    b = numbers["bare"]; bid = str(b["_id"])
    st, xml = await ahttp("POST", f"http://127.0.0.1:{port}/twiml?n={bid}&sig={product.sign('number', bid)}", form={**form, "To": b["phoneNumber"]})
    ok("number whose AI answering is off -> <Reject/> (never answered, nothing billed)", st == 200 and "<Reject" in xml, f"HTTP {st} {xml[:120]}")
    start = start_message("CA" + uuid.uuid4().hex, AC_TOK, {"n": nid, "dir": "in", "a": "", "callee": CALLER, "t": "1.abc"})
    ok("a stream with a made-up token is closed 1008", await refused(port, start) == 1008)


# --- a call IN: book Saturday at 2 pm -------------------------------------------------------------------

async def test_inbound(port, agents, numbers):
    print("\n== /twiml + /twilio (a call in to an Auth Token number): book Saturday at 2 pm ==")
    te.clear_bookings(agents["book"])
    n = numbers["token"]; nid = str(n["_id"]); q = f"/twiml?n={nid}&sig={product.sign('number', nid)}"
    call_sid = "CA" + uuid.uuid4().hex
    form = {"AccountSid": AC_TOK, "ApiVersion": "2010-04-01", "CallSid": call_sid, "CallStatus": "ringing", "Called": n["phoneNumber"],
            "Caller": CALLER, "Direction": "inbound", "From": CALLER, "To": n["phoneNumber"]}
    t0 = time.perf_counter()
    st, xml = await ahttp("POST", f"http://127.0.0.1:{port}{q}", form=form, headers={"X-Twilio-Signature": twilio_sig(AUTH_TOKEN, q, form)})
    answered_in = round(time.perf_counter() - t0, 2)
    path, params = stream_of(xml) if st == 200 and "<Stream" in xml else (None, {})
    ok("signed /twiml -> <Connect><Stream> to wss://<host>/twilio with n, dir=in, callee, t", path and path.path == "/twilio"
       and params.get("n") == nid and params.get("dir") == "in" and params.get("callee") == CALLER and params.get("t"),
       f"HTTP {st}, answered after {answered_in} s (her greeting is made first)")
    if not path:
        return
    tampered = start_message(call_sid, AC_TOK, {**params, "callee": "+15551112222"})
    ok("the same token with another callee is refused 1008", await refused(port, tampered) == 1008)
    SEEN.clear()
    c = await twilio_call(port, start_message(call_sid, AC_TOK, params), te.BOOK)
    ok("she speaks first, at once (greeting made while it rang)", c.first_audio is not None and c.first_audio < 1.5, f"first audio {c.first_audio} s after start")
    ok("every message from us carries our streamSid", c.bad_sid == 0, f"{c.bad_sid} without")
    await asyncio.sleep(2)
    doc = await te.wait_call({"numberId": n["_id"], "providerCallId": call_sid})
    te.check_booking("twilio in", doc, "PHONE", CALLER)
    if doc:
        ok("doc: PHONE INBOUND, from the caller to the number, providerCallId = CallSid, agent Booker",
           doc["direction"] == "INBOUND" and doc["from"] == CALLER and doc["to"] == n["phoneNumber"] and doc["agentId"] == agents["book"]["_id"]
           and doc["durationSec"] > 0, f"from={doc['from']} to={doc['to']} endedBy={doc['endedBy']} {doc['durationSec']} s")
    rec = seen(f"/Calls/{call_sid}/Recordings.json")
    ok("recording asked for once live: dual channel, both tracks, with the Auth Token",
       len(rec) == 1 and dict(rec[0]["form"]) == {"RecordingChannels": "dual", "RecordingTrack": "both"} and rec[0]["user"] == AC_TOK, str(rec))
    hang = seen(f"/Calls/{call_sid}.json")
    if doc and doc["endedBy"] == "goodbye":
        ok("her goodbye hangs up by REST (Status=completed)", hang and dict(hang[-1]["form"]) == {"Status": "completed"}
           and c.closed.is_set(), f"{len(hang)} hang-up requests, socket closed: {c.closed.is_set()}")
    else:
        ok("the call ended (socket closed)", c.closed.is_set(), f"endedBy {doc and doc['endedBy']}, {len(hang)} hang-up requests")


# --- a call we place: she waits for hello ----------------------------------------------------------------

async def test_outbound(port, agents, numbers, placed):
    print("\n== /calls + /twilio (a call we place): hello wait ==")
    if not placed:
        ok("outbound needs the Calls request from the rest test", False); return
    n = numbers["key"]
    SEEN.clear()
    c = await twilio_call(port, start_message(placed["callSid"], AC_KEY, placed["params"]), ["Go on, I've got a minute."], first_hello=True, stop_at_end=True)
    early = [t for t, _ in c.media if t < (c.hello_end or 0)]
    ok("she waits for the hello (nothing before it)", c.hello_end and not early, f"hello ended at {c.hello_end} s, {len(early)} packets before it")
    gap = round(c.first_audio - c.hello_end, 2) if c.first_audio and c.hello_end else None
    ok("then she speaks (opener made while the callee said hello)", gap is not None and 0 <= gap < 3.0, f"first audio {gap} s after the hello ended")
    ok("Twilio's stop ends the call, no hang-up request", getattr(c, "stop_to_close", None) is not None and not seen(f"/Calls/{placed['callSid']}.json"),
       f"closed {getattr(c, 'stop_to_close', None)} s after stop")
    doc = await wait_doc({"numberId": n["_id"], "providerCallId": placed["callSid"]})
    ok("voice_calls doc written", doc is not None)
    if doc:
        ok("doc: OUTBOUND from the number to the callee, agent from /calls, caller_hung_up",
           doc["direction"] == "OUTBOUND" and doc["from"] == n["phoneNumber"] and doc["to"] == CALLEE
           and doc["agentId"] == agents["out"]["_id"] and doc["endedBy"] == "caller_hung_up" and doc["voice"] == "puck",
           f"from={doc['from']} to={doc['to']} endedBy={doc['endedBy']} voice={doc['voice']}")
        said = " ".join(t["text"] for t in doc["turns"] if t["role"] == "agent").lower()
        ok("the outbound agent spoke", "priya" in said or "sunrise" in said, said[:140])
    rec = seen(f"/Calls/{placed['callSid']}/Recordings.json")
    ok("recording asked for with the API key", len(rec) == 1 and rec[0]["user"] == SK, str(rec))
    # The completed callback after a call that streamed: its own doc stays the only one.
    nid, aid = str(n["_id"]), str(agents["out"]["_id"])
    st, _ = await ahttp("POST", f"http://127.0.0.1:{port}/twilio-events?n={nid}&a={aid}&sig={product.sign('twilio-events', nid, aid)}",
                        form={"CallSid": placed["callSid"], "CallStatus": "completed", "To": CALLEE, "From": n["phoneNumber"], "CallDuration": "12"})
    await asyncio.sleep(1.5)
    ok("completed callback for a streamed call writes nothing more", st == 200 and db.voice_calls.count_documents({"providerCallId": placed["callSid"]}) == 1)


# --- /twilio-events ----------------------------------------------------------------------------------------

async def test_events(port, agents, numbers):
    print("\n== /twilio-events ==")
    n = numbers["key"]; nid, aid = str(n["_id"]), str(agents["out"]["_id"])
    path = f"/twilio-events?n={nid}&a={aid}&sig={product.sign('twilio-events', nid, aid)}"
    url = f"http://127.0.0.1:{port}{path}"
    st, _ = await ahttp("POST", f"http://127.0.0.1:{port}/twilio-events?n={nid}&a={aid}&sig={product.sign('number', nid)}", form={"CallSid": "CAx"})
    ok("signature for another purpose -> 403", st == 403, f"HTTP {st}")
    st, _ = await ahttp("POST", f"http://127.0.0.1:{port}/twilio-events?n={nid}&a={str(agents['book']['_id'])}&sig={product.sign('twilio-events', nid, aid)}",
                        form={"CallSid": "CAx"})
    ok("changed agent -> 403", st == 403, f"HTTP {st}")

    never = "+1558" + str(int(time.time()))[-7:]
    sid = "CA" + uuid.uuid4().hex
    base = {"AccountSid": AC_KEY, "CallSid": sid, "From": n["phoneNumber"], "To": never, "Direction": "outbound-api"}
    st1, _ = await ahttp("POST", url, form={**base, "CallStatus": "initiated"})
    st2, _ = await ahttp("POST", url, form={**base, "CallStatus": "ringing"})
    await asyncio.sleep(3)
    st3, _ = await ahttp("POST", url, form={**base, "CallStatus": "no-answer", "CallDuration": "0"})
    doc = await wait_doc({"providerCallId": sid})
    ok("no-answer: a doc with endedBy no_answer", st1 == st2 == st3 == 200 and doc and doc["endedBy"] == "no_answer", f"{st1} {st2} {st3} {doc and doc.get('endedBy')}")
    if doc:
        rang = (doc["endedAt"] - doc["startedAt"]).total_seconds()
        ok("no-answer doc shape (from the ringing time, nobody spoke)", doc["direction"] == "OUTBOUND" and doc["channel"] == "PHONE"
           and doc["from"] == n["phoneNumber"] and doc["to"] == never and doc["agentId"] == agents["out"]["_id"] and doc["durationSec"] == 0
           and doc["turns"] == [] and doc["voice"] == "puck" and doc["userId"] == n["userId"] and 2.5 <= rang <= 6, f"rang {rang:.1f} s")
    await ahttp("POST", url, form={**base, "CallStatus": "no-answer"})   # Twilio retries
    await asyncio.sleep(1.5)
    ok("a retried callback writes no second doc", db.voice_calls.count_documents({"providerCallId": sid}) == 1)
    for status, want in (("busy", "busy"), ("failed", "failed")):
        s2 = "CA" + uuid.uuid4().hex
        await ahttp("POST", url, form={**base, "CallSid": s2, "CallStatus": status})
        d = await wait_doc({"providerCallId": s2})
        ok(f"{status}: endedBy {want}", d and d["endedBy"] == want, str(d and d.get("endedBy")))

    # Auth Token numbers: X-Twilio-Signature is checked on callbacks too.
    t = numbers["token"]; tid = str(t["_id"])
    tpath = f"/twilio-events?n={tid}&a={aid}&sig={product.sign('twilio-events', tid, aid)}"
    s3 = "CA" + uuid.uuid4().hex; form = {**base, "AccountSid": AC_TOK, "CallSid": s3, "From": t["phoneNumber"], "CallStatus": "busy"}
    st, _ = await ahttp("POST", f"http://127.0.0.1:{port}{tpath}", form=form)
    ok("Auth Token number: callback without X-Twilio-Signature -> 403", st == 403, f"HTTP {st}")
    st, _ = await ahttp("POST", f"http://127.0.0.1:{port}{tpath}", form=form, headers={"X-Twilio-Signature": twilio_sig(AUTH_TOKEN, tpath, form)})
    d = await wait_doc({"providerCallId": s3})
    ok("Auth Token number: signed callback -> 200 and its doc", st == 200 and d and d["endedBy"] == "busy", f"HTTP {st}")

    # Answered, but no stream ever reached us (a trial account's key press nobody made): "not_connected".
    s4 = "CA" + uuid.uuid4().hex
    await ahttp("POST", url, form={**base, "CallSid": s4, "CallStatus": "completed", "CallDuration": "9"})
    d = await wait_doc({"providerCallId": s4}, secs=25)
    ok("completed with no stream -> endedBy not_connected (after looking for the stream's own doc)", d and d["endedBy"] == "not_connected",
       str(d and d.get("endedBy")))


async def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 7867
    testdb.engine_on(port, DBNAME)
    which = sys.argv[2:] or ["unit", "rest", "twiml", "inbound", "outbound", "events"]
    os.environ["TWILIO_API_BASE"] = f"http://127.0.0.1:{TWILIO_PORT}"   # this process's own serializer checks
    api = await fake_twilio()
    agents, numbers = fixtures()
    print(f"fixtures in {DBNAME}: numbers key {numbers['key']['_id']} token {numbers['token']['_id']} bare {numbers['bare']['_id']}; caller {CALLER} callee {CALLEE}")
    placed = None
    try:
        if "unit" in which: await test_unit()
        if "rest" in which or "outbound" in which: placed = await test_rest(port, agents, numbers)
        if "twiml" in which: await test_twiml(port, agents, numbers)
        if "inbound" in which: await test_inbound(port, agents, numbers)
        if "outbound" in which: await test_outbound(port, agents, numbers, placed)
        if "events" in which: await test_events(port, agents, numbers)
    finally:
        await api.cleanup()
        dnc = HERE / "suppressed.jsonl"   # take back what this test put on the list: its fake numbers
        dnc.write_text("".join(l + "\n" for l in dnc.read_text().splitlines()
                               if '"quote": "twilio_e2e"' not in l and CALLER not in l and CALLEE not in l))
        ids = CREATED["numbers"] + te.CREATED["numbers"]
        db.voice_calls.delete_many({"numberId": {"$in": ids}})
        db.voice_bookings.delete_many({"agentId": {"$in": CREATED["agents"] + te.CREATED["agents"]}})
        db.voice_numbers.delete_many({"_id": {"$in": ids}})
        db.voice_agents.delete_many({"_id": {"$in": CREATED["agents"] + te.CREATED["agents"]}})
    passed = sum(1 for _, p in RESULTS if p)
    print(f"\n{passed}/{len(RESULTS)} passed")
    for name, p in RESULTS:
        if not p: print("  FAILED:", name)


if __name__ == "__main__":
    asyncio.run(main())
