"""One-off: mark the owner's tests over the internet made before the engine set `voice_calls.test` (2026-10-24).

Telnyx hands SIP callers over without "sip:" (gencred7ifNMv…@sip.telnyx.com.au), so those calls got digits from the
SIP user as `callerPhone` (and caller memory under it). This sets `test` (product.test_kind) and removes
`callerPhone`, `memory` and `memoryUsed` from them. Dry run unless --apply; prints ids, dates and kinds only.

    set -a; . ./.env.production-mongo; set +a
    .venv/bin/python fix_sip_test_calls.py            # what would change
    .venv/bin/python fix_sip_test_calls.py --apply    # change it
"""
import sys

import product

APPLY = "--apply" in sys.argv[1:]


def main():
    calls = product.db().voice_calls
    query = {"test": {"$exists": False}, "$or": [{"from": {"$regex": "@"}}, {"to": {"$regex": "@"}}]}
    fields = {"from": 1, "to": 1, "direction": 1, "startedAt": 1, "callerPhone": 1, "memory": 1}
    found = changed = 0
    for doc in calls.find(query, fields):
        found += 1
        kind = product.test_kind(doc.get("from") if doc.get("direction") == "INBOUND" else doc.get("to"))
        print(f"{doc['_id']}  {doc.get('startedAt'):%Y-%m-%d %H:%M}  {doc.get('direction'):<8}  {kind or 'skip (not a test)'}"
              f"  callerPhone {'set' if doc.get('callerPhone') else 'none'}{'  memory' if doc.get('memory') else ''}")
        if APPLY and kind:
            calls.update_one({"_id": doc["_id"]}, {"$set": {"test": kind},
                                                   "$unset": {"callerPhone": "", "memory": "", "memoryUsed": ""}})
            changed += 1
    print(f"{found} call(s) found in {product.setting('MONGODB_DB_NAME')}; "
          + (f"{changed} changed." if APPLY else "dry run, nothing changed (add --apply)."))


if __name__ == "__main__":
    main()
