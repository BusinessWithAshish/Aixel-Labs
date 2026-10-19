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
