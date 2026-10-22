"""The one database guard every engine test uses: a local throwaway database, named by the caller.

Tests (and the engine under test) are started with MONGODB_URI and MONGODB_DB_NAME in their own
environment, e.g. MONGODB_URI=mongodb://127.0.0.1:27018 MONGODB_DB_NAME=AixelLabsVoiceEngineDev.
Nothing falls back to a default and no real database is ever accepted. bot.py loads .env with
override=True, but product.py keeps the values the process was started with, so .env cannot move
a test to another database.
"""
import json
import os
import urllib.error
import urllib.request

# Production, the app's e2e database and the live demo engine's database.
REAL = ("AixelLabsBE", "AixelLabsE2E", "AixelLabsVoiceDemo")


def throwaway() -> tuple[str, str]:
    """(MONGODB_URI, MONGODB_DB_NAME) as this test process was started with, once they pass the guard."""
    uri, name = os.environ.get("MONGODB_URI", ""), os.environ.get("MONGODB_DB_NAME", "")
    assert uri and name, "start the test with MONGODB_URI and MONGODB_DB_NAME (a local throwaway database)"
    assert uri.startswith(("mongodb://127.0.0.1:", "mongodb://localhost:")), f"{uri}: a local database only"
    assert name not in REAL and not name.startswith("AixelLabsBE"), f"{name} is a real database, not a throwaway one"
    return uri, name


def engine_on(port, name: str):
    """The engine under test (on 127.0.0.1:`port`) writes to the same throwaway database."""
    try:
        body = urllib.request.urlopen(f"http://127.0.0.1:{port}/health", timeout=5).read()
    except urllib.error.HTTPError as e:  # 503: not set up, or draining; the body still says which database
        body = e.read()
    db = json.loads(body).get("db")
    assert db == name, f"the engine on :{port} uses database {db!r}, this test {name!r}: start both with the same MONGODB_DB_NAME"


# --- voice_accounts / caller memory, stored the way the app and the engine store them -------------


def set_account(db, fields: dict):
    """Sets fields (e.g. `keys`) on the owner's voice_accounts doc, made when missing. `fields` has the owner's userId."""
    db.voice_accounts.update_one({"userId": fields["userId"]}, {"$set": fields}, upsert=True)


def gemini_keys(sealed: str, **fields) -> list:
    """`voice_accounts.keys` with one Gemini key, the owner's default, as the app saves it."""
    from bson import ObjectId
    return [{"_id": ObjectId(), "provider": "gemini", "label": "Main", "keySealed": sealed, "status": "OK", **fields}]


def insert_number(db, number: dict):
    """Stores a number dict (with its owner's userId and tenantId, as product.find_number returns one)
    as an item of the owner's voice_accounts.numbers. Returns its _id."""
    from bson import ObjectId
    item = {k: v for k, v in number.items() if k not in ("userId", "tenantId")}
    item["_id"] = item.get("_id") or ObjectId()
    db.voice_accounts.update_one({"userId": number["userId"]},
                                 {"$push": {"numbers": item}, "$setOnInsert": {"tenantId": number["tenantId"]}}, upsert=True)
    return item["_id"]


def delete_numbers(db, ids):
    db.voice_accounts.update_many({"numbers._id": {"$in": list(ids)}}, {"$pull": {"numbers": {"_id": {"$in": list(ids)}}}})


def memory_of(db, query: dict) -> dict | None:
    """The caller's current memory, shaped like the old voice_caller_memories doc ({agentId, phone, brief,
    calls, lastCallId}). `query` takes userId, agentId and phone."""
    q = {"memory.current": True, **{("callerPhone" if k == "phone" else k): v for k, v in query.items()}}
    call = db.voice_calls.find_one(q)
    if not call:
        return None
    return {**call["memory"], "agentId": call["agentId"], "phone": call["callerPhone"], "lastCallId": call["_id"]}


def count_memories(db, query: dict) -> int:
    return db.voice_calls.count_documents({"memory.current": True, **query})


class Connections:
    """voice_accounts.calendars behind the few collection calls the calendar tests make (insert_one,
    find_one, update_one by _id with $set, delete_many by _id or owner)."""

    def __init__(self, db):
        self.db = db

    def insert_one(self, doc: dict):
        from types import SimpleNamespace
        from bson import ObjectId
        item = {k: v for k, v in doc.items() if k not in ("userId", "tenantId")}
        item["_id"] = item.get("_id") or ObjectId()
        self.db.voice_accounts.update_one({"userId": doc["userId"]},
                                          {"$push": {"calendars": item}, "$setOnInsert": {"tenantId": doc.get("tenantId")}},
                                          upsert=True)
        return SimpleNamespace(inserted_id=item["_id"])

    def find_one(self, query: dict) -> dict | None:
        acc = self.db.voice_accounts.find_one({"calendars._id": query["_id"]}, {"calendars.$": 1})
        return acc["calendars"][0] if acc else None

    def update_one(self, query: dict, update: dict):
        sets = {f"calendars.$.{k}": v for k, v in update["$set"].items()}
        return self.db.voice_accounts.update_one({"calendars._id": query["_id"]}, {"$set": sets})

    def delete_many(self, query: dict):
        if "userId" in query:
            return self.db.voice_accounts.update_many(query, {"$unset": {"calendars": ""}})
        return self.db.voice_accounts.update_many({}, {"$pull": {"calendars": query}})
