import { z } from "zod";
import { BUSINESS_BOARD, BUSINESS_MATCH_MINUTES, BUSINESS_MISS_LIMITS, BUSINESS_RULES, BUSINESS_SALARY_CAPS, BUSINESS_SETS, type BusinessSetKey } from "./constants";

const SPACE = z.number().int().min(0).max(BUSINESS_BOARD.length - 1);
const SEAT = z.number().int().min(0).max(BUSINESS_RULES.MAX_SEATS - 1);
const CASH = z.number().int().min(0).max(1_000_000);
const LAPS = z.number().int().min(1).max(BUSINESS_RULES.DEAL_MAX_LAPS);
const INTEREST_MODE = z.enum(["lap", "end"]);

/** One side of a trade: cash, properties, and "get out of Jail free" cards. */
const TRADE_SIDE = z.object({ cash: CASH, spaces: z.array(SPACE).max(28), cards: z.number().int().min(0).max(9).default(0) });

export const BUSINESS_OFFER_TERMS_SCHEMA = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("loan"),
    lender: SEAT,
    borrower: SEAT,
    amount: CASH.min(10),
    interestPct: z.number().int().min(0).max(BUSINESS_RULES.LOAN_MAX_INTEREST_PCT),
    interestMode: INTEREST_MODE,
    laps: LAPS,
  }),
  z.object({
    /** A due loan, extended: the borrower pays part now and may borrow more, on new terms. */
    kind: z.literal("renew"),
    loan: z.number().int(),
    pay: CASH,
    extra: CASH,
    interestPct: z.number().int().min(0).max(BUSINESS_RULES.LOAN_MAX_INTEREST_PCT),
    interestMode: INTEREST_MODE,
    laps: LAPS,
  }),
  z.object({
    /** Share a colour set with its other owner. */
    kind: z.literal("split"),
    set: z.enum(Object.keys(BUSINESS_SETS) as [BusinessSetKey, ...BusinessSetKey[]]),
    minorPct: z
      .number()
      .int()
      .min(BUSINESS_RULES.SPLIT_MIN_PCT)
      .max(BUSINESS_RULES.SPLIT_MAX_PCT)
      .refine((p) => p % BUSINESS_RULES.SPLIT_STEP_PCT === 0 || p === BUSINESS_RULES.SPLIT_DEFAULT_PCT),
  }),
  z.object({
    /** A player visiting Jail gets `prisoner` out, for a price the prisoner pays them. */
    kind: z.literal("bail"),
    prisoner: SEAT,
    amount: CASH,
  }),
  z.object({
    /** End a split: every house in the set goes back to the bank. */
    kind: z.literal("unsplit"),
    split: z.number().int(),
  }),
  z.object({
    kind: z.literal("trade"),
    /** What the proposer hands over. */
    give: TRADE_SIDE,
    /** What the proposer receives. */
    get: TRADE_SIDE,
  }),
]);

export const BUSINESS_COMMAND_SCHEMA = z.discriminatedUnion("type", [
  z.object({ type: z.literal("roll") }),
  z.object({ type: z.literal("payJail") }),
  z.object({ type: z.literal("buy") }),
  z.object({ type: z.literal("auction") }),
  z.object({ type: z.literal("bid"), amount: CASH }),
  z.object({ type: z.literal("passBid") }),
  z.object({ type: z.literal("ack") }),
  z.object({ type: z.literal("market"), stake: CASH }),
  /** `jail`: use the break to send that player to Jail; `random`: send whoever the dice pick, the sender included. */
  z.object({ type: z.literal("break"), rest: z.boolean(), jail: SEAT.optional(), random: z.boolean().optional() }),
  /** In Jail: hand in a "get out of Jail free" card and walk out. */
  z.object({ type: z.literal("useJailCard") }),
  z.object({ type: z.literal("endTurn") }),
  z.object({ type: z.literal("build"), space: SPACE }),
  z.object({ type: z.literal("sellHouse"), space: SPACE }),
  z.object({ type: z.literal("mortgage"), space: SPACE }),
  z.object({ type: z.literal("redeem"), space: SPACE }),
  z.object({ type: z.literal("offer"), to: SEAT, terms: BUSINESS_OFFER_TERMS_SCHEMA }),
  z.object({ type: z.literal("respond"), id: z.number().int(), accept: z.boolean() }),
  z.object({ type: z.literal("cancelOffer"), id: z.number().int() }),
  z.object({ type: z.literal("hold"), on: z.boolean() }),
  z.object({ type: z.literal("repayLoan"), id: z.number().int() }),
  /** A due loan: pay all of it now, even if that leaves the borrower short. */
  z.object({ type: z.literal("settleLoan"), id: z.number().int() }),
  z.object({ type: z.literal("bankrupt") }),
  /** In debt: play on for now and raise the cash by the next turn. Allowed once per debt. */
  z.object({ type: z.literal("defer") }),
  /** Forfeit: the player leaves the match and their properties return to the bank. */
  z.object({ type: z.literal("leave") }),
]);

/** Counted in characters as a person sees them, so an emoji is one, not two. */
const NAME = z
  .string()
  .trim()
  .min(1)
  .refine((name) => [...name].length <= BUSINESS_RULES.NAME_MAX);
const CODE = z.string().trim().toUpperCase().regex(/^[A-Z0-9]{6}$/);
const SEATS = z.number().int().min(BUSINESS_RULES.MIN_SEATS).max(BUSINESS_RULES.MAX_SEATS);
const MINUTES = z
  .number()
  .int()
  .refine((m) => (BUSINESS_MATCH_MINUTES as readonly number[]).includes(m));
const MISS_LIMIT = z
  .number()
  .int()
  .refine((m) => (BUSINESS_MISS_LIMITS as readonly number[]).includes(m));

const SALARY_CAP = z
  .number()
  .int()
  .refine((m) => (BUSINESS_SALARY_CAPS as readonly number[]).includes(m));

export const BUSINESS_CLIENT_MESSAGE_SCHEMA = z.discriminatedUnion("t", [
  z.object({ t: z.literal("create"), name: NAME, seats: SEATS, minutes: MINUTES, missLimit: MISS_LIMIT }),
  z.object({ t: z.literal("join"), code: CODE, name: NAME }),
  z.object({ t: z.literal("resume"), code: CODE, token: z.string().min(16).max(128) }),
  z.object({
    t: z.literal("config"),
    seats: SEATS.optional(),
    minutes: MINUTES.optional(),
    missLimit: MISS_LIMIT.optional(),
    teams: z.boolean().optional(),
    salaryCap: SALARY_CAP.optional(),
    bailAnyone: z.boolean().optional(),
  }),
  z.object({ t: z.literal("start") }),
  /** Host, during the match: end it now. The richest player wins. */
  z.object({ t: z.literal("end") }),
  z.object({ t: z.literal("peek"), code: CODE }),
  z.object({ t: z.literal("kick"), seat: SEAT }),
  /** Host, lobby: move a seat to another place in the turn order. */
  z.object({ t: z.literal("move"), seat: SEAT, to: SEAT }),
  /** Host, lobby, team play: put a seat in Alpha (0) or Beta (1), or back with the unplaced players (-1). */
  z.object({ t: z.literal("team"), seat: SEAT, team: z.number().int().min(-1).max(1) }),
  /** Host, during the match: stop or restart every clock. */
  z.object({ t: z.literal("pause"), on: z.boolean() }),
  /** Host: end the room for everyone. */
  z.object({ t: z.literal("close") }),
  z.object({ t: z.literal("cmd"), id: z.number().int(), cmd: BUSINESS_COMMAND_SCHEMA }),
  z.object({ t: z.literal("ping") }),
]);

export const BUSINESS_ROOM_REQUEST_SCHEMA = CODE;
