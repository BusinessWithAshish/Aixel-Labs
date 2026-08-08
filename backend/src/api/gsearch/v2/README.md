# G-Search v2 — Docs Explore

`POST /gsearch/v2` — browserless Google search via the Docs Explore endpoint
(`docs.google.com/document/d/{id}/explore/search`). Returns organic results in
the same lead shape as v1 (`GSEARCH_RESULT` with `id`), plus Knowledge Graph
internally when present.

Research: [`COMPETITORS_FINDINGS.md`](../../../../experiments/google-search/COMPETITORS_FINDINGS.md) §0 / §10.1.

## Routing

| Condition | Backend |
|-----------|---------|
| No `timeFilter` (default) | Docs Explore — KG + organic |
| `timeFilter` set | CSE fallback (v1) — Docs Explore ignores date filters |

## Request

Same fields as v1, except **`timeFilter` has no default** (omit for Docs Explore).

```bash
curl -s -X POST http://localhost:8002/gsearch/v2 \
  -H 'Content-Type: application/json' \
  -d '{"searchQuery":"hello world","country":"US"}'
```

## Self-check (no network)

```bash
pnpm --filter @aixellabs/backend exec tsx src/api/gsearch/v2/compute/selfcheck.ts
```

## Reliability — doc ID pooling + retry

Docs Explore uses a public Google Doc ID purely as a routing key. Live smoke
testing (2026-08-08) found:

- A **single shared doc ID** gets soft-throttled by Google under repeated
  use — degraded from working to a consistent `HTTP 500` after heavy reuse
  during testing.
- Even a **fresh, unused doc ID** still returns an intermittent `HTTP 500`
  over the Evomi proxy roughly 10-20% of the time — baseline flakiness of
  this undocumented endpoint, unrelated to which doc ID is used.

Mitigations in `client.ts`:

1. `GSEARCH_V2_PUBLIC_DOC_IDS` is a pool (`constants.ts`), and each request
   picks a **random starting offset** into it — not just round-robin across
   pages of a single request, since `pages` defaults to `1` and would
   otherwise always land on the same ID.
2. Page 1 (the only page that matters — a failure here fails the whole
   request) retries up to `GSEARCH_V2_PAGE1_MAX_ATTEMPTS` times, each attempt
   with a fresh proxy session (new exit IP) and a fresh doc ID.

Net effect measured over 20 default (single-page) requests: **50% → 95%**
success rate. If reliability regresses, re-run the same measurement
(`fetchGsearchV2` in a loop, tally `success`) before assuming the fix is
still working — Google's tolerance for this endpoint is not documented and
may change.
