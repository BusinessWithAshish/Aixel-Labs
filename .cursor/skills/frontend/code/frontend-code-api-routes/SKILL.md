---
name: frontend-code-api-routes
description: >-
  Create or change Next.js App Router API routes under frontend/app/api/ in Aixel
  Labs (lead-gen scrape BFF, auth session, tenant public lookup, NL chat/query,
  image proxies). Use when adding a Route Handler, maxDuration, session checks,
  or choosing route vs server action.
---

# Frontend API routes (BFF)

Executor for `frontend/app/api/**`. Prefer **server actions** for cookie-authenticated
CRUD that only the React tree calls; use Route Handlers when the browser needs
`fetch` + `AbortSignal`, streaming, middleware, or image proxying.

Governor: `.cursor/rules/frontend/code/surfaces.mdc`.

## Route map (ownership)

| Route | Role | Owner skill |
|-------|------|-------------|
| `lead-gen/scrape` | Abortable scrape BFF → `generateLeads`; **no debit** | `frontend-business-lead-generation` |
| `auth/session` | Set/clear session cookie | `frontend-auth-session` |
| `tenant` | Public tenant by subdomain (middleware-safe) | `frontend-code-config` / `frontend-mutations-server-actions` (`getTenantByNamePublic`) |
| `nl-chat` | Multi-turn agent; session + rate limit + flag | this skill + `frontend-code-feature-flags` |
| `nl-query` | One-shot NL filter over posted data | this skill + `frontend-code-hooks` |
| `instagram/image`, `gmaps/image` | CDN image proxies + cache headers | this skill |
| `instagram/profile` | IG profile helper | this skill / lead-gen |
| `mongo-health-check` | Ops health | this skill |

## Default authenticated JSON handler

```ts
import { NextResponse } from 'next/server';
import { getAppSession } from '@/server/auth';

export const maxDuration = 60; // scrape uses 300

export async function POST(request: Request) {
    const session = await getAppSession();
    if (!session?.user?.id) {
        return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    // validate body (zod or type guard)

    // work… honor request.signal when forwarding to BE
    return NextResponse.json({ success: true, data });
}
```

### Conventions

- Return `ALApiResponse<T>` when matching product/action shape (`lead-gen/scrape`, `tenant`); some NL routes return raw JSON / error strings — match the existing route’s client.
- Long scrapes: set `export const maxDuration` and forward `request.signal` to `api-client`.
- Module ACL when scraping: `hasSubModuleAccess` (see `lead-gen/scrape/route.ts`).
- Public routes (`tenant`, image proxies, health): **no** `@/server/auth` / firebase-admin imports that break middleware.
- Browser callers use `appApiClient` + paths from `app-config` (`LEAD_GEN_SCRAPE_API_ROUTE`, etc.).

## NL chat / query (extend carefully)

- Chat: validate body → rate limit → `isNlChatEnabled` → `runAgentTurn`; schemas in `nl-chat/registry.ts` from **backend Zod**.
- Query: zod input → LLM transform → `executeTransformFunction`; session required.
- New NL chat module: flag (`frontend-code-feature-flags`) + registry entry + `NL_CHAT_MODULES` in hooks constants + page `FeatureFlagGate`.

## Image proxies

- Validate allowlisted CDN URL helpers (`helpers/instagram-image`, `gmaps-image`).
- Set `Cache-Control` + `Cross-Origin-Resource-Policy` like existing routes.
- Do not proxy arbitrary URLs (SSRF).

## Route vs server action

| Need | Use |
|------|-----|
| Abortable long scrape / streaming | Route Handler |
| Cookie session create for middleware-adjacent login | Route Handler (`auth/session`) or auth-actions (both exist — prefer existing paths) |
| Debit + Mongo CRUD from UI | Server action (`frontend-mutations-server-actions`) |
| Middleware tenant bootstrap | `GET /api/tenant` only |

## Related

- Scrape pipeline → `frontend-business-lead-generation`
- Debit/save → `frontend-mutations-server-actions` (`createUserLeads`)
- Session cookie semantics → `frontend-auth-session`
- Flags on NL chat → `frontend-code-feature-flags`
- Path constants → `frontend-code-config`
