# Game design specification — Bluff

The rule numbers below will be the single source of truth in code:
`backend/src/api/bluff/constants.ts`. Change them there, then update this file.

Rules confirmed by Ashish on 2026-10-08: the rank is fixed for the round and
later players only add cards "as" that rank; a pass puts you out of the round;
anyone may call Bluff at any time; a pile nobody challenges goes to the trash;
a rank with four claimed cards in the trash is closed; the match plays on to
the last player.

## 1. Design principles

- **The game friends already play.** These are the Indian Bluff (Challenge)
  rules as Ashish's group plays them.
- **The server decides everything:** shuffle, deal, whose turn, what the pile
  holds, who was lying, and who tapped first. A phone is sent its own cards
  and nothing else.
- **Fast turns.** Every turn has a timer and a default action, so one slow
  player never stops the table.
- **One big moment.** The reveal after a Bluff call is where the fun is.
  Everything else stays quick and quiet so that moment stands out.

## 2. Match setup

| Setting      | Rule                                                                                                                |
| ------------ | ------------------------------------------------------------------------------------------------------------------- |
| Players      | 2–6. Best with 4 or more.                                                                                           |
| Decks        | One deck of 52 for 2–4 players, two decks (104) for 5–6, set by the number of players. No jokers.                   |
| Deal         | All cards are dealt, one at a time, starting with a random player. Some players may hold one card more than others. |
| First turn   | The player who got the first card opens the first round.                                                            |
| Turn order   | Clockwise, in the order the host set in the lobby.                                                                  |
| Turn time    | 90 seconds (host may pick 30 or 60).                                                                                |
| Missed turns | Host picks 2, 3 or 5. A player who misses that many turns in a row is out.                                          |
| Colours      | Dealt at random at the start, the same six as Big Business.                                                         |
| Win          | The first player to get rid of every card.                                                                          |

## 3. A round

A round has **one rank** (Aces, Kings, 7s…). The table always shows it: it is
a big card on the felt next to the pile, it is lit up on the rank strip under
the felt, and it is written on the Play button.

1. **Opening.** The player who opens picks 1 to 4 cards, puts them face down
   and names a rank: "Kings". Only the rank is named, never the suit, and the
   cards can really be anything. That rank is now the rank of the round.
2. **Every next player still in the round**, in turn, does one of two things:
    - **Play as K:** put 1 to 4 cards face down on the pile. They do not pick a
      rank and do not have to match the number the last player put down. Two
      cards after someone's three is fine. The cards can really be anything.
    - **Pass:** play nothing. A player who passes is **out of this round**:
      their turn is skipped until the round ends. They can still call Bluff.
3. **The round ends** in one of two ways:
    - Someone calls Bluff (section 4).
    - Everyone except the player who played last has passed. The pile goes to
      the trash (section 5).

### Example

Four players: Ashish, Meera, Kabir, Zoya.

- Ashish opens with 2 cards: "Kings". (Really a King and a 4.)
- Meera plays 1 card as a King. (Really a King.)
- Kabir passes. He is out of this round.
- Zoya plays 3 cards as Kings. (Really a 9, a 2 and a Jack.)
- Ashish plays 1 more as a King. Meera passes. Zoya passes.
- Kabir, Meera and Zoya have all passed, and Ashish played last: the round is
  over. The 7 cards go to the trash and Ashish opens the next round.

## 4. Calling Bluff

**Anyone can call, at any time**, as long as:

- they still hold cards (a player who has finished cannot call),
- they are not the player who made the last play, and
- there is a last play to call (a new round with no cards down has none).

A player who passed can still call. The call is always against the **last
play**: the cards the last player just put down. Older cards in the pile are
never checked.

The last-played cards turn face up for everyone.

| What the cards show                                    | Who takes the whole pile   | Who opens the next round   |
| ------------------------------------------------------ | -------------------------- | -------------------------- |
| At least one card is **not** the round's rank: a bluff | The player who played them | The caller                 |
| Every card **is** the round's rank: the truth          | The caller                 | The player who played them |

"The whole pile" is every card played in this round, not only the last ones.
Cards picked up go back into a hand, so they do not count towards the trash.

### The call window

The **Bluff button lights up on every screen the instant cards are played**.
Nobody waits to call.

The 3 seconds are a short hold on the **next player only**: for 3 seconds
after any play, their Play and Pass buttons are locked. Without this, a fast
next player could put cards on top and bury a lie before anyone had a chance
to react. After the 3 seconds the next player's turn timer starts, and
everyone can still call until the next play or pass lands.

## 5. The trash, and closed ranks

When everyone except the last player to play has passed, nobody dared to call:

- The pile slides into the **trash**, face down. Nobody ever sees those cards.
- The table adds up what was **said**: every card in that pile was played "as"
  the round's rank, so the whole pile counts as that rank in the trash.
- When the trash holds **4 or more cards said to be one rank** (8 with two
  decks), that rank is **closed**. Nobody can open a round with it again. It is
  struck out on the rank strip and greyed out in the rank picker.
- The player who played last opens the next round with any rank still open.

### Why it counts what was said, not what is true

The trash is face down, so the table cannot know what is really in it. If the
game closed a rank only when the four real cards were inside, it would be
telling everyone "those claims were true", which gives the bluff away. So the
rule follows the claim, exactly as it does at a real table: "four Aces went
in the bin, Aces are finished."

### Examples

**A. Four true Aces.** Meera opens with 4 cards as Aces. They really are the
four Aces. Everyone passes. The 4 cards go to the trash. Aces are closed.
Nothing strange: no Aces are left anywhere.

**B. Four fake Aces.** Ashish opens with 4 cards as Aces. Really they are two
Aces, a 5 and a 9. Nobody calls; everyone passes. The 4 cards go to the trash
and Aces are closed. Meera still holds the other two real Aces. She can never
say "Aces" again, so her two Aces are now dead weight: she has to slip them
out as something else, for example inside a round of Kings, and hope nobody
calls. Ashish got away with it. That is the game.

**C. So is a play of four always true?** No. Putting down four cards as Aces
is a claim like any other, and it is the easiest one to call: anyone holding
even one Ace knows it is a lie and should call Bluff straight away. The rank
closes only if the whole table lets it go.

**D. It adds up over rounds.** Round 3: 2 cards as Aces go to the trash
(2 of 4). Round 7: someone opens Aces again, 3 cards are played as Aces and
everyone passes. The trash now holds 5 cards said to be Aces. Aces are closed.

**E. Can the same player put four Aces twice?** Not once Aces are closed. If
their first four went to the trash, the rank is shut for everyone, them
included. If instead someone called and the pile was picked up, nothing went
to the trash, Aces stay open, and yes, Aces can be opened again.

**F. More than four in one round.** Ashish plays 3 as Kings, Meera plays 2 as
Kings. Five "Kings" are on the pile, so at least one of them lied. That is
allowed; it is up to the table to call. If nobody does, all 5 go to the trash
and Kings are closed.

### This can never get stuck

Closing a rank takes at least 4 cards into the trash. Closing all 13 ranks
takes at least 52, which is every card in the deck. So as long as any player
holds a card, at least one rank is still open to call.

## 6. Going out

A player who puts down their last card is **not safe yet**: anyone can still
call Bluff on that play.

- If it is called and was a bluff, the player picks up the pile and is back
  in the game.
- If it is called and was the truth, the caller picks up the pile and the
  player is out of cards.
- If nobody calls before the next player plays or passes, or the round ends,
  the play stands and the player is out of cards.

A player who is out of cards takes the next finishing place (1st, 2nd…) and
is skipped from then on. If that player was due to open the next round, the
next player clockwise who still holds cards opens instead.

## 7. End of the match

The match goes on until only one player still holds cards. Everyone gets a
place: the first one out wins, the one left holding cards is last.

(The host can switch this to "first out wins" in the lobby, and can end the
match at any time from the menu. Players are then ranked: out of cards first,
then fewest cards.)

## 8. Timers and missed turns

| Clock       | Length                    | When it runs out                                                 |
| ----------- | ------------------------- | ---------------------------------------------------------------- |
| Call window | 3 s after every play      | The next player's turn timer starts                              |
| Turn        | 90 s (host: 30 / 60 / 90) | A missed turn, then the default action below                     |
| Reveal      | 4 s                       | Nobody acts; the table watches the cards flip, then play goes on |
| Pause       | Up to 5 minutes           | The match restarts by itself                                     |

Default action on a missed turn:

- If the round has a rank: the player **passes**, so they are out of the round.
- If the player had to open a round: the server plays **one card truthfully**
  (their lowest card of a rank that is still open, called as what it is; if
  they hold no open rank, their lowest card as the lowest open rank).

Each missed turn is a strike (the red dots under a name). At the host's limit
in a row the player is out: their cards go to the trash without counting
towards any rank, and they take the last free place. Any action by the player
clears their strikes.

The tick sound plays for everyone in the last 5 seconds of a turn.

## 9. Two people act at the same moment

The server handles one message at a time for a room, in the order they
arrive. So there is always a first, and no two actions can both win.

Every play gets a number. A Bluff call says which play it is calling.

| What happens                                                                              | Result                                                                                                                                                          |
| ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Two players tap Bluff at the same moment                                                  | The first to arrive is the caller. The other sees a small notice, "Meera called first", and nothing else happens to them. They take no cards and get no strike. |
| A player taps Bluff, but the next player's cards arrived first                            | The call was aimed at a play that is no longer the last one. It is refused with "Too late". It never lands on the newer play by accident.                       |
| A player taps Bluff, but the last pass arrived first and the pile is already in the trash | Refused with "Too late".                                                                                                                                        |
| Someone taps Bluff during a reveal                                                        | Ignored. Nothing can happen until the reveal ends.                                                                                                              |
| The same player taps a button twice                                                       | The second tap is ignored.                                                                                                                                      |
| The next player taps Play during the 3-second call window                                 | The button is locked and shows the countdown; the server refuses it too.                                                                                        |
| The turn timer and the player's tap land together                                         | Whichever the server processes first counts. The other is ignored.                                                                                              |
| A player's connection drops mid-turn                                                      | Their seat stays. After 10 seconds the stand-in bot plays for them (section 10).                                                                                |

## 10. The stand-in bot

Same rule as Big Business: a player whose connection has dropped for 10
seconds is played by a simple bot until they are back. A player who is
connected but idle gets strikes, not the bot.

The bot is honest and timid:

- Opening a round: it plays every card it holds of the open rank it has most
  of, and names that rank truthfully.
- Following: if it holds the round's rank it plays all of them, otherwise it
  passes.
- It never bluffs and never calls Bluff.

## 11. What each player can see

| Thing                                                        | Who sees it                                                                       |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| Your own cards                                               | Only you                                                                          |
| How many cards each player holds                             | Everyone                                                                          |
| How many cards are in the pile, and how many each play added | Everyone                                                                          |
| The round's rank, who played last, who has passed            | Everyone                                                                          |
| How many cards are in the trash, and which ranks are closed  | Everyone                                                                          |
| The last-played cards after a Bluff call                     | Everyone, during the reveal                                                       |
| Older cards in the pile                                      | Nobody. A player who picks up the pile sees them only as cards in their own hand. |
| Cards in the trash                                           | Nobody, ever                                                                      |

## 12. Still open

| #   | Question                              | What is being built                              |
| --- | ------------------------------------- | ------------------------------------------------ |
| 1   | Jokers                                | Not in the deck. Could come later as wild cards. |
| 2   | Most cards in one play                | 4, also with two decks                           |
| 3   | Length of the hold on the next player | 3 seconds. To be tuned once it is playable.      |

## 13. Events everyone sees

Each has a banner in the middle of the table and its own sound.

| Event             | What it looks like                                                                                                               | Sound (existing name) |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| Round opened      | The rank appears as a big card on the felt and lights up on the rank strip                                                       | `chime`               |
| Cards played      | The cards fly one by one from the player's seat to the pile, their card count ticks down, and a bubble on the seat says "2 K's" (one card: "1 K") | `card`                |
| Pass              | A "Pass" bubble on the seat, then the seat is marked Passed                                                                      | `turn`                |
| Bluff called      | "Ashish calls Bluff on Zoya!"                                                                                                    | `siren`               |
| Reveal: a bluff   | Cards flip, red "Bluff!" stamp, pile flies to the liar                                                                           | `jail`                |
| Reveal: the truth | Cards flip, green "Truth!" stamp, pile flies to the caller                                                                       | `paidOff`             |
| Pile to the trash | The pile's cards fly into the bin one by one, the bin shakes, its number goes up                                                 | `pay`                 |
| Rank closed       | "Aces are closed", the rank is struck out on the strip                                                                           | `timeout`             |
| Out of cards      | "Meera is out of cards: 1st place"                                                                                               | `income`              |
| Missed turn       | Strike dot lights up on the player                                                                                               | `timeout`             |
| Your turn         | "Your turn" stamp, gold frame, haptic                                                                                            | `myTurn`              |
| Match over        | Winner screen with podium                                                                                                        | `win` / `lose`        |
