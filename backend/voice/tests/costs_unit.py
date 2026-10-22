"""A call's cost (costs.py): Gemini tokens at list price, the free tier, provider estimates, Twilio's own charge.

    .venv/bin/python tests/costs_unit.py

Uses a local throwaway database (AixelLabsVoiceEngineDev on 127.0.0.1:27018) and deletes what it wrote.
Twilio's and VoiceLink's REST APIs are a fake on 127.0.0.1:7886 (TWILIO_API_BASE, VOICELINK_API_BASE), so nothing
leaves this machine.
"""
import asyncio, os, sys

import testdb
MONGO, DBNAME = testdb.throwaway()
FAKE_TWILIO = 7886
os.environ["TWILIO_API_BASE"] = f"http://127.0.0.1:{FAKE_TWILIO}"
os.environ["VOICELINK_API_BASE"] = f"http://127.0.0.1:{FAKE_TWILIO}/vl"
os.environ.pop("VOICELINK_PROXY_URL", None)
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import product  # first: keeps the settings above over .env
from aiohttp import web
from bson import ObjectId
import costs

assert product.db().name == DBNAME
RESULTS = []
# A real call's summed usage (2026-10-21): 7 reports, 5 rotations.
USAGE = {"reports": 7, "prompt": 15177, "response": 467, "thoughts": 546, "tool_prompt": 0, "in_text": 13121,
         "in_audio": 1745, "out_audio": 467}


def ok(name, cond, detail=""):
    RESULTS.append((name, bool(cond)))
    print(f"  [{'PASS' if cond else 'FAIL'}] {name}{' -- ' + detail if detail else ''}", flush=True)


def doc_of(user, channel="PHONE", direction="INBOUND", duration=95, to=None):
    return {"_id": ObjectId(), "userId": user, "channel": channel, "direction": direction, "durationSec": duration,
            "providerCallId": "CA" + "9" * 32, "to": to, "endedBy": "goodbye"}


def pricing_tests(user):
    tokens = costs.gemini_tokens(USAGE)
    ok("tokens: input not reported as audio counts as text, thinking as text out",
       tokens == {"textIn": 13432, "audioIn": 1745, "textOut": 546, "audioOut": 467}, str(tokens))
    paid = costs.call_cost(doc_of(user), USAGE, "TELNYX")
    ok("paid key: Gemini at list price", abs(paid["geminiUsd"] - 0.023370) < 1e-6, str(paid["geminiUsd"]))
    ok("Telnyx in, 95 s = 2 billed minutes at $0.0107", abs(paid["providerUsd"] - 0.0214) < 1e-9 and paid["provider"] == "TELNYX"
       and paid["providerExact"] is False, str(paid))
    ok("total is the sum", paid["totalUsd"] == round(paid["geminiUsd"] + paid["providerUsd"], 6))

    product.db().voice_accounts.update_one({"userId": user}, {"$set": {"gemini.tier": "free"}})
    free = costs.call_cost(doc_of(user, "PLAYGROUND", "PLAYGROUND"), USAGE, None)
    ok("free-tier key, playground: costs nothing, no provider", free["totalUsd"] == 0 and free["geminiFreeTier"]
       and "provider" not in free and free["geminiTokens"]["audioIn"] == 1745, str(free))
    product.db().voice_accounts.update_one({"userId": user}, {"$unset": {"gemini.tier": ""}})

    india = costs.call_cost(doc_of(user, direction="OUTBOUND", duration=61, to="+919876543210"), {}, "TWILIO")
    ok("Twilio to India: 2 minutes at $0.0496 + stream and recording", abs(india["providerUsd"] - 2 * (0.0496 + 0.0069)) < 1e-9,
       str(india["providerUsd"]))
    vl = costs.call_cost(doc_of(user), USAGE, "VOICELINK")
    ok("VoiceLink: no published rate, its part left out", "provider" not in vl and vl["totalUsd"] == vl["geminiUsd"])
    a = costs.analysis_cost(paid, {"promptTokenCount": 2000, "candidatesTokenCount": 300, "thoughtsTokenCount": 100})
    ok("analysis: 2000 in at $0.30/M + 400 out at $2.50/M, added to the total", a["analysisUsd"] == 0.0016
       and a["analysisTokens"] == {"textIn": 2000, "textOut": 400}
       and a["totalUsd"] == round(paid["geminiUsd"] + paid["providerUsd"] + 0.0016, 6), str(a))
    ok("analysis on a free-tier key costs nothing", costs.analysis_cost({**paid, "geminiFreeTier": True},
       {"promptTokenCount": 2000})["analysisUsd"] == 0)
    ok("a call nobody answered costs no minutes", costs.call_cost(doc_of(user, duration=0), {}, "TELNYX")["totalUsd"] == 0)


async def twilio_tests(user):
    prices = iter([None, "-0.01700"])
    seen = []

    async def call(request):
        seen.append(request.path)
        return web.json_response({"sid": request.match_info["sid"], "price": next(prices), "price_unit": "USD"})

    async def voicelink_details(request):
        seen.append(request.path_qs)
        ok_token = request.headers.get("Authorization") == "Bearer vl-token"
        return web.json_response({"status": True, "message": "Success",
                                  "data": {"call_id": request.query["call_id"], "total_cost": "1.9000" if ok_token else "",
                                           "currency_symbol": "₹"}})

    app = web.Application()
    app.router.add_get("/2010-04-01/Accounts/{ac}/Calls/{sid}.json", call)
    app.router.add_get("/vl/v1/call-log/details", voicelink_details)
    runner = web.AppRunner(app)
    await runner.setup()
    await web.TCPSite(runner, "127.0.0.1", FAKE_TWILIO).start()
    costs.PRICE_LOOKS = (0, 0, 0)
    try:
        ctx = {"provider": "TWILIO", "twilio": {"account_sid": "AC" + "1" * 32, "user": "SKx", "secret": "s"}}
        doc = doc_of(user, direction="OUTBOUND", duration=95, to="+14155550123")
        product._insert(doc, ctx, USAGE)
        doc["cost"]["analysisUsd"] = 0.001  # the analysis ran first (analysis.after_call)
        await costs.fill_provider_charge(ctx, doc)
        saved = product.db().voice_calls.find_one({"_id": doc["_id"]})["cost"]
        ok("Twilio: asked again until the price was there", len(seen) == 2, str(seen))
        want = round(0.017 + 2 * 0.0069, 6)
        ok("Twilio's charge (plus stream and recording) replaces the estimate", saved["providerExact"] is True
           and abs(saved["providerUsd"] - want) < 1e-9 and abs(saved["totalUsd"] - (saved["geminiUsd"] + 0.001 + want)) < 1e-6, str(saved))

        # VoiceLink: no estimate; its call-log charge in rupees, on the number's own token, at today's rate.
        number = {"_id": ObjectId(), "userId": user, "tenantId": ObjectId(), "provider": "VOICELINK",
                  "apiKeySealed": product.seal_secret("vl-token")}
        testdb.insert_number(product.db(), number)
        costs._USD_RATES.update(at=__import__("time").time(), rates={"inr": 95.0})
        vctx = {"provider": "VOICELINK"}
        vdoc = {**doc_of(user, direction="INBOUND", duration=100), "_id": ObjectId(), "numberId": number["_id"],
                "providerCallId": "1764828073.53871"}
        product._insert(vdoc, vctx, USAGE)
        ok("VoiceLink: written without a phone part", "provider" not in vdoc["cost"])
        await costs.fill_provider_charge(vctx, vdoc)
        vsaved = product.db().voice_calls.find_one({"_id": vdoc["_id"]})["cost"]
        ok("VoiceLink: its ₹1.90 (1.9 / 95 = $0.02) fills the phone part, exact", vsaved.get("provider") == "VOICELINK"
           and vsaved["providerExact"] is True and abs(vsaved["providerUsd"] - 0.02) < 1e-9
           and seen[-1] == "/vl/v1/call-log/details?call_id=1764828073.53871", f"{vsaved} {seen[-1]}")
    finally:
        await runner.cleanup()


async def main():
    user = ObjectId()
    testdb.set_account(product.db(), {"tenantId": ObjectId(), "userId": user, "gemini": {"keySealed": "x"}})
    try:
        pricing_tests(user)
        await twilio_tests(user)
    finally:
        for name in ("voice_accounts", "voice_calls"):
            product.db()[name].delete_many({"userId": user})
    passed = sum(1 for _, p in RESULTS if p)
    print(f"\n{passed}/{len(RESULTS)} passed")
    for name, p in RESULTS:
        if not p:
            print("  FAILED:", name)
    sys.exit(0 if passed == len(RESULTS) else 1)


if __name__ == "__main__":
    asyncio.run(main())
