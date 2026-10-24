import os, sys, tempfile, json
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import bot
from pathlib import Path
def flag(t):
    for f, rx in bot.STOP_PATTERNS:
        if rx.search(bot.plain(t)): return f
    return None
def abuse(t): return bot.abuse_score(t)
POS = {
 "dnc": ["Don\u2019t ever call this number again.", "I said don\u2019t call here again.", "Take me off your list.", "Don't ever call this number again.", "I said do not call me.", "Remove my number.", "Delete my number.",
         "Stop calling me.", "Never call here again.", "Don't call me again.", "Please don't contact me anymore.", "Take my number off the list",
         "No me llame más.", "Borre mi número.", "dobara call mat karna", "Did you hear me? Remove my number.", "don't call me anymore", "Don't call here again."],
 "wrong_number": ["You've got the wrong number.", "This is a private residence.", "I don't own a business.", "I don't have a business.", "Wrong number.", "Número equivocado."],
 "recording_objection": ["I don\u2019t consent to being recorded.", "I don't consent to being recorded.", "Stop recording.", "Don't record this.", "I'm not comfortable being recorded.", "I do not agree to the recording",
                         "Do you comply with GDPR? I don't consent to being recorded.", "no recording please", "I object to being recorded", "turn off the recording"],
}
NEG = ["Call me back later.", "Don't call me right now, I'm driving.", "Don't call me tomorrow, call me Friday.", "Can you call back at five?", "I don't call them often.",
       "I'm driving right now, can't talk.", "I'm busy.", "No, I'm not interested.", "Is this call being recorded?", "Where is my data stored if I talk to you? Is this call being recorded?",
       "Fine, record it, I don't care.", "That's fine with me, you can record.", "I don't have a business card on me.", "We don't have business hours on Sunday.", "What the hell is this? I'm in the middle of something!",
       "Who gave you this number?", "How did you get my number?", "Stop wasting my time.", "Are you even a real person? This is harassment!", "I'll call you back tomorrow.",
       "My husband passed away last week.", "Is it free?", "Send me the details.", "Okay, thursday at two.", "Yeah, go ahead."]
bad = 0
for want, phrases in POS.items():
    for p in phrases:
        got = flag(p)
        if got != want: bad += 1; print(f"  MISS  want {want:20s} got {got}: {p!r}")
for p in NEG:
    got = flag(p)
    if got: bad += 1; print(f"  FALSE ALARM {got}: {p!r}")
# Ends the call: a slur or a threat at once, or a second insult aimed at her ("|" joins one caller's turns).
ABUSE_YES = ["You stupid robot, who programmed you?|Say something smart for once, you useless machine.", "you idiot|you are a moron",
             "fuck off|Go to hell.", "You people are idiots|You're useless.", "You stupid cunt", "I'll find you and hurt you.",
             "I'm gonna kill you", "shut up|you idiot|screw you"]
# Never ends it: telling her to be quiet (said to interrupt her), swearing at the situation, one insult (she asks
# for respect first), and words that only sound rude.
ABUSE_NO = ["shut up", "Shut up.", "Stop talking.", "Be quiet!", "Listen to me.", "Shut up and listen to me.", "Shut up|stop talking|be quiet",
            "This is bullshit", "What the fuck is this?", "you idiot", "fuck off", "Go to hell. Nobody wants your garbage.",
            "That is a stupid question, but okay.", "Is this stupid thing recording?", "I'm not an idiot.", "Why would I trust a useless website?",
            "My website is useless without bookings.", "What the hell is this?", "I'm in the middle of something!",
            "That's a stupid question, but okay, what time?", "Who programmed you?", "It's a pain, honestly.", "Is this a scam?",
            "I could kill for a coffee.", "Scunthorpe is where we are."]
for p in ABUSE_YES:
    s = sum(abuse(x) for x in p.split("|"))
    if s < 2: bad += 1; print(f"  ABUSE MISS (score {s}): {p!r}")
for p in ABUSE_NO:
    if sum(abuse(x) for x in p.split("|")) >= 2: bad += 1; print(f"  ABUSE FALSE ALARM: {p!r}")
# On a call: "shut up" leaves it running; one insult too; the second insult ends it as abuse.
g3 = bot.CallGuard({"stream_id": "t3", "turns": []})
g3.on_caller_text("Shut up."); g3.on_caller_text("Shut up and listen to me.")
assert not g3.forced, g3.reason
g3.on_caller_text("you idiot"); assert not g3.forced
g3.on_caller_text("fuck off"); assert g3.forced and g3.reason == "abuse", (g3.forced, g3.reason)
GB_YES = ["I\u2019m so sorry for your loss; I\u2019ll let you go.", "I\u2019ll pass that on \u2014 take care.", "I'm sorry for your loss. I'll let you go.", "Stay safe, I'll leave you to it.", "Take care.", "Thursday at two, then. Someone will send the details across — take care.", "Have a good one.", "Stay safe, I'll let you go.", "Mind how you go.", "Goodbye.", "Bye now.", "Talk then.", "All the best.", "Passing that on. Have a good one."]
GB_NO = ["Want me to let you go?", "Should I let you get back to it?", "What time do you close?", "That's all I've got on that.", "Take care of the shop first. What time do you close?", "I'm just the calling assistant.", "Stay safe on the road — and what time would suit you?", "Someone will send the details across."]
for p in GB_YES:
    if not bot.says_goodbye(p): bad += 1; print(f"  GOODBYE MISS: {p!r}")
for p in GB_NO:
    if bot.says_goodbye(p): bad += 1; print(f"  GOODBYE FALSE ALARM: {p!r}")
for t,exp in [("Passing that on. Take care.",True),("I'll pass that on.",True),("That'll be passed on.",True),("I'll flag that.",True),("What time do you close?",False),("I'm Maya, an AI calling assistant.",False)]:
    if bool(bot.STOP_ACK.search(t)) != exp: bad += 1; print(f"  STOP_ACK wrong for {t!r}")
# suppression file round trip
tmp = Path(tempfile.mkdtemp()) / "s.jsonl"; bot.SUPPRESSED = tmp
assert not bot.is_suppressed("+15550100001")
rec = {"stream_id": "t1", "turns": []}
g = bot.CallGuard(rec, "+1 (555) 010-0001")
g.on_caller_text("Take me off your list please")
assert g.forced and g.reason == "dnc", (g.forced, g.reason)
assert bot.is_suppressed("+15550100001") and bot.is_suppressed("1-555-010-0001") and not bot.is_suppressed("+15550100002")
assert not bot.is_suppressed("sip:maya@aixellabs.sip.telnyx.com")
g2 = bot.CallGuard({"stream_id": "t2", "turns": []}, "sip:maya@x"); g2.on_caller_text("Remove my number"); assert g2.reason == "dnc"   # no callee -> flagged, nothing written
assert len(tmp.read_text().splitlines()) == 1
print(f"\n{'ALL' if not bad else bad} checks {'passed' if not bad else 'FAILED'}  ({sum(len(v) for v in POS.values())} positives, {len(NEG)} negatives, abuse, goodbye, suppression round-trip)")


# ===================== voicemail / recording detection =====================
import re as _re, json as _json, glob as _glob
bad2 = 0
def machine_text(t):
    g = bot.CallGuard({"stream_id": "m", "turns": []}, None); g.t0 = __import__("time").monotonic()
    g._look_for_machine(bot.plain(t)); return ("ivr" if g._ivr else "voicemail" if g._strong else None, sorted(g._mediums))

GREETINGS = [   # a recording said this: a phrase alone must settle it
 "The person you are trying to reach is not available. At the tone, please record your message. When you have finished recording, you may hang up.",
 "Hi, you've reached Mike at Davis Plumbing. I'm out on a job right now and can't come to the phone. Leave your name and number and I'll get back to you.",
 "You have reached the voicemail of John Smith. Please leave a message after the beep.",
 "Hi this is Sarah, I'm not able to take your call right now. Leave me a message and I'll call you back.",
 "The Google subscriber you are trying to reach is unavailable. Please try again later.",
 "The number you have dialed is not reachable. Please try again later.",
 "Your call has been forwarded to an automated voice message system. 555-0142 is not available.",
 "Please leave a message at the tone.",
 "We're sorry, the mailbox is full and cannot accept any messages at this time.",
 "Hello, you've reached the voice mailbox of Dr. Patel's office. We are currently closed. If this is an emergency, hang up and dial 911. Otherwise please leave a message after the tone.",
 "Your call is important to us. Please stay on the line and the next available representative will be with you shortly.",
 "Thank you for calling Davis Plumbing. For sales, press 1. For service, press 2. To speak to the office, press 0.",
 "Para español, oprima el dos. For English, press one.",
 "All of our agents are currently assisting other customers. Please hold.",
 "This call may be recorded for quality assurance. Please listen carefully as our menu options have changed.",
 "Deje su mensaje después del tono.",
 "Has llegado al buzón de voz de Carlos. Deje su mensaje.",
 "Hey it's Dave, can't talk right now, leave a message after the beep.",
 "You've reached the answering machine of the Johnson family. We can't come to the phone.",
 "Wait for the tone, then record your message.",
 "The party you are trying to reach is not available at the moment.",
 "At the sound of the tone please record your message.",
 "If you know your party's extension, you may dial it at any time.",
 "The subscriber you have dialed is switched off.",
]
HUMANS = [      # a person said this: none may be treated as a recording
 "Hello?", "Hello, Davis Plumbing.", "Yeah, go ahead.", "I've got a minute.", "What is this?", "Who is this?",
 "Davis Plumbing, you've reached Tom, how can I help you?", "Thanks for calling Davis Plumbing, this is Tom.",
 "He's not available right now, can I take a message?", "She's not in today. Can I take your name?",
 "I'm in the middle of a job right now, what do you need?", "I'm driving right now, I can't talk.", "Call me back later.",
 "It goes to voicemail, but I usually forget to check it until the next morning.",
 "We close at five. After that it goes to voicemail and I call people back the next morning.",
 "It rings out, nobody picks up, and customers just leave a message if they bother to.",
 "My voicemail is full most days. I should clear it, honestly.", "I check my mailbox every morning and call them back as soon as I can.",
 "We're closed on Sundays. Our hours are eight to five the rest of the week.", "Are you the one who left a voicemail yesterday?",
 "Is this call being recorded?", "I don't consent to being recorded.", "Fine, record it.", "Can you leave a message with my receptionist?",
 "He said to leave a message with the front desk.", "I'll call you back tomorrow.", "Press on, I'm listening.", "Just give me a number and I'll get back to you.",
 "No, I'm not interested.", "What does the demo show?", "Take me off your list.", "I'm not available for that, no.",
]
for g in GREETINGS:
    kind, m = machine_text(g)
    ok = kind is not None or len(m) >= 2          # medium-only greetings rely on the long-monologue rule, checked below
    if kind is None and len(m) < 2 and not _re.search(r"closed|hours", g, _re.I):
        bad2 += 1; print(f"  GREETING MISSED (no strong phrase, mediums {m}): {g[:80]!r}")
for h in HUMANS:
    kind, m = machine_text(h)
    if kind: bad2 += 1; print(f"  HUMAN TREATED AS A RECORDING ({kind}): {h!r}")
# every caller line the persona suite has ever used, and every caller turn in the real recorded calls
sim_src = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "sim.py")).read()
lines = _re.findall(r'"((?:[^"\\\n]|\\.){4,140})"', sim_src)
n = 0
for l in lines:
    kind, m = machine_text(l)
    if kind: bad2 += 1; print(f"  PERSONA LINE TREATED AS A RECORDING ({kind}): {l!r}")
    n += 1
real = 0
for f in _glob.glob(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "calls", "*.json")):
    _rec = _json.load(open(f))
    if str(_rec.get("call_control_id", "")).startswith(("test:", "browser:")): continue   # my own test calls, not people
    for t in _rec["turns"]:
        if t["who"] == "caller":
            real += 1; kind, m = machine_text(t["text"])
            if kind: bad2 += 1; print(f"  REAL CALLER LINE TREATED AS A RECORDING ({kind}): {t['text']!r}")

# ---- the timing rules, on a controlled clock ----
import time as _time
class Clock:
    def __init__(s): s.t = 0.0
def case(events, want, label):
    """events: ('speech', a, b) | ('text', t, str) | ('beep', t) ; evaluated every 0.5 s to t=40"""
    global bad2
    g = bot.CallGuard({"stream_id": "c", "turns": []}, None); c = Clock(); g._now = lambda: c.t
    fired = None; g.trigger_machine = lambda kind, why: setattr(g, "_hit", (kind, why)) or setattr(g, "forced", True)
    T = 0.0
    while T <= 40 and not g.forced:
        c.t = T
        for e in events:
            if e[0] == "speech":
                if abs(T - e[1]) < 1e-6: g.on_speech_started()
                if abs(T - e[2]) < 1e-6: g.on_speech_stopped()
            elif e[0] == "text" and abs(T - e[1]) < 1e-6: g._look_for_machine(e[2])
            elif e[0] == "beep" and abs(T - e[1]) < 1e-6: g.on_beep()
            elif e[0] == "beep" and abs(T - (e[1] + 1.5)) < 1e-6: g.on_beep_after(quiet=(e[2] == "quiet"))
        g.check_machine(); T = round(T + 0.5, 1)
    got = getattr(g, "_hit", None)
    ok = (got is not None) == want
    if not ok: bad2 += 1
    print(f"  {'ok  ' if ok else 'WRONG'} {label:62s} -> {('hang up at %.1fs as %s' % (c.t, got[0])) if got else 'keeps talking'}")
print()
case([("speech", 1, 14)], True, "14 s of continuous talking from pickup, no words recognised")
case([("speech", 1, 11), ("text", 11.5, "Hi you've reached Mike. I'm not available right now.")], True, "10 s greeting wording: 'reached' + 'not available'")
case([("speech", 1, 6), ("text", 6.5, "Davis Plumbing, you've reached Tom, I'm not available at the moment, can I take a message?")], False, "live person, 5 s, greeting-like words")
case([("speech", 1, 2)], False, "just 'Hello?'")
case([("speech", 1, 6), ("beep", 6.5, "quiet")], True, "5 s greeting, beep, then the line goes quiet")
case([("speech", 1, 6), ("beep", 6.5, "active")], False, "beep, but the line stays noisy (a truck reversing, say)")
case([("speech", 1, 3.5), ("beep", 4, "quiet")], True, "a short 2.5 s greeting, beep, then quiet")
case([("speech", 1, 2), ("beep", 3, "quiet")], False, "beep after only a second of speech")
case([("speech", 20, 29), ("text", 29.5, "It goes to voicemail, but I usually forget to check it and I call them back when I can.")], False, "owner answers the voicemail question, 9 s")
case([("speech", 1, 3), ("speech", 10, 12), ("text", 12.5, "Yeah go ahead"), ("speech", 17, 25), ("text", 25.5, "We close at five and it goes to voicemail, I call back as soon as I can")], False, "a normal conversation, start to finish")
case([("speech", 1, 3), ("text", 3.5, "Thank you for calling Davis Plumbing. For sales press 1.")], True, "automated menu")
print(f"\n{'ALL' if not bad2 else bad2} voicemail checks {'passed' if not bad2 else 'FAILED'}: {len(GREETINGS)} greetings, {len(HUMANS)} human lines, {n} persona lines, {real} real caller turns")
