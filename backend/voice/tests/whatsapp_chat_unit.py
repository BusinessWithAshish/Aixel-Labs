"""WhatsApp chats (whatsapp.py Chats, chat.py): a message starts a conversation, the agent answers through
Meta, more messages join it, a tool runs in the middle of a reply, a quiet chat closes with its cost,
analysis and the caller's memory, and the next chat starts from that memory.

    MONGODB_URI=mongodb://127.0.0.1:27018 MONGODB_DB_NAME=AixelLabsVoiceEngineDev .venv/bin/python tests/whatsapp_chat_unit.py

A local throwaway database; Meta's Graph API and Gemini are fakes on 127.0.0.1:7887 (WHATSAPP_GRAPH_BASE,
GEMINI_API_BASE), so nothing leaves this machine. Everything it writes is deleted.
"""
import asyncio, json, os, sys
from datetime import timedelta

import testdb
MONGO, DBNAME = testdb.throwaway()
FAKE = 7887
os.environ["WHATSAPP_GRAPH_BASE"] = f"http://127.0.0.1:{FAKE}/graph"
os.environ["GEMINI_API_BASE"] = f"http://127.0.0.1:{FAKE}/gemini"
os.environ.setdefault("VOICELAB_KEY", "whatsapp-chat-unit-test-key")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import product  # first: keeps the settings above over .env
from aiohttp import web
from bson import ObjectId
import chat
import whatsapp

assert product.db().name == DBNAME
RESULTS = []
SENT, GEMINI, VOICE = [], [], []  # what Meta was asked to send (texts, voice notes), what Gemini was asked
BRIEF = "Ravi asked about Saturday hours; prefers mornings."


def ok(name, cond, detail=""):
    RESULTS.append((name, bool(cond)))
    print(f"  [{'PASS' if cond else 'FAIL'}] {name}{' -- ' + detail if detail else ''}", flush=True)


async def fake_graph(request: web.Request):
    if request.headers.get("Authorization") != "Bearer EAAtoken":
        return web.json_response({"error": {"code": 190}}, status=401)
    tail = request.match_info["tail"]
    if request.method == "GET":  # a voice note: its URL, then its bytes
        if tail.endswith("MEDIA1"):
            return web.json_response({"url": f"http://127.0.0.1:{FAKE}/graph/media-file", "mime_type": "audio/ogg"})
        return web.Response(body=b"OggS-incoming", content_type="audio/ogg")
    if tail.endswith("/media"):
        return web.json_response({"id": "UP1"})
    body = await request.json()
    if body.get("type") == "text":
        SENT.append(body)
    if body.get("type") == "audio":
        VOICE.append(body)
    return web.json_response({"messages": [{"id": "wamid.out"}], "success": True})


async def fake_gemini(request: web.Request):
    body = await request.json()
    GEMINI.append(body)
    if "responseJsonSchema" in (body.get("generationConfig") or {}):  # the post-chat analysis
        answer = {"summary": "Asked about Saturday.", "sentiment": "positive", "successful": True, "memory": BRIEF}
        parts = [{"text": json.dumps(answer)}]
    elif any("inlineData" in p for p in body["contents"][-1]["parts"]):  # a voice note to hear
        parts = [{"text": "I want to come in on Saturday"}]
    elif "human" in json.dumps(body["contents"][-1]) and "functionResponse" not in json.dumps(body["contents"][-1]):
        parts = [{"functionCall": {"name": "ask_for_a_person", "args": {"reason": "wants a human"}}}]
    elif "book" in json.dumps(body["contents"][-1]) and not any("functionResponse" in json.dumps(c) for c in body["contents"]):
        parts = [{"functionCall": {"name": "check_availability", "args": {"date": "2026-10-31"}}, "thoughtSignature": "sig1"}]
    else:
        parts = [{"text": f"Reply {len(GEMINI)}"}]
    return web.json_response({"candidates": [{"content": {"role": "model", "parts": parts}}],
                              "usageMetadata": {"promptTokenCount": 1000, "candidatesTokenCount": 20}})


def message(text, n, kind="text", media_id=None):
    return {"phone_number_id": "PN1", "id": f"wamid.in{n}", "from": "919812345678", "name": "Ravi", "type": kind, "text": text,
            "media_id": media_id, "mime": "audio/ogg; codecs=opus" if media_id else None}


async def main():
    app = web.Application()
    app.router.add_route("*", "/graph/{tail:.*}", fake_graph)
    app.router.add_post("/gemini/{tail:.*}", fake_gemini)
    runner = web.AppRunner(app)
    await runner.setup()
    await web.TCPSite(runner, "127.0.0.1", FAKE).start()

    db, tenant, user = product.db(), ObjectId(), ObjectId()
    testdb.set_account(db, {"tenantId": tenant, "userId": user,
                            "keys": testdb.gemini_keys(product.seal_secret("AIza-chat-unit-key"))})
    agent_id = db.voice_agents.insert_one({
        "tenantId": tenant, "userId": user, "name": "Priya", "callType": "INBOUND", "voice": "Aoede", "memory": True,
        "prompt": "You are Priya, the front desk of Smile Dental.",
        "tools": {"booking": {"enabled": True, "timezone": "Asia/Kolkata", "slotMinutes": 30,
                              "hours": {d: {"open": "09:00", "close": "18:00"} for d in ("mon", "tue", "wed", "thu", "fri", "sat")}}},
    }).inserted_id
    number_id = testdb.insert_number(db, {
        "userId": user, "tenantId": tenant, "provider": "WHATSAPP", "phoneNumber": "+15550001111", "providerNumberId": "PN1",
        "apiKeySealed": product.seal_secret("EAAtoken"), "inboundAgentId": agent_id,
        "whatsapp": {"appId": "123456", "appSecretSealed": product.seal_secret("s"), "wabaId": "W1"}})
    number = product.find_number(number_id)
    try:
        await whatsapp.answer_message(number, message("Hi, are you open Saturday?", 1))
        first = db.voice_calls.find_one({"numberId": number_id, "channel": "WHATSAPP"})
        ok("a message starts a chat: open, the person's number, their words, her reply",
           first and first["chat"]["open"] and first["callerPhone"] == "+919812345678"
           and [t["role"] for t in first["turns"]] == ["caller", "agent"] and first["endedBy"] == "chat_open", str(first and first["turns"]))
        ok("her reply went to the person through Meta, as text", SENT and SENT[-1]["to"] == "919812345678"
           and SENT[-1]["text"]["body"] == first["turns"][1]["text"])
        ok("Gemini was told it is a WhatsApp chat, with the agent's prompt",
           "This is a WhatsApp chat" in GEMINI[0]["systemInstruction"]["parts"][0]["text"]
           and "Smile Dental" in GEMINI[0]["systemInstruction"]["parts"][0]["text"])
        ok("the reply's tokens are counted on the chat", first["chat"]["tokens"] == {"textIn": 1000, "textOut": 20})

        await whatsapp.answer_message(number, message("Can I book a cleaning?", 2))
        chats = list(db.voice_calls.find({"numberId": number_id, "channel": "WHATSAPP"}))
        doc = chats[0]
        ok("the next message joins the same chat", len(chats) == 1 and len(doc["turns"]) == 4, str([t["text"] for t in doc["turns"]]))
        ok("a tool ran in the middle of the reply and is logged on the chat",
           [t["name"] for t in doc.get("toolCalls") or []] == ["check_availability"], str(doc.get("toolCalls")))
        ok("her turn went back to Gemini with its thought signature, then the tool's answer",
           any(p.get("thoughtSignature") == "sig1" for c in GEMINI[-1]["contents"] for p in c["parts"])
           and "functionResponse" in json.dumps(GEMINI[-1]["contents"][-1]))

        await whatsapp.answer_message(number, message(None, 3, kind="audio"))
        doc = db.voice_calls.find_one({"_id": doc["_id"]})
        ok("a voice note gets a plain 'text only' answer, no model", doc["turns"][-1]["text"] == whatsapp.NOT_TEXT
           and doc["turns"][-2]["text"] == "[audio]")

        quiet = product.now() - timedelta(seconds=whatsapp.IDLE_SECS + 60)
        db.voice_calls.update_one({"_id": doc["_id"]}, {"$set": {"chat.lastMessageAt": quiet}})
        ok("a quiet chat is found by the sweep", doc["_id"] in whatsapp._stale_chats({}))
        await whatsapp.close_chat(doc["_id"])
        await whatsapp.close_chat(doc["_id"])  # a second look (another slot) does nothing
        closed = db.voice_calls.find_one({"_id": doc["_id"]})
        ok("closed: chat_ended, open false, a duration", not closed["chat"]["open"] and closed["endedBy"] == "chat_ended"
           and closed["durationSec"] >= 0)
        ok("its cost: the chat model's tokens at list price", closed["cost"]["geminiTokens"]["textIn"] == 3000
           and abs(closed["cost"]["geminiUsd"] - (3000 * 0.3 + 60 * 2.5) / 1e6) < 1e-9, str(closed.get("cost")))
        ok("analysed once, and the caller's memory is kept on it",
           closed["analysis"]["summary"] == "Asked about Saturday." and closed["memory"]["brief"] == BRIEF
           and closed["memory"]["current"] is True and sum("responseJsonSchema" in (b.get("generationConfig") or {}) for b in GEMINI) == 1)

        await whatsapp.answer_message(number, message("Hello again", 4))
        chats = list(db.voice_calls.find({"numberId": number_id, "channel": "WHATSAPP"}).sort("startedAt", 1))
        ok("a message after the close starts a new chat", len(chats) == 2 and chats[1]["chat"]["open"])
        ok("...which starts from what she remembers", BRIEF in GEMINI[-1]["systemInstruction"]["parts"][0]["text"])

        chat.speak = lambda ctx, text: asyncio.sleep(0, b"OggS-reply")  # Gemini TTS + ffmpeg are not faked here
        chat.audio_secs = lambda audio: 3.0
        await whatsapp.answer_message(number, message(None, 5, kind="audio", media_id="MEDIA1"))
        now_chat = db.voice_calls.find_one({"_id": chats[1]["_id"]})
        heard, said = now_chat["turns"][-2], now_chat["turns"][-1]
        ok("a voice note is heard on the owner's own key (Gemini here: no Deepgram or OpenAI key) and answered as a voice note",
           heard == {**heard, "role": "caller", "voice": True, "text": "I want to come in on Saturday"}
           and said["role"] == "agent" and said.get("voice") and len(VOICE) == 1 and VOICE[0]["audio"] == {"id": "UP1", "voice": True},
           str(now_chat["turns"][-2:]))
        ok("the voice note's seconds and model are kept for the cost", now_chat["chat"]["voice"] == {
            "sttSecs": 3.0, "ttsSecs": 3.0, "sttModel": chat.MODEL}, str(now_chat["chat"].get("voice")))

        sent = len(SENT)
        await whatsapp.answer_message(number, message("Can I talk to a human please?", 6))
        flagged = db.voice_calls.find_one({"_id": chats[1]["_id"]})
        ok("asked for a person: the AI hands the chat over and says so", (flagged["chat"].get("needsHuman") or {}).get("reason")
           == "wants a human" and len(SENT) == sent + 1, str(flagged["chat"].get("needsHuman")))
        await whatsapp.answer_message(number, message("Hello?", 7))
        waiting = db.voice_calls.find_one({"_id": chats[1]["_id"]})
        ok("...then stays quiet: the message waits, unread, for a person", len(SENT) == sent + 1
           and waiting["turns"][-1]["text"] == "Hello?" and waiting["chat"]["unread"] == 1)

        db.voice_calls.update_one({"_id": chats[1]["_id"]}, {"$set": {
            "chat.needsHuman": None, "chat.human": {"since": product.now(), "userId": user, "name": "Asha"},
            "chat.lastMessageAt": product.now() - timedelta(seconds=whatsapp.IDLE_SECS + 60)}})
        await whatsapp.answer_message(number, message("Are you there?", 8))
        chats = list(db.voice_calls.find({"numberId": number_id, "channel": "WHATSAPP"}).sort("startedAt", 1))
        ok("a taken-over conversation stays with the person into the next chat; the AI says nothing",
           len(chats) == 3 and (chats[2]["chat"].get("human") or {}).get("name") == "Asha" and len(SENT) == sent + 1
           and [t["role"] for t in chats[2]["turns"]] == ["caller"])

        ok("contents: the person's several messages are one user turn; an opening agent line is dropped",
           chat.contents([{"role": "agent", "text": "Hi!"}, {"role": "caller", "text": "a"}, {"role": "caller", "text": "b"},
                          {"role": "agent", "text": "c"}])
           == [{"role": "user", "parts": [{"text": "a"}, {"text": "b"}]}, {"role": "model", "parts": [{"text": "c"}]}])
        ok("a voice reply is said without WhatsApp's marks (a price was read with its asterisks); maths and names keep theirs",
           chat.spoken("Whitening is *₹6,000*. Booked for _Saturday_, ~no~ `ok`") == "Whitening is ₹6,000. Booked for Saturday, no ok"
           and chat.spoken("5 * 3 is 15, mail my_name_here") == "5 * 3 is 15, mail my_name_here")
    finally:
        db.voice_calls.delete_many({"userId": user})
        db.voice_bookings.delete_many({"userId": user})
        db.voice_agents.delete_many({"userId": user})
        db.voice_accounts.delete_many({"userId": user})
        await runner.cleanup()


asyncio.run(main())
failed = [name for name, passed in RESULTS if not passed]
print(f"\n{len(RESULTS) - len(failed)}/{len(RESULTS)} passed")
sys.exit(1 if failed else 0)
