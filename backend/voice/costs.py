"""What a call cost its owner, in US dollars: `voice_calls.cost` (`VoiceCallCost` in the backend's types.ts).

    gemini    the tokens Gemini reported for the call (bot.py `usage`) at Google's list price; 0 when the
              owner's key is on Google's free tier (voice_accounts.gemini.tier "free", set in the app)
    provider  the phone minutes at the provider's list rate, written with the call (providerExact false).
              Twilio's own charge for the call (its Call resource `price`) replaces it once Twilio fills it
              in (fill_provider_charge, after the call, in the same background task as the analysis:
              never in the call's path). Telnyx can send its charge too (`call.cost` webhooks), but only
              once the customer's apps turn `call_cost_in_webhooks` on; until then Telnyx is the estimate.
              VoiceLink publishes no rates (each account has its own): no estimate, its part is left out
              until its call-log API gives the call's own charge, which then fills it in like Twilio's.
    analysis  the post-call analysis (analysis.py) on the same key: its tokens at the analysis model's list price,
              0 on a free-tier key. Added once the analysis ran (analysis_cost), absent when it did not run.

Prices excl. tax, with their sources and dates: backend/src/db/voice-call-rates.json, shared with the app
(`VOICE_CALL_RATES` in types.ts, which also estimates an agent's cost before any call).
"""

import asyncio
import json
import math
import time
from pathlib import Path

import aiohttp
from loguru import logger

import product

RATES = json.loads((Path(__file__).resolve().parents[1] / "src/db/voice-call-rates.json").read_text())
# USD per 1M tokens, paid tier. Thinking bills as text out; Live has no cache price.
GEMINI_USD_PER_M = RATES["gemini"]["usdPerMillionTokens"]
# USD per 1M tokens for the post-call analysis's text model.
ANALYSIS_USD_PER_M = RATES["analysis"]["usdPerMillionTokens"]
# USD a minute, every part the engine uses (voice, media stream, recording), by provider and direction.
# shortcut: US rates for every destination but India (Twilio); Telnyx's India rates are not public.
PROVIDER_USD_PER_MIN = {(name, direction): rate for name, p in RATES["providers"].items()
                        for direction, rate in p["usdPerMinute"].items()}
# Billed beside the call's own charge (Twilio's `price` is the connection only: stream and recording).
EXTRAS_USD_PER_MIN = {name: p["extrasUsdPerMinute"] for name, p in RATES["providers"].items()}
# After the call: when to ask the provider for its charge (seconds after the previous look). A deploy's drain
# waits for these, so they stay short; a charge that comes later leaves the estimate.
PRICE_LOOKS = (20, 60, 120)


def gemini_tokens(usage: dict) -> dict:
    """The call's tokens by what they are billed as, from bot.py's summed usage reports
    (prompt/response totals, their audio share, thoughts and tool prompts)."""
    audio_in, audio_out = usage.get("in_audio", 0), usage.get("out_audio", 0)
    return {
        "textIn": max(usage.get("prompt", 0) + usage.get("tool_prompt", 0) - audio_in, 0),
        "audioIn": audio_in,
        "textOut": max(usage.get("response", 0) - audio_out, 0) + usage.get("thoughts", 0),
        "audioOut": audio_out,
    }


def minutes(duration_sec: int) -> int:
    """Billed minutes: providers round each call up to the minute."""
    return math.ceil(max(duration_sec, 0) / 60)


def provider_estimate(provider: str, direction: str, to: str | None, duration_sec: int) -> float:
    key = (provider, direction)
    if direction == "OUTBOUND" and (to or "").startswith("+91") and (provider, "OUTBOUND_IN") in PROVIDER_USD_PER_MIN:
        key = (provider, "OUTBOUND_IN")
    return minutes(duration_sec) * (PROVIDER_USD_PER_MIN[key] + EXTRAS_USD_PER_MIN[provider])


def analysis_cost(cost: dict, usage: dict) -> dict:
    """The `cost` fields the analysis adds, from its generateContent `usageMetadata`: the prompt in, the answer
    and thinking out, at list price (0 when the call's Gemini part is free tier), and the total with it."""
    tokens = {"textIn": usage.get("promptTokenCount", 0),
              "textOut": usage.get("candidatesTokenCount", 0) + usage.get("thoughtsTokenCount", 0)}
    usd = 0.0 if cost.get("geminiFreeTier") else sum(n * ANALYSIS_USD_PER_M[k] for k, n in tokens.items()) / 1e6
    return {"analysisUsd": round(usd, 6), "analysisTokens": tokens,
            "totalUsd": round(cost["geminiUsd"] + cost["providerUsd"] + usd, 6)}


def free_tier(user_id) -> bool:
    """The owner's key is on Google's free tier (set in the app; missing = paid)."""
    doc = product.db().voice_accounts.find_one({"userId": user_id}, {"gemini.tier": 1})
    return ((doc or {}).get("gemini") or {}).get("tier") == "free"


def call_cost(doc: dict, usage: dict, provider: str | None) -> dict:
    """The `cost` of a finished call's voice_calls document. Reads the key's tier: run it off the event loop."""
    tokens = gemini_tokens(usage)
    free = free_tier(doc["userId"])
    gemini = 0.0 if free else sum(n * GEMINI_USD_PER_M[kind] for kind, n in tokens.items()) / 1e6
    cost = {"geminiUsd": round(gemini, 6), "geminiFreeTier": free, "geminiTokens": tokens,
            "providerUsd": 0.0, "providerExact": False}
    if doc["channel"] == "PHONE" and (provider, doc["direction"]) in PROVIDER_USD_PER_MIN:
        cost["provider"] = provider
        cost["providerUsd"] = round(provider_estimate(provider, doc["direction"], doc.get("to"), doc["durationSec"]), 6)
    cost["totalUsd"] = round(cost["geminiUsd"] + cost["providerUsd"], 6)
    return cost


async def twilio_price(creds: dict, call_sid: str) -> float | None:
    """Twilio's charge for the call's connection in USD (its `price`, a negative string), or None while unset."""
    import twilio  # imports product: loaded on first use

    async with aiohttp.ClientSession() as session:
        async with session.get(twilio.account_url(creds, f"/Calls/{call_sid}.json"), auth=twilio._auth(creds),
                               timeout=aiohttp.ClientTimeout(total=15)) as r:
            body = await r.json(content_type=None) if r.status == 200 else {}
    price, unit = body.get("price"), (body.get("price_unit") or "USD").upper()
    if price in (None, "") or unit != "USD":  # shortcut: a non-USD account keeps the estimate
        return None
    return abs(float(price))


async def voicelink_price(number_id, call_id: str) -> float | None:
    """VoiceLink's charge for the call in USD (`total_cost`, rupees, from call-log/details on the number's
    own token, at today's rate), or None while unset. The account's own rate: VoiceLink publishes none."""
    import voicelink  # imports product: loaded on first use

    number = await asyncio.to_thread(product.find_number, number_id)
    if not number:
        return None
    data = await voicelink.api_get("/v1/call-log/details", product.open_secret(number["apiKeySealed"]), {"call_id": call_id})
    inr = data.get("total_cost")
    if inr in (None, ""):
        return None
    if (data.get("currency_symbol") or "₹") != "₹":  # shortcut: VoiceLink bills in rupees only, as far as its docs say
        return None
    return float(inr) / await usd_rate("inr")


_USD_RATES: dict = {"at": 0.0, "rates": {}}


async def usd_rate(code: str) -> float:
    """Units of `code` a dollar buys today (the app's rate source), kept a day. Raises when unknown."""
    if time.time() - _USD_RATES["at"] > 86400 or code not in _USD_RATES["rates"]:
        async with aiohttp.ClientSession() as session:
            async with session.get(RATES["currency"]["usdRatesUrls"][0], timeout=aiohttp.ClientTimeout(total=10)) as r:
                body = await r.json(content_type=None)
        _USD_RATES.update(at=time.time(), rates=body["usd"])
    return float(_USD_RATES["rates"][code])


async def fill_provider_charge(ctx: dict, doc: dict):
    """Swap the estimate for the provider's own charge once it is there (Twilio, VoiceLink). Never raises."""
    cost, provider = doc.get("cost") or {}, ctx.get("provider")
    if not doc.get("providerCallId") or not doc["durationSec"] or not cost:
        return
    if provider == "TWILIO" and ctx.get("twilio"):
        price = lambda: twilio_price(ctx["twilio"], doc["providerCallId"])  # noqa: E731
    elif provider == "VOICELINK":
        price = lambda: voicelink_price(doc["numberId"], doc["providerCallId"])  # noqa: E731
    else:
        return
    try:
        for wait in PRICE_LOOKS:
            await asyncio.sleep(wait)
            charged = await price()
            if charged is not None:
                break
        else:
            logger.info(f"cost of call {doc['_id']}: {provider} has no charge yet, the estimate stays")
            return
        usd = round(charged + minutes(doc["durationSec"]) * EXTRAS_USD_PER_MIN.get(provider, 0), 6)
        await asyncio.to_thread(product.db().voice_calls.update_one, {"_id": doc["_id"]}, {"$set": {
            "cost.provider": provider, "cost.providerUsd": usd, "cost.providerExact": True,
            "cost.totalUsd": round(cost["geminiUsd"] + cost.get("analysisUsd", 0) + usd, 6)}})
        logger.info(f"cost of call {doc['_id']}: {provider} charged ${charged:.4f}, phone part ${usd}")
    except Exception as e:
        logger.warning(f"cost of call {doc.get('_id')}: could not get {provider}'s charge: {e!r}")
