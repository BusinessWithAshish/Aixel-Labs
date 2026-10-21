# Voice engine (`backend/voice`)

The backend's third service, beside `api` and `games`: the Python engine behind the app's Voice agents.
Gemini Live speaks and listens on phone calls (Pipecat), for customers' agents on their own Telnyx,
Twilio or VoiceLink numbers, in the app's browser playground, and in outbound campaigns.

Served at `https://api.aixellabs.in/voice/*`: Caddy strips `/voice` and proxies to the live slot
(`backend/deploy/Caddyfile`). The Node backend is not in the path (its rate limit, API secret and
body parsing would sit in every carrier request); the engine checks every request itself (signed
URLs, short-lived stream tokens, `VOICELAB_KEY`, Twilio's signature).

## Files

| File | What it is |
|---|---|
| `phone.py` | The server (FastAPI + uvicorn): carrier webhooks and media WebSockets, `POST /calls`, `/play`, `/health`, the SIGTERM drain. Entry point: `phone.py --port <port>` |
| `bot.py` | The call pipeline's parts (turn taking, call guard, voicemail detection, call records); also the `/a` browser test page (`index.html`) |
| `product.py` | Customers' agents, numbers and calls in Mongo (`voice_*` collections; shapes in `backend/src/db/types.ts`), signed URLs, sealed keys, each owner's own Gemini key |
| `tools.py`, `calendars.py` | Agent tools: booking (own calendar through Composio) and the owner's webhooks |
| `campaigns.py` | Outbound campaigns: the dialling loop, leases, retries, calling windows |
| `analysis.py` | Post-call analysis and caller memory |
| `costs.py` | Each call's cost (`voice_calls.cost`): Gemini tokens at list price (0 on a free-tier key), the phone minutes at the provider's list rate, then the provider's own charge after the call (Twilio's Call `price`, VoiceLink's call-log `total_cost`). Rates, sources and dates: `backend/src/db/voice-call-rates.json`, shared with the app |
| `twilio.py`, `voicelink.py` | Twilio and VoiceLink numbers (Telnyx is built into `phone.py`) |
| `fillers.py`, `fillers/` | The short "mm" and voicemail clips in each voice (shipped ones; others are made once and kept in `cache/`) |
| `prospect.py` | A fake prospect for test calls on the Telnyx path |
| `tests/` | Unit and end-to-end suites (below) |

## Setup

```bash
cd backend/voice
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
```

`.env` (next to the code, never committed) holds the keys: `GEMINI_API_KEY`, `VOICELAB_KEY` (the
secret shared with the app, its `VOICE_ENGINE_SECRET`), `TELNYX_API_KEY` and the Telnyx ids of Aixel
Labs' own line, `GROQ_API_KEY`, `COMPOSIO_API_KEY`. The database is **not** in `.env`: `bot.py` loads
`.env` with override, so a test would silently reach a real database. It comes from the process
environment (`MONGODB_URI`, `MONGODB_DB_NAME`), which `product.py` keeps over `.env`.

Other settings (environment): `PUBLIC_HOST` (host + path prefix carriers reach, default `localhost`),
`MAX_CALLS` (8), `CAMPAIGNS` (`off` stops the dialling loop), `SLOT_PORTS`, `LOG_LEVEL`, and the
`*_API_BASE` overrides the tests use to point at fakes.

## Service (VPS)

`aixel-labs-voice@<port>`, slots `8121` / `8122`, deployed like the others by `backend/deploy/deploy.sh`
(see `.cursor/skills/backend/backend-platform/SKILL.md`): `deploy.sh <sha> voice`. The unit
(`backend/deploy/aixel-labs-voice@.service`) runs `.venv/bin/python phone.py --port <slot>` from the
release, with `PUBLIC_HOST=api.aixellabs.in/voice` and the database from `service.env`.
Logs: `journalctl -u aixel-labs-voice@<port>`.

**State lives in the checkout, not in a release.** Untracked files in the checkout's `backend/voice`
are linked into every release by `deploy.sh` (as the workers' venvs are), so they survive deploys
and rollbacks:

| Path | What |
|---|---|
| `.env`, `service.env` | keys; the service's database (`MONGODB_URI`, `MONGODB_DB_NAME`) — edit, then redeploy |
| `.venv/` | the Python environment |
| `calls/`, `turns.jsonl` | a JSON record per call; per-turn latency |
| `suppressed.jsonl` | the do-not-call list (people who asked not to be called again) |
| `cache/` | voice clips made at runtime |
| `prompt.md` | the prompt of Aixel Labs' own line (read on every call) |

`deploy.sh` creates the state paths that do not exist yet before linking, so a release never starts
a copy of its own.

**SIGTERM drains** (a deploy stops the old slot once Caddy sends everything new to the other one):
no new calls from then on (`/texml` and `/twiml` answer with a short apology and hang up, a VoiceLink
call coming in is refused, `/play` refuses, `POST /calls` answers 503 `{"code": "draining"}`, the
campaign loop dials nobody and hands its campaigns over), `/health` answers 503 `draining`, and every
running call goes on to its end. The process exits once nothing is left (calls, campaign calls it
placed and has not settled, after-call analysis), at most `TimeoutStopSec` (1 h) later. Ctrl-C still
stops at once.

**Two slots at once**: campaign contacts are claimed one at a time by find-and-modify, so the two
never dial the same contact; a call one slot placed and the other received is found in the database.
Telnyx's pickup event for a call the old slot dialled reaches the new slot, which hands it over
(`SLOT_PORTS`).

## Tests

Every suite needs `MONGODB_URI` and `MONGODB_DB_NAME` in its own environment, a local throwaway
database (e.g. `AixelLabsVoiceEngineDev`), and refuses a real one (`tests/testdb.py`); end-to-end
suites also check that the engine they talk to uses the same database. Each suite's docstring has its
exact command (engine settings, fake ports). Most use real Gemini Live sessions, never a real phone.

```bash
export MONGODB_URI=mongodb://127.0.0.1:27018 MONGODB_DB_NAME=AixelLabsVoiceEngineDev
.venv/bin/python tests/tools_unit.py          # also: calendars_unit, agent_features_unit, campaigns_unit, guard_unit, costs_unit
.venv/bin/python tests/drain_e2e.py 8131      # starts its own two slots: SIGTERM drain + event handover
```

End-to-end: `product_e2e`, `tools_e2e`, `twilio_e2e`, `voicelink_e2e`, `gemini_key_e2e`,
`agent_features_e2e`, `calendars_e2e`, `campaigns_e2e`, `prefix_e2e` (through a local Caddy built
from the repo's Caddyfile).
