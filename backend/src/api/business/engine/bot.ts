/**
 * Stand-in for a player who is offline. Plain arithmetic, no AI: it keeps the
 * match moving and refuses deals that would strip the absent player, so nobody
 * comes back to find their best city traded away for ₹10.
 *
 * Pure like `compute.ts`: reads the state, never changes it, and needs no clock.
 */
import { BUSINESS_BOARD, BUSINESS_RULES, type BusinessSetKey } from "../constants";
import type { BusinessCommand, BusinessGameState, BusinessOffer, BusinessOfferTerms } from "../types";
import { canBuild, canMortgage, canSellHouse, houseCost, mortgageValue, ownedBy, ownsSet, setSpaces, validateOffer } from "./compute";

/** A trade must be worth this much of what the bot gives up (105 = a 5% edge), so a coin-flip deal is refused. */
const TRADE_MIN_RETURN_PCT = 105;
/** Share of a colour set's total price that completing (or breaking) the set is worth. */
const SET_BONUS_PCT = 50;
/** Cash the bot keeps after lending, so one bad landing does not sink the absent player. */
const LEND_RESERVE = 400;
/** The bot lends at most this share of its cash in one loan. */
const LOAN_MAX_CASH_PCT = 30;
/** Lowest interest the bot lends at. */
const LOAN_MIN_INTEREST_PCT = 10;
/** The bot borrows only when its cash is below this. */
const BORROW_BELOW_CASH = 300;
/** Highest interest the bot borrows at when it is all paid at the end. */
const BORROW_MAX_INTEREST_PCT = 30;
/** Highest total interest (rate × laps) the bot borrows at when it is paid every lap. */
const BORROW_MAX_LAP_INTEREST_PCT = 40;
/** As a mortgage lender: the largest advance, as a share of the property's price. */
const MORTGAGE_LEND_MAX_ADVANCE_PCT = 60;
/** As a mortgage lender: the smallest share of the rent worth lending for. */
const MORTGAGE_LEND_MIN_SHARE = 30;
/** As the owner: the smallest advance, as a share of the price, worth pledging a property for. */
const MORTGAGE_OWN_MIN_ADVANCE_PCT = 40;
/** As the owner: the largest share of the rent the bot gives away. */
const MORTGAGE_OWN_MAX_SHARE = 50;
/** Extending a due loan: the borrower pays at least this share of it now… */
const RENEW_MIN_PAY_PCT = 30;
/** …or the new interest is at least this. */
const RENEW_MIN_INTEREST_PCT = 15;
/** Extending a due loan: the extra lent is at most this share of the bot's cash. */
const RENEW_MAX_EXTRA_CASH_PCT = 20;
/** Highest auction bid, as a share of the property's price. */
const AUCTION_MAX_PRICE_PCT = 90;
/** The same, when the property completes a colour set for the bot. */
const AUCTION_MAX_PRICE_SET_PCT = 110;
/** Cash the bot keeps after winning an auction. */
const AUCTION_RESERVE = 200;
/** Cash the bot keeps after building a house. */
const BUILD_RESERVE = 600;
/** Cash the bot keeps after buying the property it landed on. */
const BUY_RESERVE = 150;

type TradeSide = { cash: number; spaces: number[] };

function price(space: number): number {
  return BUSINESS_BOARD[space].price ?? 0;
}

/** What a property is worth in a trade: its price and houses, less what the bank already advanced on it. */
function propertyValue(state: BusinessGameState, space: number): number {
  const prop = state.props[space];
  if (!prop) return 0;
  return price(space) + prop.houses * houseCost(space) - (prop.mortgaged ? mortgageValue(space) : 0);
}

function setBonus(set: BusinessSetKey): number {
  const total = setSpaces(set).reduce((sum, i) => sum + price(i), 0);
  return Math.round((total * SET_BONUS_PCT) / 100);
}

/**
 * Both sides of a trade as the bot sees them. A colour set is worth more than
 * its cities, so the bot counts a bonus for a set it would complete, and asks
 * for one when the trade breaks its own set or hands the other player theirs.
 */
function tradeValues(
  state: BusinessGameState,
  seat: number,
  other: number,
  receive: TradeSide,
  give: TradeSide,
): { received: number; given: number } {
  let received = receive.cash + receive.spaces.reduce((sum, i) => sum + propertyValue(state, i), 0);
  let given = give.cash + give.spaces.reduce((sum, i) => sum + propertyValue(state, i), 0);

  const ownerAfter = (i: number): number | undefined => {
    if (receive.spaces.includes(i)) return seat;
    if (give.spaces.includes(i)) return other;
    return state.props[i]?.owner;
  };
  const sets = new Set<BusinessSetKey>();
  for (const i of [...receive.spaces, ...give.spaces]) {
    const set = BUSINESS_BOARD[i].set;
    if (set) sets.add(set);
  }
  for (const set of sets) {
    const ids = setSpaces(set);
    const mineBefore = ownsSet(state, seat, set);
    const mineAfter = ids.every((i) => ownerAfter(i) === seat);
    const theirsBefore = ownsSet(state, other, set);
    const theirsAfter = ids.every((i) => ownerAfter(i) === other);
    if (!mineBefore && mineAfter) received += setBonus(set);
    if (mineBefore && !mineAfter) given += setBonus(set);
    if (!theirsBefore && theirsAfter) given += setBonus(set);
  }
  return { received, given };
}

function acceptTrade(state: BusinessGameState, seat: number, offer: BusinessOffer, terms: Extract<BusinessOfferTerms, { kind: "trade" }>): boolean {
  // `give` is what the proposer hands over, so it is what the bot receives.
  const { received, given } = tradeValues(state, seat, offer.from, terms.give, terms.get);
  return received * 100 >= given * TRADE_MIN_RETURN_PCT;
}

function acceptLoan(state: BusinessGameState, seat: number, terms: Extract<BusinessOfferTerms, { kind: "loan" }>): boolean {
  const cash = state.players[seat].cash;
  if (terms.lender === seat) {
    return (
      terms.amount * 100 <= cash * LOAN_MAX_CASH_PCT &&
      cash - terms.amount >= LEND_RESERVE &&
      terms.interestPct >= LOAN_MIN_INTEREST_PCT
    );
  }
  if (cash >= BORROW_BELOW_CASH) return false;
  // Paid every lap, the interest is charged once per lap: judge the total, not the headline rate.
  if (terms.interestMode === "lap") return terms.interestPct * terms.laps <= BORROW_MAX_LAP_INTEREST_PCT;
  return terms.interestPct <= BORROW_MAX_INTEREST_PCT;
}

function acceptMortgage(state: BusinessGameState, seat: number, terms: Extract<BusinessOfferTerms, { kind: "mortgage" }>): boolean {
  const worth = price(terms.space);
  if (terms.lender === seat) {
    return (
      terms.advance * 100 <= worth * MORTGAGE_LEND_MAX_ADVANCE_PCT &&
      terms.share >= MORTGAGE_LEND_MIN_SHARE &&
      state.players[seat].cash - terms.advance >= LEND_RESERVE
    );
  }
  return terms.advance * 100 >= worth * MORTGAGE_OWN_MIN_ADVANCE_PCT && terms.share <= MORTGAGE_OWN_MAX_SHARE;
}

function acceptRenew(state: BusinessGameState, seat: number, terms: Extract<BusinessOfferTerms, { kind: "renew" }>): boolean {
  const loan = state.loans.find((l) => l.id === terms.loan);
  if (!loan || loan.lender !== seat) return false;
  const cash = state.players[seat].cash;
  const worthIt = terms.pay * 100 >= loan.due * RENEW_MIN_PAY_PCT || terms.interestPct >= RENEW_MIN_INTEREST_PCT;
  if (!worthIt) return false;
  // The reserve guards fresh lending only: an extension that lends nothing more costs the bot no cash.
  if (terms.extra === 0) return true;
  return terms.extra * 100 <= cash * RENEW_MAX_EXTRA_CASH_PCT && cash + terms.pay - terms.extra >= LEND_RESERVE;
}

function acceptOffer(state: BusinessGameState, seat: number, offer: BusinessOffer): boolean {
  // An offer can go stale while it waits (cash spent, a property sold): the engine would refuse it anyway.
  if (validateOffer(state, offer.from, offer.to, offer.terms)) return false;
  const terms = offer.terms;
  switch (terms.kind) {
    case "trade":
      return acceptTrade(state, seat, offer, terms);
    case "loan":
      return acceptLoan(state, seat, terms);
    case "mortgage":
      return acceptMortgage(state, seat, terms);
    case "renew":
      return acceptRenew(state, seat, terms);
    default:
      return false;
  }
}

/** True when owning `space` as well would give `seat` its whole colour set. */
function completesSet(state: BusinessGameState, seat: number, space: number): boolean {
  const set = BUSINESS_BOARD[space].set;
  if (!set) return false;
  return setSpaces(set).every((i) => i === space || state.props[i]?.owner === seat);
}

function auctionCommand(state: BusinessGameState, seat: number): BusinessCommand | null {
  const a = state.pending;
  if (a?.type !== "auction") return null;
  if (a.by === seat || a.passed.includes(seat)) return null;
  const bid = a.by === null ? a.open : a.bid + BUSINESS_RULES.BID_STEP;
  const cap = completesSet(state, seat, a.space) ? AUCTION_MAX_PRICE_SET_PCT : AUCTION_MAX_PRICE_PCT;
  const affordable = state.players[seat].cash - bid >= AUCTION_RESERVE;
  // Always the minimum raise: the bot only needs to stay in, never to outbid itself.
  if (affordable && bid * 100 <= price(a.space) * cap) return { type: "bid", amount: bid };
  return { type: "passBid" };
}

function debtCommand(state: BusinessGameState, seat: number): BusinessCommand {
  const owned = ownedBy(state, seat);
  // Houses first: a mortgage is refused while anything stands in the set.
  const sell = owned.find((i) => canSellHouse(state, seat, i) === null);
  if (sell !== undefined) return { type: "sellHouse", space: sell };
  // Cheapest first, so the properties that earn the most are the last to stop paying rent.
  const pledge = owned.filter((i) => canMortgage(state, seat, i) === null).sort((x, y) => price(x) - price(y) || x - y)[0];
  if (pledge !== undefined) return { type: "mortgage", space: pledge };
  return { type: "bankrupt" };
}

/**
 * Plays for a player who is offline. Returns the one command that seat should
 * send now, or null when there is nothing for it to do. Pure: no mutation, no clock, no randomness
 * beyond what is derived from the state.
 */
export function botCommand(state: BusinessGameState, seat: number): BusinessCommand | null {
  const me = state.players[seat];
  if (!me || me.bankrupt || state.phase === "over") return null;

  // Someone is waiting on an answer: that comes before the bot's own turn.
  const offer = state.offers.find((o) => o.to === seat);
  if (offer) return { type: "respond", id: offer.id, accept: acceptOffer(state, seat, offer) };

  // An auction is open to every seat, not only the player whose turn it is.
  if (state.phase === "auction") return auctionCommand(state, seat);

  if (state.turn !== seat) return null;

  switch (state.phase) {
    case "roll": {
      const build = ownedBy(state, seat).find(
        (i) => me.cash >= houseCost(i) + BUILD_RESERVE && canBuild(state, seat, i) === null,
      );
      if (build !== undefined) return { type: "build", space: build };
      return { type: "roll" };
    }
    case "buy": {
      if (state.pending?.type !== "buy") return null;
      return me.cash - price(state.pending.space) >= BUY_RESERVE ? { type: "buy" } : { type: "auction" };
    }
    case "card":
    case "result":
      return { type: "ack" };
    case "market":
      // The Market is a gamble: never with an absent player's money.
      return { type: "market", stake: 0 };
    case "break":
      return { type: "break", rest: false };
    case "loandue": {
      const due = state.loans.filter((l) => l.borrower === seat && l.dueNow);
      // Two loans can fall due on the same lap, and `pending` keeps naming the first after it is dealt with.
      const pendingId = state.pending?.type === "loanDue" ? state.pending.id : null;
      const loan = due.find((l) => l.id === pendingId) ?? due[0];
      return loan ? { type: "settleLoan", id: loan.id } : null;
    }
    case "debt":
      return debtCommand(state, seat);
    case "end":
      return { type: "endTurn" };
    default:
      return null;
  }
}
