# Technical architecture — Aixel Business

## 1. Tenant and route model

Create an existing Aixel tenant record with:

```text
name: business
label: Big Business
type: PRODUCT
```

The tenant record is configuration, not a replacement for the game route. The
game's initial Next.js surface should live at:

```text
frontend/app/products/business/
```

A `PRODUCT` tenant is rewritten by `frontend/middleware.ts` from
`business.<root domain>/…` to `/products/business/…`, so the same pages serve
both the subdomain and the plain local path. (An `EXTERNAL` tenant only
redirects, which is not what the game needs.)

## 2. Recommended service split

| Layer | Responsibility |
| --- | --- |
| Next.js product UI | Lobby, room, board, asset panels, event log, accessible interaction controls. |
| Guest session | Browser-held opaque reconnect credential scoped to one room and seat; no sign-in or Firebase identity. |
| Game API | Only room creation and code/link resolution need request-response HTTP; game play and state recovery run over WebSocket. |
| WebSocket gateway | Push snapshots, state revisions, timer updates, reconnect recovery, and accepted/rejected commands. |
| Game engine | Deterministic validation and transition functions; no browser dependencies. |
| In-memory room store | Room, seats, snapshot, event log, deadlines, and reconnect credentials while the VPS process is alive. |

The existing Express backend is appropriate for the authoritative game API,
engine, and WebSocket server because it is a persistent VPS process. Attach the
WebSocket upgrade handler to that same Node HTTP server; do not route game
commands through Next.js or poll for state. The Next.js app remains a thin,
responsive client. This v1 deliberately has no MongoDB writes.

## 3. Suggested backend module

```text
backend/src/api/business/
  index.ts             # Express router
  schemas.ts           # Zod request and command schemas
  engine/
    board.ts            # versioned board configuration
    rules.ts            # pure state transitions
    bots.ts             # deterministic bot decisions
    random.ts           # seeded PRNG
  room-store.ts         # process-local Map-based room storage and expiry
  socket.ts              # WebSocket connection, room broadcast, reconnect
  types.ts              # client-safe API/game types
```

This should be a new API module mounted via `backend/src/config.ts` and
`backend/src/routes.ts`. Game documents belong in the backend schema source of
truth; frontend code imports the shared types rather than redefining them.

## 4. Data model (proposal)

| Collection | Key data |
| --- | --- |
| `RoomStore: Map<roomCode, Room>` | room code, board version, host seat, match configuration, state snapshot, event sequence, expiry |
| `Seat` | seat number, display name, token, opaque reconnect-token hash, connection status |
| `GameEvent[]` | bounded, in-memory public event log used for state recovery and diagnostics |

Use one serialized command queue per room. Every accepted command increments a
revision and appends an event before the new snapshot is broadcast. Purge ended
or abandoned rooms by TTL. A VPS restart intentionally ends active rooms in
this v1; show that limitation in the lobby rather than implying persistence.

## 5. API surface (proposal)

```text
POST /business/rooms                 create private room
POST /business/rooms/:code/join      claim a guest seat and mint reconnect credential
GET  /business/rooms/:code/resolve   validate room code and redirect/open invite route
WS   /business/ws                     join, reclaim, start, command, snapshot, broadcast
```

The WebSocket handshake supplies room code plus opaque reconnect credential.
The server maps that credential to exactly one seat and never trusts a
client-provided player ID. Each command includes an idempotency key and expected
revision. Store the credential only in a secure browser cookie where possible;
the invite URL itself carries a room code, not the reclaim secret.

## 6. Delivery order

1. Confirm tenant-domain routing and VPS reverse-proxy support for WebSocket
   upgrades.
2. Add backend game types, pure engine, in-memory store, and deterministic
   engine tests.
3. Build a single-room vertical slice in `app/products/business`.
4. Add private room codes/invites, guest reconnect credentials, WebSocket
   recovery, and player-finance rules.
5. Add observability, rate limits, abuse controls, and external tenant setup.

## 7. Security and operations

- Treat all user input as commands, never state patches.
- Rate-limit room creation, join attempts, and game commands.
- Use opaque room codes with sufficient entropy; do not use sequential IDs in
  invitations.
- Record game engine version and board version inside active rooms for
  reproducible diagnostics.
- Do not put real-money, payment, or transferable-value mechanics in v1.
- Instrument room created/joined/started/finished, reconnects, command rejects,
  and bot actions for diagnosis.

## 8. As built (first playable version)

- Everything, including room creation and joining, runs over the one WebSocket
  at `/business/ws`. The only HTTP route is `GET /business/rooms/:code`.
- The reconnect token is kept in the browser's `localStorage`, per room, not in
  a cookie.
- The engine applies each command to a copy of the state and swaps it in on
  success. There is no idempotency key or expected revision yet.
- The frontend derives the socket address from `BE_API` in local dev. Production
  needs `NEXT_PUBLIC_BUSINESS_WS_URL` and WebSocket upgrades through the proxy.
- No bots module. Rate limiting is per socket (messages per window).
