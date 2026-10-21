"""End to end: a small outbound campaign run by a real engine instance, the phone side played here.

Needs a test instance pointed at the throwaway database and this script's fake Telnyx:

    MONGODB_URI=mongodb://127.0.0.1:27018 MONGODB_DB_NAME=AixelLabsVoiceEngineDev \\
      TELNYX_API_BASE=http://127.0.0.1:8877 CAMPAIGN_TICK_SECS=1 LOG_LEVEL=INFO \\
      .venv/bin/python phone.py --port 7877
    FAKE_TELNYX_PORT=8877 .venv/bin/python tests/campaigns_e2e.py 7877

The engine's own campaign loop does the dialling (POST /calls, in process). The fake Telnyx takes
each dial and this script plays what the phone network would: a person who picks up and talks
(scripted.py, a real Gemini Live session), or a phone that rings out (Telnyx's call.hangup). Two
answered calls, so two Live sessions. Nothing reaches the real Telnyx; every number is +1555.
"""
import asyncio, base64, json, os, sys, time, urllib.parse, urllib.request, uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(HERE)); sys.path.insert(0, str(HERE / "tests"))
import testdb
MONGO, DBNAME = testdb.throwaway()
FAKE_PORT = int(os.getenv("FAKE_TELNYX_PORT", "8877"))

import websockets
from aiohttp import web
from bson import ObjectId
from pymongo import MongoClient
import product, scripted

db = MongoClient(MONGO)[DBNAME]
FAKE_KEY = "KEY_FAKE_CAMPAIGN_0123456789"
RESULTS = []
SUPPRESSED = HERE / "suppressed.jsonl"
MARK = "campaigns_e2e"

ASHA, BEN, CHEN, DEV, EVE = "+15559991001", "+15559991002", "+15559991003", "+15559991004", "+15559991005"
# What the phone does on each dial of each number, in order: answer, or ring out.
PLAN = {ASHA: ["answer"], BEN: ["ring_out", "ring_out"], DEV: ["ring_out", "answer"], EVE: ["ring_out"]}


def ok(name, cond, detail=""):
    RESULTS.append((name, bool(cond)))
    print(f"  [{'PASS' if cond else 'FAIL'}] {name}{' -- ' + detail if detail else ''}", flush=True)


def fixtures():
    now = datetime.now(timezone.utc)
    tenant, user = ObjectId(), ObjectId()
    agent = {"tenantId": tenant, "userId": user, "name": "Campaign caller", "callType": "OUTBOUND", "voice": "kore",
             "prompt": "You are Priya from Sunrise Dental in Austin, calling patients about their six-monthly cleaning. "
                       "Say your name and the clinic's name in your very first sentence. Keep every reply to one or two short sentences.",
             "callNotes": "", "createdAt": now, "updatedAt": now}
    agent["_id"] = db.voice_agents.insert_one(agent).inserted_id
    number = {"tenantId": tenant, "userId": user, "provider": "TELNYX", "providerNumberId": "fake-pn-campaign",
              "apiKeySealed": product.seal_secret(FAKE_KEY), "phoneNumber": "+15550004444", "callControlAppId": "fake-cc-app",
              "inboundAgentId": None, "outboundAgentId": agent["_id"], "createdAt": now, "updatedAt": now}
    number["_id"] = testdb.insert_number(db, number)
    # Every call runs on the owner's own Gemini key (product.gemini_key_for): this run's own key, sealed.
    key = os.environ["GEMINI_API_KEY"]
    testdb.set_account(db, {"tenantId": tenant, "userId": user, "createdAt": now, "updatedAt": now,
                                  "gemini": {"keySealed": product.seal_secret(key), "last4": key[-4:], "status": "OK",
                                             "checkedAt": now, "savedAt": now}})
    return agent, number


def make_campaign(agent, number, phones, *, status, max_concurrent, retry, name):
    now = datetime.now(timezone.utc)
    doc = {"tenantId": agent["tenantId"], "userId": agent["userId"], "name": name, "agentId": agent["_id"],
           "numberId": number["_id"], "status": status, "maxConcurrent": max_concurrent, "retry": retry,
           # Every day, all day, so the run never waits on the clock.
           "window": {"days": ["mon", "tue", "wed", "thu", "fri", "sat", "sun"], "start": "00:00", "end": "24:00", "timezone": "UTC"},
           "defaultCountry": "US", "variableKeys": ["company", "plan"], "lastError": None,
           "createdAt": now, "updatedAt": now, "startedAt": now if status == "RUNNING" else None}
    doc["_id"] = db.voice_campaigns.insert_one(doc).inserted_id
    db.voice_campaign_contacts.insert_many([
        {"tenantId": agent["tenantId"], "userId": agent["userId"], "campaignId": doc["_id"], "phone": p, "name": n,
         "variables": {"company": f"{n}'s shop", "plan": "Gold"}, "row": i + 2, "status": "PENDING", "attempts": 0,
         "nextAttemptAt": None, "booked": False, "callIds": [], "createdAt": now, "updatedAt": now}
        for i, (p, n) in enumerate(phones)])
    return doc


# --- the fake Telnyx and the phone side -----------------------------------------------------------

DIALS: list[dict] = []
LIVE = {"now": 0, "max": 0}


async def fake_telnyx():
    async def handle(request):
        body = await request.json() if request.can_read_body else None
        if request.path == "/v2/calls":
            DIALS.append({"body": body, "at": time.monotonic()})
            return web.json_response({"data": {"call_control_id": "v3:fake-" + os.urandom(6).hex(), "call_leg_id": "x"}})
        return web.json_response({"data": {"result": "ok"}})   # record_start, hangup
    app = web.Application(); app.router.add_route("*", "/{tail:.*}", handle)
    runner = web.AppRunner(app); await runner.setup()
    await web.TCPSite(runner, "127.0.0.1", FAKE_PORT).start()
    return runner


def local(url, port):
    p = urllib.parse.urlparse(url)
    return url.replace(f"{p.scheme}://{p.netloc}", f"{'ws' if p.scheme == 'wss' else 'http'}://127.0.0.1:{port}")


def post(url, body):
    req = urllib.request.Request(url, data=json.dumps(body).encode(), headers={"Content-Type": "application/json"})
    return urllib.request.urlopen(req, timeout=5).read()


async def ring_out(port, dial):
    """The line opens before ringing (as Telnyx does), rings 2 s, and Telnyx reports nobody answered."""
    sid = str(uuid.uuid4())
    async with websockets.connect(local(dial["stream_url"], port), max_size=None) as ws:
        await ws.send(json.dumps({"event": "connected"}))
        await ws.send(json.dumps({"event": "start", "stream_id": sid, "start": {"call_control_id": f"test:{sid}",
                                  "media_format": {"encoding": "PCMU", "sample_rate": 8000, "channels": 1}}}))
        await asyncio.sleep(2)
        await asyncio.to_thread(post, local(dial["webhook_url"], port),
                                {"data": {"event_type": "call.hangup", "payload": {"call_control_id": f"test:{sid}", "hangup_cause": "timeout"}}})
        try:
            await asyncio.wait_for(ws.wait_closed(), 10)
        except asyncio.TimeoutError:
            pass


async def phone_network(port, stop: asyncio.Event):
    """Plays the phone side of every dial the engine makes, as it makes them."""
    seen, tasks, count = 0, [], {}

    async def one(dial):
        LIVE["now"] += 1; LIVE["max"] = max(LIVE["max"], LIVE["now"])
        try:
            to = dial["to"]
            n = count[to] = count.get(to, 0) + 1
            what = (PLAN.get(to) or ["ring_out"])[min(n, len(PLAN.get(to) or [1])) - 1]
            print(f"    phone: dial {n} to {to}: {what}", flush=True)
            if what == "answer":
                await scripted.run(str(port), "human_pickup", ring=2, url=dial["stream_url"], events=dial["webhook_url"])
            else:
                await ring_out(port, dial)
        finally:
            LIVE["now"] -= 1

    while not stop.is_set():
        while seen < len(DIALS):
            tasks.append(asyncio.create_task(one(DIALS[seen]["body"]))); seen += 1
        await asyncio.sleep(0.2)
    await asyncio.gather(*tasks, return_exceptions=True)


def contacts(campaign):
    return {c["phone"]: c for c in db.voice_campaign_contacts.find({"campaignId": campaign["_id"]})}


async def wait_for(cond, secs, step=0.5):
    end = time.monotonic() + secs
    while time.monotonic() < end:
        if await asyncio.to_thread(cond):
            return True
        await asyncio.sleep(step)
    return False


async def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 7877
    testdb.engine_on(port, DBNAME)
    health = json.loads(urllib.request.urlopen(f"http://127.0.0.1:{port}/health", timeout=5).read())
    assert health.get("product_db"), f"the engine on {port} has no database: {health}"
    fake = await fake_telnyx()
    agent, number = fixtures()
    with SUPPRESSED.open("a") as f:   # Chen asked not to be called again, on some earlier call
        f.write(json.dumps({"number": CHEN, "reason": "test", "quote": MARK, "stream_id": "test"}) + "\n")
    stop = asyncio.Event()
    network = asyncio.create_task(phone_network(port, stop))
    camp = paused = None
    try:
        print(f"\n== a campaign of 4 (max 2 at once, 1 retry on no answer) in {DBNAME} ==")
        camp = make_campaign(agent, number, [(ASHA, "Asha"), (BEN, "Ben"), (CHEN, "Chen"), (DEV, "Dev")], status="RUNNING",
                             max_concurrent=2, retry={"maxRetries": 1, "delayMinutes": 0.1, "on": ["no_answer", "voicemail"]},
                             name="E2E cleaning reminders")
        peak = {"calling": 0}

        def sample():
            n = db.voice_campaign_contacts.count_documents({"campaignId": camp["_id"], "status": "CALLING"})
            peak["calling"] = max(peak["calling"], n)
            return db.voice_campaigns.find_one({"_id": camp["_id"]})["status"] == "COMPLETED"

        done = await wait_for(sample, 300, 0.3)
        ok("the campaign ran to COMPLETED on its own", done, db.voice_campaigns.find_one({"_id": camp["_id"]})["status"])
        cs = contacts(camp)
        for p, c in cs.items():
            print(f"    {p} {c['name']}: {c['status']} attempts={c['attempts']} last={c.get('lastOutcome')} calls={len(c.get('callIds') or [])}")
        ok("never more than 2 calls at once (contacts CALLING)", peak["calling"] <= 2, f"peak {peak['calling']}")
        ok("never more than 2 lines open at once (phone side)", LIVE["max"] <= 2, f"peak {LIVE['max']}")
        ok("Chen (do-not-call list) skipped and never dialled",
           cs[CHEN]["status"] == "SKIPPED_DNC" and not any(d["body"]["to"] == CHEN for d in DIALS), cs[CHEN]["status"])
        ok("Asha answered on the first dial", cs[ASHA]["status"] == "ANSWERED" and cs[ASHA]["attempts"] == 1, cs[ASHA]["status"])
        ok("Ben rang out twice: unreached after his one retry", cs[BEN]["status"] == "UNREACHED" and cs[BEN]["attempts"] == 2
           and cs[BEN].get("lastOutcome") == "no_answer", f"{cs[BEN]['status']} {cs[BEN]['attempts']}")
        ok("Dev rang out, then answered the retry", cs[DEV]["status"] == "ANSWERED" and cs[DEV]["attempts"] == 2, f"{cs[DEV]['status']} {cs[DEV]['attempts']}")
        dials = [d["body"]["to"] for d in DIALS]
        ok("five dials in all (1 + 2 + 2), through the campaign's number", len(dials) == 5 and all(d["body"]["from"] == number["phoneNumber"] for d in DIALS),
           f"{len(dials)}: {dials}")
        asha = db.voice_calls.find_one({"_id": cs[ASHA].get("lastCallId")}) if cs[ASHA].get("lastCallId") else None
        ok("Asha's call log names the campaign and contact, with her variables",
           asha is not None and asha.get("campaignId") == camp["_id"] and asha.get("campaignContactId") == cs[ASHA]["_id"]
           and asha.get("variables") == {"name": "Asha", "company": "Asha's shop", "plan": "Gold"},  # the name is {{name}}
           f"endedBy={asha and asha.get('endedBy')} variables={asha and asha.get('variables')}")
        if asha:
            agent_text = " ".join(t["text"] for t in asha["turns"] if t["role"] == "agent").lower()
            ok("...and she talked as the campaign's agent", "priya" in agent_text or "sunrise" in agent_text, agent_text[:140])
        dev_calls = list(db.voice_calls.find({"campaignContactId": cs[DEV]["_id"]}).sort("endedAt", 1))
        ok("Dev's two calls are both linked, no answer then answered",
           len(dev_calls) == 2 and dev_calls[0]["endedBy"] == "no_answer" and dev_calls[1]["endedBy"] != "no_answer"
           and sorted(cs[DEV]["callIds"]) == sorted(c["_id"] for c in dev_calls), str([c["endedBy"] for c in dev_calls]))
        ben_gap = [d["at"] for d in DIALS if d["body"]["to"] == BEN]
        ok("Ben's retry waited its delay (6 s after the first call ended)", len(ben_gap) == 2 and ben_gap[1] - ben_gap[0] >= 6,
           f"{ben_gap[1] - ben_gap[0]:.1f} s between dials" if len(ben_gap) == 2 else str(ben_gap))

        print("\n== pause and resume ==")
        before = len(DIALS)
        paused = make_campaign(agent, number, [(EVE, "Eve")], status="PAUSED", max_concurrent=1,
                               retry={"maxRetries": 0, "delayMinutes": 1, "on": []}, name="E2E paused")
        await asyncio.sleep(5)
        ok("a paused campaign dials nobody", len(DIALS) == before and contacts(paused)[EVE]["status"] == "PENDING")
        db.voice_campaigns.update_one({"_id": paused["_id"]}, {"$set": {"status": "RUNNING"}})
        done = await wait_for(lambda: db.voice_campaigns.find_one({"_id": paused["_id"]})["status"] == "COMPLETED", 60)
        eve = contacts(paused)[EVE]
        ok("resumed: Eve is dialled once, rings out, no retries: unreached, campaign completed",
           done and eve["status"] == "UNREACHED" and eve["attempts"] == 1 and len(DIALS) == before + 1, f"{eve['status']} {eve['attempts']}")
    finally:
        stop.set()
        await network
        await fake.cleanup()
        SUPPRESSED.write_text("".join(l + "\n" for l in SUPPRESSED.read_text().splitlines() if f'"quote": "{MARK}"' not in l))
        # Nothing left RUNNING for another engine on this database to pick up.
        ids = [c["_id"] for c in (camp, paused) if c]
        db.voice_campaigns.update_many({"_id": {"$in": ids}, "status": {"$in": ["RUNNING", "PAUSED"]}}, {"$set": {"status": "CANCELLED"}})
    passed = sum(1 for _, p in RESULTS if p)
    print(f"\n{passed}/{len(RESULTS)} passed")
    for name, p in RESULTS:
        if not p:
            print("  FAILED:", name)


if __name__ == "__main__":
    asyncio.run(main())
