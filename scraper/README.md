# scraper (Python sidecar)

Legacy **FastAPI + Botasaurus** service for Google search link extraction and
Instagram profile helpers. **Not** on the product critical path — prefer the
Node scrapers in `backend/src/api` for lead-gen. Not included in root
`installAll` / `devAll`.

## Quick start

```bash
pnpm --filter scraper run setup   # venv + requirements.txt
pnpm --filter scraper run dev     # DEBUG + headed browser
pnpm --filter scraper run start
```

Or: activate `venv/` / `uv` and run `python main.py`.

## Port

| Source | Default |
|--------|---------|
| `.env.example` | **8003** |
| `config.py` if `PORT` unset | **8000** |

Set `PORT=8003` in `scraper/.env` to match the example.

## Routes

| Method | Path | Role |
|--------|------|------|
| `GET` | `/health` | Health |
| `POST` | `/api/search` | Google search scrape |
| `POST` | `/api/instagram/profiles` | Batch profiles |
| `GET` | `/api/instagram/profile` | Single profile |
| `POST` | `/api/instagram/open-signup` | Signup flow helper |
| `GET` | `/api/instagram/validate` | Validate handles/URLs |

JSON envelopes use `ALApiResponse` (`api/responses.py`), aligned with the
backend.

## Env / proxy

See `.env.example`: `HEADLESS`, `PROXY_URL` (optional), or Evomi
(`EVOMI_PROXY_*`) — same naming style as backend.

## Agents

Botasaurus patterns: `.cursor/skills/external/botasaurus/SKILL.md`.
