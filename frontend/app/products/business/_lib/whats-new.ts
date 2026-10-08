/**
 * What changed in the game, newest first, in words a player would use. Shown once to a returning
 * player on the main screen (never in the middle of a match), and again from the "What's new" button.
 *
 * Add a new entry at the top with the next `id` whenever a release changes how the game plays or
 * looks. Never renumber: a player's browser remembers the highest `id` it has shown.
 */
export type BusinessUpdate = { id: number; title: string; points: string[] };

export const BUSINESS_UPDATES: readonly BusinessUpdate[] = [
    {
        id: 2,
        title: 'Jail gets dangerous',
        points: [
            'Leaving Jail without doubles now costs 30% of your cash, shared among the other players.',
            'Any player can bail you out for a price you agree, but whoever does it has to come to the Jail themselves.',
            'A new Chance card: "Get out of Jail free". Keep it, use it, or sell it in a trade.',
            'Take a Break has a third choice: send a player to Jail, or let chance pick one (it might be you).',
            'Short of cash? You can play on once and pay by your next turn.',
            'Auctions are a live leaderboard, and every bid restarts the 20 seconds.',
            'The host can end the match at any time: the richest player wins.',
            'Six clearer player colours, bigger pawns, and your connection speed shown live.',
        ],
    },
    {
        id: 1,
        title: 'New ways to deal and build',
        points: [
            'A toolbar on your turn: Trade, Build, Sell and Mine. Build and Sell work with one tap.',
            'Split property: share a colour set with the player who holds its last city, and both earn its rent.',
            'Your salary grows by ₹100 with every lap you finish.',
            'Taxes and Chance cards take or pay a share of your cash, not a fixed sum.',
            'Railway and utility rents climb with every house built on the board.',
            'The Market is all or nothing: lose your stake or double it.',
            'Your turn is announced across the whole screen, and the clock waits while you make a deal.',
        ],
    },
];

export const LATEST_UPDATE = BUSINESS_UPDATES[0].id;
