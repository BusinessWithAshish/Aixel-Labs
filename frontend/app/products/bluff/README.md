# Bluff — product planning

`bluff` is the second Aixel game: the card game friends in India call Bluff or
Challenge, played online in a private room. It is built on what Big Business
already has (rooms, invite links, seats, timers, missed-turn strikes, the
stand-in bot, host controls, banners, sounds and the whole skin), so the new
work is only the card rules and the card table.

## Status

First playable version (2026-10-08). Rules engine, rooms, socket, home, lobby
and the card table all work locally, and a three-browser match has been
played end to end. Not done: tenant record and DNS for `bluff.aixellabs.in`,
deploy to the VPS, a check on a real phone.

## Product documents

- [PRD](./PRD.md) — who it is for, what v1 contains, what it leaves out
- [Game design specification](./GAME_DESIGN_SPEC.md) — the rules, turn by turn,
  with examples, timers and what the bot does
- [Technical architecture](./TECHNICAL_ARCHITECTURE.md) — folder layout, what is
  reused from `business`, what is new, protocol, delivery order

## Where the code will be

Same shape as Big Business, one folder each side:

- Rules, rooms and socket: `backend/src/api/bluff/`
- Screens: `frontend/app/products/bluff/_components/`, socket hook in `_hooks/`,
  helpers in `_lib/`
- Skin: the Big Business stylesheet (`../business/business.css`, scoped `.bb`)
  plus `bluff.css` for the card table only

## Working decisions

- Tenant: `bluff`, type `PRODUCT`; public host `bluff.aixellabs.in`
- Product name for now: **Bluff**
- Mobile first: every screen fits one phone screen with no page scroll
  (checked at 375×667), the same rule as Big Business
- Private rooms only, 2–6 players, no sign-in, play money or no money at all
- The look is the Big Business look: same fonts, buttons, avatars, pop-ups,
  banners and sounds. Only the middle of the table changes: a felt with a
  card pile where the board was

## Rules confirmed (2026-10-08)

- The opener names a rank; everyone after plays 1 to 4 cards "as" that rank.
- A pass puts you out of the round. You can still call Bluff.
- Anyone holding cards can call Bluff at any time, on the last play.
- A pile nobody calls goes to the trash. Four cards said to be one rank in
  the trash close that rank for the rest of the match.
- The match plays on until one player is left holding cards.

Still open: jokers (off for now) and the length of the call window (3 seconds
for now). See section 12 of the game design spec.
