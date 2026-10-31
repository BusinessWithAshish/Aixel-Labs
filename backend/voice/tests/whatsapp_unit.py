"""WhatsApp calls (whatsapp.py, phone.py /whatsapp): webhook signature, parsing, repeats, the SDP filter,
and what the routes refuse. No database, no Meta, no aiortc: the app's numbers are stubbed and a call
coming in is caught where it would be answered.

    .venv/bin/python tests/whatsapp_unit.py
"""
import asyncio, hashlib, hmac, json, os, sys

os.environ["VOICELAB_KEY"] = "whatsapp-unit-test-key"
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import product  # first: keeps the settings above over .env
import phone
import whatsapp
from fastapi.testclient import TestClient

RESULTS = []
APP, OTHER_APP, SECRET = "1234567890", "999", "app-secret-1"


def ok(name, cond, detail=""):
    RESULTS.append((name, bool(cond)))
    print(f"  [{'PASS' if cond else 'FAIL'}] {name}{' -- ' + detail if detail else ''}", flush=True)


def hub(raw: bytes, secret: str = SECRET) -> str:
    return "sha256=" + hmac.new(secret.encode(), raw, hashlib.sha256).hexdigest()


def number(pnid: str, app: str = APP, secret: str = SECRET) -> dict:
    return {"_id": f"n-{pnid}", "provider": "WHATSAPP", "providerNumberId": pnid, "phoneNumber": "+15550001111",
            "apiKeySealed": product.seal_secret("token"),
            "whatsapp": {"appId": app, "appSecretSealed": product.seal_secret(secret), "wabaId": "w1"}}


def webhook(pnid: str, *calls: dict, field: str = "calls") -> dict:
    return {"object": "whatsapp_business_account", "entry": [{"id": "w1", "changes": [
        {"field": field, "value": {"messaging_product": "whatsapp", "metadata": {"phone_number_id": pnid},
                                   "calls": list(calls)}}]}]}


CONNECT = {"id": "wacid.A1", "event": "connect", "direction": "USER_INITIATED", "from": "919876543210",
           "to": "15550001111", "session": {"sdp_type": "offer", "sdp": "v=0\r\n"}}


def module_tests():
    raw = b'{"a":1}'
    ok("signature: the app secret's HMAC passes", whatsapp.signature_ok(SECRET, raw, hub(raw)))
    ok("signature: another secret fails", not whatsapp.signature_ok(SECRET, raw, hub(raw, "other")))
    ok("signature: non-ASCII in the header fails, not raises", not whatsapp.signature_ok(SECRET, raw, "sha256=é"))
    ok("media: only Meta's https hosts (or the Graph base, a fake in tests) get the token",
       whatsapp.media_url_ok("https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=1")
       and whatsapp.media_url_ok(f"{whatsapp.graph_base()}/media-files/1")
       and not whatsapp.media_url_ok("http://lookaside.fbsbx.com/x") and not whatsapp.media_url_ok("https://evil.example/x")
       and not whatsapp.media_url_ok("https://fbsbx.com.evil.example/x") and not whatsapp.media_url_ok("http://169.254.169.254/"))
    ok("media: an id that would change the Graph path is not fetched",
       asyncio.run(whatsapp.download_media("t", "../me?fields=x")) == (None, ""))
    ok("signature: no header / no prefix fails",
       not whatsapp.signature_ok(SECRET, raw, None) and not whatsapp.signature_ok(SECRET, raw, hub(raw)[7:]))
    ok("signed: any number's secret will do (one still on an old secret)",
       whatsapp.signed([number("p1", secret="old"), number("p2")], raw, hub(raw)))

    events = whatsapp.calls_in(webhook("p1", CONNECT, {"id": "wacid.A1", "event": "terminate", "status": "COMPLETED"}))
    ok("parse: connect and terminate, with the number and Meta's offer",
       [(e["event"], e["phone_number_id"], e["from"], e["sdp_type"]) for e in events]
       == [("connect", "p1", "919876543210", "offer"), ("terminate", "p1", None, None)], str(events))
    no_from = whatsapp.calls_in(webhook("p1", {**CONNECT, "from": None, "from_user_id": "US.bsuid"}))
    ok("parse: a caller with a username only (no `from`) still parses", no_from and no_from[0]["from"] is None)
    ok("parse: messages, statuses and junk give no call events",
       whatsapp.calls_in(webhook("p1", CONNECT, field="messages")) == [] and whatsapp.calls_in([]) == []
       and whatsapp.calls_in({"entry": ["x", {"changes": [None, {"field": "calls", "value": []}]}]}) == []
       and whatsapp.calls_in(webhook("p1", {"event": "connect"}, "junk")) == [])

    ok("repeats: the first is fresh, the second is not", whatsapp.fresh("c9", "connect") and not whatsapp.fresh("c9", "connect"))
    ok("repeats: another event of the same call is fresh", whatsapp.fresh("c9", "terminate"))

    sdp = "v=0\r\na=fingerprint:sha-256 AA\r\na=fingerprint:sha-512 BB\r\na=setup:active"
    ok("SDP: only the sha-256 fingerprint is left", whatsapp.for_whatsapp(sdp) == "v=0\r\na=fingerprint:sha-256 AA\r\na=setup:active\r\n")
    texts = webhook("p1", field="messages")
    texts["entry"][0]["changes"][0]["value"].update(
        contacts=[{"wa_id": "919876543210", "profile": {"name": "Ravi"}}],
        messages=[{"id": "wamid.1", "from": "919876543210", "type": "text", "text": {"body": " Hi there "}},
                  {"id": "wamid.2", "from": "919876543210", "type": "interactive",
                   "interactive": {"type": "button_reply", "button_reply": {"id": "b1", "title": "Book a visit"}}},
                  {"id": "wamid.3", "from": "919876543210", "type": "audio", "audio": {"id": "m1"}},
                  {"id": "wamid.4", "type": "text"},
                  {"id": "wamid.5", "from": "919876543210", "type": "reaction", "reaction": {"message_id": "wamid.out", "emoji": "👍"}},
                  {"id": "wamid.6", "from": "919876543210", "type": "system", "system": {"body": "changed number"}}, "junk"],
        statuses=[{"id": "wamid.out", "status": "delivered"}])
    got = whatsapp.messages_in(texts)
    ok("messages: text and a tapped button read as text, a voice note as no text, with the sender's name",
       [(m["id"], m["text"], m["name"]) for m in got]
       == [("wamid.1", "Hi there", "Ravi"), ("wamid.2", "Book a visit", "Ravi"), ("wamid.3", None, "Ravi")], str(got))
    ok("messages: delivery receipts, reactions, system notices and call events are not messages",
       whatsapp.messages_in(webhook("p1", CONNECT)) == [] and whatsapp.calls_in(texts) == [])
    ok("verify token: the app's signParts('whatsapp-verify', appId)",
       whatsapp.verify_ok(APP, product.sign("whatsapp-verify", APP)) and not whatsapp.verify_ok(OTHER_APP, product.sign("whatsapp-verify", APP)))


def route_tests():
    numbers = {APP: [number("p1")], OTHER_APP: [number("p2", app=OTHER_APP, secret="s2")]}
    product.whatsapp_numbers = lambda app_id: numbers.get(app_id, [])
    caught = []
    def caught_spawn(coro):
        caught.append(coro.cr_frame.f_locals.get("event") or coro.cr_frame.f_locals.get("message"))
        coro.close()
    whatsapp.spawn = caught_spawn
    client = TestClient(phone.make_app())
    url = f"/whatsapp?app={APP}&sig={product.sign('whatsapp', APP)}"

    # Meta appends hub.* to the callback's own query (app, sig).
    ours = {"app": APP, "sig": product.sign("whatsapp", APP), "hub.mode": "subscribe"}
    challenge = client.get("/whatsapp", params={**ours, "hub.verify_token": product.sign("whatsapp-verify", APP),
                                                "hub.challenge": "1158201444"})
    ok("verify: the challenge is echoed", challenge.status_code == 200 and challenge.text == "1158201444", challenge.text)
    wrong = client.get("/whatsapp", params={**ours, "hub.verify_token": "nope", "hub.challenge": "1"})
    ok("verify: a wrong token is refused", wrong.status_code == 403)

    def post(body: dict, path: str = url, secret: str = SECRET):
        raw = json.dumps(body).encode()
        return client.post(path, content=raw, headers={"X-Hub-Signature-256": hub(raw, secret), "Content-Type": "application/json"})

    ok("events: our own URL signature is checked first", post(webhook("p1", CONNECT), f"/whatsapp?app={APP}&sig=bad").status_code == 403)
    ok("events: a non-ASCII sig is a plain 403, not a crash", client.post(f"/whatsapp?app={APP}&sig=%C3%A9", content=b"{}").status_code == 403)
    big = b"x" * (phone.WEBHOOK_MAX_BYTES + 1)
    ok("events: a body over the cap is refused before it is read",
       client.post(url, content=big, headers={"X-Hub-Signature-256": hub(big)}).status_code == 413)
    bearer = {"Authorization": f"Bearer {os.environ['VOICELAB_KEY']}"}
    ok("voice note: only the app may encode one", client.post("/voice-note", content=b"OggS").status_code == 401)
    ok("voice note: a playlist pointing at a file is refused, not read",
       client.post("/voice-note", content=b"ffconcat version 1.0\nfile /etc/hostname\n", headers=bearer).status_code == 422)
    ok("events: a body not signed with the app's secret is refused", post(webhook("p1", CONNECT), secret="other").status_code == 403)
    ok("events: a signed connect is answered in the background",
       post(webhook("p1", CONNECT)).status_code == 200 and [e and e["id"] for e in caught] == ["wacid.A1"], str(caught))
    post(webhook("p1", CONNECT))
    ok("events: Meta sending the same connect again answers once", len(caught) == 1)
    post(webhook("p2", {**CONNECT, "id": "wacid.B2"}))
    ok("events: a number on ANOTHER app is not reachable through this app's webhook", len(caught) == 1)
    post(webhook("p1", {**CONNECT, "id": "wacid.C3", "direction": "BUSINESS_INITIATED", "session": {"sdp_type": "answer", "sdp": "x"}}))
    ok("events: a business-initiated connect (outbound, not built) is not answered", len(caught) == 1)
    text = webhook("p1", field="messages")
    text["entry"][0]["changes"][0]["value"]["messages"] = [{"id": "wamid.9", "from": "919876543210", "type": "text",
                                                           "text": {"body": "Hello"}}]
    post(text)
    post(text)
    ok("messages: a signed message is answered in the background, once", [c and c["id"] for c in caught][1:] == ["wamid.9"],
       str(caught))


module_tests()
route_tests()
failed = [name for name, passed in RESULTS if not passed]
print(f"\n{len(RESULTS) - len(failed)}/{len(RESULTS)} passed")
sys.exit(1 if failed else 0)
