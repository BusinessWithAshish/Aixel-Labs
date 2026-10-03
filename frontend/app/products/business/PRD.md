# Product requirements document — Aixel Business

## 1. Summary

Aixel Business is an original online, turn-based property-trading board game.
Two to six players move around a board, acquire districts, collect rent,
develop completed sets, trade, lend, and try to be the final solvent player.
Each match is a private room entered through a shareable invite link or room code.

The product is inspired by the broad category of Indian "Business" board
games, whose public Play Store descriptions advertise 2–6 players, property
buying, rent, development, computer opponents, and private online rooms.
Those are genre references, not a specification to reproduce another game.

## 2. Goals

- Make a familiar property-trading game easy to start in a browser—no app
  installation required.
- Support a complete, fair match with friends in a private room.
- Let a player reconnect after a refresh or network loss without signing in.
- Make state and outcomes authoritative on the server so clients cannot alter
  dice results, cash, ownership, or turn order.
- Fit cleanly into Aixel Labs' external-tenant product model.

## 3. Non-goals for v1

- Real-money play, wagering, withdrawals, or purchasable advantages.
- Bots, public/random matchmaking, ranked play, chat moderation, spectating,
  tournaments, and social graphs.
- Persistent user accounts, Firebase identity, and MongoDB storage for matches.
- A pixel-perfect recreation of any published board game or mobile app.
- Mobile-native apps; the responsive web app is the first platform.

## 4. Users and primary journeys

| User | Need | v1 journey |
| --- | --- | --- |
| Host | Start a game with friends quickly | Choose 2–6 seats, create a private room, copy an invite link or code, and start after seats are filled. |
| Friend | Join without friction | Open invite or enter room code, choose a display name and token, join lobby, and play when host starts. |
| Reconnecting player | Resume after loss of tab or network | Reopen the original link or enter the room code on the same browser; reclaim the room seat and receive the latest state. |

## 5. v1 feature scope

### Lobby and identity

- Private room code and shareable invitation link
- 2–6 human seats; host controls the player count before the game begins
- Guest display names and token selection
- Ready/start controls and reconnect indicator
- Room code entry that redirects to the matching invite route

### Match play

- Server-generated two-die roll; one active player at a time
- Buy-or-auction decision for an unowned district
- Automatic rent, tax, salary, card, and movement resolution
- Owned-district panel, cash balances, turn timer, and activity log
- Development, bank mortgage, player-backed property lending, cash loans, and
  bilateral trading at defined turn phases
- Bankruptcy and a final winner screen

## 6. Experience requirements

- A player understands whose turn it is, what action is required, and the
  likely financial consequence without reading a rulebook mid-match.
- Every state-changing action produces a plain-language event in the log.
- The board remains usable at 1024px wide; phones get a focused board view and
  a bottom sheet for player and asset details.
- The UI is original and uses Aixel branding rather than the visual identity of
  a reference game.

## 7. Success measures

- ≥90% of created rooms reach a started match.
- ≥70% of started private matches reach a winner or agreed end state.
- Median time from room creation to first turn: under two minutes.
- Zero client-authoritative economy or dice decisions.

## 8. Release sequence

1. **Vertical slice:** fixed board, private room, two browser sessions, and an
   event log.
2. **Private alpha:** invite/code entry, reconnecting guest sessions,
   WebSocket state delivery, and server authority.
3. **v1:** full rule set, accessibility pass, analytics, and external tenant
   launch.
4. **Post-v1:** bots, public matchmaking, multilingual UI, and replay/spectator
   features if justified by usage.

## 9. Product decisions

- Domain: `business.aixellabs.in`.
- Inactive players: every phase has a timer and a default action (auto-pass).
  There is no pause.
- A match also ends at a host-selected time limit (30, 45 or 60 minutes), on
  net worth.
- No bots in v1.
