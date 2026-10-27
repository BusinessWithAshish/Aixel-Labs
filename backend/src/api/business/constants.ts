/**
 * Big Business — board, rule numbers and routes (SSOT).
 * Pure data: no Node imports, so the frontend can import this file directly.
 */

export const BUSINESS_ROUTES = {
  ROOM: "/rooms/:code",
  /** Owner only, from the server itself: running matches, and steering a player's luck in one. */
  /** WebSocket upgrade path on the backend HTTP server (not an Express route). */
  WS: "/business/ws",
} as const;

export const BUSINESS_RULES = {
  START_CASH: 2000,
  /** Copies of the Mela card in a freshly shuffled Chance deck (the other cards appear once each)… */
  MELA_CARDS: 5,
  /** …and one more is shuffled into the deck every this many rounds, so long matches get more melas… */
  MELA_CARD_EVERY_ROUNDS: 8,
  /** …while the deck holds fewer than this many. */
  MELA_CARDS_MAX: 10,
  /** A mela multiplies the rent of every city in its set by this. */
  MELA_RENT_MULTIPLIER: 3,
  /** Salary grows with every lap a player completes: lap 1 pays this, lap 2 twice this, and so on. */
  SALARY_STEP: 100,
  /** A levy or a percentage card never takes or pays less than this. */
  PCT_MIN: 50,
  /** Leaving Jail without doubles costs this share of the cash held, shared out among the other players. */
  JAIL_PCT: 30,
  /** Missed doubles allowed before the fee is forced on the third turn. */
  JAIL_TRIES: 3,
  MAX_EXTRA_ROLLS: 2,
  /** 5 = hotel. */
  MAX_HOUSES: 5,
  MORTGAGE_RATE: 0.5,
  REDEEM_RATE: 0.55,
  HOUSE_RESALE_RATE: 0.5,
  AUCTION_OPEN_RATE: 0.5,
  /** Time to bid. Every bid starts the countdown again from this, so nobody is rushed out. */
  AUCTION_SECONDS: 20,
  BID_STEP: 5,
  /** A lender may lend at most this share of the cash they hold. */
  LOAN_MAX_CASH_SHARE: 0.7,
  LOAN_MAX_INTEREST_PCT: 100,
  DEAL_MAX_LAPS: 6,
  /** Across the whole table, at most this many cash loans may be running at once. */
  MAX_LOANS: 3,
  /** Across the whole table, at most this many colour sets may be split between two players at once. */
  MAX_SPLITS: 3,
  /** A split gives the player with one city of the set this share of it, in percent… */
  SPLIT_DEFAULT_PCT: 33,
  /** …or this share in a two-city set, where each partner holds one city… */
  SPLIT_PAIR_DEFAULT_PCT: 50,
  SPLIT_MIN_PCT: 10,
  SPLIT_MAX_PCT: 90,
  /** …set in steps of this many percent. */
  SPLIT_STEP_PCT: 5,
  MARKET_MIN_STAKE: 10,
  MARKET_MAX_STAKE: 1000,
  /** Two dice: 2–5 loses the stake, 6–8 nothing, 9–12 wins the stake again. */
  MARKET_LOSE_MAX: 5,
  MARKET_FLAT_MAX: 8,
  DEFAULT_MISS_LIMIT: 3,
  /** Chance "Property tax": this share of the cash held for every property owned (all of it at most). */
  TAX_PCT_PER_PROPERTY: 2,
  /** Chance "Repairs": this share of the cash held for every house (a hotel counts as five), all of it at most. */
  REPAIR_PCT_PER_HOUSE: 2,
  /** Longest name a player may take: it has to fit on a player plate. */
  NAME_MAX: 12,
  /** A pause ends by itself after this long, so one tap cannot stop a match for good. */
  PAUSE_MAX_SECONDS: 300,
  MIN_SEATS: 2,
  MAX_SEATS: 6,
  /** Lines the activity keeps, newest first. Enough for a whole match of a few players. */
  LOG_LIMIT: 250,
  OFFER_SECONDS: 60,
  /**
   * The turn clock stands still while its player is making a deal, and while their offer waits for
   * an answer: for at most this long in one turn, so the table is never held up for good.
   */
  HOLD_TURN_SECONDS: 180,
} as const;

/** Seconds a phase may sit before the server takes the default action. */
export const BUSINESS_PHASE_SECONDS = {
  roll: 45,
  buy: 30,
  /** A Chance card: time to read it, and for the table to see it. */
  card: 30,
  /** A result pop-up (the Market's dice, a closed Market): time to read it. */
  result: 20,
  market: 45,
  /** Rest, keep playing, or pick someone to send to Jail: a real decision, so it gets real time. */
  break: 90,
  debt: 75,
  /** A loan came due: pay it, or ask the lender to extend it. */
  loandue: 40,
  /** After the roll is dealt with: time to build, trade and make deals. */
  end: 90,
} as const;

/** Match lengths the host can pick. 0 = no limit: play until one player is left. */
export const BUSINESS_MATCH_MINUTES = [30, 45, 60, 0] as const;

/** Turns in a row a player may miss before they are removed. Picked by the host. */
export const BUSINESS_MISS_LIMITS = [2, 3, 5] as const;

/**
 * Highest salary a lap can pay, picked by the host. 0 = no cap (the default). With no cap and no
 * time limit a long match can run on and on; ₹500 keeps such a match finite.
 */
export const BUSINESS_SALARY_CAPS = [0, 500, 1000, 1500] as const;

/** Rent as a multiple of price: alone, colour set, 1–4 houses, hotel. */
export const BUSINESS_RENT_LADDER = [0.1, 0.3, 1, 2.5, 4.5, 6, 7.5] as const;
/** A station's rent is a toll on the cash the lander holds: this share (in percent) for an owner of 1–4 stations. */
export const BUSINESS_RAIL_TOLL_PCT = [0, 10, 20, 30, 40] as const;
/** Utility rent is the dice total times this. Every house on the board (a hotel counts as five) adds one to it. */
export const BUSINESS_UTILITY_MULTIPLIER = { ONE: 4, BOTH: 10 } as const;

/** Shown in the lobby. Real colours are dealt at random when the match starts. */
export const BUSINESS_LOBBY_COLOR = "#6F6592";

/**
 * Six colours that never look alike at a glance, on a pawn the size of a fingernail: four strong
 * hues, then white and dark grey. No orange (reads as red), no pink or purple (read as each other
 * and as blue), no second green.
 */
export const BUSINESS_PLAYER_COLORS = [
  "#FF3B4E", // red
  "#2F8BFF", // blue
  "#FFC400", // yellow
  "#22C55E", // green
  "#F4F6FB", // white
  "#4A4A55", // dark grey
] as const;

export const BUSINESS_SETS = {
  /** Two cities only, so its rent runs half again above its price, or it is never worth owning. */
  brown: { name: "Brown", color: "#8B5A2B", text: "#FFFFFF", house: 50, rent: 1.5 },
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
  /** A levy takes this share (in percent) of the cash the player holds. */
  pct?: number;
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
 * Places in Pune and Pimpri-Chinchwad, priced the way they are in real life: the cheap sets are
 * gaons (villages) on the edge of PCMC, the middle ones PCMC towns, the dear ones Pune's prime areas.
 * Names stay short (eight letters at most): on a phone a tile is about 22px wide.
 */
/** 48 spaces, clockwise from Launch. Index 12 is Jail, 24 Break, 36 Go to Jail. */
export const BUSINESS_BOARD: readonly BusinessSpace[] = [
  { kind: "launch", name: "Launch", icon: "rocket" },
  city("Mulshi", "brown", 80),
  city("Kamshet", "brown", 100),
  chance(),
  city("Dehu", "sky", 80),
  city("Alandi", "sky", 80),
  city("Jejuri", "sky", 100),
  rail("Pune Stn"),
  { kind: "levy", name: "Income Tax", icon: "receipt", pct: 10 },
  city("Lavasa", "pink", 120),
  city("Khandala", "pink", 120),
  city("Lonavala", "pink", 140),
  { kind: "jail", name: "Jail", icon: "lock-keyhole" },
  city("Akurdi", "orange", 160),
  city("Nigdi", "orange", 160),
  city("Pimpri", "orange", 180),
  market(),
  utility("Power", "zap"),
  rail("Pimpri Stn"),
  chance(),
  city("Ravet", "red", 200),
  city("Sangvi", "red", 200),
  city("Wakad", "red", 220),
  market(),
  { kind: "break", name: "Take a Break", icon: "coffee" },
  city("Katraj", "yellow", 240),
  city("Warje", "yellow", 240),
  city("Wagholi", "yellow", 260),
  chance(),
  rail("Swargate"),
  utility("Telecom", "wifi"),
  market(),
  city("Pashan", "green", 280),
  city("Kharadi", "green", 280),
  city("Kothrud", "green", 300),
  chance(),
  { kind: "gojail", name: "Go to Jail", icon: "siren" },
  city("Aundh", "blue", 320),
  city("Viman", "blue", 320),
  city("Baner", "blue", 340),
  market(),
  rail("Lohegaon", "plane"),
  city("Camp", "purple", 360),
  city("Deccan", "purple", 360),
  city("Kalyani", "purple", 380),
  { kind: "levy", name: "Luxury Tax", icon: "receipt", pct: 20 },
  city("Boat Club", "black", 400),
  city("Koregaon", "black", 400),
];

export const BUSINESS_JAIL_INDEX = 12;

/** The gaon sets: cheap, and the only ones that can hold a mela. */
export const BUSINESS_MELA_SETS: readonly BusinessSetKey[] = ["brown", "sky", "pink"];
/** How long a mela lasts, by what its holder picks when it starts. Balanced to run for about the same share of a match. */
export const BUSINESS_MELA_LENGTHS = { rounds: 6, laps: 1, minutes: 15 } as const;

export type BusinessCardEffect =
  /** Collect this share (in percent) of the cash you hold. */
  | { type: "gain"; pct: number }
  /** Collect this share (in percent) of what the properties you own cost. */
  | { type: "dividend"; pct: number }
  /** Pay this share (in percent) of the cash you hold. */
  | { type: "pct"; pct: number }
  | { type: "tax" }
  | { type: "repair" }
  | { type: "back"; steps: number }
  | { type: "jail" }
  /** A "get out of Jail free" card: kept until it is used, and tradeable like cash. */
  | { type: "jailcard" }
  /** A Mela card: kept, tradeable, and spent to start a mela on a whole town set. */
  | { type: "mela" };

export type BusinessCard = { text: string; effect: BusinessCardEffect };

/**
 * One Chance deck: four cards pay, six cost, two move the player, and one is a card to keep
 * ("get out of Jail free"). It takes more than it gives.
 * Nothing is a fixed sum: every card is a share of the player's cash or property, so it matters
 * as much late in a match as early. There is no minimum and no cap: the card is exactly its share.
 */
export const BUSINESS_CHANCE_CARDS: readonly BusinessCard[] = [
  { text: "The bank pays a dividend on your properties. Collect 5% of what they cost.", effect: { type: "dividend", pct: 5 } },
  { text: "Your annuity matures. Collect 5% of your cash.", effect: { type: "gain", pct: 5 } },
  { text: "Festival bonus. Collect 8% of your cash.", effect: { type: "gain", pct: 8 } },
  { text: "The bank made a mistake in your favour. Collect 10% of your cash.", effect: { type: "gain", pct: 10 } },
  { text: "Property tax. Pay 2% of your cash for every property you own.", effect: { type: "tax" } },
  { text: "Repairs. Pay 2% of your cash for every house, a hotel counting as 5.", effect: { type: "repair" } },
  { text: "Doctor's fees. Pay 5% of your cash.", effect: { type: "pct", pct: 5 } },
  { text: "School fees. Pay 8% of your cash.", effect: { type: "pct", pct: 8 } },
  { text: "Car breakdown. Pay 10% of your cash.", effect: { type: "pct", pct: 10 } },
  { text: "Wedding in the family. Pay 15% of your cash.", effect: { type: "pct", pct: 15 } },
  { text: "Go back 3 spaces.", effect: { type: "back", steps: 3 } },
  { text: "Go to Jail.", effect: { type: "jail" } },
  { text: "Get out of Jail free. Keep this card until you need it, or trade it.", effect: { type: "jailcard" } },
  { text: "Mela! Keep this card. Spend it to hold a mela on a whole gaon set you own: its rent is tripled while the mela lasts. Or trade it.", effect: { type: "mela" } },
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
