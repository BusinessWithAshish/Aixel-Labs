/**
 * Bluff: rule numbers, the deck and routes. Pure data, imported by the frontend.
 * The rules in words: frontend/app/products/bluff/GAME_DESIGN_SPEC.md.
 */
import { BUSINESS_LOBBY_COLOR, BUSINESS_PLAYER_COLORS } from "../business/constants";

export const BLUFF_ROUTES = {
  ROOM: "/rooms/:code",
  /** WebSocket upgrade path on the backend HTTP server (not an Express route). */
  WS: "/bluff/ws",
} as const;

/** Low to high; a hand is shown in this order. */
export const BLUFF_RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"] as const;
export type BluffRank = (typeof BLUFF_RANKS)[number];

export const BLUFF_SUITS = ["s", "h", "d", "c"] as const;
export type BluffSuit = (typeof BLUFF_SUITS)[number];

export const BLUFF_RULES = {
  MIN_SEATS: 2,
  MAX_SEATS: 6,
  NAME_MAX: 12,
  /** Most cards one play may put down. */
  MAX_PLAY: 4,
  /** One deck up to this many players, two decks above it. */
  ONE_DECK_MAX_PLAYERS: 4,
  /** Cards said to be one rank, in the trash, that close the rank: this many per deck. */
  CLOSE_PER_DECK: 4,
  /** After a play, the next player cannot play or pass for this long, so everyone has time to call. */
  HOLD_SECONDS: 3,
  /** The table watches the called cards flip for this long before the pile moves. */
  REVEAL_SECONDS: 4,
  /** The tick sound plays for everyone in these last seconds of a turn. */
  TICK_LAST_SECONDS: 5,
  /** A host pause ends by itself after this long. */
  PAUSE_MAX_SECONDS: 300,
  /** Newest log lines kept in the state. */
  LOG_MAX: 80,
} as const;

export const BLUFF_TURN_SECONDS = [30, 60, 90] as const;
export const BLUFF_DEFAULT_TURN_SECONDS = 90;
export const BLUFF_MISS_LIMITS = [2, 3, 5] as const;
export const BLUFF_DEFAULT_MISS_LIMIT = 3;
/** "last": play on until one player holds cards. "first": the match ends when the first player is out. */
export const BLUFF_END_MODES = ["last", "first"] as const;
export type BluffEndMode = (typeof BLUFF_END_MODES)[number];

export const BLUFF_LOBBY_COLOR = BUSINESS_LOBBY_COLOR;
/** The same six colours as Big Business, dealt at random when the match starts. */
export const BLUFF_PLAYER_COLORS = BUSINESS_PLAYER_COLORS;

const RANK_WORDS: Partial<Record<BluffRank, string>> = { A: "Ace", J: "Jack", Q: "Queen", K: "King" };

/** "King" / "Kings", "7" / "7s". */
export const bluffRankName = (rank: BluffRank, count = 2) => (RANK_WORDS[rank] ?? rank) + (count === 1 ? "" : "s");

export const BLUFF_ERRORS = {
  INVALID_PARAMS: "Invalid request",
  ROOM_NOT_FOUND: "That room does not exist. Check the code.",
  ROOM_FULL: "That room is full.",
  ROOM_STARTED: "That match has already started.",
  BAD_TOKEN: "This browser does not hold a seat in that room.",
  NOT_HOST: "Only the host can do that.",
  NEED_PLAYERS: "At least 2 players are needed to start.",
  NOT_YOUR_TURN: "It is not your turn.",
  TOO_LATE: "Too late.",
} as const;
