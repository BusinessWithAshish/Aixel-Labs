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
import type { BusinessInterestMode, BusinessOfferTerms, BusinessPublicState } from "../types";

type State = Pick<BusinessPublicState, "players" | "props" | "loans">;

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
  return Math.ceil((BUSINESS_BOARD[space].price ?? 0) * BUSINESS_RULES.REDEEM_RATE);
}

/** Index into the rent ladder for a city: 0 alone, 1 colour set, 2–5 houses, 6 hotel. */
export function rentLevel(state: State, space: number): number {
  const prop = state.props[space];
  const set = BUSINESS_BOARD[space].set;
  if (!prop || !set) return 0;
  if (prop.houses > 0) return prop.houses + 1;
  return ownsSet(state, prop.owner, set) ? 1 : 0;
}

/** Rent for every step of a city's ladder, in ladder order. */
export function rentLadder(space: number): number[] {
  const price = BUSINESS_BOARD[space].price ?? 0;
  return BUSINESS_RENT_LADDER.map((m) => Math.round(price * m));
}

export function rentFor(state: State, space: number, diceSum: number): number {
  const prop = state.props[space];
  const tile = BUSINESS_BOARD[space];
  if (!prop || prop.mortgaged) return 0;
  if (tile.kind === "city") return rentLadder(space)[rentLevel(state, space)];
  if (tile.kind === "rail") return BUSINESS_RAIL_RENT[countKind(state, prop.owner, "rail")];
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
  if (!prop || prop.owner !== seat) return "You do not own this city.";
  if (!ownsSet(state, seat, tile.set)) return "Own the whole colour set first.";
  const ids = setSpaces(tile.set);
  // Houses and mortgages never mix: the whole set must be fully the builder's own.
  if (ids.some((i) => state.props[i].mortgaged)) return "Redeem every city in this set from the bank first.";
  if (ids.some((i) => state.props[i].lend)) return "A city in this set is mortgaged to a player. Pay them back first.";
  if (prop.houses >= BUSINESS_RULES.MAX_HOUSES) return "This city already has a hotel.";
  if (prop.houses > Math.min(...setHouses(state, tile.set))) return "Build evenly across the set.";
  if (state.players[seat].cash < houseCost(space)) return "Not enough cash.";
  return null;
}

export function canSellHouse(state: State, seat: number, space: number): string | null {
  const tile = BUSINESS_BOARD[space];
  const prop = state.props[space];
  if (!prop || prop.owner !== seat || !tile.set) return "You do not own this city.";
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
  if (prop.lend) return "Already mortgaged to a player.";
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

/** Lender's part of a rent under a player mortgage. An odd rupee stays with the owner. */
export function lenderCut(rent: number, share: number): number {
  return Math.floor((rent * share) / 100);
}

export function netWorth(state: State, seat: number): number {
  let worth = state.players[seat].cash;
  for (const i of ownedBy(state, seat)) {
    const prop = state.props[i];
    const price = BUSINESS_BOARD[i].price ?? 0;
    worth += prop.mortgaged ? price - mortgageValue(i) : price;
    worth += prop.houses * houseCost(i);
    if (prop.lend) worth -= prop.lend.advance;
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
    if (terms.amount > maxLoan(state, terms.lender))
      return `${state.players[terms.lender].name} can lend at most ₹${maxLoan(state, terms.lender)}.`;
    return null;
  }

  if (terms.kind === "mortgage") {
    if (!pair(terms.owner, terms.lender)) return "A mortgage is between the two of you.";
    const prop = state.props[terms.space];
    if (!prop || prop.owner !== terms.owner) return "The owner does not hold that property.";
    if (prop.mortgaged) return "That property is mortgaged to the bank.";
    if (prop.lend) return "That property is already mortgaged to a player.";
    if (!setIsBare(state, terms.space)) return "Sell the houses in this set first.";
    if (state.players[terms.lender].cash < terms.advance)
      return `${state.players[terms.lender].name} does not have ₹${terms.advance}.`;
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
      const prop = state.props[i];
      if (!prop || prop.owner !== owner)
        return `${state.players[owner].name} does not own ${BUSINESS_BOARD[i].name}.`;
      if (prop.lend) return `${BUSINESS_BOARD[i].name} is mortgaged to a player.`;
      if (!setIsBare(state, i)) return `Sell the houses in ${BUSINESS_BOARD[i].name}'s set first.`;
    }
    return null;
  };
  return check(give.spaces, from) ?? check(get.spaces, to);
}
