# Technical architecture — Bluff

Bluff is built as a sibling of Big Business: the same folder shape on both
sides, the same room and socket model, the same skin. This document says what
is reused as it is, what is copied and trimmed, and what is new.

## 1. Tenant and route model

Tenant record:

```text
name: bluff
label: Bluff
type: PRODUCT
```

`frontend/middleware.ts` already rewrites a `PRODUCT` tenant from
`bluff.<root domain>/…` to `/products/bluff/…`, so no middleware change is
needed. Locally the game is at `http://localhost:3003/products/bluff`.

## 2. Folder layout

```text
backend/src/api/bluff/
  constants.ts        # deck, rule numbers, routes, error texts (imported by the frontend)
  schemas.ts          # Zod schemas for client messages and commands
  types.ts            # game state, per-seat view, server messages
  engine/
    rules.ts          # createGame, applyCommand, tick, publicView. Pure: no I/O, no clock
    compute.ts        # read-only helpers shared with the frontend (canPlay, canCall, ranking)
    bot.ts            # the one move the stand-in bot makes
  room-store.ts       # rooms, seats, reconnect tokens, pause, bot pacing
  socket.ts           # WebSocket gateway on /bluff/ws
  handler.ts, index.ts  # GET /bluff/rooms/:code
  README.md

frontend/app/products/bluff/
  layout.tsx          # fonts + `.bb bl` wrapper; imports ../business/business.css and ./bluff.css
  page.tsx            # home
  [code]/page.tsx     # room
  bluff.css           # card table only, scoped under `.bb .bl-*`
  _components/
    BluffHome.tsx  BluffRoom.tsx  Lobby.tsx
    Table.tsx         # hud, felt, seats, pile, rank card, trash, rank strip, action bar, hand,
                      #   the reveal, and the animations played back from the log (useTableFx)
    Popups.tsx        # call picker, menu, how to play, activity, result
    bits.tsx          # PlayingCard, logo, the pop-up ("View table"), tips
  _hooks/use-bluff-room.ts
  _lib/client.ts      # storage keys (`bl:`), ws url
```

## 3. What is reused, and how

| Piece                                                                                        | Where it is today                                   | For Bluff                                                                                        |
| -------------------------------------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Skin: tokens, buttons, avatars, plates, pop-ups, ribbons, HUD, lobby, home, podium, confetti | `business/business.css` (scoped `.bb`)              | **Imported as it is.** The Bluff layout renders `<div class="bb bl">`.                           |
| Sounds                                                                                       | `business/_lib/sound.ts`                            | **Imported.** Bluff uses existing names (`card`, `siren`, `jail`, `paidOff`, `win`…).            |
| Haptics, toasts, emoji-safe names, ink-on-colour                                             | `business/_lib/haptic.ts`, `toast.tsx`, `client.ts` | **Imported.**                                                                                    |
| Avatars, icons, buttons, ticker, strikes                                                     | `business/_components/bits.tsx`                     | **Imported** where the component has no Business state in it.                                    |
| Socket hook: resume, reconnect, ping, clock offset, kicked/closed                            | `business/_hooks/use-business-room.ts`              | **Copied and retyped** (about 140 lines; only the types differ).                                 |
| Home and lobby screens                                                                       | `BusinessHome.tsx`, `Lobby.tsx`                     | **Copied and trimmed:** drop match length, salary cap, bail, teams; add turn time and match end. |
| Rooms, seats, tokens, kick, move, pause, end, close, idle expiry, bot pacing                 | `backend/.../business/room-store.ts`                | **Copied and trimmed** (about 300 lines; teams and the deadline list change).                    |
| Gateway: origin check, rate limit, per-seat broadcast, tick loop                             | `backend/.../business/socket.ts`                    | **Copied and trimmed** (about 200 lines).                                                        |
| Player colours                                                                               | `BUSINESS_PLAYER_COLORS`                            | **Imported.**                                                                                    |

### Why copy the room and socket files instead of sharing them now

Big Business is live and its working tree has unfinished changes in exactly
these files. Pulling them into a shared kit first would mean changing a live
game before Bluff has a single card on screen, and the right shape of that kit
is only clear once two games exist.

So v1 **imports** whatever is already free of game rules and **copies** the
two files that are tied to Business types. After Bluff ships, the two copies
are compared and the common part moves to `backend/src/api/_game/` and
`frontend/app/products/_kit/`. The third game then starts from the kit.

### The one change Big Business needed (done)

`attachBusinessSocket` closed every WebSocket upgrade whose path was not
`/business/ws`, which would have killed Bluff's socket. Each game now exports a
gateway (`createBusinessGateway`, `createBluffGateway`) and
`backend/src/api/game-sockets.ts` routes upgrades by path. `server.ts` calls
`attachGameSockets(server)`. `attachBusinessSocket` still exists for the
Business test scripts.

```text
/business/ws → business gateway
/bluff/ws    → bluff gateway
anything else → socket.destroy()
```


## 4. Backend wiring

- `config.ts`: `ENDPOINTS.BLUFF = "/bluff"`, plus `API_ENDPOINTS` entries.
- `routes.ts`: `app.use(ENDPOINTS.BLUFF, bluffRoutes)`.
- `server.ts`: attach the Bluff gateway next to the Business one.
- `backend/package.json` exports: `./bluff/constants`, `./bluff/types`,
  `./bluff/compute`, so the frontend imports rules and types rather than
  redefining them.
- No database. Rooms are a `Map` in the process, like Big Business.
- Needs the long-lived VPS process; not available on Vercel.

## 5. Game state

```ts
type Card = { id: number; rank: Rank; suit: Suit }; // id is unique across decks

type BluffGameState = {
    rev: number;
    phase: 'play' | 'reveal' | 'over';
    players: {
        seat: number;
        hand: Card[]; // never sent to other seats
        passed: boolean; // out of the current round
        missed: number; // strikes in a row
        place: number | null; // finishing place once out of cards or removed
        gone: boolean; // removed for missed turns, or left
    }[];
    turn: number; // seat to play or pass
    round: {
        rank: Rank | null; // null until the opener names it
        pile: Card[]; // every card played this round, in order
        lastPlay: { id: number; seat: number; count: number } | null;
        lockUntil: number; // end of the call window: no play or pass before this
    };
    nextPlayId: number; // every play gets a number; a Bluff call names the one it is against
    reveal: { caller: number; target: number; cards: Card[]; bluff: boolean; taker: number; until: number } | null;
    trash: {
        count: number; // cards out of the game
        said: Record<Rank, number>; // how many trashed cards were played "as" each rank
    };
    closed: Rank[]; // ranks with said[rank] >= 4 × decks
    deadline: number | null;
    log: Event[];
    seed: number;
};
```

`publicView(state, you)` is the only thing that leaves the server. It replaces
every other player's `hand` with a count and `round.pile` with a count. The
actual cards of the last play appear only inside `reveal`, after a call.
Trashed cards are dropped from the state altogether: only `trash.count` and
`trash.said` are kept, so there is nothing to leak. A self-play test asserts
that no view sent to seat A contains a card id held by seat B.

## 6. Commands

```text
play   { cards: number[], rank?: Rank }   // rank only when opening a round
pass
bluff  { play: number }                   // the id of the play being called
leave
```

Server checks:

- `play`: it is your turn; the call window is over; you have not passed; 1–4
  cards; every id is in your hand; `rank` is present and not closed when the
  round has no rank, absent otherwise.
- `pass`: it is your turn; the call window is over; the round has a rank.
- `bluff`: phase is `play`; you hold cards; `play` equals `round.lastPlay.id`;
  you are not `lastPlay.seat`. Any seat may send it, on or off turn.

Room-level messages are the same as Big Business:

```text
client → server   create | join | resume | peek | config | kick | move | start | pause | end | close | cmd | ping
server → client   joined | room | peek | kicked | closed | ack | error | pong
```

`team` is dropped (no teams in v1).

### Simultaneous actions

Node runs one message handler at a time and `applyCommand` is synchronous, so
commands for a room are applied strictly in arrival order. There are no locks
and nothing to deadlock on. Fairness comes from two things:

- **The play id.** A `bluff` that names a play which is no longer the last one
  (a newer play landed, or the pile was trashed, or a reveal has started) is
  refused. It can never hit a different play than the one the player saw.
- **Soft refusals.** A late `bluff` is answered with a `late` notice
  ("Meera called first" / "Too late"), not an error toast, and never counts as
  a strike.

The client also disables Bluff the moment it sends one, until the next
snapshot, so a double tap sends one message.

## 7. Tick

Runs four times a second, like Big Business.

- `phase: "play"`, the call window is over and no deadline is set: start the
  turn deadline for `turn`.
- `phase: "play"` and the deadline has passed: count a missed turn, then pass,
  or play one truthful card if the player had to open.
- After any pass: if every player still in the match except `lastPlay.seat`
  has passed, move the pile to the trash, add its size to `trash.said[rank]`,
  close the rank if it reached the limit, clear every `passed`, and let
  `lastPlay.seat` open.
- `phase: "reveal"` and `until` has passed: move the pile to `taker`, settle
  anyone who is now out of cards, clear every `passed`, set the next opener,
  back to `play`.
- Pause shifts `deadline`, `round.lockUntil` and `reveal.until` by the time
  spent paused.
- The stand-in bot acts for seats offline for more than 10 seconds.

## 8. Frontend

- The Table reads one snapshot and draws it. All card motion (slide to the
  pile, flip, fly to a player) is derived by comparing the previous snapshot
  with the new one, the way Big Business derives banners from its log.
- The hand is laid out by script: cards overlap just enough to fit the width,
  in one row up to 13 cards and two rows above that. It never scrolls the page.
- Selected cards live in local state until Play is pressed; a new snapshot
  drops any selected id that is no longer in the hand.
- Sizes use `--vh` and plain pixels or percentages, no container units and no
  `inset`, so the old iPads that Big Business supports keep working.
- Every pop-up is full-screen (`.pop`), never inside the felt.

## 9. Delivery order

1. Upgrade router in `server.ts` (the one Business change), verified with the
   existing Business socket smoke test.
2. `constants.ts`, `types.ts`, `schemas.ts`, `engine/rules.ts` with a
   self-play script: thousands of random matches, invariants on card counts
   (hands + pile + trash = deck size; a closed rank is never opened again) and on the per-seat view.
3. `room-store.ts`, `socket.ts`, route and config wiring, socket smoke test.
4. Frontend: layout, home, lobby, room hook.
5. Table: seats, pile, hand, action bar, call picker.
6. Reveal, banners, sounds, result screen.
7. Two-phone test at 375×667, then old-iPad check.
8. Tenant record, DNS for `bluff.aixellabs.in`, VPS deploy.

## 10. Security and operations

- Commands are intents, never state. The seat always comes from the reconnect
  token.
- A hand is only ever serialised for its own seat. This is the one rule Bluff
  adds to the Business model, and it has its own test.
- Same per-socket rate limit and message size cap as Big Business.
- No money, no betting, no transferable value.
- Deploying the backend restarts the process and ends every running match of
  both games. Deploy when no rooms are live.
