"""Stream one channel of a saved dual-channel recording at the /telnyx endpoint, in real time."""
import asyncio, audioop, base64, json, sys, time, uuid, wave
import websockets

port, path, ch = sys.argv[1], sys.argv[2], int(sys.argv[3])
w = wave.open(path)
raw = w.readframes(w.getnframes())
rate = w.getframerate()
mono = audioop.tomono(raw, 2, 1 - ch, ch)           # keep one channel
pcm8, _ = audioop.ratecv(mono, 2, 1, rate, 8000, None)
ulaw = audioop.lin2ulaw(pcm8, 2)
frames = [ulaw[i:i + 160].ljust(160, b"\xff") for i in range(0, len(ulaw), 160)]
frames += [b"\xff" * 160] * 200                      # 4 s of line silence at the end

async def main():
    sid = str(uuid.uuid4())
    async with websockets.connect(f"ws://127.0.0.1:{port}/telnyx?voice=sulafat", max_size=None) as ws:
        await ws.send(json.dumps({"event": "connected"}))
        await ws.send(json.dumps({"event": "start", "stream_id": sid, "start": {
            "call_control_id": f"test:{sid}",
            "media_format": {"encoding": "PCMU", "sample_rate": 8000, "channels": 1}}}))
        async def drain():
            async for _ in ws: pass
        d = asyncio.create_task(drain())
        t0 = time.perf_counter()
        for i, f in enumerate(frames):
            await ws.send(json.dumps({"event": "media", "stream_id": sid,
                                      "media": {"payload": base64.b64encode(f).decode()}}))
            await asyncio.sleep(max(0, t0 + (i + 1) * 0.02 - time.perf_counter()))
        d.cancel()
asyncio.run(main())
