import { z } from "zod";
import { BLUFF_END_MODES, BLUFF_MISS_LIMITS, BLUFF_RANKS, BLUFF_RULES, BLUFF_TURN_SECONDS } from "./constants";

const SEAT = z.number().int().min(0).max(BLUFF_RULES.MAX_SEATS - 1);
const CARD_ID = z.number().int().min(0).max(103);

export const BLUFF_COMMAND_SCHEMA = z.discriminatedUnion("type", [
  /** `rank` only when opening a round; later plays are always "as" the round's rank. */
  z.object({ type: z.literal("play"), cards: z.array(CARD_ID).min(1).max(BLUFF_RULES.MAX_PLAY), rank: z.enum(BLUFF_RANKS).optional() }),
  z.object({ type: z.literal("pass") }),
  /** `play`: the number of the play being called, so a late call can never land on a newer play. */
  z.object({ type: z.literal("bluff"), play: z.number().int().min(1) }),
  z.object({ type: z.literal("leave") }),
]);

/** Counted in characters as a person sees them, so an emoji is one, not two. */
const NAME = z
  .string()
  .trim()
  .min(1)
  .refine((name) => [...name].length <= BLUFF_RULES.NAME_MAX);
const CODE = z.string().trim().toUpperCase().regex(/^[A-Z0-9]{6}$/);
const SEATS = z.number().int().min(BLUFF_RULES.MIN_SEATS).max(BLUFF_RULES.MAX_SEATS);
const TURN_SECONDS = z
  .number()
  .int()
  .refine((s) => (BLUFF_TURN_SECONDS as readonly number[]).includes(s));
const MISS_LIMIT = z
  .number()
  .int()
  .refine((m) => (BLUFF_MISS_LIMITS as readonly number[]).includes(m));
const END_MODE = z.enum(BLUFF_END_MODES);

export const BLUFF_CLIENT_MESSAGE_SCHEMA = z.discriminatedUnion("t", [
  z.object({ t: z.literal("create"), name: NAME, seats: SEATS, turnSeconds: TURN_SECONDS, missLimit: MISS_LIMIT }),
  z.object({ t: z.literal("join"), code: CODE, name: NAME }),
  z.object({ t: z.literal("resume"), code: CODE, token: z.string().min(16).max(128) }),
  z.object({ t: z.literal("config"), seats: SEATS.optional(), turnSeconds: TURN_SECONDS.optional(), missLimit: MISS_LIMIT.optional(), endMode: END_MODE.optional() }),
  z.object({ t: z.literal("start") }),
  /** Host, during the match: end it now. */
  z.object({ t: z.literal("end") }),
  z.object({ t: z.literal("peek"), code: CODE }),
  z.object({ t: z.literal("kick"), seat: SEAT }),
  /** Host, lobby: move a seat to another place in the turn order. */
  z.object({ t: z.literal("move"), seat: SEAT, to: SEAT }),
  /** Host, during the match: stop or restart every clock. */
  z.object({ t: z.literal("pause"), on: z.boolean() }),
  /** Host: end the room for everyone. */
  z.object({ t: z.literal("close") }),
  z.object({ t: z.literal("cmd"), id: z.number().int(), cmd: BLUFF_COMMAND_SCHEMA }),
  z.object({ t: z.literal("ping") }),
]);

export const BLUFF_ROOM_REQUEST_SCHEMA = CODE;
