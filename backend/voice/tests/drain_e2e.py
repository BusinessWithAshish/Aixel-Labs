"""A deploy's two slots, end to end: SIGTERM drains (phone.py), and a carrier event reaches the slot holding the call.

Starts two engines itself, as deploy.sh runs them for a moment (the slot being replaced and the new one, both
told SLOT_PORTS), on a throwaway database, campaigns off, real Gemini Live (2 sessions, Ashish's own line,
"test:" call ids so Telnyx is never asked for anything):

    MONGODB_URI=mongodb://127.0.0.1:27018 MONGODB_DB_NAME=AixelLabsVoiceEngineDev \\
      .venv/bin/python tests/drain_e2e.py 8131        # slots on 8131 and 8132

1. handover: a call placed on slot A rings; Telnyx's call.answered arrives at slot B (Caddy moved on), which
   hands it to A: she speaks after the pickup.
2. drain: during a call on A, A gets SIGTERM. /health 503 draining, /calls 503 "draining", a call coming in
   (/texml) gets the short apology, /voicelink in and /play are refused; B still answers 200. The call on A
   goes on to its end (she answers every line), then A exits by itself, code 0.
"""
import asyncio, json, os, signal, subprocess, sys, time, urllib.error, urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(HERE)); sys.path.insert(0, str(HERE / "tests"))
import testdb
MONGO, DBNAME = testdb.throwaway()

import websockets
import product, scripted

RESULTS = []


def ok(name, cond, detail=""):
    RESULTS.append((name, bool(cond)))
    print(f"  [{'PASS' if cond else 'FAIL'}] {name}{' -- ' + detail if detail else ''}", flush=True)


def http(method, url, body=None, headers=None):
    req = urllib.request.Request(url, data=json.dumps(body).encode() if body is not None else None, method=method,
                                 headers={"Content-Type": "application/json", **(headers or {})})
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return r.status, r.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()


def start(port: int, ports: str, log) -> subprocess.Popen:
    env = {**os.environ, "MONGODB_URI": MONGO, "MONGODB_DB_NAME": DBNAME, "CAMPAIGNS": "off", "SLOT_PORTS": ports,
           "LOG_LEVEL": "INFO"}
    return subprocess.Popen([sys.executable, "phone.py", "--port", str(port)], cwd=HERE, env=env, stdout=log, stderr=log)


async def healthy(port: int, within: float = 90) -> bool:
    end = time.monotonic() + within
    while time.monotonic() < end:
        try:
            if (await asyncio.to_thread(http, "GET", f"http://127.0.0.1:{port}/health"))[0] == 200:
                return True
        except OSError:
            pass
        await asyncio.sleep(0.5)
    return False


async def running(port: int) -> int:
    return json.loads((await asyncio.to_thread(http, "GET", f"http://127.0.0.1:{port}/health"))[1]).get("calls_running", 0)


async def handover(a: int, b: int):
    print("\n== handover: the pickup arrives at the other slot ==")
    r = await scripted.run(str(a), "busy", ring=2.0, events=f"http://127.0.0.1:{b}/telnyx-events")
    ok("slot B handed call.answered to slot A: she spoke after the pickup", r["first_sound"] is not None, str(r))


async def drain(a: int, b: int, proc: subprocess.Popen):
    print("\n== drain: SIGTERM during a call ==")
    call = asyncio.create_task(scripted.run(str(a), "answers"))
    end = time.monotonic() + 30
    while time.monotonic() < end and await running(a) < 1:
        await asyncio.sleep(0.3)
    await asyncio.sleep(8)  # her opening line and the first exchange
    ok("a call is running on A", await running(a) == 1)
    proc.send_signal(signal.SIGTERM)
    sent = time.monotonic()
    await asyncio.sleep(1)

    st, body = await asyncio.to_thread(http, "GET", f"http://127.0.0.1:{a}/health")
    h = json.loads(body)
    ok("A's /health: 503, draining, the call still running", st == 503 and h.get("draining") is True and h.get("calls_running") == 1, f"{st} {body[:160]}")
    st, _ = await asyncio.to_thread(http, "GET", f"http://127.0.0.1:{b}/health")
    ok("B's /health: 200 (deploy.sh checks the new slot's own port)", st == 200)
    st, body = await asyncio.to_thread(http, "POST", f"http://127.0.0.1:{a}/calls", {"numberId": "x", "to": "+15559990000"},
                                       {"Authorization": f"Bearer {os.environ['VOICELAB_KEY']}"})
    ok("POST /calls on A: 503 code draining", st == 503 and json.loads(body).get("code") == "draining", f"{st} {body}")
    st, body = await asyncio.to_thread(http, "GET", f"http://127.0.0.1:{a}/texml?To=sip:sulafat@aixellabs.sip.telnyx.com")
    ok("a call coming in (/texml) on A: the short apology, then hang up", st == 200 and "<Say>" in body and "<Hangup/>" in body, body[:160])
    async with websockets.connect(f"ws://127.0.0.1:{a}/play?agent=x&user=y&t=z") as ws:
        first = json.loads(await asyncio.wait_for(ws.recv(), 10))
        try:
            await asyncio.wait_for(ws.recv(), 10)
        except websockets.ConnectionClosed:
            pass
    ok("/play on A: refused with code draining", first.get("code") == "draining" and ws.close_code == 1013, f"{first} {ws.close_code}")
    url = f"ws://127.0.0.1:{a}/voicelink?n=000000000000000000000001&sig={product.sign('number', '000000000000000000000001')}"
    try:
        async with websockets.connect(url) as ws:
            await asyncio.wait_for(ws.recv(), 10)
        code = None
    except websockets.ConnectionClosed as e:
        code = e.rcvd.code if e.rcvd else None
    except websockets.InvalidStatus as e:
        code = e.response.status_code
    # Closed before the upgrade is accepted, which the server answers with 403: either way VoiceLink hangs up.
    ok("a VoiceLink call coming in on A: refused at once", code in (1013, 403), str(code))

    alive_during = proc.poll() is None
    r = await call
    ended = time.monotonic()
    ok("the call went on to its end on A (every line answered, A never hung up)",
       len(r["true_gaps_ms"]) >= 5 and alive_during, f"{len(r['true_gaps_ms'])} replies, {ended - sent:.0f}s after SIGTERM")
    try:
        code = await asyncio.to_thread(proc.wait, 20)
    except subprocess.TimeoutExpired:
        code = None
    ok("A exited by itself once the call ended, code 0", code == 0, f"code {code}, {time.monotonic() - ended:.1f}s after the call")


async def main():
    a = int(sys.argv[1]) if len(sys.argv) > 1 else 8131
    b = a + 1
    logs = HERE / "tests" / "sim"
    logs.mkdir(exist_ok=True)
    procs = []
    try:
        for port in (a, b):
            procs.append(start(port, f"{a} {b}", open(logs / f"drain-{port}.log", "w")))
        ok("both slots healthy", await healthy(a) and await healthy(b))
        for port in (a, b):
            testdb.engine_on(port, DBNAME)
        await handover(a, b)
        await drain(a, b, procs[0])
    finally:
        for p in procs:
            if p.poll() is None:
                p.send_signal(signal.SIGTERM)  # idle by now: drains at once
                try:
                    p.wait(15)
                except subprocess.TimeoutExpired:
                    p.kill()
    passed = sum(1 for _, p in RESULTS if p)
    print(f"\n{passed}/{len(RESULTS)} passed (engine logs: tests/sim/drain-{a}.log, drain-{b}.log)")
    sys.exit(0 if passed == len(RESULTS) else 1)


if __name__ == "__main__":
    asyncio.run(main())
