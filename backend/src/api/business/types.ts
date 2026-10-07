import type { z } from "zod";
import type { BusinessCard, BusinessSetKey } from "./constants";
import type {
  BUSINESS_CLIENT_MESSAGE_SCHEMA,
  BUSINESS_COMMAND_SCHEMA,
  BUSINESS_OFFER_TERMS_SCHEMA,
} from "./schemas";

export type BusinessCommand = z.infer<typeof BUSINESS_COMMAND_SCHEMA>;
export type BusinessOfferTerms = z.infer<typeof BUSINESS_OFFER_TERMS_SCHEMA>;
export type BusinessClientMessage = z.infer<typeof BUSINESS_CLIENT_MESSAGE_SCHEMA>;

export type BusinessPhase =
  | "roll"
  | "buy"
  | "auction"
  | "card"
  | "result"
  | "market"
  | "break"
  | "debt"
  | "loandue"
  | "end"
  | "over";

export type BusinessPlayer = {
  seat: number;
  name: string;
  color: string;
  cash: number;
  pos: number;
  /** 0 = free. 1–3 = in jail, about to make that attempt. */
  jail: number;
  /** Resting: the next turn is skipped. */
  skip: boolean;
  bankrupt: boolean;
  /** Turns in a row this player let the roll timer run out. */
  missed: number;
  /** Laps completed: the salary grows with each one. */
  laps: number;
  /** In debt and already put it off once: at their next turn it must be raised before anything else. */
  deferred: boolean;
  /** Unpaid parts of what they owe, carried over while a debt is put off. */
  owed: BusinessOwed[];
  /** Players with the same number play together: one colour, no rent between them, they win together. */
  team: number;
};

/**
 * A three-city colour set shared by its two owners: `major` holds two cities, `minor` one. Each city
 * keeps its owner, but the set counts as complete, rent from any of its cities is shared by
 * `minorPct` / the rest, and only `major` builds, with each paying their share of every house.
 */
export type BusinessSplit = {
  id: number;
  set: BusinessSetKey;
  major: number;
  minor: number;
  /** The minor partner's share, in percent. */
  minorPct: number;
};

export type BusinessProperty = {
  owner: number;
  /** 0–4 houses, 5 = hotel. */
  houses: number;
  /** Mortgaged to the bank: earns no rent. */
  mortgaged: boolean;
};

/** "lap": interest is paid every time the borrower passes Launch. "end": all of it with the loan. */
export type BusinessInterestMode = "lap" | "end";

export type BusinessLoan = {
  id: number;
  lender: number;
  borrower: number;
  amount: number;
  interestPct: number;
  interestMode: BusinessInterestMode;
  /** Interest paid at each Launch when the mode is "lap", else 0. */
  perLap: number;
  /** Owed when the laps run out or on early repayment: the amount, plus interest in "end" mode. */
  due: number;
  lapsLeft: number;
  /** The laps ran out: the borrower must pay or agree an extension before the turn ends. */
  dueNow?: boolean;
};

export type BusinessOffer = {
  id: number;
  from: number;
  to: number;
  terms: BusinessOfferTerms;
  expiresAt: number;
};

export type BusinessPending =
  | { type: "buy"; space: number }
  | {
      type: "auction";
      space: number;
      /** Opening price; the first bid must be at least this. */
      open: number;
      bid: number;
      by: number | null;
      passed: number[];
      endsAt: number;
    }
  | { type: "card"; card: BusinessCard }
  | { type: "result"; title: string; text: string; tone: "good" | "bad" | "mid"; dice?: [number, number] }
  | { type: "market" }
  | { type: "break" }
  | { type: "loanDue"; id: number };

export type BusinessOwed = { to: number | null; amount: number };

/** What kind of money moved, so clients can pick the banner and the sound. */
export type BusinessFxKind =
  | "buy"
  | "rent"
  | "salary"
  | "card"
  | "tax"
  | "market"
  | "loan"
  | "repay"
  | "bank"
  | "build"
  /** Interest paid on a loan as its borrower passes Launch. */
  | "interest"
  /** `from` went to Jail; `why` says how. */
  | "jail"
  /** Two players swapped something. Everyone sees that it happened, never what. */
  | "trade"
  /** `from` left the match. */
  | "out"
  /** `from` and `to` split a colour set, or ended a split (`amount` 0 = started). */
  | "split"
  /** `to` got `from` out of Jail; `from` paid them `amount` (0 for players outside the deal). */
  | "bail";

/** Money moving with a log line. `from`/`to` are seats; null is the bank. */
export type BusinessFx = {
  kind: BusinessFxKind;
  from: number | null;
  to: number | null;
  /** 0 with `kind` loan/mortgage: a private deal announced to the others without its numbers. */
  amount: number;
  space?: number;
  why?: "speeding" | "gojail" | "card" | "sent";
};

/** `only` lists the seats allowed to read the entry (a private deal). Absent = everyone. */
export type BusinessLogEntry = { n: number; text: string; seat?: number; only?: number[]; fx?: BusinessFx };

export type BusinessRanking = { seat: number; worth: number; bankrupt: boolean; team: number };

export type BusinessGameState = {
  rev: number;
  phase: BusinessPhase;
  turn: number;
  round: number;
  players: BusinessPlayer[];
  /** Keyed by board index. Absent = unowned. */
  props: Record<number, BusinessProperty>;
  dice: [number, number];
  /** Increments on every roll so clients can replay the dice and the walk. */
  rollSeq: number;
  /** Doubles rolled in a row this turn. */
  doubles: number;
  /** A doubles roll earned another roll once the landing is resolved. */
  again: boolean;
  pending: BusinessPending | null;
  /** Unpaid parts of payments the active player could not cover. */
  owed: BusinessOwed[];
  loans: BusinessLoan[];
  /** Colour sets split between two players. */
  splits: BusinessSplit[];
  /** The active player put their debt off for this turn: it is played on without paying up. */
  grace: boolean;
  /** The turn began in debt (a partner's share of a house): once it is cleared, the roll comes next. */
  opening: boolean;
  offers: BusinessOffer[];
  log: BusinessLogEntry[];
  logSeq: number;
  idSeq: number;
  /** Epoch ms when the current phase takes its default action. */
  deadline: number | null;
  /** Epoch ms when the match ends on net worth. */
  endsAt: number | null;
  /** Missed turns in a row that remove a player. */
  missLimit: number;
  /** The most one lap's salary can pay; 0 = no cap. */
  salaryCap: number;
  /** A timer already ran out on the active player this turn (counted once per turn). */
  lapsed: boolean;
  /** The turn clock is standing still (its player is writing an offer, or one is waiting for an answer) until `until`. */
  hold: { at: number; until: number; offer: boolean } | null;
  /** Milliseconds the clock has already stood still this turn. */
  held: number;
  winner: number | null;
  /** The team that won. With no teams set up, every player is a team of one. */
  winnerTeam: number | null;
  ranking: BusinessRanking[] | null;
  /** Server-only: seeded PRNG state and shuffled Chance order. Stripped from client views. */
  rng: number;
  deck: number[];
};

export type BusinessPublicState = Omit<BusinessGameState, "rng" | "deck">;

/** `teams`: two teams (Alpha against Beta) instead of everyone for themselves. */
/** `salaryCap`: the most a lap's salary can pay; 0 = no cap. */
export type BusinessRoomConfig = { seats: number; minutes: number; missLimit: number; teams: boolean; salaryCap: number };

export type BusinessSeatView = {
  seat: number;
  name: string;
  color: string;
  connected: boolean;
  /** Team play, in the lobby: 0 = Alpha, 1 = Beta, -1 = not placed yet. Ignored in a solo room. */
  team: number;
};

export type BusinessRoomView = {
  code: string;
  hostSeat: number;
  config: BusinessRoomConfig;
  seats: BusinessSeatView[];
  started: boolean;
  /** Server time (epoch ms) at which the host paused the match, or null while it runs. */
  pausedAt: number | null;
  state: BusinessPublicState | null;
  /** The seat this socket controls. */
  you: number;
  /** Server clock (epoch ms) so clients can correct countdowns. */
  now: number;
};

export type BusinessServerMessage =
  | { t: "joined"; code: string; seat: number; token: string }
  | { t: "room"; room: BusinessRoomView }
  | { t: "error"; message: string; id?: number }
  | { t: "ack"; id: number }
  | { t: "pong" }
  /** Answer to `peek`: what an invitee sees before joining. */
  | { t: "peek"; room: BusinessRoomSummary }
  /** The host removed this seat from the lobby. */
  | { t: "kicked" }
  /** The host left: the room is gone for everyone. */
  | { t: "closed" };

export type BusinessRoomSummary = {
  code: string;
  started: boolean;
  seatsTaken: number;
  seats: number;
  /** Name of the player who created the room, shown on the invite screen. */
  host: string;
};
