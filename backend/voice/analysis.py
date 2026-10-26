"""After a call: one cheap text-model pass over what was said.

What the owner asked for on the agent (`analysis`, `VoiceAgentAnalysis` in the backend's
src/db/types.ts): a summary (on unless turned off), the caller's sentiment, whether the call
was a success by the owner's own definition, and up to 10 custom fields. With caller memory
on (`memory: true`) the same pass also rewrites what the agent remembers about the caller.

    voice_calls.analysis      {summary, sentiment, successful, fields: {...}, model, error?}
    voice_calls.memory        the brief after this call, the caller's `current` one (product.load_memory)
    voice_calls.cost          + analysisUsd / analysisTokens, the pass's own price (costs.analysis_cost)

It runs in the background task that writes the call's document (product.save_call), on the
call's own Gemini key (the owner's), with structured JSON output. It never delays the call's
teardown, and a failure is recorded on the call (`analysis.error`), never raised.
A call where the caller said nothing (no answer, voicemail, refused key) is not analysed.
"""

import asyncio
import json
import os
import re

from loguru import logger
from pymongo.errors import DuplicateKeyError

import costs
import product

# shortcut: an ANALYSIS_MODEL override is still priced at the default model's rate (voice-call-rates.json).
MODEL = os.getenv("ANALYSIS_MODEL", costs.RATES["analysis"]["model"])
TIMEOUT = 30.0
SENTIMENTS = ("positive", "neutral", "negative")
FIELD_TYPES = ("boolean", "text", "number", "choice")
MAX_FIELDS = 10
SUMMARY_MAX = 1000
TEXT_MAX = 500
BRIEF_MAX = 600  # VOICE_AGENT_FEATURE_LIMITS.memoryBriefMax
TRANSCRIPT_MAX = 60_000  # characters of transcript sent; a longer call keeps its end
FIELD_NAME = re.compile(r"^[a-z][a-z0-9_]{0,43}$")
# A recording answered: analysed (the summary says so), but nothing is remembered about the person.
MACHINE_ENDINGS = ("voicemail", "voicemail_message", "ivr")


def settings(agent: dict) -> dict:
    """The agent's analysis settings, cleaned. No settings = the summary only."""
    raw = agent.get("analysis") if isinstance(agent.get("analysis"), dict) else {}
    fields = []
    for f in raw.get("fields") or []:
        if not isinstance(f, dict) or f.get("type") not in FIELD_TYPES or not FIELD_NAME.match(str(f.get("name") or "")):
            continue
        options = [str(o).strip() for o in f.get("options") or [] if str(o).strip()]
        if f["type"] == "choice" and not options:
            continue
        fields.append({"name": str(f["name"]), "type": f["type"], "description": str(f.get("description") or "").strip(),
                       **({"options": options} if f["type"] == "choice" else {})})
    return {
        "summary": raw.get("summary") is not False,
        "sentiment": raw.get("sentiment") is True,
        "success": raw.get("success") is True,
        "successDefinition": str(raw.get("successDefinition") or "").strip(),
        "fields": fields[:MAX_FIELDS],
    }


def wanted(cfg: dict, memory: bool) -> bool:
    return bool(memory or cfg["summary"] or cfg["sentiment"] or cfg["success"] or cfg["fields"])


def transcript(doc: dict) -> str:
    """The call as lines, each tool run where it happened."""
    runs: dict[int, list[str]] = {}
    for t in doc.get("toolCalls") or []:
        line = f"[tool {t.get('name')} {json.dumps(t.get('arguments') or {}, ensure_ascii=False)} -> {str(t.get('result') or '')[:300]}]"
        runs.setdefault(int(t.get("afterTurn") or 0), []).append(line)
    lines = list(runs.get(0, []))
    for i, turn in enumerate(doc.get("turns") or [], start=1):
        lines.append(f"{'Agent' if turn['role'] == 'agent' else 'Caller'}: {turn['text']}")
        lines += runs.get(i, [])
    text = "\n".join(lines)
    return text[-TRANSCRIPT_MAX:]


def _field_schema(f: dict) -> dict:
    kind = {"boolean": "boolean", "number": "number"}.get(f["type"], "string")
    out: dict = {"type": [kind, "null"], "description": f["description"] or f["name"]}
    if f["type"] == "choice":
        out["enum"] = [*f["options"], None]
    return out


def schema(cfg: dict, memory: bool) -> dict:
    props: dict = {}
    if cfg["summary"]:
        props["summary"] = {"type": "string"}
    if cfg["sentiment"]:
        props["sentiment"] = {"type": "string", "enum": list(SENTIMENTS)}
    if cfg["success"]:
        props["successful"] = {"type": "boolean"}
    if cfg["fields"]:
        props["fields"] = {"type": "object", "properties": {f["name"]: _field_schema(f) for f in cfg["fields"]},
                           "required": [f["name"] for f in cfg["fields"]]}
    if memory:
        props["memory"] = {"type": "string"}
    return {"type": "object", "properties": props, "required": list(props)}


def instructions(cfg: dict, memory: bool, doc: dict, agent_name: str, previous: str | None) -> str:
    who = {"INBOUND": "answered a call to the business", "OUTBOUND": "placed a call"}.get(
        doc.get("direction"), "talked with someone in a browser test")
    asks = []
    if cfg["summary"]:
        asks.append("- summary: two or three plain sentences: who the other person was, what they wanted or said, what "
                    "was agreed or done, and what happens next. Only what the transcript shows.")
    if cfg["sentiment"]:
        asks.append("- sentiment: the other person's overall attitude on the call: positive, neutral or negative.")
    if cfg["success"]:
        goal = cfg["successDefinition"] or "the call achieved what the agent was there to do"
        asks.append(f"- successful: true only if this happened on the call: {goal}")
    for f in cfg["fields"]:
        kind = f"one of: {', '.join(f['options'])}" if f["type"] == "choice" else f["type"]
        asks.append(f"- fields.{f['name']} ({kind}): {f['description'] or f['name']}. null when the call doesn't say.")
    if memory:
        asks.append(
            f"- memory: a note for the agent's next call with this same person, at most {BRIEF_MAX} characters: their "
            "name and role if given, facts they shared about themselves or their business, what was discussed, "
            "agreed or promised, open questions, and preferences (like when to call). Facts only, no quotes, no "
            "advice. Keep what is still true from the earlier note below and drop what the call made outdated."
            + (f"\n  Earlier note: {previous.strip()}" if previous else "\n  There is no earlier note.")
        )
    return (f'An AI voice agent named "{agent_name or "the agent"}" {who}. Read the transcript and fill in the JSON. '
            "Speech-to-text mistakes are likely: read for meaning.\n\n"
            "# What to fill in\n" + "\n".join(asks) + "\n\n# Transcript\n" + transcript(doc))


def request_body(cfg: dict, memory: bool, doc: dict, agent_name: str, previous: str | None) -> dict:
    return {
        "contents": [{"role": "user", "parts": [{"text": instructions(cfg, memory, doc, agent_name, previous)}]}],
        "generationConfig": {"responseMimeType": "application/json", "responseJsonSchema": schema(cfg, memory),
                             "temperature": 0},
    }


def _bool(v):
    if isinstance(v, bool):
        return v
    if isinstance(v, str) and v.strip().lower() in ("true", "yes"):
        return True
    if isinstance(v, str) and v.strip().lower() in ("false", "no"):
        return False
    return None


def _number(v):
    if isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        return v
    try:
        n = float(str(v).replace(",", "").strip())
    except (TypeError, ValueError):
        return None
    return int(n) if n.is_integer() else n


def _text(v, cap: int) -> str | None:
    text = " ".join(str(v).split()) if isinstance(v, (str, int, float)) and not isinstance(v, bool) else ""
    return text[:cap] or None


def parse(raw: str, cfg: dict, memory: bool) -> tuple[dict, str | None]:
    """The model's JSON as the call's `analysis` (only what was asked for, each value checked
    against its type: a wrong type or an answer outside a choice's options becomes null) and the
    memory brief. Raises ValueError when it is not a JSON object."""
    data = json.loads(raw)
    if not isinstance(data, dict):
        raise ValueError("the model did not answer with a JSON object")
    out: dict = {}
    if cfg["summary"]:
        out["summary"] = _text(data.get("summary"), SUMMARY_MAX)
    if cfg["sentiment"]:
        s = str(data.get("sentiment") or "").strip().lower()
        out["sentiment"] = s if s in SENTIMENTS else None
    if cfg["success"]:
        out["successful"] = _bool(data.get("successful"))
    if cfg["fields"]:
        given = data.get("fields") if isinstance(data.get("fields"), dict) else {}
        values = {}
        for f in cfg["fields"]:
            v = given.get(f["name"])
            if f["type"] == "boolean":
                values[f["name"]] = _bool(v)
            elif f["type"] == "number":
                values[f["name"]] = _number(v)
            elif f["type"] == "choice":
                match = [o for o in f["options"] if isinstance(v, str) and o.lower() == v.strip().lower()]
                values[f["name"]] = match[0] if match else None
            else:
                values[f["name"]] = _text(v, TEXT_MAX)
        out["fields"] = values
    brief = _text(data.get("memory"), BRIEF_MAX) if memory else None
    return out, brief


async def generate(key: str, body: dict) -> tuple[str, dict]:
    """One generateContent call on the analysis model. The JSON text and the tokens it billed
    (`usageMetadata`), or raises."""
    data = await product.gemini_generate(key, MODEL, body, TIMEOUT)
    parts = (((data.get("candidates") or [{}])[0].get("content") or {}).get("parts") or [])
    out = "".join(p.get("text", "") for p in parts if not p.get("thought"))
    if not out.strip():
        raise RuntimeError(f"Gemini gave no answer ({str(data.get('promptFeedback') or data)[:200]})")
    return out, data.get("usageMetadata") or {}


def _store(ctx: dict, doc: dict, result: dict, brief: str | None, cost: dict):
    """The analysis (and its `cost.*` fields) on the call, and with a new brief, the caller's memory: it becomes the current one."""
    calls = product.db().voice_calls
    phone = ctx.get("memory_phone")
    fields = {"analysis": result, **{f"cost.{k}": v for k, v in cost.items()}}
    if not brief or not phone:
        calls.update_one({"_id": doc["_id"]}, {"$set": fields})
        return
    previous = ctx.get("memory_used") or {}
    memory = {"brief": brief, "calls": int(previous.get("calls") or 0) + 1,
              "since": previous.get("since") or doc["startedAt"], "current": True}
    calls.update_many({"userId": doc["userId"], "agentId": doc["agentId"], "callerPhone": phone,
                       "memory.current": True, "_id": {"$ne": doc["_id"]}}, {"$unset": {"memory.current": ""}})
    try:
        calls.update_one({"_id": doc["_id"]}, {"$set": {**fields, "callerPhone": phone, "memory": memory}})
    except DuplicateKeyError:  # a call with the same caller stored its brief a moment ago: that one stays current
        memory.pop("current")
        calls.update_one({"_id": doc["_id"]}, {"$set": {**fields, "callerPhone": phone, "memory": memory}})


async def after_call(ctx: dict, doc: dict):
    """Analyse a finished call and store the result (and the caller's memory). Never raises."""
    try:
        cfg = ctx.get("analysis") or settings({})
        memory = bool(ctx.get("memory_phone")) and doc.get("endedBy") not in MACHINE_ENDINGS
        if not wanted(cfg, memory) or not any(t["role"] == "caller" and t["text"].strip() for t in doc.get("turns") or []):
            return
        previous = (ctx.get("memory_used") or {}).get("brief")
        usage = None  # what Google billed; None when the request itself failed (nothing billed)
        try:
            raw, usage = await generate(ctx.get("gemini_key") or os.environ["GEMINI_API_KEY"],
                                        request_body(cfg, memory, doc, ctx.get("agent_name") or "", previous))
            result, brief = parse(raw, cfg, memory)
        except Exception as e:
            logger.warning(f"analysis of call {doc['_id']} failed: {e!r}")
            result, brief = {"error": str(e)[:300] or repr(e)}, None
        result["model"] = MODEL
        # On the call's cost when it has one; kept on `doc` too, for fill_provider_charge's total.
        cost = costs.analysis_cost(doc["cost"], usage) if doc.get("cost") and usage is not None else {}
        if cost:
            doc["cost"].update(cost)
        await asyncio.to_thread(_store, ctx, doc, result, brief, cost)
        logger.info(f"analysis of call {doc['_id']} stored ({'failed' if 'error' in result else 'ok'}"
                    f"{', memory updated' if brief else ''})")
    except Exception as e:
        logger.error(f"analysis of call {doc.get('_id')}: could not be stored: {e!r}")
