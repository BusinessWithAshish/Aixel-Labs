"""End to end: {{variables}}, post-call analysis, caller memory and the voicemail message, on live calls.

Needs a test instance on a throwaway database, a fake Telnyx, and the real Gemini (Live + the text model):

    MONGODB_URI=mongodb://127.0.0.1:27018 MONGODB_DB_NAME=AixelLabsVoiceEngineDev CAMPAIGNS=off \\
      TELNYX_API_BASE=http://127.0.0.1:7888 LOG_LEVEL=INFO .venv/bin/python phone.py --port 7880
    FAKE_TELNYX_PORT=7888 .venv/bin/python tests/agent_features_e2e.py 7880 [vars memory voicemail hangup]

`vars`: a call placed through POST /calls with `variables` speaks the per-call value and the agent's
default; its analysis (summary, sentiment, success, custom fields) is written a few seconds after it
ends, and the caller memory with it. `memory`: the same number calls in, and the call starts with what
she remembered (needs `vars` first). `voicemail`: a scripted voicemail (greeting + beep) gets the agent's
own message with its variables filled in. `hangup`: an agent left on "hang up" leaves none.
Four Live sessions, one at a time. Fixtures are deleted afterwards.
"""
import asyncio, json, os, sys, time, urllib.request
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(HERE)); sys.path.insert(0, str(HERE / "tests"))
import testdb
MONGO, DBNAME = testdb.throwaway()
FAKE_PORT = int(os.getenv("FAKE_TELNYX_PORT", "7888"))
os.environ["MONGODB_URI"], os.environ["MONGODB_DB_NAME"] = MONGO, DBNAME  # product (sealing) keeps these over .env

from aiohttp import web
from bson import ObjectId
from pymongo import MongoClient
import product  # before scripted (which reloads .env with override): keeps the database settings above
import scripted

db = MongoClient(MONGO)[DBNAME]
assert db.name == DBNAME and product.db().name == DBNAME
RESULTS = []
OUT, IN_CALLER, VM_TO, VM_HANGUP_TO = "+15559990000", "+15559990000", "+15559990002", "+15559990003"


def ok(name, cond, detail=""):
    RESULTS.append((name, bool(cond)))
    print(f"  [{'PASS' if cond else 'FAIL'}] {name}{' -- ' + detail if detail else ''}", flush=True)


SEEN: list[dict] = []


async def fake_telnyx():
    async def handle(request):
        body = await request.json() if request.can_read_body else None
        SEEN.append({"path": request.path, "body": body})
        if request.path == "/v2/calls":
            return web.json_response({"data": {"call_control_id": "v3:fake-" + os.urandom(6).hex()}})
        return web.json_response({"data": {"result": "ok"}})
    app = web.Application(); app.router.add_route("*", "/{tail:.*}", handle)
    runner = web.AppRunner(app); await runner.setup()
    await web.TCPSite(runner, "127.0.0.1", FAKE_PORT).start()
    return runner


def fixtures():
    now = datetime.now(timezone.utc)
    tenant, user = ObjectId(), ObjectId()
    scripted.give_owner_key(db, tenant, user)
    agent = {
        "tenantId": tenant, "userId": user, "name": "Priya", "callType": "OUTBOUND", "voice": "kore",
        "prompt": ("You are {{agent_name}}, calling from {{clinic}}. Your very first sentence is exactly: "
                   "\"Hi, this is {{agent_name}} from {{clinic}}, calling about {{topic}}.\" "
                   "Then keep every reply to one short sentence."),
        "callNotes": "Topic of this call: {{topic}}.",
        "variables": {"clinic": "Sunrise Dental", "topic": "a check-up"},
        "analysis": {"summary": True, "sentiment": True, "success": True,
                     "successDefinition": "The person said they have a minute to talk.",
                     "fields": [{"name": "caller_name", "type": "text", "description": "The first name the other person gave"},
                                {"name": "interest", "type": "choice", "description": "How interested the person sounded",
                                 "options": ["High", "Medium", "Low"]},
                                {"name": "has_voicemail", "type": "boolean", "description": "Their calls go to voicemail"}]},
        "memory": True,
        "voicemail": {"action": "MESSAGE",
                      "message": "Hi {{first_name}}, this is {{agent_name}} from {{clinic}} about {{topic}}. Please call us back."},
        "createdAt": now, "updatedAt": now,
    }
    agent["_id"] = db.voice_agents.insert_one(agent).inserted_id
    quiet = {**agent, "_id": ObjectId(), "name": "Quiet", "voicemail": {"action": "HANG_UP", "message": "unused"}}
    db.voice_agents.insert_one(quiet)
    number = {"tenantId": tenant, "userId": user, "provider": "TELNYX", "providerNumberId": "fake-pn-af",
              "apiKeySealed": product.seal_secret("KEY_FAKE_CUSTOMER_AF"), "phoneNumber": "+15550004444",
              "texmlAppId": "fake-texml-app", "callControlAppId": "fake-cc-app",
              "inboundAgentId": agent["_id"], "outboundAgentId": agent["_id"], "createdAt": now, "updatedAt": now}
    number["_id"] = db.voice_numbers.insert_one(number).inserted_id
    return agent, quiet, number


def http(method, url, body=None, headers=None):
    req = urllib.request.Request(url, data=json.dumps(body).encode() if body is not None else None, method=method,
                                 headers={"Content-Type": "application/json", **(headers or {})})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return r.status, r.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()


async def place(port, number, to, scenario, agent_id=None, variables=None):
    """POST /calls, then play Telnyx's part with what the server sent it. Returns (status, body, doc)."""
    SEEN.clear()
    body = {"numberId": str(number["_id"]), "to": to, **({"agentId": str(agent_id)} if agent_id else {}),
            **({"variables": variables} if variables is not None else {})}
    st, text = await asyncio.to_thread(http, "POST", f"http://127.0.0.1:{port}/calls", body,
                                       {"Authorization": f"Bearer {os.environ['VOICELAB_KEY']}"})
    dial = next((s["body"] for s in SEEN if s["path"] == "/v2/calls"), None)
    if st != 200 or not dial:
        return st, text, None
    t0 = datetime.now(timezone.utc).replace(microsecond=0)
    await scripted.run(str(port), scenario, ring=3, url=dial["stream_url"], events=dial["webhook_url"])
    doc = None
    for _ in range(40):
        await asyncio.sleep(0.5)
        doc = db.voice_calls.find_one({"numberId": number["_id"], "to": to, "startedAt": {"$gte": t0}}, sort=[("_id", -1)])
        if doc:
            break
    return st, text, doc


async def analysed(call_id, secs=40):
    for _ in range(secs * 2):
        doc = db.voice_calls.find_one({"_id": call_id})
        if doc.get("analysis"):
            return doc
        await asyncio.sleep(0.5)
    return db.voice_calls.find_one({"_id": call_id})


def agent_words(doc):
    return " ".join(t["text"] for t in doc["turns"] if t["role"] == "agent").lower()


async def test_vars(port, agent, number):
    print("\n== variables in a live call, then its analysis and the caller memory ==")
    st, body = await asyncio.to_thread(http, "POST", f"http://127.0.0.1:{port}/calls",
                                       {"numberId": str(number["_id"]), "to": OUT, "variables": {"bad name": "x"}},
                                       {"Authorization": f"Bearer {os.environ['VOICELAB_KEY']}"})
    ok("/calls refuses badly named variables (400)", st == 400, f"HTTP {st} {body}")
    st, body, doc = await place(port, number, OUT, "human_pickup", variables={"topic": "the pineapple whitening offer"})
    ok("/calls with variables -> 200", st == 200, f"HTTP {st} {body}")
    ok("call doc written with the call's variables", doc and doc.get("variables") == {"topic": "the pineapple whitening offer"},
       str(doc and doc.get("variables")))
    if not doc:
        return
    words = agent_words(doc)
    ok("she said the per-call value ({{topic}})", "pineapple" in words, words[:200])
    ok("she said the agent's default ({{clinic}}) and her name ({{agent_name}})", "sunrise dental" in words and "priya" in words, words[:200])
    doc = await analysed(doc["_id"])
    a = doc.get("analysis") or {}
    print(f"    analysis: {a}")
    ok("analysis written after the call (no error)", a and not a.get("error") and a.get("model"), str(a)[:300])
    ok("summary + sentiment + success", isinstance(a.get("summary"), str) and len(a["summary"]) > 20
       and a.get("sentiment") in ("positive", "neutral", "negative") and isinstance(a.get("successful"), bool))
    f = a.get("fields") or {}
    # The person's "Hello? Davis Plumbing, this is Tom" is their pickup hello, kept from her (RingGate), so it is not
    # in the transcript: caller_name must come back null, not guessed.
    ok("custom fields: has_voicemail true (they said so), interest an option (or null), caller_name null (never said)",
       f.get("has_voicemail") is True and "interest" in f and f["interest"] in ("High", "Medium", "Low", None) and f.get("caller_name") is None, str(f))
    mem = db.voice_caller_memories.find_one({"userId": agent["userId"], "agentId": agent["_id"], "phone": OUT})
    ok("caller memory saved for (owner, agent, +number), <= 600 chars", mem and 0 < len(mem["brief"]) <= 600
       and mem["lastCallId"] == doc["_id"], str(mem and mem["brief"]))


async def test_memory(port, agent, number):
    print("\n== the same number calls in: she starts with what she remembers ==")
    mem = db.voice_caller_memories.find_one({"userId": agent["userId"], "agentId": agent["_id"], "phone": IN_CALLER})
    ok("a memory exists from the first call", mem is not None)
    if not mem:
        return
    t0 = datetime.now(timezone.utc).replace(microsecond=0)
    await scripted.run(str(port), "busy", texml=True, number=str(number["_id"]), caller=IN_CALLER)
    doc = None
    for _ in range(40):
        await asyncio.sleep(0.5)
        doc = db.voice_calls.find_one({"numberId": number["_id"], "direction": "INBOUND", "startedAt": {"$gte": t0}})
        if doc:
            break
    ok("inbound call doc written", doc is not None)
    if not doc:
        return
    used = doc.get("memoryUsed") or {}
    ok("the call started with the memory (memoryUsed = the stored brief and its date)",
       used.get("brief") == mem["brief"] and used.get("lastCallAt") is not None, str(used)[:200])
    print(f"    her words: {agent_words(doc)[:240]!r}")
    doc = await analysed(doc["_id"])
    mem2 = db.voice_caller_memories.find_one({"_id": mem["_id"]})
    ok("memory rewritten after the second call (2 calls, newest call id)", mem2["calls"] == 2 and mem2["lastCallId"] == doc["_id"],
       str(mem2 and mem2["brief"]))


async def test_voicemail(port, agent, number):
    print("\n== voicemail: her own message after the beep ==")
    st, body, doc = await place(port, number, VM_TO, "vm_personal", variables={"first_name": "Mike"})
    ok("/calls -> 200", st == 200, f"HTTP {st} {body}")
    if not doc:
        ok("call doc written", False)
        return
    want = "Hi Mike, this is Priya from Sunrise Dental about a check-up. Please call us back."
    ok("endedBy voicemail_message, the rendered message on the doc", doc["endedBy"] == "voicemail_message"
       and doc.get("voicemailMessage") == want, f"{doc['endedBy']} {doc.get('voicemailMessage')!r}")
    ok("flagged as voicemail + message left", {"voicemail", "voicemail_message_left"} <= {f["flag"] for f in doc["flags"]},
       str(doc["flags"]))
    mem = db.voice_caller_memories.find_one({"userId": agent["userId"], "phone": VM_TO})
    doc = await analysed(doc["_id"])
    ok("a voicemail is analysed but nothing is remembered about the number", doc.get("analysis") and mem is None,
       str(doc.get("analysis"))[:200])


async def test_hangup(port, quiet, number):
    print("\n== voicemail with an agent set to hang up ==")
    st, body, doc = await place(port, number, VM_HANGUP_TO, "vm_carrier", agent_id=quiet["_id"])
    ok("/calls -> 200", st == 200, f"HTTP {st} {body}")
    ok("hung up on the recording, no message", doc and doc["endedBy"] == "voicemail" and not doc.get("voicemailMessage")
       and "voicemail_message_left" not in {f["flag"] for f in doc["flags"]}, str(doc and (doc["endedBy"], doc["flags"])))


async def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 7880
    testdb.engine_on(port, DBNAME)
    which = sys.argv[2:] or ["vars", "memory", "voicemail", "hangup"]
    st, health = await asyncio.to_thread(http, "GET", f"http://127.0.0.1:{port}/health")
    assert st == 200, f"no test instance on :{port}"
    fake = await fake_telnyx()
    agent, quiet, number = fixtures()
    print(f"fixtures in {DBNAME}: agent {agent['_id']} user {agent['userId']} number {number['_id']}")
    try:
        if "vars" in which: await test_vars(port, agent, number)
        if "memory" in which: await test_memory(port, agent, number)
        if "voicemail" in which: await test_voicemail(port, agent, number)
        if "hangup" in which: await test_hangup(port, quiet, number)
    finally:
        await fake.cleanup()
        for name in ("voice_agents", "voice_numbers", "voice_calls", "voice_caller_memories", "voice_settings"):
            db[name].delete_many({"userId": agent["userId"]})
    passed = sum(1 for _, p in RESULTS if p)
    print(f"\n{passed}/{len(RESULTS)} passed")
    for name, p in RESULTS:
        if not p: print("  FAILED:", name)


if __name__ == "__main__":
    asyncio.run(main())
