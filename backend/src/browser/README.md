# Browser (Puppeteer)

Real-Chrome scraping for Google Search and Google Maps, moved here from the old
standalone `browser-worker` service. **Parked: nothing imports it and no route is
mounted**, so it adds no load and no API surface. Production `/gsearch` and `/gmaps`
stay on TLS + Evomi. Keep this as the fallback for when those get blocked
(`api/gsearch/RECOVERY.md`).

## Layout

| Path | Role |
|------|------|
| `core/browser.ts` | Finds the installed Chrome, launch flags, proxy flag |
| `core/browser-batch-handler.ts` | Browser pool, pages per browser, retries |
| `core/stealth-handlers.ts`, `core/bot-stealth-inject.js` | Viewport, headers, anti-detection script |
| `core/console-debugger.js` | Paste-into-DevTools pagination stress test; not imported |
| `gsearch/` | Browser SERP scrape (homepage warm-up, then `gsearch-injector.js`) |
| `gmaps/` | Maps listing search, then per-business details |
| `routes.ts` | `registerBrowserRoutes(app)`; not called anywhere |

## Turning it on

1. Add auth first. These handlers came from a private worker and check nothing, and each
   call spends Chrome memory and Evomi proxy budget.
2. Mount through `config.ts` + `routes.ts`, per the `backend-platform` skill. Prefer calling
   `fetchGSearch` from an `api/` module over exposing the raw routes.
3. Check memory. `MAX_BROWSER_SESSIONS` (10) x `MAX_PAGES_PER_BROWSER` (5) is far more
   than this VPS should run alongside everything else, so lower both.

## Env

`EVOMI_PROXY_*` (shared `PROXY_CONFIG`). Optional: `CHROME_EXECUTABLE_PATH`,
`MAX_BROWSER_SESSIONS`, `MAX_PAGES_PER_BROWSER`, `MAX_RETRIES`, `RETRY_DELAY`,
`RETRY_JITTER_MS`.

Chrome must be installed on the machine; `puppeteer-core` never downloads one. `.js` files
are injected into pages and read from `src/` at runtime, because `tsc` doesn't copy them.
