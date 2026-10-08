/**
 * Bluff rules engine. Pure: no I/O and no clock of its own (`now` is passed in).
 * Every command is applied to a copy of the state, so a refused command changes nothing.
 * The rules in words: frontend/app/products/bluff/GAME_DESIGN_SPEC.md.
 */
import { BLUFF_ERRORS, BLUFF_RANKS, BLUFF_RULES, BLUFF_SUITS, bluffRankName, type BluffRank } from "../constants";
import type { BluffCard, BluffCommand, BluffFx, BluffGameState, BluffPlayer, BluffPublicState, BluffRoomConfig } from "../types";
import { bluffCloseAt, bluffDecksFor, bluffOpenRanks, bluffSortHand } from "./compute";

export class BluffRuleError extends Error {}
/** A Bluff call that lost the race. The player did nothing wrong, so it is answered softly. */
export class BluffLateError extends BluffRuleError {}

function fail(message: string): never {
  throw new BluffRuleError(message);
}

const ORDINALS = ["", "1st", "2nd", "3rd", "4th", "5th", "6th"];
const cardsWord = (n: number) => (n === 1 ? "1 card" : `${n} cards`);

function log(state: BluffGameState, text: string, seat?: number, fx?: BluffFx) {
  state.log.unshift({ n: ++state.logSeq, text, seat, fx });
  if (state.log.length > BLUFF_RULES.LOG_MAX) state.log.length = BLUFF_RULES.LOG_MAX;
}

/** Still in the match: neither finished nor removed. A player whose last cards are on the pile still counts until that play stands. */
const inMatch = (p: BluffPlayer) => !p.gone && p.place === null;
/** Can take a turn in this round. */
const canAct = (p: BluffPlayer) => inMatch(p) && !p.passed && p.hand.length > 0;

function nextActive(state: BluffGameState, from: number): number {
  const n = state.players.length;
  for (let i = 1; i <= n; i++) {
    const seat = (from + i) % n;
    if (canAct(state.players[seat])) return seat;
  }
  return -1;
}

function finish(state: BluffGameState) {
  // Whoever still holds cards is ranked by how few; a player whose last play was still open has none and comes first.
  const left = state.players.filter(inMatch).sort((a, b) => a.hand.length - b.hand.length || a.seat - b.seat);
  for (const p of left) p.place = ++state.outCount;
  state.phase = "over";
  state.deadline = null;
  state.reveal = null;
  state.round.closingAt = null;
  state.ranking = state.players
    .map((p) => ({ seat: p.seat, place: p.place as number, cards: p.hand.length, gone: p.gone }))
    .sort((a, b) => a.place - b.place);
  const winner = state.players[state.ranking[0].seat];
  log(state, `${winner.name} wins the match.`, winner.seat);
}

/** Ends the match when it is decided. Returns true when it is over. */
function checkOver(state: BluffGameState): boolean {
  if (state.phase === "over") return true;
  const left = state.players.filter(inMatch);
  if (left.length <= 1 || (state.endMode === "first" && state.outCount >= 1)) {
    finish(state);
    return true;
  }
  return false;
}

function takePlace(state: BluffGameState, p: BluffPlayer) {
  p.place = ++state.outCount;
  log(state, `${p.name} is out of cards: ${ORDINALS[p.place]} place.`, p.seat, { kind: "out", seat: p.seat, place: p.place });
}

/** The last play stands (nobody called in time): if it emptied the player's hand, they are out of cards. */
function settleLastPlay(state: BluffGameState) {
  const last = state.round.lastPlay;
  if (!last) return;
  const p = state.players[last.seat];
  if (inMatch(p) && p.hand.length === 0) takePlace(state, p);
}

/** A player leaves the match for good; their cards go to the trash without counting towards any rank. */
function remove(state: BluffGameState, p: BluffPlayer, text: string) {
  state.trash.count += p.hand.length;
  p.hand = [];
  p.gone = true;
  p.passed = true;
  p.place = state.players.length - state.goneCount++;
  log(state, text, p.seat, { kind: "gone", seat: p.seat });
}

function startRound(state: BluffGameState, opener: number, now: number) {
  for (const p of state.players) if (!p.gone) p.passed = false;
  state.round = { rank: null, pile: [], lastPlay: null, holdUntil: 0, closingAt: null };
  state.roundNo++;
  state.turn = canAct(state.players[opener]) ? opener : nextActive(state, opener);
  state.deadline = now + state.turnSeconds * 1000;
}

/** Nobody called: the pile goes to the trash, counted as the rank it was played as. */
function trashPile(state: BluffGameState, now: number) {
  const { rank, pile, lastPlay } = state.round;
  if (!rank || !lastPlay) return;
  const count = pile.length;
  state.trash.count += count;
  const said = (state.trash.said[rank] ?? 0) + count;
  state.trash.said[rank] = said;
  const closed = said >= bluffCloseAt(state.decks) && !state.closed.includes(rank);
  if (closed) state.closed.push(rank);
  const last = state.players[lastPlay.seat];
  log(
    state,
    `Nobody called ${last.name}. ${cardsWord(count)} to the trash.${closed ? ` ${bluffRankName(rank)} are closed.` : ""}`,
    last.seat,
    { kind: "trash", seat: last.seat, count, rank, closed },
  );
  settleLastPlay(state);
  state.round.pile = [];
  if (checkOver(state)) return;
  startRound(state, lastPlay.seat, now);
}

/** After a pass or a player leaving: end the round if only the last player is left in it, else move the turn on. */
function continueRound(state: BluffGameState, now: number) {
  if (checkOver(state)) return;
  const last = state.round.lastPlay;
  if (last && !state.players.some((p) => canAct(p) && p.seat !== last.seat)) {
    // A fresh play with nobody left to answer it keeps its short window for a call.
    if (state.round.closingAt === null) trashPile(state, now);
    return;
  }
  if (state.turn < 0 || !canAct(state.players[state.turn])) {
    state.turn = nextActive(state, state.turn < 0 ? 0 : state.turn);
    state.deadline = now + state.turnSeconds * 1000;
  }
}

function doPlay(state: BluffGameState, p: BluffPlayer, ids: number[], rank: BluffRank | null, now: number) {
  const opened = state.round.rank === null;
  // The play before this one stands now.
  settleLastPlay(state);
  const played: BluffCard[] = [];
  for (const id of ids) {
    const i = p.hand.findIndex((c) => c.id === id);
    played.push(...p.hand.splice(i, 1));
  }
  if (opened) state.round.rank = rank;
  const said = state.round.rank as BluffRank;
  state.round.pile.push(...played);
  state.round.lastPlay = { id: ++state.playSeq, seat: p.seat, count: played.length };
  log(
    state,
    opened ? `${p.name} opened with ${played.length} ${bluffRankName(said, played.length)}.` : `${p.name} put ${played.length} ${bluffRankName(said, played.length)}.`,
    p.seat,
    { kind: "play", seat: p.seat, count: played.length, rank: said, opened },
  );
  if (checkOver(state)) return;
  const hold = now + BLUFF_RULES.HOLD_SECONDS * 1000;
  state.round.holdUntil = hold;
  if (!state.players.some((q) => canAct(q) && q.seat !== p.seat)) {
    // Everyone else is out of the round: the table still gets a moment to call before the pile is trashed.
    state.round.closingAt = hold;
    state.deadline = null;
    return;
  }
  state.turn = nextActive(state, p.seat);
  state.deadline = hold + state.turnSeconds * 1000;
}

function doPass(state: BluffGameState, p: BluffPlayer, now: number) {
  settleLastPlay(state);
  p.passed = true;
  log(state, `${p.name} passed.`, p.seat, { kind: "pass", seat: p.seat });
  continueRound(state, now);
}

/** The one card played for a player who had to open a round and let the timer run out: a true one when possible. */
function forcedOpening(state: BluffGameState, p: BluffPlayer): { card: BluffCard; rank: BluffRank } {
  const open = bluffOpenRanks(state.closed);
  const honest = p.hand.find((c) => open.includes(c.rank));
  return honest ? { card: honest, rank: honest.rank } : { card: p.hand[0], rank: open[0] };
}

function resolveReveal(state: BluffGameState, now: number) {
  const reveal = state.reveal;
  if (!reveal) return;
  const taker = state.players[reveal.taker];
  const target = state.players[reveal.target];
  const pile = state.round.pile;
  if (taker.gone) state.trash.count += pile.length;
  else {
    taker.hand.push(...pile);
    bluffSortHand(taker.hand);
  }
  log(
    state,
    reveal.bluff ? `It was a bluff. ${taker.name} takes ${cardsWord(pile.length)}.` : `It was true. ${taker.name} takes ${cardsWord(pile.length)}.`,
    taker.seat,
    { kind: "take", taker: taker.seat, count: pile.length, bluff: reveal.bluff },
  );
  state.round.pile = [];
  state.round.lastPlay = null;
  state.reveal = null;
  state.phase = "play";
  // A true last play stands: its player is out of cards.
  if (!reveal.bluff && inMatch(target) && target.hand.length === 0) takePlace(state, target);
  if (checkOver(state)) return;
  startRound(state, reveal.bluff ? reveal.caller : reveal.target, now);
}

/* ---------- public API ---------- */

export function createGame(seats: { name: string; color: string }[], config: BluffRoomConfig, seed: number, now: number): BluffGameState {
  const decks = bluffDecksFor(seats.length);
  const deck: BluffCard[] = [];
  for (let d = 0; d < decks; d++) for (const suit of BLUFF_SUITS) for (const rank of BLUFF_RANKS) deck.push({ id: deck.length, rank, suit });

  // mulberry32, seeded: the same seed deals the same hands.
  let rng = seed | 0;
  const random = () => {
    rng = (rng + 0x6d2b79f5) | 0;
    let t = Math.imul(rng ^ (rng >>> 15), 1 | rng);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }

  const players: BluffPlayer[] = seats.map((s, seat) => ({ seat, name: s.name, color: s.color, hand: [], passed: false, missed: 0, place: null, gone: false }));
  // One card at a time, starting with a random player, who then opens the first round.
  const first = Math.floor(random() * players.length);
  deck.forEach((card, i) => players[(first + i) % players.length].hand.push(card));
  for (const p of players) bluffSortHand(p.hand);

  const state: BluffGameState = {
    rev: 1,
    phase: "play",
    turn: first,
    roundNo: 1,
    decks,
    players,
    round: { rank: null, pile: [], lastPlay: null, holdUntil: 0, closingAt: null },
    playSeq: 0,
    reveal: null,
    trash: { count: 0, said: {} },
    closed: [],
    deadline: now + config.turnSeconds * 1000,
    turnSeconds: config.turnSeconds,
    missLimit: config.missLimit,
    endMode: config.endMode,
    outCount: 0,
    goneCount: 0,
    ranking: null,
    log: [],
    logSeq: 0,
  };
  log(state, `The cards are dealt. ${players[first].name} opens the first round.`, first);
  return state;
}

/** What one seat may see: its own hand, and only how many cards anyone else or the pile holds. */
export function publicView(state: BluffGameState, seat: number): BluffPublicState {
  return {
    ...state,
    players: state.players.map(({ hand, ...p }) => ({ ...p, cards: hand.length })),
    round: { ...state.round, pile: state.round.pile.length },
    hand: state.players[seat]?.hand ?? [],
  };
}

/** The host ends the match now: out of cards first, then fewest cards. */
export function endMatch(prev: BluffGameState): BluffGameState {
  if (prev.phase === "over") return prev;
  const state = structuredClone(prev);
  finish(state);
  state.rev++;
  return state;
}

export function applyCommand(prev: BluffGameState, seat: number, cmd: BluffCommand, now: number): BluffGameState {
  const state = structuredClone(prev);
  const p = state.players[seat];
  if (!p) fail(BLUFF_ERRORS.INVALID_PARAMS);
  if (state.phase === "over") fail("The match is over.");

  if (cmd.type === "leave") {
    if (p.gone) fail("You have already left.");
    if (p.place !== null) return prev;
    remove(state, p, `${p.name} left the match.`);
    if (state.phase === "play") continueRound(state, now);
    else checkOver(state);
  } else if (cmd.type === "bluff") {
    if (state.phase === "reveal") {
      const first = state.reveal as NonNullable<BluffGameState["reveal"]>;
      throw new BluffLateError(first.playId === cmd.play ? `${state.players[first.caller].name} called first.` : BLUFF_ERRORS.TOO_LATE);
    }
    const last = state.round.lastPlay;
    // The play it was aimed at is no longer the last one: never let the call land on a different play.
    if (!last || last.id !== cmd.play) throw new BluffLateError(BLUFF_ERRORS.TOO_LATE);
    if (last.seat === seat) fail("You cannot call your own cards.");
    if (!inMatch(p) || p.hand.length === 0) fail("Only a player holding cards can call Bluff.");
    const target = state.players[last.seat];
    if (target.gone) fail(`${target.name} has left the match.`);
    const cards = state.round.pile.slice(-last.count);
    const bluff = cards.some((c) => c.rank !== state.round.rank);
    state.reveal = { playId: last.id, caller: seat, target: last.seat, cards, bluff, taker: bluff ? last.seat : seat, count: state.round.pile.length, until: now + BLUFF_RULES.REVEAL_SECONDS * 1000 };
    state.phase = "reveal";
    state.deadline = null;
    state.round.closingAt = null;
    p.missed = 0;
    log(state, `${p.name} called Bluff on ${target.name}.`, seat, { kind: "call", caller: seat, target: last.seat });
  } else {
    if (state.phase !== "play") fail("Wait for the cards to be shown.");
    if (state.turn !== seat || state.round.closingAt !== null || !canAct(p)) fail(p.passed && inMatch(p) ? "You passed. You are out until this round ends." : BLUFF_ERRORS.NOT_YOUR_TURN);
    if (now < state.round.holdUntil) fail("Give the others a moment to call.");
    if (cmd.type === "pass") {
      if (state.round.rank === null) fail("You open this round: play at least one card.");
      p.missed = 0;
      doPass(state, p, now);
    } else {
      if (new Set(cmd.cards).size !== cmd.cards.length || cmd.cards.some((id) => !p.hand.some((c) => c.id === id))) fail("Those cards are not in your hand.");
      let rank: BluffRank | null = null;
      if (state.round.rank === null) {
        if (!cmd.rank) fail("Say which rank you are playing.");
        if (state.closed.includes(cmd.rank)) fail(`${bluffRankName(cmd.rank)} are closed. Pick another rank.`);
        rank = cmd.rank;
      }
      p.missed = 0;
      doPlay(state, p, cmd.cards, rank, now);
    }
  }
  state.rev++;
  return state;
}

/** Advances the clocks. Returns the same object when nothing was due. */
export function tick(prev: BluffGameState, now: number): BluffGameState {
  if (prev.phase === "over") return prev;
  const revealDue = prev.phase === "reveal" && !!prev.reveal && now >= prev.reveal.until;
  const closingDue = prev.phase === "play" && prev.round.closingAt !== null && now >= prev.round.closingAt;
  const turnDue = prev.phase === "play" && prev.round.closingAt === null && prev.deadline !== null && now >= prev.deadline;
  if (!revealDue && !closingDue && !turnDue) return prev;

  const state = structuredClone(prev);
  if (revealDue) resolveReveal(state, now);
  else if (closingDue) {
    state.round.closingAt = null;
    trashPile(state, now);
  } else {
    const p = state.players[state.turn];
    p.missed++;
    log(state, `${p.name} missed a turn (${p.missed} of ${state.missLimit}).`, p.seat, { kind: "miss", seat: p.seat });
    if (p.missed >= state.missLimit) {
      remove(state, p, `${p.name} missed ${state.missLimit} turns in a row and is out.`);
      continueRound(state, now);
    } else if (state.round.rank === null) {
      const { card, rank } = forcedOpening(state, p);
      doPlay(state, p, [card.id], rank, now);
    } else doPass(state, p, now);
  }
  state.rev++;
  return state;
}
