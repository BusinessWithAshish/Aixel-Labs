"""Every customer call runs on its owner's own Gemini API key (2026-10-19).

    MONGODB_URI=mongodb://127.0.0.1:27018 MONGODB_DB_NAME=AixelLabsVoiceEngineDev CAMPAIGNS=off \\
      TELNYX_API_BASE=http://127.0.0.1:7877 LOG_LEVEL=INFO .venv/bin/python phone.py --port 7876
    FAKE_TELNYX_PORT=7877 .venv/bin/python tests/gemini_key_e2e.py 7876 [unit play calls texml twiml voicelink legacy]

Three owners: A has the real key from .env, B a key Google refuses, C none. The server's own
GEMINI_API_KEY stays valid throughout, so B's and C's refusals prove a customer call never falls
back to it, and A's calls prove the owner's key is the one used. Two Live sessions (A's playground,
the legacy line) and a few refused connects; everything else is HTTP. Never production Mongo,
never AixelLabsE2E; fixtures are deleted afterwards.
"""
import asyncio, json, os, sys, time, urllib.parse, uuid
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(HERE)); sys.path.insert(0, str(HERE / "tests"))
os.environ.setdefault("FAKE_TELNYX_PORT", "7877")

import websockets
from bson import ObjectId
import product_e2e as pe   # the fake Telnyx, the playground client, http helpers (and the db guard)
import product, bot, scripted, testdb

db = pe.db
ok, RESULTS = pe.ok, pe.RESULTS
BAD_KEY = "AIzaSyD-not-a-real-key-0000000000000000"
CREATED = {"agents": [], "numbers": [], "owners": []}
STAMP = str(int(time.time()))[-6:]


def owner(key: str | None):
    """An owner with an inbound agent, an outbound agent, and a Telnyx, a Twilio and a VoiceLink number."""
    now = datetime.now(timezone.utc)
    tenant, user = ObjectId(), ObjectId()
    CREATED["owners"].append(user)
    if key:
        scripted.give_owner_key(db, tenant, user, key)

    def agent(call_type):
        a = {"tenantId": tenant, "userId": user, "name": f"Key test {call_type.lower()}", "voice": "kore", "callType": call_type,
             "prompt": "You are Priya, the receptionist at Sunrise Dental in Austin. Say your name and the clinic's name in "
                       "your very first sentence. Keep every reply to one short sentence.",
             "callNotes": "", "createdAt": now, "updatedAt": now}
        a["_id"] = db.voice_agents.insert_one(a).inserted_id
        CREATED["agents"].append(a["_id"])
        return a
    inbound, outbound = agent("INBOUND"), agent("OUTBOUND")

    def number(provider, phone, extra):
        n = {"tenantId": tenant, "userId": user, "provider": provider, "phoneNumber": phone, "providerNumberId": "pn-" + uuid.uuid4().hex[:8],
             "apiKeySealed": product.seal_secret(pe.FAKE_KEY), "inboundAgentId": inbound["_id"], "outboundAgentId": outbound["_id"],
             "createdAt": now, "updatedAt": now, **extra}
        n["_id"] = testdb.insert_number(db, n)
        CREATED["numbers"].append(n["_id"])
        return n
    seq = str(len(CREATED["owners"]))
    numbers = {
        "telnyx": number("TELNYX", f"+1558{seq}0{STAMP}", {"texmlAppId": "fake-texml-app", "callControlAppId": "fake-cc-app"}),
        "twilio": number("TWILIO", f"+1558{seq}1{STAMP}", {"twilio": {"accountSid": "AC" + "a1" * 16, "apiKeySid": "SK" + "b2" * 16}}),
        "voicelink": number("VOICELINK", f"+9180{seq}{STAMP}2", {"voicelink": {"clientId": None, "botId": 501}}),
    }
    return {"user": user, "inbound": inbound, "outbound": outbound, "numbers": numbers}


def settings(o):
    return db.voice_accounts.find_one({"userId": o["user"]}) or {}


async def wait_doc(query, secs=8.0):
    end = time.monotonic() + secs
    while time.monotonic() < end:
        doc = db.voice_calls.find_one(query, sort=[("_id", -1)])
        if doc:
            return doc
        await asyncio.sleep(0.4)
    return None


# --- unit: no server ----------------------------------------------------------------------------------

async def test_unit():
    print("\n== unit: what counts as a key problem, and the service's handling ==")
    cases = {
        "1007 None. API key not valid. Please pass a valid API key.": "INVALID",
        "1008 None. Method doesn't allow unregistered callers (callers without established identity).": "INVALID",
        "1011 None. You exceeded your current quota, please check your plan and billing details.": "QUOTA",
        "Generative Language API has not been used in project 123 before or it is disabled.": "API_DISABLED",
        "connection reset by peer": None,
        "1011 None. Internal error encountered.": None,
    }
    got = {text: (bot.gemini_key_problem(text) or (None,))[0] for text in cases}
    ok("Google's refusals are told apart from network trouble", got == cases, str(got))

    llm = bot.TurnSafeGeminiLive(api_key="unused", system_instruction="x")
    calls = []

    async def refused(*args):
        calls.append(args)
    llm.on_key_error = refused
    quota = Exception("1011 None. You exceeded your current quota, please check your plan and billing details.")
    first, second = await llm._handle_connection_error(quota), await llm._handle_connection_error(quota)
    ok("a refused key mid-call: no reconnect attempts, on_key_error once", first is False and second is False and len(calls) == 1
       and calls[0][0] == "QUOTA", f"{first} {second} {calls}")
    blip = await llm._handle_connection_error(Exception("connection reset by peer"))
    ok("a network blip still gets Pipecat's reconnect", blip is True and len(calls) == 1)

    bad = await product.check_gemini_key(BAD_KEY)
    ok("check_gemini_key: Google refuses a made-up key (INVALID)", bad is not None and bad[0] == "INVALID", str(bad)[:200])
    good = await product.check_gemini_key(os.environ["GEMINI_API_KEY"])
    ok("check_gemini_key: the real key is accepted", good is None, str(good)[:200])


# --- /play ----------------------------------------------------------------------------------------------

async def test_play(port, a, b, c):
    print("\n== /play: owner A (real key), B (refused key), C (no key) ==")
    aid, uid = str(c["inbound"]["_id"]), str(c["user"])
    r = await pe.play_session(port, aid, uid, token=bot.make_token("play", aid, uid, ttl=120))
    errors = [e for e in r["events"] if e["type"] == "error"]
    ok("C, no key: an error event, then the socket closes 1008", errors and errors[0]["code"] == "gemini_key_missing"
       and r["close"] and r["close"][0] == 1008 and r["audio"] == 0, f"{errors} close={r['close']}")

    t_start = datetime.now(timezone.utc).replace(microsecond=0)
    aid, uid = str(b["inbound"]["_id"]), str(b["user"])
    r = await pe.play_session(port, aid, uid, token=bot.make_token("play", aid, uid, ttl=120))
    errors = [e for e in r["events"] if e["type"] == "error"]
    ended = [e for e in r["events"] if e["type"] == "ended"]
    ok("B, refused key: error event gemini_key_invalid, then ended, no audio (never our key)",
       errors and errors[0]["code"] == "gemini_key_invalid" and r["audio"] == 0 and r["close"] is not None,
       f"{errors} {ended} close={r['close']} audio={r['audio']}")
    doc = await wait_doc({"agentId": b["inbound"]["_id"], "channel": "PLAYGROUND", "startedAt": {"$gte": t_start}})
    ok("B: the call is logged with endedBy gemini_key_error and why", doc and doc["endedBy"] == "gemini_key_error"
       and any(f["flag"] == "gemini_key_error" for f in doc["flags"]), str(doc and (doc["endedBy"], doc["flags"])))
    s = (settings(b).get("keys") or [{}])[0]
    ok("B: the owner's key is marked INVALID for the app, in plain words", s.get("status") == "INVALID"
       and "not a valid API key" in (s.get("statusMessage") or ""), str({k: s.get(k) for k in ("status", "statusMessage")}))

    aid, uid = str(a["inbound"]["_id"]), str(a["user"])
    r = await pe.play_session(port, aid, uid, script=["Yeah, go ahead, I've got a minute."])
    agent_lines = [e["text"] for e in r["events"] if e["type"] == "transcript" and e["role"] == "agent"]
    ok("A, own key: she speaks and answers", r["audio"] > 48000 and agent_lines and not any(e["type"] == "error" for e in r["events"]),
       f"{r['audio'] / 48000:.1f} s of audio, {agent_lines[:1]}")
    ok("A: the key stays OK", (settings(a).get("keys") or [{}])[0].get("status") == "OK")


# --- POST /calls ----------------------------------------------------------------------------------------

async def test_calls(port, a, b, c):
    print("\n== POST /calls ==")
    url, auth = f"http://127.0.0.1:{port}/calls", {"Authorization": f"Bearer {os.environ['VOICELAB_KEY']}"}
    for name, o, code in (("C, no key", c, "gemini_key_missing"), ("B, refused key", b, "gemini_key_invalid")):
        for provider in ("telnyx", "twilio", "voicelink"):
            pe.SEEN.clear()
            to = "+919876500001" if provider == "voicelink" else "+15559990001"
            st, body = await pe.ahttp("POST", url, {"numberId": str(o["numbers"][provider]["_id"]), "to": to}, auth)
            data = json.loads(body) if body.startswith("{") else {}
            ok(f"{name}, {provider}: 409 {code}, nothing dialled", st == 409 and data.get("code") == code and not pe.SEEN,
               f"HTTP {st} {body[:200]}")
    pe.SEEN.clear()
    st, body = await pe.ahttp("POST", url, {"numberId": str(a["numbers"]["telnyx"]["_id"]), "to": "+15559990002"}, auth)
    dialled = [x for x in pe.SEEN if x["path"] == "/v2/calls"]
    ok("A, own key: the call is placed", st == 200 and dialled, f"HTTP {st} {body[:200]}")
    db.voice_agents.update_one({"_id": a["outbound"]["_id"]}, {"$set": {"prompt": " "}})
    pe.SEEN.clear()
    st, body = await pe.ahttp("POST", url, {"numberId": str(a["numbers"]["telnyx"]["_id"]), "to": "+15559990003"}, auth)
    db.voice_agents.update_one({"_id": a["outbound"]["_id"]}, {"$set": {"prompt": a["outbound"]["prompt"]}})
    data = json.loads(body) if body.startswith("{") else {}
    ok("A, agent with no prompt: 409 agent_no_prompt, nothing dialled",
       st == 409 and data.get("code") == "agent_no_prompt" and data.get("error") == product.AGENT_NO_PROMPT and not pe.SEEN,
       f"HTTP {st} {body[:200]}")


# --- calls coming in -------------------------------------------------------------------------------------

async def test_texml(port, a, b, c):
    print("\n== /texml?n= (Telnyx, a call coming in) ==")
    for name, o, caller in (("C, no key", c, "+15557771001"), ("B, refused key", b, "+15557771002")):
        n = o["numbers"]["telnyx"]
        nid = str(n["_id"])
        t0 = time.perf_counter()
        st, body = await pe.ahttp("GET", f"http://127.0.0.1:{port}/texml?n={nid}&sig={scripted.number_sig(nid)}"
                                         f"&Direction=inbound&From={urllib.parse.quote(caller)}&To={urllib.parse.quote(n['phoneNumber'])}")
        took = time.perf_counter() - t0
        ok(f"{name}: a short apology and a hang-up, no stream", st == 200 and "<Say>" in body and "<Hangup/>" in body
           and "<Stream" not in body, f"HTTP {st} in {took:.2f} s: {body[:200]}")
        doc = await wait_doc({"numberId": n["_id"], "direction": "INBOUND"})
        ok(f"{name}: the call is logged for the owner (gemini_key_error, no audio)", doc and doc["endedBy"] == "gemini_key_error"
           and doc["durationSec"] == 0 and doc["turns"] == [] and doc["from"] == caller and doc["to"] == n["phoneNumber"], str(doc and {k: doc.get(k) for k in ("endedBy", "flags", "from", "to")}))
    n, caller = a["numbers"]["telnyx"], "+15557771004"
    nid = str(n["_id"])
    db.voice_agents.update_one({"_id": a["inbound"]["_id"]}, {"$set": {"prompt": ""}})
    st, body = await pe.ahttp("GET", f"http://127.0.0.1:{port}/texml?n={nid}&sig={scripted.number_sig(nid)}"
                                     f"&Direction=inbound&From={urllib.parse.quote(caller)}&To={urllib.parse.quote(n['phoneNumber'])}")
    db.voice_agents.update_one({"_id": a["inbound"]["_id"]}, {"$set": {"prompt": a["inbound"]["prompt"]}})
    doc = await wait_doc({"numberId": n["_id"], "direction": "INBOUND", "from": caller})
    ok("A, agent with no prompt: an apology and a hang-up, no stream, logged as agent_no_prompt",
       st == 200 and "<Hangup/>" in body and "<Stream" not in body and doc and doc["endedBy"] == "error"
       and doc["flags"] == [{"flag": "agent_no_prompt", "quote": product.AGENT_NO_PROMPT}],
       f"HTTP {st} {body[:120]} {doc and (doc['endedBy'], doc['flags'])}")
    r = await scripted.run(str(port), "busy", texml=True, number=str(a["numbers"]["telnyx"]["_id"]), caller="+15557771003")
    ok("A, own key: she answers the call", r["first_sound"] is not None, f"first sound {r['first_sound']}")


async def test_twiml(port, a, b, c):
    print("\n== /twiml?n= (Twilio, a call coming in) ==")
    for name, o, caller in (("C, no key", c, "+15557772001"), ("B, refused key", b, "+15557772002")):
        n = o["numbers"]["twilio"]
        nid = str(n["_id"])
        form = urllib.parse.urlencode({"From": caller, "To": n["phoneNumber"], "CallSid": "CA" + uuid.uuid4().hex}).encode()
        st, body = await asyncio.to_thread(raw_post, f"http://127.0.0.1:{port}/twiml?n={nid}&sig={scripted.number_sig(nid)}", form)
        ok(f"{name}: a short apology and a hang-up, no stream", st == 200 and "<Say>" in body and "<Hangup/>" in body
           and "<Stream" not in body, f"HTTP {st}: {body[:200]}")
        doc = await wait_doc({"numberId": n["_id"], "direction": "INBOUND"})
        ok(f"{name}: the call is logged with the caller", doc and doc["endedBy"] == "gemini_key_error" and doc["from"] == caller,
           str(doc and {k: doc.get(k) for k in ("endedBy", "from", "to")}))


def raw_post(url, data):
    import urllib.request
    req = urllib.request.Request(url, data=data, method="POST", headers={"Content-Type": "application/x-www-form-urlencoded"})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return r.status, r.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()


async def test_voicelink(port, a, b, c):
    print("\n== /voicelink (a call coming in) ==")
    n = c["numbers"]["voicelink"]
    nid = str(n["_id"])
    sid = "MZ" + uuid.uuid4().hex
    start = {"event": "start", "sequence_number": 0, "stream_sid": sid,
             "start": {"stream_sid": sid, "call_sid": "test:" + uuid.uuid4().hex, "account_sid": "77", "from": "919876500077",
                       "to": n["phoneNumber"].lstrip("+"), "custom_parameters": {},
                       "media_format": {"encoding": "audio/alaw", "sample_rate": "8000"}}}
    async with websockets.connect(f"ws://127.0.0.1:{port}/voicelink?n={nid}&sig={product.sign('number', nid)}") as ws:
        await ws.send(json.dumps(start))
        try:
            await asyncio.wait_for(ws.wait_closed(), 10)
        except asyncio.TimeoutError:
            pass
        code = ws.close_code
    ok("C, no key: the socket is closed (VoiceLink hangs up)", code == 1008, f"close {code}")
    doc = await wait_doc({"numberId": n["_id"], "direction": "INBOUND"})
    ok("C: the call is logged for the owner", doc and doc["endedBy"] == "gemini_key_error", str(doc and doc.get("endedBy")))


# --- Ashish's own line: still our key --------------------------------------------------------------------

async def test_legacy(port, *_):
    print("\n== legacy line (/telnyx, no number): still the engine's own key ==")
    r = await scripted.run(str(port), "no")
    ok("she speaks on Ashish's own line (env GEMINI_API_KEY)", r["first_sound"] is not None, f"first sound {r['first_sound']}")


async def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 7876
    testdb.engine_on(port, pe.DBNAME)
    which = sys.argv[2:] or ["unit", "play", "calls", "texml", "twiml", "voicelink", "legacy"]
    for line in ("Yeah, go ahead, I've got a minute.",):
        scripted.tts(line)
    fake = await pe.fake_telnyx()
    a, b, c = owner(os.environ["GEMINI_API_KEY"]), owner(BAD_KEY), owner(None)
    print(f"fixtures in {pe.DBNAME}: owners A {a['user']} B {b['user']} C {c['user']}")
    tests = {"unit": test_unit, "play": test_play, "calls": test_calls, "texml": test_texml, "twiml": test_twiml,
             "voicelink": test_voicelink, "legacy": test_legacy}
    try:
        for name in which:
            await (tests[name]() if name == "unit" else tests[name](port, a, b, c))
    finally:
        await fake.cleanup()
        db.voice_calls.delete_many({"agentId": {"$in": CREATED["agents"]}})
        testdb.delete_numbers(db, CREATED["numbers"])
        db.voice_agents.delete_many({"_id": {"$in": CREATED["agents"]}})
        db.voice_accounts.delete_many({"userId": {"$in": CREATED["owners"]}})
    passed = sum(1 for _, p in RESULTS if p)
    print(f"\n{passed}/{len(RESULTS)} passed")
    for name, p in RESULTS:
        if not p:
            print("  FAILED:", name)


if __name__ == "__main__":
    asyncio.run(main())
