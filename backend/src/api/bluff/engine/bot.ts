/**
 * The stand-in for a player whose connection dropped. It is honest and timid: it plays the
 * cards it really holds, passes otherwise, and never calls Bluff. The one exception is forced:
 * opening a round while holding only closed ranks, where every possible play is a lie.
 */
import { BLUFF_RANKS, BLUFF_RULES } from "../constants";
import type { BluffCommand, BluffGameState } from "../types";
import { bluffOpenRanks } from "./compute";

/** The one move the bot makes for `seat` now, or null when it has nothing to do. */
export function botCommand(state: BluffGameState, seat: number, now: number): BluffCommand | null {
  const p = state.players[seat];
  if (state.phase !== "play" || state.turn !== seat || state.round.closingAt !== null || now < state.round.holdUntil) return null;
  if (!p || p.gone || p.place !== null || p.passed || p.hand.length === 0) return null;

  const ofRank = (rank: string) => p.hand.filter((c) => c.rank === rank).slice(0, BLUFF_RULES.MAX_PLAY);
  if (state.round.rank !== null) {
    const held = ofRank(state.round.rank);
    return held.length ? { type: "play", cards: held.map((c) => c.id) } : { type: "pass" };
  }
  const open = bluffOpenRanks(state.closed);
  let best = open[0];
  for (const rank of open) if (ofRank(rank).length > ofRank(best).length) best = rank;
  const held = ofRank(best);
  if (held.length) return { type: "play", cards: held.map((c) => c.id), rank: best };
  // Only closed ranks in hand: its lowest card, as the lowest open rank.
  return { type: "play", cards: [p.hand[0].id], rank: open[0] ?? BLUFF_RANKS[0] };
}
