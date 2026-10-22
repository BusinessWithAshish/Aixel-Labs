"""The PIPELINE stack end to end, beside Gemini Live on the same script: the browser playground (/play), then
a call coming in to a customer number on the Telnyx path (/texml?n= then /telnyx, tests/scripted.py), whose
caller-side "true" reply gaps (the caller's last loud packet to her first) compare the two fairly.

    MONGODB_URI=mongodb://127.0.0.1:27018 MONGODB_DB_NAME=AixelLabsVoiceEngineDev LOG_LEVEL=INFO .venv/bin/python phone.py --port 7893
    MONGODB_URI=mongodb://127.0.0.1:27018 MONGODB_DB_NAME=AixelLabsVoiceEngineDev .venv/bin/python tests/cascade_e2e.py 7893 [stt-model llm-model tts-model]

Default stack: all Gemini on the owner's (the .env) Gemini key, gemini-3.5-transcribe-live, gemini-3.5-flash-lite,
gemini-3.8-flash-lite-tts: the only one that runs without another provider's key. On a free-tier key Gemini TTS
allows ~4 requests a minute per model, so the script is short. Spoken lines are the cached ones (tests/linecache).
"""
import asyncio, os, sys
from datetime import datetime, timezone

import testdb
MONGO, DBNAME = testdb.throwaway()
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from bson import ObjectId
import product, scripted
from product_e2e import play_session, latest_call, db, FAKE_KEY

PORT = int(sys.argv[1])
STT, LLM, TTS = (sys.argv[2:5] if len(sys.argv) >= 5 else
                 ("gemini-3.5-transcribe-live", "gemini-3.5-flash-lite", "gemini-3.8-flash-lite-tts"))
SCRIPT = ["Yeah, go ahead, I've got a minute.", "How much does it cost?", "Can you just email me the details instead?"]
RESULTS = []


def ok(name, cond, detail=""):
    RESULTS.append((name, bool(cond)))
    print(f"  [{'PASS' if cond else 'FAIL'}] {name}{' -- ' + detail if detail else ''}", flush=True)


async def one(agent, label):
    print(f"\n== {label} ==")
    t0 = datetime.now(timezone.utc).replace(microsecond=0)
    r = await play_session(PORT, str(agent["_id"]), str(agent["userId"]), script=SCRIPT)
    ev = r["events"]
    said = [e["text"] for e in ev if e["type"] == "transcript" and e["role"] == "agent"]
    heard = [e["text"] for e in ev if e["type"] == "transcript" and e["role"] == "caller"]
    gaps = [e["gapMs"] for e in ev if e["type"] == "turn"]
    ok(f"{label}: she spoke", r["audio"] > 48000 and said, f"{r['audio'] / 48000:.1f} s, first audio at {r['first_audio']} s, said {said[:2]}")
    ok(f"{label}: the caller's words reached the page", len(heard) >= 2, repr(heard))
    if label.startswith("REALTIME"):
        ok(f"{label}: reply gaps measured", len(gaps) >= 2, f"gaps {gaps}")
    else:  # on a free-tier key Gemini TTS answers 429 past ~4 requests a minute: a reply it drops has no gap
        print(f"  pipeline reply gaps: {gaps}")
    await asyncio.sleep(3)
    doc = latest_call(agentId=agent["_id"], channel="PLAYGROUND", startedAt={"$gte": t0})
    ok(f"{label}: voice_calls written with the transcript", doc and doc["turns"],
       doc and f"{len(doc['turns'])} turns, gaps {doc['gapsMs']}, cost {doc.get('cost')}")
    return doc, gaps


async def main():
    now = datetime.now(timezone.utc)
    tenant, user = ObjectId(), ObjectId()
    scripted.give_owner_key(db, tenant, user)
    gemini = os.environ["GEMINI_API_KEY"]
    db.voice_accounts.update_one({"userId": user}, {"$set": {"keys": [
        {"_id": ObjectId(), "provider": "gemini", "label": "test", "keySealed": product.seal_secret(gemini),
         "last4": gemini[-4:], "status": "OK", "checkedAt": now, "savedAt": now, "tier": "free"}]}})
    base = {"tenantId": tenant, "userId": user, "name": "Pipeline test", "voice": "kore", "createdAt": now, "updatedAt": now,
            "prompt": "You are Priya, the receptionist at Sunrise Dental in Austin. Say your name and the clinic's name in "
                      "your very first sentence. Keep every reply to one or two short sentences."}
    live = {**base, "_id": db.voice_agents.insert_one({**base}).inserted_id}
    stack = {"kind": "PIPELINE", "stt": {"provider": "gemini", "model": STT}, "llm": {"provider": "gemini", "model": LLM},
             "tts": {"provider": "gemini", "model": TTS}}
    pipe = {**base, "stack": stack}
    pipe["_id"] = db.voice_agents.insert_one({**pipe}).inserted_id
    try:
        pdoc, pgaps = await one(pipe, f"PIPELINE {STT} / {LLM} / {TTS}")
        if pdoc:
            s = (pdoc.get("cost") or {}).get("stack") or {}
            ok("PIPELINE: cost per part recorded", s.get("llm", {}).get("tokensIn", 0) > 0 and s.get("stt", {}).get("minutes", 0) > 0
               and "tts" in s and pdoc["cost"]["geminiUsd"] == 0, str(s))
        ldoc, lgaps = await one(live, "REALTIME gemini-3.8-live (unchanged)")
        if ldoc:
            ok("REALTIME: no stack cost, Gemini tokens as before", "stack" not in ldoc["cost"]
               and ldoc["cost"]["geminiTokens"]["audioIn"] > 0, str(ldoc["cost"]))
        med = lambda g: sorted(g)[len(g) // 2] if g else None
        print(f"\nreply gap median (engine side): pipeline {med(pgaps)} ms {pgaps}, live {med(lgaps)} ms {lgaps}")
        true = {}
        for agent, label in ((pipe, "PIPELINE"), (live, "REALTIME")):
            print(f"\n== {label}: a call in on the Telnyx path ==")
            nid = testdb.insert_number(db, {"tenantId": tenant, "userId": user, "provider": "TELNYX", "phoneNumber": "+15550001111",
                                            "apiKeySealed": product.seal_secret(FAKE_KEY), "inboundAgentId": agent["_id"],
                                            "createdAt": now, "updatedAt": now})
            t0 = datetime.now(timezone.utc).replace(microsecond=0)
            await asyncio.sleep(20 if label == "PIPELINE" else 0)  # a free-tier key's Gemini TTS: ~4 requests a minute
            r = await scripted.run(str(PORT), "busy", texml=True, number=str(nid))
            await asyncio.sleep(3)
            doc = latest_call(numberId=nid, direction="INBOUND", startedAt={"$gte": t0})
            true[label] = r["true_gaps_ms"]
            ok(f"{label} phone: she answered, the call was written", r["first_sound"] is not None and doc and doc["turns"],
               f"first sound {r['first_sound']} s, true gaps {r['true_gaps_ms']}, turns {doc and [t['text'][:40] for t in doc['turns']]}")
            testdb.delete_numbers(db, [nid])
        print(f"\ntrue reply gaps (caller side, phone): pipeline {true.get('PIPELINE')} ms, live {true.get('REALTIME')} ms")
    finally:
        db.voice_agents.delete_many({"userId": user})
        db.voice_calls.delete_many({"userId": user})
        db.voice_accounts.delete_many({"userId": user})
    passed = sum(1 for _, p in RESULTS if p)
    print(f"\n{passed}/{len(RESULTS)} passed")
    sys.exit(0 if passed == len(RESULTS) else 1)


if __name__ == "__main__":
    asyncio.run(main())
