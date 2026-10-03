import type { z } from "zod";
import type { BusinessCard } from "./constants";
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
  /** Players with the same number play together: one colour, no rent between them, they win together. */
  team: number;
};

/** A mortgage to another player: the owner keeps title, the lender shares rent. */
export type BusinessLend = {
  to: number;
  /** Lender's share of every rent, 0–100. */
  share: number;
  advance: number;
  /** Owner's laps left before title moves to the lender. */
  lapsLeft: number;
};

export type BusinessProperty = {
  owner: number;
  /** 0–4 houses, 5 = hotel. */
  houses: number;
  /** Mortgaged to the bank: earns no rent. */
  mortgaged: boolean;
  lend?: BusinessLend;
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
  | "out";

/** Money moving with a log line. `from`/`to` are seats; null is the bank. */
export type BusinessFx = {
  kind: BusinessFxKind;
  from: number | null;
  to: number | null;
  /** 0 with `kind` loan/mortgage: a private deal announced to the others without its numbers. */
  amount: number;
  space?: number;
  why?: "speeding" | "gojail" | "card";
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
  /** A timer already ran out on the active player this turn (counted once per turn). */
  lapsed: boolean;
  winner: number | null;
  /** The team that won. With no teams set up, every player is a team of one. */
  winnerTeam: number | null;
  ranking: BusinessRanking[] | null;
  /** Server-only: seeded PRNG state and shuffled Chance order. Stripped from client views. */
  rng: number;
  deck: number[];
};

export type BusinessPublicState = Omit<BusinessGameState, "rng" | "deck">;

export type BusinessRoomConfig = { seats: number; minutes: number; missLimit: number };

export type BusinessSeatView = {
  seat: number;
  name: string;
  color: string;
  connected: boolean;
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
