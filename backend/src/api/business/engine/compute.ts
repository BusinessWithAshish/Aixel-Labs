/**
 * Pure read-only helpers over a game state. No Node imports and no mutation,
 * so the frontend uses the same functions to enable or disable its buttons.
 * Every `can*` helper returns `null` when allowed, or the reason it is not.
 */
import {
  BUSINESS_BOARD,
  BUSINESS_RAIL_RENT,
  BUSINESS_RENT_LADDER,
  BUSINESS_RULES,
  BUSINESS_SETS,
  BUSINESS_UTILITY_MULTIPLIER,
  type BusinessSetKey,
  type BusinessSpaceKind,
} from "../constants";
import type { BusinessInterestMode, BusinessOfferTerms, BusinessPublicState, BusinessSplit } from "../types";

type State = Pick<BusinessPublicState, "players" | "props" | "loans" | "splits">;

export function isBuyable(space: number): boolean {
  const kind = BUSINESS_BOARD[space].kind;
  return kind === "city" || kind === "rail" || kind === "utility";
}

export function setSpaces(set: BusinessSetKey): number[] {
  const out: number[] = [];
  BUSINESS_BOARD.forEach((s, i) => {
    if (s.set === set) out.push(i);
  });
  return out;
}

export function ownedBy(state: State, seat: number): number[] {
  return Object.keys(state.props)
    .map(Number)
    .filter((i) => state.props[i].owner === seat)
    .sort((a, b) => a - b);
}

export function ownsSet(state: State, seat: number, set: BusinessSetKey): boolean {
  return setSpaces(set).every((i) => state.props[i]?.owner === seat);
}

/** The split covering a colour set, if it is split. */
export function splitOf(state: State, set: BusinessSetKey | undefined): BusinessSplit | undefined {
  return set ? state.splits.find((s) => s.set === set) : undefined;
}

/** The split a property belongs to, if any. */
export function splitAt(state: State, space: number): BusinessSplit | undefined {
  return splitOf(state, BUSINESS_BOARD[space].set);
}

/** Splits a sum by a split's shares: the minor partner's part, rounded down, and the rest for the major one. */
export function splitShares(split: BusinessSplit, amount: number): { major: number; minor: number } {
  const minor = Math.floor((amount * split.minorPct) / 100);
  return { major: amount - minor, minor };
}

/**
 * The two owners who could split a set: one holding two of its three cities, the other one.
 * Null when the set is not owned that way.
 */
export function splitPair(state: State, set: BusinessSetKey): { major: number; minor: number } | null {
  const ids = setSpaces(set);
  if (ids.length !== 3 || ids.some((i) => !state.props[i])) return null;
  const owners = ids.map((i) => state.props[i].owner);
  const counts = new Map<number, number>();
  for (const o of owners) counts.set(o, (counts.get(o) ?? 0) + 1);
  if (counts.size !== 2) return null;
  const [[a, an], [b]] = [...counts];
  return an === 2 ? { major: a, minor: b } : { major: b, minor: a };
}

/** The set counts as complete for rent and building: one owner, or split between two. */
export function setComplete(state: State, set: BusinessSetKey): boolean {
  const ids = setSpaces(set);
  const owner = state.props[ids[0]]?.owner;
  return owner !== undefined && (ids.every((i) => state.props[i]?.owner === owner) || !!splitOf(state, set));
}

/** Who builds and sells houses in a set: its single owner, or the major partner of a split. */
export function builderOf(state: State, set: BusinessSetKey): number | null {
  const split = splitOf(state, set);
  if (split) return split.major;
  const ids = setSpaces(set);
  const owner = state.props[ids[0]]?.owner;
  return owner !== undefined && ids.every((i) => state.props[i]?.owner === owner) ? owner : null;
}

export function countKind(state: State, seat: number, kind: BusinessSpaceKind): number {
  return ownedBy(state, seat).filter((i) => BUSINESS_BOARD[i].kind === kind).length;
}

export function houseCost(space: number): number {
  const set = BUSINESS_BOARD[space].set;
  return set ? BUSINESS_SETS[set].house : 0;
}

export function mortgageValue(space: number): number {
  return Math.floor((BUSINESS_BOARD[space].price ?? 0) * BUSINESS_RULES.MORTGAGE_RATE);
}

export function redeemCost(space: number): number {
  // In whole percent: 100 × 0.55 is 55.00000000000001 in floating point, which would round up to 56.
  return Math.ceil(((BUSINESS_BOARD[space].price ?? 0) * Math.round(BUSINESS_RULES.REDEEM_RATE * 100)) / 100);
}

/** Index into the rent ladder for a city: 0 alone, 1 colour set, 2–5 houses, 6 hotel. */
export function rentLevel(state: State, space: number): number {
  const prop = state.props[space];
  const set = BUSINESS_BOARD[space].set;
  if (!prop || !set) return 0;
  if (prop.houses > 0) return prop.houses + 1;
  return setComplete(state, set) ? 1 : 0;
}

/** Rent for every step of a city's ladder, in ladder order. */
export function rentLadder(space: number): number[] {
  const price = BUSINESS_BOARD[space].price ?? 0;
  return BUSINESS_RENT_LADDER.map((m) => Math.round(price * m));
}

/** Houses standing anywhere on the board; a hotel counts as five. */
export function housesOnBoard(state: State): number {
  return Object.values(state.props).reduce((sum, p) => sum + p.houses, 0);
}

/** Railway rent for an owner of `count` railways: the base, plus a little for every house on the board, per railway owned. */
export function railRent(state: State, count: number): number {
  return count > 0 ? BUSINESS_RAIL_RENT[count] + BUSINESS_RULES.RAIL_RENT_PER_HOUSE * housesOnBoard(state) * count : 0;
}

/** Salary for a player's `lap`-th lap: it grows by one step every lap, up to the host's cap (0 = none). */
export function salaryFor(lap: number, cap = 0): number {
  const salary = Math.max(1, lap) * BUSINESS_RULES.SALARY_STEP;
  return cap > 0 ? Math.min(cap, salary) : salary;
}

/** A share of the cash in hand, with a floor so an empty pocket is no way out. */
export function shareOfCash(cash: number, pct: number): number {
  if (pct <= 0) return 0;
  return Math.max(BUSINESS_RULES.PCT_MIN, Math.round((Math.max(0, cash) * pct) / 100));
}

export function rentFor(state: State, space: number, diceSum: number): number {
  const prop = state.props[space];
  const tile = BUSINESS_BOARD[space];
  if (!prop || prop.mortgaged) return 0;
  if (tile.kind === "city") return rentLadder(space)[rentLevel(state, space)];
  if (tile.kind === "rail") return railRent(state, countKind(state, prop.owner, "rail"));
  if (tile.kind === "utility") {
    const both = countKind(state, prop.owner, "utility") === 2;
    return (both ? BUSINESS_UTILITY_MULTIPLIER.BOTH : BUSINESS_UTILITY_MULTIPLIER.ONE) * diceSum;
  }
  return 0;
}

function setHouses(state: State, set: BusinessSetKey): number[] {
  return setSpaces(set).map((i) => state.props[i]?.houses ?? 0);
}

export function canBuild(state: State, seat: number, space: number): string | null {
  const tile = BUSINESS_BOARD[space];
  const prop = state.props[space];
  if (tile.kind !== "city" || !tile.set) return "Only cities can have houses.";
  const split = splitOf(state, tile.set);
  if (!prop || (prop.owner !== seat && split?.major !== seat)) return "You do not own this city.";
  if (builderOf(state, tile.set) !== seat)
    return split ? `Only ${state.players[split.major].name}, who holds two cities of this set, builds here.` : "Own the whole colour set first.";
  const ids = setSpaces(tile.set);
  // Houses and mortgages never mix: the whole set must be free of the bank.
  if (ids.some((i) => state.props[i].mortgaged)) return "Redeem every city in this set from the bank first.";
  if (prop.houses >= BUSINESS_RULES.MAX_HOUSES) return "This city already has a hotel.";
  if (prop.houses > Math.min(...setHouses(state, tile.set))) return "Build evenly across the set.";
  // In a split the builder pays their share; the partner's share is taken from them even if it leaves them short.
  const own = split ? splitShares(split, houseCost(space)).major : houseCost(space);
  if (state.players[seat].cash < own) return "Not enough cash.";
  return null;
}

export function canSellHouse(state: State, seat: number, space: number): string | null {
  const tile = BUSINESS_BOARD[space];
  const prop = state.props[space];
  if (!prop || !tile.set || builderOf(state, tile.set) !== seat) return "You do not own this city.";
  if (prop.houses <= 0) return "Nothing is built here.";
  if (prop.houses < Math.max(...setHouses(state, tile.set))) return "Sell evenly across the set.";
  return null;
}

export function houseResale(space: number): number {
  return Math.floor(houseCost(space) * BUSINESS_RULES.HOUSE_RESALE_RATE);
}

/** True when nothing is built anywhere in the property's colour set. */
function setIsBare(state: State, space: number): boolean {
  const set = BUSINESS_BOARD[space].set;
  return !set || setHouses(state, set).every((h) => h === 0);
}

export function canMortgage(state: State, seat: number, space: number): string | null {
  const prop = state.props[space];
  if (!prop || prop.owner !== seat) return "You do not own this property.";
  if (prop.mortgaged) return "Already mortgaged to the bank.";
  if (splitAt(state, space)) return "This city is in a split set. End the split first.";
  if (!setIsBare(state, space)) return "Sell the houses in this set first.";
  return null;
}

export function canRedeem(state: State, seat: number, space: number): string | null {
  const prop = state.props[space];
  if (!prop || prop.owner !== seat) return "You do not own this property.";
  if (!prop.mortgaged) return "This property is not mortgaged to the bank.";
  if (state.players[seat].cash < redeemCost(space)) return "Not enough cash.";
  return null;
}

export function maxLoan(state: State, lender: number): number {
  return Math.max(0, Math.floor(state.players[lender].cash * BUSINESS_RULES.LOAN_MAX_CASH_SHARE));
}

/** What is owed at the end: the amount, plus the interest when it is all paid at the end. */
export function loanDue(amount: number, interestPct: number, mode: BusinessInterestMode = "end"): number {
  return mode === "lap" ? amount : amount + Math.round((amount * interestPct) / 100);
}

/** Interest paid at each Launch in "lap" mode. */
export function lapInterest(amount: number, interestPct: number): number {
  return Math.round((amount * interestPct) / 100);
}

export function netWorth(state: State, seat: number): number {
  let worth = state.players[seat].cash;
  for (const i of ownedBy(state, seat)) {
    const prop = state.props[i];
    const price = BUSINESS_BOARD[i].price ?? 0;
    worth += prop.mortgaged ? price - mortgageValue(i) : price;
    // Houses in a split set belong to both partners by their shares (added below).
    if (!splitAt(state, i)) worth += prop.houses * houseCost(i);
  }
  for (const split of state.splits) {
    if (split.major !== seat && split.minor !== seat) continue;
    const built = setSpaces(split.set).reduce((sum, i) => sum + (state.props[i]?.houses ?? 0) * houseCost(i), 0);
    worth += splitShares(split, built)[split.major === seat ? "major" : "minor"];
  }
  for (const loan of state.loans) {
    if (loan.borrower === seat) worth -= loan.due;
    if (loan.lender === seat) worth += loan.due;
  }
  return worth;
}

/** Whether the player has anything left to sell or mortgage to raise cash. */
export function canRaiseCash(state: State, seat: number): boolean {
  return ownedBy(state, seat).some(
    (i) => canSellHouse(state, seat, i) === null || canMortgage(state, seat, i) === null,
  );
}

/**
 * A property can change hands in a trade unless something is built in its
 * colour set or it is shared with a player. One mortgaged to the bank can be
 * traded: it stays mortgaged, and the new owner has to redeem it.
 */
export function canTrade(state: State, owner: number, space: number): string | null {
  const prop = state.props[space];
  const name = BUSINESS_BOARD[space].name;
  if (!prop || prop.owner !== owner) return `${state.players[owner].name} does not own ${name}.`;
  if (splitAt(state, space)) return `${name} is in a split set. End the split first.`;
  if (!setIsBare(state, space)) return `Sell the houses in ${name}'s set first.`;
  return null;
}

export function validateOffer(
  state: State,
  from: number,
  to: number,
  terms: BusinessOfferTerms,
): string | null {
  const a = state.players[from];
  const b = state.players[to];
  if (!a || !b || from === to) return "Pick another player.";
  if (a.bankrupt || b.bankrupt) return "That player is out of the match.";
  const pair = (x: number, y: number) => (x === from && y === to) || (x === to && y === from);

  if (terms.kind === "loan") {
    if (!pair(terms.lender, terms.borrower)) return "A loan is between the two of you.";
    if (state.loans.length >= BUSINESS_RULES.MAX_LOANS)
      return `Only ${BUSINESS_RULES.MAX_LOANS} loans can run at a time. One has to be paid back first.`;
    if (terms.amount > maxLoan(state, terms.lender))
      return `${state.players[terms.lender].name} can lend at most ₹${maxLoan(state, terms.lender)}.`;
    return null;
  }

  if (terms.kind === "split") {
    const name = BUSINESS_SETS[terms.set].name;
    if (splitOf(state, terms.set)) return `The ${name} set is already split.`;
    const owners = splitPair(state, terms.set);
    if (!owners || !pair(owners.major, owners.minor)) return `Only a three-city set held two and one by the two of you can be split.`;
    if (a.team === b.team) return "Teammates already pay each other no rent.";
    if (setSpaces(terms.set).some((i) => state.props[i].mortgaged)) return "Redeem every city in this set from the bank first.";
    if (state.splits.length >= BUSINESS_RULES.MAX_SPLITS)
      return `Only ${BUSINESS_RULES.MAX_SPLITS} sets can be split at a time. One split has to end first.`;
    return null;
  }

  if (terms.kind === "unsplit") {
    const split = state.splits.find((s) => s.id === terms.split);
    if (!split || !pair(split.major, split.minor)) return "That split is not between the two of you.";
    return null;
  }

  if (terms.kind === "renew") {
    const loan = state.loans.find((l) => l.id === terms.loan);
    if (!loan || loan.borrower !== from || loan.lender !== to) return "That loan is not between the two of you.";
    if (!loan.dueNow) return "That loan is not due yet.";
    if (terms.pay > loan.due) return `Pay at most ₹${loan.due}.`;
    if (terms.pay > Math.max(0, a.cash)) return `${a.name} does not have ₹${terms.pay}.`;
    if (terms.extra > maxLoan(state, to)) return `${b.name} can lend at most ₹${maxLoan(state, to)} more.`;
    if (loan.due - terms.pay + terms.extra < 10) return "Almost nothing is left. Pay it off instead.";
    return null;
  }

  const { give, get } = terms;
  if (!give.cash && !get.cash && !give.spaces.length && !get.spaces.length) return "The trade is empty.";
  if (new Set([...give.spaces, ...get.spaces]).size !== give.spaces.length + get.spaces.length)
    return "A property is listed twice.";
  if (give.cash > Math.max(0, a.cash)) return `${a.name} does not have ₹${give.cash}.`;
  if (get.cash > Math.max(0, b.cash)) return `${b.name} does not have ₹${get.cash}.`;
  const check = (spaces: number[], owner: number): string | null => {
    for (const i of spaces) {
      const reason = canTrade(state, owner, i);
      if (reason) return reason;
    }
    return null;
  };
  return check(give.spaces, from) ?? check(get.spaces, to);
}
