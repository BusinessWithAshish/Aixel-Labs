# Claude Delegation API

Sync HTTP + MCP API that delegates a task to Claude Code on the local Claude
subscription (flat-rate, not metered API credits). Port of
`hermes-claude-mcp` — that standalone server is retired; this backend service
replaces it for every caller (Hermes profiles, n8n, anything else on this
VPS or reachable network).

## Why this stays on the flat subscription

Shells to `claude -p` — genuine first-party Claude Code, its own system
prompt, its own tools, its own agent loop. Background (a Hermes profile's
SOUL.md/memories, if `home_dir` points at one) is passed as *task content* in
the user turn, exactly what you'd paste into a Claude Code session by hand.
The system prompt is never overridden — that's the one thing that keeps this
off extra-usage billing. `ANTHROPIC_API_KEY` is stripped from the child
environment so the CLI can't silently fall through to metered API billing.

**VPS only** — every endpoint (including `/claude/budget`) refuses to run
unless `AIXEL_VPS=1` is set, so this can't accidentally shell out on a
developer's own machine and burn real usage against their subscription.

## Endpoints

| Method | Path | Role |
|--------|------|------|
| `POST` | `/claude` | Delegate a task (sync; can take several minutes on a cold session) |
| `GET` | `/claude/budget` | Shared daily delegation budget status |

Also exposed as the `claude` MCP tool (ops `ask` and `budget_status`).

## Request (`POST /claude`)

```json
{
  "task": "…",
  "session_id": null,
  "model": null,
  "effort": null,
  "home_dir": "/home/ubuntu/.hermes/profiles/killjoy",
  "allow_tools": null,
  "max_turns": 12,
  "timeout_seconds": 600
}
```

- `home_dir` is generic on purpose, not Hermes-specific: it's the CLI's cwd,
  and on a **new** session (no `session_id`) it's also checked for
  `SOUL.md` / `memories/USER.md` / `memories/MEMORY.md` — if present, those
  are read and prepended as background. Pass a Hermes profile directory to
  get that profile's context automatically; pass any other directory (or
  omit it) for a plain delegation with just that cwd, no bundle.
- `session_id`: continue a previous delegation — cheap, reuses the prompt
  cache (measured: 13 output tokens vs ~21K entry cost for a fresh session).
  Prefer one session with follow-ups over several fresh calls.
- `allow_tools`: comma-separated Claude Code tools. Default read-only
  (`Read,Grep,Glob,WebSearch,WebFetch`) — delegation is for thinking, not
  silently mutating the filesystem. Add `Write,Edit,Bash` only when the task
  must change files.

## Response

```json
{ "success": true, "data": { "ok": true, "session_id": "…", "text": "…", "usage": { "input_tokens": 0, "output_tokens": 0 } } }
```

`ok: false` covers both transport failures and soft blocks — a daily-budget
block, or Claude itself reporting a usage limit / third-party-billing notice.
Both are reported as errors rather than valid answers, and both say
"do not retry" explicitly: retrying a limit/billing block just burns another
call for the same rejection.

## Budget ledger

Shared across **every** caller — same ledger file
(`/home/ubuntu/.claude-delegate-budget.json` by default) `hermes-claude-mcp`
used, so moving a caller here doesn't reset the daily count. Deliberately
global, not per-caller: the Claude subscription quota is per-account, so a
per-caller budget would let each caller spend "their" allowance and blow
through the account limit many times over. Resumes are always allowed even
when the breaker has tripped — they cost a fraction of a cold start.

Env: `CLAUDE_DAILY_SESSIONS` / `CLAUDE_DAILY_TOKENS` (0/unset = unlimited,
tracked but never blocks), `CLAUDE_BUDGET_FILE` (ledger path override).

## Smoke

```bash
curl -sS -X POST http://127.0.0.1:8002/claude \
  -H 'content-type: application/json' \
  -d '{"task":"Reply with exactly: pong"}' | jq .

curl -sS http://127.0.0.1:8002/claude/budget | jq .
```
