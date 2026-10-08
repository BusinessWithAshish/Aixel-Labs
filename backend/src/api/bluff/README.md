# Bluff (`/bluff`)

Server for the Bluff card game: rules engine, in-memory rooms and the WebSocket
gateway. The UI lives in `frontend/app/products/bluff/`, and so do the rules in
words (`GAME_DESIGN_SPEC.md`). Built as a sibling of `../business/`.

## Layout

| File | Role |
|------|------|
| `constants.ts` | Deck, rule numbers, routes, error texts. Pure data, imported by the frontend. |
| `schemas.ts` | Zod schemas for client messages and commands. |
| `types.ts` | Game state, the per-seat view and server message types. |
| `engine/compute.ts` | Pure read-only helpers shared with the frontend (`bluffCanCall`, `bluffOnTurn`, deck and close counts). |
| `engine/rules.ts` | `createGame`, `applyCommand`, `tick`, `publicView`, `endMatch`. No I/O, no clock. |
| `engine/bot.ts` | `botCommand`: the honest move a stand-in makes for a player who dropped off. |
| `room-store.ts` | Process-local rooms, seats, pause and reconnect tokens. Runs the stand-in bot. No database. |
| `socket.ts` | WebSocket gateway on `BLUFF_ROUTES.WS`. `../game-sockets.ts` routes upgrades to it. |
| `handler.ts` / `index.ts` | `GET /bluff/rooms/:code` room summary. |

## Protocol

One WebSocket per player at `/bluff/ws`. Clients send intents, never state.

```text
client → server   create | join | resume | peek | config | kick | move | start | pause | end | close | cmd | ping
server → client   joined | room | peek | kicked | closed | ack | late | error | pong
commands (cmd)    play { cards, rank? } | pass | bluff { play } | leave
```

- The seat always comes from the reconnect token, never from the message.
- Each socket gets its own `room` view: only that seat's hand is in it. The pile and the trash
  are sent as counts. The called cards appear in `reveal` for everyone.
- `bluff` names the play it is against. If that play is no longer the last one, or someone
  else called first, the answer is `late` (a soft notice), never an error and never a strike.
- After a play the next player cannot play or pass for `HOLD_SECONDS`; anyone may call at once.
- `tick` runs four times a second: missed turns, the end of a reveal, and the pile going to the
  trash when everyone but the last player has passed.

## Limits to know

- Rooms live in memory. A backend restart ends every match (of both games).
- Needs a long-lived process, so it is not available on Vercel.

## Checks

`backend/experiments/` is gitignored; these scripts live there locally.

```bash
npx tsx experiments/bluff/selfplay.ts 4000        # random matches with invariants (card count, no leaked cards)
npx tsx experiments/bluff/cases.ts                # the rules, case by case
NODE_ENV=development npx tsx experiments/bluff/socket-smoke.ts
```
