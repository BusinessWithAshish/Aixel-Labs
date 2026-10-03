/**
 * Big Business — board, rule numbers and routes (SSOT).
 * Pure data: no Node imports, so the frontend can import this file directly.
 */

export const BUSINESS_ROUTES = {
  ROOM: "/rooms/:code",
  /** WebSocket upgrade path on the backend HTTP server (not an Express route). */
  WS: "/business/ws",
} as const;

export const BUSINESS_RULES = {
  START_CASH: 2500,
  SALARY: 500,
  JAIL_FEE: 100,
  /** Missed doubles allowed before the fee is forced on the third turn. */
  JAIL_TRIES: 3,
  MAX_EXTRA_ROLLS: 2,
  /** 5 = hotel. */
  MAX_HOUSES: 5,
  MORTGAGE_RATE: 0.5,
  REDEEM_RATE: 0.55,
  HOUSE_RESALE_RATE: 0.5,
  AUCTION_OPEN_RATE: 0.5,
  AUCTION_SECONDS: 15,
  /** A bid in the last seconds resets the countdown to this many seconds. */
  AUCTION_EXTEND_SECONDS: 5,
  BID_STEP: 5,
  /** A lender may lend at most this share of the cash they hold. */
  LOAN_MAX_CASH_SHARE: 0.7,
  LOAN_MAX_INTEREST_PCT: 100,
  DEAL_MAX_LAPS: 6,
  /** Across the whole table, at most this many cash loans may be running at once. */
  MAX_LOANS: 3,
  /** Across the whole table, at most this many properties may be shared with a player at once. */
  MAX_SHARED: 3,
  MARKET_MIN_STAKE: 10,
  MARKET_MAX_STAKE: 1000,
  /** Two dice: 2–5 loses this share of the stake, 6–8 nothing, 9–12 wins the stake again. */
  MARKET_LOSE_MAX: 5,
  MARKET_FLAT_MAX: 8,
  MARKET_LOSS_RATE: 0.5,
  DEFAULT_MISS_LIMIT: 3,
  TAX_PER_PROPERTY: 25,
  REPAIR_PER_HOUSE: 40,
  REPAIR_PER_HOTEL: 115,
  MIN_SEATS: 2,
  MAX_SEATS: 6,
  LOG_LIMIT: 80,
  OFFER_SECONDS: 45,
} as const;

/** Seconds a phase may sit before the server takes the default action. */
export const BUSINESS_PHASE_SECONDS = {
  roll: 45,
  buy: 20,
  card: 12,
  result: 8,
  market: 25,
  break: 15,
  debt: 75,
  /** A loan came due: pay it, or ask the lender to extend it. */
  loandue: 40,
  end: 30,
} as const;

/** Match lengths the host can pick. 0 = no limit: play until one player is left. */
export const BUSINESS_MATCH_MINUTES = [30, 45, 60, 0] as const;

/** Turns in a row a player may miss before they are removed. Picked by the host. */
export const BUSINESS_MISS_LIMITS = [2, 3, 5] as const;

/** Rent as a multiple of price: alone, colour set, 1–4 houses, hotel. */
export const BUSINESS_RENT_LADDER = [0.1, 0.3, 1, 2.5, 4.5, 6, 7.5] as const;
export const BUSINESS_RAIL_RENT = [0, 25, 50, 100, 200] as const;
export const BUSINESS_UTILITY_MULTIPLIER = { ONE: 4, BOTH: 10 } as const;

/** Shown in the lobby. Real colours are dealt at random when the match starts. */
export const BUSINESS_LOBBY_COLOR = "#6F6592";

/** Six colours that never look alike: no two greens, no orange next to red. */
export const BUSINESS_PLAYER_COLORS = [
  "#FF3B4E", // red
  "#2F8BFF", // blue
  "#FFC400", // yellow
  "#22C55E", // green
  "#A259FF", // purple
  "#FF7AD9", // pink
] as const;

export const BUSINESS_SETS = {
  brown: { name: "Brown", color: "#8B5A2B", text: "#FFFFFF", house: 50 },
  sky: { name: "Sky", color: "#6CC8F5", text: "#2A1B4D", house: 50 },
  pink: { name: "Pink", color: "#FF7EB6", text: "#2A1B4D", house: 50 },
  orange: { name: "Orange", color: "#FF8A1F", text: "#2A1B4D", house: 100 },
  red: { name: "Red", color: "#E5383B", text: "#FFFFFF", house: 100 },
  yellow: { name: "Yellow", color: "#FFD21F", text: "#2A1B4D", house: 150 },
  green: { name: "Green", color: "#2FB457", text: "#FFFFFF", house: 150 },
  blue: { name: "Blue", color: "#2456D6", text: "#FFFFFF", house: 200 },
  purple: { name: "Purple", color: "#8E3FD9", text: "#FFFFFF", house: 200 },
  black: { name: "Black", color: "#1E1B26", text: "#FFC83D", house: 200 },
} as const;

export type BusinessSetKey = keyof typeof BUSINESS_SETS;

export type BusinessSpaceKind =
  | "launch"
  | "city"
  | "rail"
  | "utility"
  | "chance"
  | "market"
  | "levy"
  | "jail"
  | "break"
  | "gojail";

export type BusinessSpace = {
  kind: BusinessSpaceKind;
  name: string;
  /** Lucide icon name for non-city spaces. */
  icon?: string;
  set?: BusinessSetKey;
  price?: number;
  fee?: number;
};

const city = (name: string, set: BusinessSetKey, price: number): BusinessSpace => ({
  kind: "city",
  name,
  set,
  price,
});
const rail = (name: string, icon = "train-front"): BusinessSpace => ({
  kind: "rail",
  name,
  icon,
  price: 200,
});
const utility = (name: string, icon: string): BusinessSpace => ({
  kind: "utility",
  name,
  icon,
  price: 150,
});
const chance = (): BusinessSpace => ({ kind: "chance", name: "Chance", icon: "circle-help" });
const market = (): BusinessSpace => ({ kind: "market", name: "Market", icon: "trending-up" });

/**
 * City names are short on purpose (six letters at most): on a phone a tile is
 * about 22px wide, and the name has to be readable on it.
 */
/** 48 spaces, clockwise from Launch. Index 12 is Jail, 24 Break, 36 Go to Jail. */
export const BUSINESS_BOARD: readonly BusinessSpace[] = [
  { kind: "launch", name: "Launch", icon: "rocket" },
  city("Gaya", "brown", 60),
  city("Puri", "brown", 60),
  chance(),
  city("Shimla", "sky", 80),
  city("Leh", "sky", 80),
  city("Ooty", "sky", 100),
  rail("North Rail"),
  { kind: "levy", name: "Income Tax", icon: "receipt", fee: 200 },
  city("Ajmer", "pink", 120),
  city("Kota", "pink", 120),
  city("Jaipur", "pink", 140),
  { kind: "jail", name: "Jail", icon: "lock-keyhole" },
  city("Agra", "orange", 160),
  city("Patna", "orange", 160),
  city("Kanpur", "orange", 180),
  market(),
  utility("Power", "zap"),
  rail("Coast Rail"),
  chance(),
  city("Nagpur", "red", 200),
  city("Bhopal", "red", 200),
  city("Indore", "red", 220),
  market(),
  { kind: "break", name: "Take a Break", icon: "coffee" },
  city("Goa", "yellow", 240),
  city("Mysuru", "yellow", 240),
  city("Kochi", "yellow", 260),
  chance(),
  rail("Metro"),
  utility("Telecom", "wifi"),
  market(),
  city("Ranchi", "green", 280),
  city("Surat", "green", 280),
  city("Mohali", "green", 300),
  chance(),
  { kind: "gojail", name: "Go to Jail", icon: "siren" },
  city("Thane", "blue", 320),
  city("Nashik", "blue", 320),
  city("Rajkot", "blue", 340),
  market(),
  rail("Airport", "plane"),
  city("Pune", "purple", 360),
  city("Noida", "purple", 360),
  city("Vizag", "purple", 380),
  { kind: "levy", name: "Luxury Tax", icon: "receipt", fee: 100 },
  city("Delhi", "black", 400),
  city("Mumbai", "black", 400),
];

export const BUSINESS_JAIL_INDEX = 12;

export type BusinessCardEffect =
  | { type: "cash"; amount: number }
  | { type: "tax" }
  | { type: "repair" }
  | { type: "back"; steps: number }
  | { type: "jail" };

export type BusinessCard = { text: string; effect: BusinessCardEffect };

/** One Chance deck: five cards pay, five cost, two move the player. */
export const BUSINESS_CHANCE_CARDS: readonly BusinessCard[] = [
  { text: "The bank pays you a dividend. Collect ₹50.", effect: { type: "cash", amount: 50 } },
  { text: "Your annuity matures. Collect ₹100.", effect: { type: "cash", amount: 100 } },
  { text: "The bank made a mistake in your favour. Collect ₹200.", effect: { type: "cash", amount: 200 } },
  { text: "Your loan is approved. Collect ₹150.", effect: { type: "cash", amount: 150 } },
  { text: "Festival bonus. Collect ₹100.", effect: { type: "cash", amount: 100 } },
  { text: "Property tax. Pay ₹25 for every property you own.", effect: { type: "tax" } },
  { text: "Repairs. Pay ₹40 per house and ₹115 per hotel.", effect: { type: "repair" } },
  { text: "Doctor's fees. Pay ₹100.", effect: { type: "cash", amount: -100 } },
  { text: "School fees. Pay ₹150.", effect: { type: "cash", amount: -150 } },
  { text: "Speeding fine. Pay ₹50.", effect: { type: "cash", amount: -50 } },
  { text: "Go back 3 spaces.", effect: { type: "back", steps: 3 } },
  { text: "Go to Jail.", effect: { type: "jail" } },
];

export const BUSINESS_ERRORS = {
  INVALID_PARAMS: "Invalid request",
  ROOM_NOT_FOUND: "That room does not exist. Check the code.",
  ROOM_FULL: "That room is full.",
  ROOM_STARTED: "That match has already started.",
  BAD_TOKEN: "This browser does not hold a seat in that room.",
  NOT_HOST: "Only the host can do that.",
  NEED_PLAYERS: "At least two players are needed to start.",
  NOT_YOUR_TURN: "It is not your turn.",
  WRONG_PHASE: "You cannot do that right now.",
} as const;
