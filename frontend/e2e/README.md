# Browser tests (Playwright)

End-to-end tests that drive the real Next.js app in Chromium. Nothing here touches
Atlas, the production Firebase project, or the scraper backend.

```bash
pnpm --filter frontend e2e        # services up, build if the app changed, run everything (~6 min)
pnpm --filter frontend exec playwright test e2e/lead-generation/credits.spec.ts   # one spec, needs a build
pnpm --filter frontend e2e:dev    # everything on `next dev`, one worker: no build, slow (~1 h)
pnpm --filter frontend e2e:ui     # Playwright's interactive UI, on `next dev`
pnpm --filter frontend e2e:walkthrough   # screenshot tour for visual review (not pass/fail)
pnpm --filter frontend e2e:services:down
```

The walkthrough (`walkthrough/*.walkthrough.ts`) saves a desktop and phone screenshot of every
lead-generation screen and form state to `node_modules/.cache/e2e/walkthrough/`, with a
`report.json` of console errors, failed requests and horizontal overflow.

First time on a machine: `pnpm --filter frontend exec playwright install chromium`.
Requires Docker.

## Why it is fast

| | Before | Now |
|---|---|---|
| App server | `next dev`, every route compiled on first hit | production build (`next start`) |
| Workers | 1, all specs share two users | 3, each with its own server, database and fake-API ports |
| Traces | recorded for every test | recorded only on the retry of a failed test |
| Full chromium run (VPS, 4 cores) | ~1 h 10 min | ~4.5–6 min, plus ~2 min when the app needs a rebuild |

- **Build.** `pnpm e2e:build` (`e2e/build.sh`) builds into `.next-e2e/`, apart from `next dev`'s
  `.next/`. It is skipped while the app source (frontend minus `e2e/`, plus `backend/src`) is
  unchanged since the last build; `FORCE=1` rebuilds. A plain `playwright test` runs whatever
  build is there and stops with a hint when there is none: rebuild after changing app code.
- **Workers.** `E2E_WORKERS` (default 3: the VPS has 4 cores, and a 4th or 5th worker was slower)
  sets both the workers and the servers. Use it rather than `--workers`, or tests land on a worker
  without a server.
- **`@local-fetch` tests.** A production build refuses to let the server call private addresses
  (`server/voice-agent/public-url.ts`), and three tests need exactly that: their fakes run on
  127.0.0.x. They are tagged with `LOCAL_FETCH` (`support/fixtures.ts`), left out of the
  production run and run after it on `next dev` by `pnpm e2e:local-fetch` (~1 min).
- **Retries.** A failing test is retried once, with a trace. A pass on retry is reported as flaky:
  fix it, do not ignore it. `--retries=0` while iterating on a broken spec.
- **Iterating on one spec.** `E2E_DEV=1 pnpm exec playwright test <spec>` skips the build; pages
  compile on first hit, so the first run of each route is slow.

## How a run is isolated

| Dependency | In tests | Where |
|---|---|---|
| MongoDB | `mongo:7` on `127.0.0.1:27018`, tmpfs, database `AixelLabsE2E` (worker 0), `AixelLabsE2E1`… | `docker-compose.yml` |
| Firebase Auth | Auth emulator on `127.0.0.1:9099`, project `demo-aixel-e2e` | `docker-compose.yml` |
| Backend (`BE_API`) | Closed port — an unmocked scrape fails fast | `support/env.ts` |
| Scrape BFF | Mocked in the browser with `mockScrape` | `support/lead-gen.ts` |

`playwright.config.ts` starts one server per worker on port **3103 + worker** with those values
forced over `.env`; the fakes' ports move up by 20 per worker (`support/env.ts`). `global-setup.ts`
then drops and reseeds every worker's database, signs both users in once (the session cookie
works on every port), and refuses to continue unless each server serves the tenant it just seeded.

The app is opened at `http://e2e.localhost:3103` (worker 0) — tenant `e2e`, seeded with:

| User | Storage state | Notes |
|---|---|---|
| `E2E_USER` | `USER_STORAGE_STATE` | full module access, 50 credits |
| `E2E_ADMIN` | `ADMIN_STORAGE_STATE` | admin, credits-exempt |

Sign-in skips the Google popup: setup mints the same `__session` cookie the app creates
(`createSessionCookie`) and saves it as storage state, so `getAppSession` runs unchanged.

## Writing a spec

```ts
import { expect, test } from '../support/fixtures';
import { USER_STORAGE_STATE } from '../support/env';
import { E2E_USER } from '../support/users';

test.use({ storageState: USER_STORAGE_STATE });
test.beforeEach(async ({ db }) => db.resetUser(E2E_USER));
```

- Tests run in parallel, each worker on its own database, and in any order: reset what the test
  uses in `beforeEach` (`resetUser`, `resetVoiceAgents`, …); pass `{ credits, moduleAccess }` to
  start from a different state. Never rely on what another test left behind.
- A fake API a spec starts must listen on its `E2E_*` base from `support/env.ts` (never a literal
  port), so each worker gets its own.
- A test whose server must call a fake on this machine takes `LOCAL_FETCH`.
- Assert on what was persisted through the `db` fixture, not only on what the UI shows.
- Import enums, routes and types from `@aixellabs/backend/…` and `@/config/app-config`
  rather than repeating strings.
- Never let a test reach a real scraper: mock `/api/lead-gen/scrape` with `mockScrape`.
- Wait for hydration before typing into a server-rendered form (see `openLeadGenForm`).

## Gotchas

- Traces, screenshots and sessions go to `node_modules/.cache/e2e`. Keep them out of
  `frontend/`: files written there mid-run put `next dev` into a rebuild loop.
- On `next dev` (`E2E_DEV=1`) do not run `pnpm dev` at the same time: both write to `.next`. Do not
  edit app files during a dev run either: hot reload makes server actions hang.
- Production servers are never reused: a server left on 3103–3105 (a killed run) fails the next run
  with "port in use". Find it with `ss -ltnp | grep 310` and kill it by PID.
- Production builds inline `NODE_ENV`, so anything the app does only outside production
  (loopback URLs, insecure cookies) behaves as in production here.
