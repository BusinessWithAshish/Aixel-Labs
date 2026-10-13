# Browser tests (Playwright)

End-to-end tests that drive the real Next.js app in Chromium. Nothing here touches
Atlas, the production Firebase project, or the scraper backend.

```bash
pnpm --filter frontend e2e        # start services, run everything
pnpm --filter frontend e2e:ui     # same, in Playwright's interactive UI
pnpm --filter frontend exec playwright test e2e/lead-generation/credits.spec.ts
pnpm --filter frontend e2e:walkthrough   # screenshot tour for visual review (not pass/fail)
pnpm --filter frontend e2e:services:down
```

The walkthrough (`walkthrough/*.walkthrough.ts`) saves a desktop and phone screenshot of every
lead-generation screen and form state to `node_modules/.cache/e2e/walkthrough/`, with a
`report.json` of console errors, failed requests and horizontal overflow.

First time on a machine: `pnpm --filter frontend exec playwright install chromium`.
Requires Docker.

## How a run is isolated

| Dependency | In tests | Where |
|---|---|---|
| MongoDB | `mongo:7` on `127.0.0.1:27018`, tmpfs, database `AixelLabsE2E` | `docker-compose.yml` |
| Firebase Auth | Auth emulator on `127.0.0.1:9099`, project `demo-aixel-e2e` | `docker-compose.yml` |
| Backend (`BE_API`) | Closed port — an unmocked scrape fails fast | `support/env.ts` |
| Scrape BFF | Mocked in the browser with `mockScrape` | `support/lead-gen.ts` |

`playwright.config.ts` starts `next dev` on port **3103** with those values forced over
`.env`. `global-setup.ts` then drops and reseeds the database, signs both users in, and
refuses to continue unless the running app serves the tenant it just seeded.

The app is opened at `http://e2e.localhost:3103` — tenant `e2e`, seeded with:

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

- Specs share the two seeded users, so they run serially (`workers: 1`). Reset the user in
  `beforeEach`; pass `{ credits, moduleAccess }` to start from a different state.
- Assert on what was persisted through the `db` fixture, not only on what the UI shows.
- Import enums, routes and types from `@aixellabs/backend/…` and `@/config/app-config`
  rather than repeating strings.
- Never let a test reach a real scraper: mock `/api/lead-gen/scrape` with `mockScrape`.
- Wait for hydration before typing into a server-rendered form (see `openLeadGenForm`).

## Gotchas

- Traces, screenshots and sessions go to `node_modules/.cache/e2e`. Keep them out of
  `frontend/`: files written there mid-run put `next dev` into a rebuild loop.
- Do not run `pnpm dev` and the suite at the same time — both write to `.next`.
- The first hit of each route compiles it, so navigations get a 60s budget.
