# Game design specification — Big Business

The rule numbers below are the single source of truth in code:
`backend/src/api/business/constants.ts`. Change them there, then update this file.

## 1. Design principles

- **Familiar, but original:** the classic property-trading format, with our own
  board, card text and artwork.
- **Server decides everything:** dice, cards, cash, ownership and timers.
  Clients send intents and draw what the server says.
- **Fast turns:** every phase has a timer and a default action, so an inactive
  player never blocks the table.
- **Deals are enforced:** loans and mortgages between players are visible,
  timed and settled by the server.

## 2. Match setup

| Setting | Rule |
|---|---|
| Players | 2–6 humans, solo or in teams. A simple bot stands in only for a player who has dropped off. |
| Starting cash | ₹2,500 (play money) |
| Salary | ₹500 each time a player passes or lands on Launch |
| Board | 48 spaces: 28 cities in 10 colour sets, 4 railways/airport, 2 utilities, 4 Chance, 4 Market, 2 levies, 4 corners |
| Dice | Two six-sided dice, rolled on the server |
| Match length | Host picks 30, 45 or 60 minutes, or no limit. At the bell the richest player wins; with no limit the match runs until one player is left. |
| Missed turns | Host picks 2, 3 or 5. A player who misses that many turns in a row is out. |
| Colours | Dealt at random when the match starts, from six that never look alike: red, blue, yellow, green, purple, pink. |
| Win | Last player not bankrupt, or highest net worth at the time limit |

Net worth = cash + property prices (a bank-mortgaged property counts half)
+ houses at cost − money owed on deals.

## 3. Board

Clockwise from Launch. Corners: Launch (0), Jail (12), Take a Break (24), Go to Jail (36).

| Set | Cities and prices | House cost |
|---|---|---:|
| Brown | Gaya 60, Puri 60 | 50 |
| Sky | Shimla 80, Leh 80, Ooty 100 | 50 |
| Pink | Ajmer 120, Kota 120, Jaipur 140 | 50 |
| Orange | Agra 160, Patna 160, Kanpur 180 | 100 |
| Red | Nagpur 200, Bhopal 200, Indore 220 | 100 |
| Yellow | Goa 240, Mysuru 240, Kochi 260 | 150 |
| Green | Ranchi 280, Surat 280, Mohali 300 | 150 |
| Blue | Thane 320, Nashik 320, Rajkot 340 | 200 |
| Purple | Pune 360, Noida 360, Vizag 380 | 200 |
| Black | Delhi 400, Mumbai 400 | 200 |

- **Railways and airport** (North Rail, Coast Rail, Metro,
  Airport): ₹200 each. Rent 25 / 50 / 100 / 200 for 1 / 2 / 3 / 4 owned.
- **Utilities** (Power, Telecom): ₹150 each. Rent is 4 × the dice
  total with one, 10 × with both.
- **Taxes:** Income Tax ₹200, Luxury Tax ₹100.

### Rent ladder (cities)

| State | Rent |
|---|---:|
| City alone | 10% of price |
| Whole colour set, no houses | 30% of price |
| 1 house | 1 × price |
| 2 houses | 2.5 × price |
| 3 houses | 4.5 × price |
| 4 houses | 6 × price |
| Hotel | 7.5 × price |

**Houses and mortgages never mix.** A colour set either has buildings or has
a mortgage in it, never both:
- To mortgage any property of a set (to the bank or to a player), every house
  in that set must be sold first.
- To build anywhere in a set, the player must own all of it outright: nothing
  mortgaged to the bank, nothing mortgaged to a player.
So a property whose rent is shared with a lender can never have houses or a
hotel, and rent sharing only ever applies to base rent (or the full-set rent).

On the board, houses are drawn on the property's colour band in the owner's
colour, all the same size (two rows of two at most; a hotel is one bigger
building with windows). A property mortgaged to the bank goes dark under one
big red bank mark. A property shared with a player keeps its look and carries
a handshake in the lender's colour on its colour band. The band
is a fixed size. The owner's marker sits just inside the board, centred on the
property. The board has no photos: each property is a cream card with the name
and the price written along the tile (bottom to top on the top and bottom
rows, left to right on the sides). Railways (grey-blue) and utilities (yellow)
have no colour band, since nothing is built on them; their icon sits there
instead. There are no photos anywhere: property cards, the small cards in the
player panel and in offers, and auction lots all use the set colour on cream. City names are six letters or fewer so
they fit a phone.

Screen: a full-screen button sits in the top bar wherever the browser allows it
(not iPhone Safari). In a short, wide window (a phone on its side) the board
fills the height on the left and the players sit on the right; in a short,
narrow window (split screen with another app) the board keeps a playable size
and the table scrolls.

Teams: two teams only (Alpha and Beta), of any sizes, or everyone solo.

Building needs the whole colour set with nothing mortgaged, and must be even:
no city more than one house ahead of another in its set. Four houses upgrade
to a hotel for one more house cost. A house sells back for half its cost.

## 4. Turn

```text
roll → (move, salary, landing) → buy | auction | card | market | break | debt → end → next player
```

| Phase | Timer | If the timer runs out |
|---|---:|---|
| Roll | 45 s | The turn is missed. |
| Buy decision | 20 s | The property goes to auction |
| Auction | 15 s | Highest bid wins |
| Chance card | 12 s | The card is applied |
| Market | 25 s | Skipped |
| Take a Break | 15 s | Keeps playing |
| Debt | 75 s | The player is bankrupt |
| End of turn | 30 s | Turn passes |

- **Doubles** give another roll, up to two extra. A third double in a row sends
  the player to Jail.
- **Managing** (build, sell houses, mortgage, redeem, offers) is allowed on your
  own turn, before rolling and before ending the turn.
- **Missed turns:** for a player who is connected but not playing (a player who
  dropped off is covered by the stand-in bot instead). A turn counts as missed
  when any of the player's own timers runs out in it (roll, buy, card, market,
  break or end of turn; at most one strike per turn). A blinking red strike
  shows on the player's plate and everyone hears the timeout. Rolling yourself
  clears the strikes. Reaching the host's limit on a roll timeout removes the
  player and returns their properties to the bank.
- **Out of time ends the turn:** once any of the player's timers runs out, the
  turn passes to the next player as soon as that step is settled (a property
  they did not buy is still auctioned). No extra roll for doubles, and no new
  choices (Chance, Market, Break) after landing.
- **Timer sound:** the last 5 seconds of any timer (turn, auction) tick for
  everyone at the table, timed on the server clock, and a buzzer sounds when a
  player's timer runs out.
- **Market closed:** landing on the Market without a property or enough cash
  shows a pop-up saying why, instead of nothing.
- **Trades:** everyone sees a "trade done" banner between the two players;
  what was swapped is never shown.
- Building a house shows no banner: the house just appears on the board.
- **Money moves** (buying, rent, salary, Chance cards, taxes, the Market, loans)
  are shown to everyone as a banner in the middle of the board, with who paid
  whom and a sound for each kind. Private deals stay private: only the two
  players see their loan and mortgage banners.
- **Teams:** the lobby has two tabs, "Team vs Team" and "Solo"; the host picks.
  Team play is always two sides, Team Alpha and Team Beta, of any sizes (2v2,
  3v3, 1v4, …). The lobby shows three columns: Team Alpha, Players (not placed
  yet) and Team Beta. The host moves players with the arrows; guests see the
  same columns without arrows. The match starts once every player is placed
  and both teams have someone. Teammates share one colour, pay no rent to each
  other, and win together: the match ends when one team is left, or at the
  bell the team worth the most wins. Colour sets, cash and deals stay
  personal; teammates can trade.
- **Start:** when the host presses Start, everyone sees a 3, 2, 1, Go! countdown
  before the table.
- **Pause:** the host has a pause button during the match. Everyone sees a
  "Game paused" curtain, every clock stops, and the time is given back on resume. If the host
  drops off while it is paused, the match restarts by itself after a minute.
- **Host leaving:** the room closes for everyone. Any other player leaving
  counts as bankruptcy.
- **Dropping off:** a player whose connection is lost keeps their seat. They
  get 10 seconds to come back. If their turn timer runs out inside those 10
  seconds, that turn is simply missed. After that a bot plays for them, one
  move at a time, until they reopen the link. The bot rolls, buys when it keeps ₹150, bids up to 90% of the price,
  skips the Market, builds when it has ₹600 to spare, and raises cash or goes
  bankrupt when in debt. It never starts deals. It answers offers by
  arithmetic: a trade must give it at least 5% more than it gives (with a 50%
  premium on anything that completes or breaks a colour set); it lends at most
  30% of its cash at 10% interest or more; it borrows only when below ₹300.
  A player who is connected but idle still gets missed-turn strikes.
- **Lobby:** the host can remove a player before the match starts (two taps).
  An invite link shows whose room it is before the guest types a name.
- **Leaving:** a player may leave at any time from the menu. It counts as
  bankruptcy and their properties return to the bank.

## 5. Landing rules

- **Unowned property:** buy at the printed price, or send it to auction. A
  player who cannot afford it goes straight to auction.
- **Auction:** open bidding, everyone still in the match may bid. Opens at half
  price, minimum raise ₹5, 15-second countdown shown on screen. A bid in the
  last 5 seconds resets the countdown to 5. No bids: it stays unowned.
- **Owned property:** pay rent. No rent on a property mortgaged to the bank.
- **Chance:** one deck of 12 cards — four pay (₹50–₹200), six cost (₹100–₹250,
  ₹40 per property owned, and ₹50 per house / ₹150 per hotel), "go back 3 spaces" and
  "go to Jail".
- **Market:** a player who owns a property may stake ₹10–₹1,000 (never more
  than their cash) and two dice are rolled: 2–5 loses half the stake, 6–8
  nothing, 9–12 wins the stake again. The two outer ranges are equally likely
  (10 in 36 each), so on average the player gains about 14% of the stake.
- **Take a Break:** choose to rest (skip your next turn) or keep playing.
- **Go to Jail:** move to Jail, no salary. Everyone sees a Jail banner: "Sent
  to Jail", "Chance: go straight to Jail", or for three doubles in a row
  "Overspeeding!".
- **Launch:** passing or landing on Launch pays ₹500. Going back onto Launch
  with "go back 3 spaces" pays the salary again (only the salary; it does not
  count as a new lap for loans and deals). The salary banner shows the moment
  the pawn reaches Launch, before whatever it lands on.
- **Jail:** roll doubles to leave free. After two misses, on the third turn you
  leave anyway and pay ₹100. You may also pay ₹100 before rolling.

## 6. Raising cash

- **Bank mortgage:** receive half the price. The property earns no rent.
  Redeem for 55% of the price. Not allowed while the colour set has houses.
- **Shared rent, both ways:** when a property is mortgaged to a player, each
  of the two pays the other's part if they land on it: the lender pays the
  owner's share, the owner pays the lender's share. Everyone else pays both.
  Nobody is exempt, so a two-player game with shared properties still moves money.
- **Mortgage to a player:** the owner keeps the property. The other player pays
  an agreed amount now and receives an agreed share (0–100%) of every rent; an
  odd rupee goes to the owner. The owner has an agreed number of laps (1–6) to
  pay the amount back; if not, the property moves to the lender.
- **Cash loan:** pure cash between two players. They agree the amount, the
  interest (0–100%), the laps to repay (1–6), and when interest is paid:
  **each lap** (the interest is paid to the lender every time the borrower
  passes Launch, and the amount at the end) or **at the end** (amount plus
  interest together). A lender can lend at most 70% of the cash they hold.
- **Loan due:** when the laps run out, nothing is taken automatically. Once the
  landing is settled, the borrower gets a "Loan due" pop-up (40 s): pay it all
  now (even if that leaves them short, which leads to raising cash), or ask the
  lender to extend it: pay part now, borrow more from the same lender, and set
  new interest and laps. The lender accepts or rejects; on a reject or no answer
  the whole amount is paid.
- **Trade:** cash and properties both ways. Cities in a set with houses, and
  properties shared with a player, cannot be traded. A property mortgaged to
  the bank can be traded: it stays mortgaged, and the new owner earns no rent
  from it until they redeem it (55% of the price). The trade screen shows
  every property and fades the ones that cannot be traded; tapping one says why.
- **Table-wide limits:** at most 3 cash loans may be running at once, and at
  most 3 properties may be shared with players at once, counted across all
  players. A new one needs an old one to be paid back first.
- **One mortgage at a time:** a property mortgaged to the bank cannot also be
  shared with a player, and a property shared with a player cannot be
  mortgaged to the bank.

Offers are made on your own turn, to one player at a time, and expire after
45 seconds or when the turn ends. Sending an offer keeps the turn open long
enough for the other player to answer.
Offers, and the log lines about loans, mortgages to a player and trades, are
shown only to the two players involved. The rest of the table sees a banner
that the deal happened (who with whom, and the property for a mortgage), never
the amounts or terms. A property mortgaged to a player carries a handshake in
the lender's colour on its board marker, and the player panel lists each one.

## 7. Debt and bankruptcy

A payment always goes through; the payer's cash may go negative. While it is
negative the player cannot continue and has two choices:

- **Repay debt:** sell houses, mortgage to the bank or to a player, trade, or
  ask for a loan, until cash is zero or more. Options that the player has
  nothing for are disabled; asking for a loan is always available.
- **Bankruptcy:** the player is out. The same settlement applies however they
  go out (bankrupt, leaving, or removed for missed turns), and debts are settled
  in cash only. Nobody ever receives a bankrupt player's properties:
  1. A property shared with a player goes to that lender (it was the security).
  2. Everything else is sold to the bank: each house at half its cost, each
     property at half its price (nothing for one already mortgaged to the
     bank), plus any cash in hand. That is the pot.
  3. The pot pays the players owed: unpaid rent or loan money from this turn,
     and every cash loan still running (due or not). If the pot covers
     everything, each is paid in full and the rest goes to the bank. If not,
     each gets a share in proportion to what they are owed, and the rest of
     their money is lost. The bank never tops it up.
  4. All the properties return to the bank, unowned, and can be bought again.
  A loan the bankrupt player had given to someone is cancelled: the borrower
  keeps the money. A property someone had shared with the bankrupt player is
  theirs again in full.

## 8. Integrity

- The seat is taken from the reconnect token, never from the message.
- Commands are validated against the current phase and player, applied to a
  copy of the state, and rejected whole if any rule fails.
- Dice and the Chance order come from a seeded generator kept on the server.

## 9. Not decided yet

- Final Chance card list and wording.
- Whether the Market stake range (₹10–₹1,000) is right, and whether the Market
  should stay in the player's favour.
- Whether missed-turn strikes should clear after a played turn (they do now).
- Tile photos come from Unsplash and are loaded from its CDN. A few were picked
  from search results without being checked against the city.
- The economy was simulated before the Market game, the new Chance deck and the
  optional break were added. It should be re-run with them.
