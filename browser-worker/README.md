# @aixellabs/browser-worker

Optional **Puppeteer** Express worker for Google Search and Google Maps scrape
paths that need a real browser. Production backend `/gsearch` is **browserless
CSE** and does not require this service.

## Quick start

```bash
pnpm --filter browser-worker run dev    # http://localhost:8080
pnpm --filter browser-worker run build
pnpm --filter browser-worker run prod
```

Copy `.env.example` → `.env`. Defaults: `PORT=8080`, Evomi residential proxy,
optional concurrency knobs (`MAX_BROWSER_SESSIONS`, `MAX_PAGES_PER_BROWSER`, …).

## Endpoints

| Method | Path | Role |
|--------|------|------|
| `GET` | `/ping` | Health |
| `POST` | `/gsearch` | Browser SERP scrape |
| `POST` | `/gmaps/scrape` | Maps scrape via browser |

Routes: `src/routes.ts` ← `ENDPOINTS` in `src/config.ts`.

## Layout

```
browser-worker/
├── src/
│   ├── server.ts
│   ├── routes.ts / config.ts
│   ├── handlers/     # gsearch, gmaps
│   ├── browser/      # pool, stealth, proxy
│   └── utils/
└── .env.example
```

## When to use

- Local experiments or flows that still expect a Puppeteer SERP/Maps worker.
- Not required for current product lead-gen that calls backend `/gsearch` (CSE)
  or `/gmaps/*` (HTTP).
