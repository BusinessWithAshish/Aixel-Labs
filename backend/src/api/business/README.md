# Big Business (`/business`)

Server for the Big Business board game: rules engine, in-memory rooms and the
WebSocket gateway. The UI lives in `frontend/app/products/business/`.

## Layout

| File | Role |
|------|------|
| `constants.ts` | Board (48 spaces), rule numbers, Chance deck, routes. Pure data, imported by the frontend. |
| `schemas.ts` | Zod schemas for client messages, commands and offer terms. |
| `types.ts` | Game state, room view and server message types. |
| `engine/compute.ts` | Pure read-only helpers (rent, `can*` checks, net worth, offer validation). Shared with the frontend so buttons enable on the same rules. |
| `engine/rules.ts` | `createGame`, `applyCommand`, `tick`. Deterministic; no I/O, no clock. |
| `engine/bot.ts` | `botCommand`: the one move a stand-in bot makes for a player who dropped off. Pure arithmetic, never starts deals. |
| `room-store.ts` | Process-local rooms, seats, teams, pause and reconnect tokens. Runs the stand-in bot for absent seats. No database. |
| `socket.ts` | WebSocket gateway on `BUSINESS_ROUTES.WS`, attached in `server.ts`. |
| `handler.ts` / `index.ts` | `GET /business/rooms/:code` room summary. |

## Protocol

One WebSocket per player at `/business/ws`. Clients send intents, never state.

```text
client → server   create | join | resume | peek | config | team | kick | start | pause | close | cmd | ping
server → client   joined (seat + reconnect token) | room (full view) | peek | kicked | closed | ack | error | pong
```

- The seat always comes from the reconnect token, never from the message.
- Every accepted change broadcasts a full `room` view to each socket in the room.
- `tick` runs four times a second: a phase deadline counts a missed turn and
  takes the default action (auction on an undecided purchase, turn passes on),
  offers expire, and the match ends on net worth at the time limit.
- `config`, `team`, `kick`, `start`, `pause` and `close` are host-only. `close`
  (or the host leaving a match) deletes the room and sends `closed` to everyone.
- While paused nothing ticks and commands are refused; on resume every deadline
  is pushed back by the time spent paused.
- A seat with no socket for 10 seconds is played by `botCommand`, one move at a
  time, until its player resumes.
- Each socket gets its own view: offers and private log lines are filtered per seat.

## Limits to know

- Rooms live in memory. A backend restart ends every match.
- Needs a long-lived process, so it is not available on Vercel.
- In production the browser needs the public `wss://` address:
  set `NEXT_PUBLIC_BUSINESS_WS_URL` on the frontend. The reverse proxy must
  forward WebSocket upgrades for `/business/ws`.

## Checks

`backend/experiments/` is gitignored; the two scripts below live there locally.

```bash
npx tsx experiments/business/selfplay.ts 600      # random players play full matches with invariants
npx tsx experiments/business/bot-test.ts          # the stand-in bot: offer maths + all-bot matches
NODE_ENV=development npx tsx experiments/business/socket-smoke.ts
```
