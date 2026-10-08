# Product requirements document — Bluff

## 1. Summary

Bluff is the card game where you put cards face down, say what they are, and
may be lying. The others either believe you or call your bluff. Whoever is
wrong picks up the whole pile. The first player with no cards wins.

Friends already play it with a real deck. This product lets the same group
play from their phones: one person creates a private room, shares a link, and
everyone is at the table in under a minute.

It is the second game on the Aixel game base. Big Business supplied the base;
Bluff adds a card engine and a card table on top of it.

## 2. Goals

- A group of friends can start a match from a link, with no app and no sign-in.
- The game feels like the real one: quick turns, a tense reveal, a loud result.
- Nobody can cheat by looking at the network: a phone is only ever sent its
  own cards.
- Reuse the Big Business base so the build is the card rules and one new
  screen, not a new product.
- Leave behind a base that makes the third game faster again.

## 3. Non-goals for v1

- Real money, betting, coins to buy, or any paid advantage.
- Playing against the computer, public matchmaking, ranking, friends lists.
- Chat. Voice is how friends play; they will be on a call or in one room.
- Sign-in, saved profiles, match history.
- A native app.

## 4. Users and journeys

| User                    | Need                     | Journey                                                                                                                 |
| ----------------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| Host                    | Get a game going quickly | Type a name, create a room, share the link or the 6-letter code, press Start when everyone is in.                       |
| Friend                  | Join with no friction    | Open the link, type a name, land in the lobby.                                                                          |
| Player on a bad network | Not lose the game        | Reopening the link on the same phone takes the same seat back. While away, a simple stand-in plays safe moves for them. |

## 5. v1 scope

### Taken from Big Business as it is

- Private room with a code and an invite link; join by link or by typing the code
- Lobby: seat count, host kicks a player, host drags to set the turn order
- Reconnect to the same seat after a refresh or a dropped connection
- Turn timer, missed-turn strikes, and removal after 2, 3 or 5 missed turns
- Stand-in bot for a player whose connection dropped
- Host pause, host "end match now", host leaving ends the match with a result
- Banners with their own sound for every event everyone should notice
- Activity log, connection strength meter, sound and music switches, haptics
- Winner screen with podium and confetti
- The whole look: fonts, colours, buttons, avatars, pop-ups

### New for Bluff

- Deck, shuffle and deal on the server
- A private hand per player: you see your cards, others see only how many
- The card table: players around a felt, the pile in the middle, the current
  call ("Meera says 2 Kings") above it
- Choosing cards from your hand and playing them face down
- Naming the rank when you open a round; after that the rank stays lit on
  the table and everyone plays "as" it
- Pass (you sit out the rest of the round), and Bluff, which anyone can call
  at any time
- A fair result when two people tap at the same moment: the server picks the
  first, the other sees "Meera called first"
- The trash: a pile nobody challenged flies into the bin, and a rank with
  four claimed cards in the trash is closed for the rest of the match
- The reveal: the last cards flip over, a "Bluff!" or "Truth!" stamp, and the
  pile flies to whoever was wrong
- Finishing order: first out, second out, and the last one holding cards

### Host settings

| Setting           | Choices                                    | Default                 |
| ----------------- | ------------------------------------------ | ----------------------- |
| Seats             | 2–6                                        | 4                       |
| Turn time         | 30, 60 or 90 seconds                       | 90                      |
| Out after missing | 2, 3 or 5 turns                            | 3                       |
| Match ends        | Play to the last player, or first out wins | Play to the last player |

The deck count is not a setting: one deck for up to 4 players, two decks for
5 or 6. That keeps the lobby on one screen.

## 6. Experience requirements

- It must look like a mobile game, not a web app: chunky buttons, sound on
  every action, cards that move.
- Every screen fits a phone screen with no page scroll. A hand of 40 cards
  still fits: cards overlap more, they never push the page.
- At any moment the player can tell three things without reading: whose turn
  it is, what the current call is, and how many cards each player holds.
- The reveal is the best moment of the game. It gets the biggest animation and
  the loudest sound, and everyone sees it at the same time.
- Picking cards must be safe on a small screen: tap to lift, tap again to put
  back, and the Play button always names the rank in play ("Play as K").
- A pop-up always covers the whole screen; none opens inside the table.

## 7. Success measures

- 90% or more of created rooms start a match.
- 80% or more of started matches reach a winner (Bluff is short, so this
  should beat Big Business).
- Median match length between 8 and 15 minutes.
- Median time from creating the room to the first card played: under 90 seconds.
- No message ever sent to a phone that contains another player's cards.

## 8. Release sequence

1. **Docs and preview** (this step): rules agreed, screens seen before any code.
2. **Engine:** deck, deal, play, pass, bluff, finishing order, with self-play
   tests that run thousands of random matches.
3. **Table:** the room and lobby copied from Big Business, plus the new card
   table, played by two browsers.
4. **Feel:** reveal animation, sounds, banners, haptics, the winner screen.
5. **Launch:** tenant record, `bluff.aixellabs.in`, deploy to the VPS.
6. **Later:** jokers, quick emoji reactions, a rematch
   button that keeps the same room.

## 9. Product decisions

- Domain: `bluff.aixellabs.in`.
- No money in the game at all. Winning is finishing first.
- No bot opponents. The stand-in bot only covers for a dropped connection, and
  it never lies and never calls Bluff.
- Rooms live in memory, like Big Business: a backend restart ends every match.
