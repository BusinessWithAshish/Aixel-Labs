# Big Business — product planning

`business` is a future external-tenant product: an original, browser-first
property-trading board game. It is intended to be reachable at
`business.aixellabs.in` once the tenant and DNS are configured.

## Status

First playable version. Private rooms, 2–6 players, the full turn loop,
auctions, houses and hotels, bank mortgages, loans, mortgages to a player,
trades, Chance, Market, Jail, bankruptcy and the time limit all work locally.
Not done: tenant record and DNS, production WebSocket address, real artwork,
automated tests in CI.

## Run it locally

```bash
pnpm --filter backend run dev     # game server (WebSocket on the backend port)
pnpm --filter frontend dev        # http://localhost:3003/products/business
```

Create a room, then open the invite link in another browser (or on a phone on
the same Wi-Fi, using the laptop's IP address instead of `localhost`). Two tabs
of the same browser share one seat, so use a second browser or a private window.

## Where the code is

- Rules, rooms and socket: `backend/src/api/business/` (see its README)
- Screens: `_components/`, socket hook: `_hooks/`, helpers: `_lib/`
- Skin: `business.css`, scoped under `.bb`

## Product documents

- [PRD](./PRD.md) — user problem, scope, modes, and release plan
- [Game design specification](./GAME_DESIGN_SPEC.md) — original game rules and
  deterministic resolution rules
- [Technical architecture](./TECHNICAL_ARCHITECTURE.md) — how the product fits
  into the existing Aixel Labs frontend, backend, auth, and tenancy systems

## Reference boundary

The public description of the Android app *Business Game* informed the genre
and broad feature expectations (turn-based property trading; human, bot, and
private-room play). This product must not reuse that app's name treatment,
board layout, city/property set, cards, art, sound, copy, code, or other
assets. All implementation material is to be created independently.

## Working decisions

- Tenant: `business`, type `EXTERNAL`
- Public host: `business.aixellabs.in`
- Product name for now: **Big Business**
- Launch platform: responsive web, desktop-first and tablet-friendly
- Core release: invite-only private rooms; no sign-in, bots, or public matchmaking
- Tenant type: `PRODUCT`, so the middleware rewrites the subdomain to `/products/business`
