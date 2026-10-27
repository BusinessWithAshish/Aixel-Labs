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
        id: 5,
        title: 'Pune board and the Mela',
        points: [
            'The board is now Pune and PCMC: gaons like Mulshi, Dehu and Lonavala up to Boat Club and Koregaon.',
            'New Mela cards in Chance: own a whole gaon set (brown, sky or pink) and hold a mela for 3× rent on all of it.',
            'Pick how long: 6 rounds, until you next pass Launch, or 15 minutes. Trade Mela cards like Jail cards.',
            'The longer the match, the more Mela cards come into the deck.',
            'Stations are tolls now: 10%, 20%, 30% or 40% of the cash of whoever lands, by how many the owner has.',
            'Brown is worth having: Mulshi costs ₹80, Kamshet ₹100, and both charge 1.5× the usual rent.',
            'Brown and black can now be split too: one city each, and the player with the dearer city builds.',
            'In Jail you can still trade cards (Jail free and Mela).',
            'A bail offered from Take a Break can still be accepted after the helper rolls on.',
        ],
    },
    {
        id: 4,
        title: 'Fairer Jail, safer exits',
        points: [
            'Just out of Jail? You cannot bail anyone out until you have moved on, and nobody in Jail can bail another.',
            'With "Bail from: Jail & Break", a player resting on Take a Break can bail too.',
            'A Jail turn you miss still counts as one of your three tries.',
            'Chance cards stay up for 30 seconds and show the sum, such as "10% of ₹2,140".',
            'No more limits on Chance: a card pays or takes exactly its share, however rich you are.',
            'A swipe back on your phone opens the menu instead of throwing you out of the match.',
            'Refresh in the menu fetches the table again without reloading the page.',
            'The host can step away and rejoin: the match only ends if they are gone for 10 minutes.',
        ],
    },
    {
        id: 3,
        title: 'Smoother comebacks',
        points: [
            'Bail now says whether the helper has to come to the Jail, so a helper can ask more for the trip.',
            'Banners stay up longer, and the Market result waits 20 seconds for you to read it.',
            'Your own moves stand out in gold in the activity.',
            'Back from another app? The game reconnects the moment you return.',
            'The main screen offers a way back into a match that is still on, and forgets one that has ended.',
            'Joining and rejoining show what is happening while you wait.',
        ],
    },
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
