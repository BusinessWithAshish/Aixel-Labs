import type { z } from "zod";
import type { BluffEndMode, BluffRank, BluffSuit } from "./constants";
import type { BLUFF_CLIENT_MESSAGE_SCHEMA, BLUFF_COMMAND_SCHEMA } from "./schemas";

export type BluffCommand = z.infer<typeof BLUFF_COMMAND_SCHEMA>;
export type BluffClientMessage = z.infer<typeof BLUFF_CLIENT_MESSAGE_SCHEMA>;

/** `id` is unique across both decks, so two Kings of spades are still two cards. */
export type BluffCard = { id: number; rank: BluffRank; suit: BluffSuit };

export type BluffPhase = "play" | "reveal" | "over";

export type BluffPlayer = {
  seat: number;
  name: string;
  color: string;
  /** Sorted low to high. Never sent to another seat. */
  hand: BluffCard[];
  /** Out of the current round: skipped until it ends. May still call Bluff. */
  passed: boolean;
  /** Turns missed in a row. */
  missed: number;
  /** Finishing place, once out of cards or removed. */
  place: number | null;
  /** Removed for missed turns, or left. */
  gone: boolean;
};

export type BluffLastPlay = { id: number; seat: number; count: number };

export type BluffRound = {
  /** Null until the opener names it. */
  rank: BluffRank | null;
  /** Every card played this round, oldest first. */
  pile: BluffCard[];
  lastPlay: BluffLastPlay | null;
  /** Epoch ms before which the next player may not play or pass (anyone may call). */
  holdUntil: number;
  /** Everyone else is out of the round: at this time the pile goes to the trash unless someone calls. */
  closingAt: number | null;
};

export type BluffReveal = {
  /** The play that was called. */
  playId: number;
  caller: number;
  target: number;
  /** The called cards, face up for everyone. */
  cards: BluffCard[];
  bluff: boolean;
  /** Who picks up the pile. */
  taker: number;
  /** Size of the pile being picked up. */
  count: number;
  until: number;
};

/** What the table animates for a log line. */
export type BluffFx =
  | { kind: "play"; seat: number; count: number; rank: BluffRank; opened: boolean }
  | { kind: "pass"; seat: number }
  | { kind: "call"; caller: number; target: number }
  | { kind: "take"; taker: number; count: number; bluff: boolean }
  | { kind: "trash"; seat: number; count: number; rank: BluffRank; closed: boolean }
  | { kind: "out"; seat: number; place: number }
  | { kind: "miss"; seat: number }
  | { kind: "gone"; seat: number };

export type BluffLogEntry = { n: number; text: string; seat?: number; fx?: BluffFx };

export type BluffRanking = { seat: number; place: number; cards: number; gone: boolean };

export type BluffGameState = {
  rev: number;
  phase: BluffPhase;
  /** Seat to play or pass. */
  turn: number;
  roundNo: number;
  decks: number;
  players: BluffPlayer[];
  round: BluffRound;
  /** Every play gets a number; a Bluff call names the one it is against. */
  playSeq: number;
  reveal: BluffReveal | null;
  trash: {
    /** Cards out of the game. */
    count: number;
    /** How many trashed cards were played "as" each rank. */
    said: Partial<Record<BluffRank, number>>;
  };
  /** Ranks nobody may open a round with any more. */
  closed: BluffRank[];
  /** Epoch ms when the player on turn misses it. */
  deadline: number | null;
  turnSeconds: number;
  missLimit: number;
  endMode: BluffEndMode;
  /** Players out of cards so far, and players removed so far: the next places from the top and from the bottom. */
  outCount: number;
  goneCount: number;
  ranking: BluffRanking[] | null;
  log: BluffLogEntry[];
  logSeq: number;
};

export type BluffPublicPlayer = Omit<BluffPlayer, "hand"> & { cards: number };

/** What one seat is sent: its own hand, and only counts for everything else that is face down. */
export type BluffPublicState = Omit<BluffGameState, "players" | "round"> & {
  players: BluffPublicPlayer[];
  round: Omit<BluffRound, "pile"> & { pile: number };
  /** The viewer's own cards. */
  hand: BluffCard[];
};

export type BluffRoomConfig = { seats: number; turnSeconds: number; missLimit: number; endMode: BluffEndMode };

export type BluffSeatView = { seat: number; name: string; color: string; connected: boolean };

export type BluffRoomView = {
  code: string;
  hostSeat: number;
  config: BluffRoomConfig;
  seats: BluffSeatView[];
  started: boolean;
  /** Server time (epoch ms) at which the host paused the match, or null while it runs. */
  pausedAt: number | null;
  state: BluffPublicState | null;
  /** The seat this socket controls. */
  you: number;
  /** Server clock (epoch ms) so clients can correct countdowns. */
  now: number;
};

export type BluffRoomSummary = {
  code: string;
  started: boolean;
  seatsTaken: number;
  seats: number;
  /** Name of the player who created the room, shown on the invite screen. */
  host: string;
};

export type BluffServerMessage =
  | { t: "joined"; code: string; seat: number; token: string }
  | { t: "room"; room: BluffRoomView }
  | { t: "error"; message: string; id?: number }
  /** A Bluff call that lost the race: someone else was first, or the play it aimed at is gone. Not an error. */
  | { t: "late"; message: string; id?: number }
  | { t: "ack"; id: number }
  | { t: "pong" }
  | { t: "peek"; room: BluffRoomSummary }
  | { t: "kicked" }
  | { t: "closed" };
