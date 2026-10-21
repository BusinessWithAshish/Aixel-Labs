"""What a call cost its owner, in US dollars: `voice_calls.cost` (`VoiceCallCost` in the backend's types.ts).

    gemini    the tokens Gemini reported for the call (bot.py `usage`) at Google's list price; 0 when the
              owner's key is on Google's free tier (voice_settings.gemini.tier "free", set in the app)
    provider  the phone minutes at the provider's list rate, written with the call (providerExact false).
              Twilio's own charge for the call (its Call resource `price`) replaces it once Twilio fills it
              in (fill_provider_charge, after the call, in the same background task as the analysis:
              never in the call's path). Telnyx can send its charge too (`call.cost` webhooks), but only
              once the customer's apps turn `call_cost_in_webhooks` on; until then Telnyx is the estimate.
              VoiceLink publishes no rates: its part is left out (no `provider`).

Prices excl. tax, read 2026-10-21:
    Gemini  ai.google.dev/gemini-api/docs/pricing, gemini-3.8-live (page updated 2026-10-19); free tier free
    Telnyx  telnyx.com/pricing/call-control (Voice API $0.002, media streaming $0.0035, recording $0.002 a
            minute) + telnyx.com/pricing/elastic-sip (US local in from $0.0032, out from $0.005)
    Twilio  twilio.com/en-us/voice/pricing/us ("current as of August 2026": local in $0.0085, out $0.014,
            Media Streams $0.0044) + /pricing/in (to Indian mobiles $0.0496); recording $0.0025
"""

import asyncio
import math

import aiohttp
from loguru import logger

import product

# USD per 1M tokens, gemini-3.8-live paid tier. Thinking bills as text out; Live has no cache price.
GEMINI_USD_PER_M = {"textIn": 0.75, "audioIn": 3.00, "textOut": 4.50, "audioOut": 12.00}

# USD a minute, every part the engine uses (voice, media stream, recording), by provider and direction.
# shortcut: US rates for every destination but India (Twilio); Telnyx's India rates are not public.
PROVIDER_USD_PER_MIN = {
    ("TELNYX", "INBOUND"): 0.002 + 0.0035 + 0.002 + 0.0032,
    ("TELNYX", "OUTBOUND"): 0.002 + 0.0035 + 0.002 + 0.005,
    ("TWILIO", "INBOUND"): 0.0085,
    ("TWILIO", "OUTBOUND"): 0.014,
    ("TWILIO", "OUTBOUND_IN"): 0.0496,
}
# Twilio's Call `price` is the connection only: the stream and the recording are billed beside it.
TWILIO_EXTRAS_USD_PER_MIN = 0.0044 + 0.0025
# After the call: when to ask Twilio for its charge (seconds after the previous look). A deploy's drain
# waits for these, so they stay short; a charge that comes later leaves the estimate.
TWILIO_LOOKS = (20, 60, 120)


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
    if provider == "TWILIO" and direction == "OUTBOUND" and (to or "").startswith("+91"):
        key = ("TWILIO", "OUTBOUND_IN")
    per_min = PROVIDER_USD_PER_MIN[key] + (TWILIO_EXTRAS_USD_PER_MIN if provider == "TWILIO" else 0)
    return minutes(duration_sec) * per_min


def free_tier(user_id) -> bool:
    """The owner's key is on Google's free tier (set in the app; missing = paid)."""
    doc = product.db().voice_settings.find_one({"userId": user_id}, {"gemini.tier": 1})
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


async def fill_provider_charge(ctx: dict, doc: dict):
    """Swap the estimate for Twilio's own charge once it is there. Never raises."""
    cost = doc.get("cost") or {}
    if cost.get("provider") != "TWILIO" or not doc.get("providerCallId") or not ctx.get("twilio") or not doc["durationSec"]:
        return
    try:
        for wait in TWILIO_LOOKS:
            await asyncio.sleep(wait)
            price = await twilio_price(ctx["twilio"], doc["providerCallId"])
            if price is not None:
                break
        else:
            logger.info(f"cost of call {doc['_id']}: Twilio has no price yet, the estimate stays")
            return
        usd = round(price + minutes(doc["durationSec"]) * TWILIO_EXTRAS_USD_PER_MIN, 6)
        await asyncio.to_thread(product.db().voice_calls.update_one, {"_id": doc["_id"]}, {"$set": {
            "cost.providerUsd": usd, "cost.providerExact": True, "cost.totalUsd": round(cost["geminiUsd"] + usd, 6)}})
        logger.info(f"cost of call {doc['_id']}: Twilio charged ${price}, phone part ${usd}")
    except Exception as e:
        logger.warning(f"cost of call {doc.get('_id')}: could not get Twilio's charge: {e!r}")
