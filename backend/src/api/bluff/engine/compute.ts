/**
 * Read-only helpers shared with the frontend, so buttons enable on the same rules the server applies.
 */
import { BLUFF_RANKS, BLUFF_RULES, BLUFF_SUITS, type BluffRank } from "../constants";
import type { BluffCard, BluffPublicState } from "../types";

export const bluffDecksFor = (players: number) => (players <= BLUFF_RULES.ONE_DECK_MAX_PLAYERS ? 1 : 2);

/** Cards said to be one rank, in the trash, at which that rank closes. */
export const bluffCloseAt = (decks: number) => BLUFF_RULES.CLOSE_PER_DECK * decks;

export function bluffSortHand(hand: BluffCard[]): BluffCard[] {
  return hand.sort(
    (a, b) => BLUFF_RANKS.indexOf(a.rank) - BLUFF_RANKS.indexOf(b.rank) || BLUFF_SUITS.indexOf(a.suit) - BLUFF_SUITS.indexOf(b.suit) || a.id - b.id,
  );
}

export const bluffOpenRanks = (closed: readonly BluffRank[]): BluffRank[] => BLUFF_RANKS.filter((r) => !closed.includes(r));

/** Still holding cards in the match: neither finished nor removed. */
const holding = (state: BluffPublicState, seat: number) => {
  const p = state.players[seat];
  return !!p && !p.gone && p.place === null && p.cards > 0;
};

/** May `seat` call Bluff right now? Anyone holding cards may, on or off turn, against the last play (never their own). */
export function bluffCanCall(state: BluffPublicState, seat: number): boolean {
  const last = state.round.lastPlay;
  return state.phase === "play" && !!last && last.seat !== seat && holding(state, seat) && !state.players[last.seat].gone;
}

/** Is it `seat`'s turn to play or pass (ignoring the short hold after a play)? */
export function bluffOnTurn(state: BluffPublicState, seat: number): boolean {
  return state.phase === "play" && state.turn === seat && state.round.closingAt === null && holding(state, seat) && !state.players[seat].passed;
}
