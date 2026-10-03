/**
 * Big Business rules engine. Deterministic given the state's seeded PRNG:
 * no I/O, no timers, no `Date.now()` — the caller passes `now`.
 *
 * `applyCommand` and `tick` work on a clone and return it, so a rejected
 * command can never leave a room half-updated.
 */
import {
  BUSINESS_BOARD,
  BUSINESS_CHANCE_CARDS,
  BUSINESS_ERRORS,
  BUSINESS_JAIL_INDEX,
  BUSINESS_PHASE_SECONDS,
  BUSINESS_RULES,
  BUSINESS_SETS,
  type BusinessCard,
} from "../constants";
import type {
  BusinessCommand,
  BusinessFx,
  BusinessGameState,
  BusinessLoan,
  BusinessOfferTerms,
  BusinessPending,
  BusinessPhase,
  BusinessPlayer,
  BusinessPublicState,
  BusinessRoomConfig,
} from "../types";
import {
  canBuild,
  canMortgage,
  canRedeem,
  canSellHouse,
  houseCost,
  houseResale,
  isBuyable,
  lapInterest,
  lenderCut,
  loanDue,
  mortgageValue,
  netWorth,
  ownedBy,
  ownsSet,
  redeemCost,
  rentFor,
  validateOffer,
} from "./compute";

const N = BUSINESS_BOARD.length;

export class BusinessRuleError extends Error {}

function fail(message: string): never {
  throw new BusinessRuleError(message);
}

const rs = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

/* ---------- seeded randomness ---------- */

/** mulberry32: advances `state.rng` and returns a float in [0, 1). */
function random(state: BusinessGameState): number {
  state.rng = (state.rng + 0x6d2b79f5) | 0;
  let t = state.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function rollDie(state: BusinessGameState): number {
  return 1 + Math.floor(random(state) * 6);
}

function shuffleDeck(state: BusinessGameState) {
  const deck = BUSINESS_CHANCE_CARDS.map((_, i) => i);
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(random(state) * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  state.deck = deck;
}

function drawCard(state: BusinessGameState): BusinessCard {
  if (!state.deck.length) shuffleDeck(state);
  return BUSINESS_CHANCE_CARDS[state.deck.shift() as number];
}

/* ---------- small helpers ---------- */

function log(state: BusinessGameState, text: string, seat?: number, only?: number[], fx?: BusinessFx) {
  state.log.unshift({ n: ++state.logSeq, text, seat, ...(only ? { only } : {}), ...(fx ? { fx } : {}) });
  if (state.log.length > BUSINESS_RULES.LOG_LIMIT) state.log.length = BUSINESS_RULES.LOG_LIMIT;
}

/** Everyone except these seats: who gets the public notice of a private deal. */
function othersThan(state: BusinessGameState, ...seats: number[]): number[] {
  return state.players.map((p) => p.seat).filter((s) => !seats.includes(s));
}

function active(state: BusinessGameState): BusinessPlayer {
  return state.players[state.turn];
}

function alive(state: BusinessGameState): BusinessPlayer[] {
  return state.players.filter((p) => !p.bankrupt);
}

function setPhase(
  state: BusinessGameState,
  phase: BusinessPhase,
  now: number,
  pending: BusinessPending | null = null,
) {
  state.phase = phase;
  state.pending = pending;
  if (phase === "over") state.deadline = null;
  else if (pending?.type === "auction") state.deadline = pending.endsAt;
  else state.deadline = now + BUSINESS_PHASE_SECONDS[phase as keyof typeof BUSINESS_PHASE_SECONDS] * 1000;
}

/**
 * Take `amount` from a player. Cash may go negative; the part they could not
 * cover is recorded in `owed` and reaches the creditor once they raise it.
 */
function pay(state: BusinessGameState, from: number, to: number | null, amount: number) {
  if (amount <= 0) return;
  const payer = state.players[from];
  const paidNow = Math.min(Math.max(0, payer.cash), amount);
  payer.cash -= amount;
  if (to !== null) state.players[to].cash += paidNow;
  if (amount > paidNow) state.owed.push({ to, amount: amount - paidNow });
}

function settleOwed(state: BusinessGameState) {
  for (const debt of state.owed) {
    if (debt.to !== null && !state.players[debt.to].bankrupt) state.players[debt.to].cash += debt.amount;
  }
  state.owed = [];
}

/** Ends the match. The winning team is the one given, or else the richest team still in. */
function finish(state: BusinessGameState, team: number | null) {
  const worth = state.players.map((p) => (p.bankrupt ? 0 : netWorth(state, p.seat)));
  // A team's score is what its players are worth together; a team with nobody left scores below any other.
  const teamWorth = (t: number) => {
    const members = state.players.filter((p) => p.team === t);
    return members.every((p) => p.bankrupt) ? -Infinity : members.reduce((sum, p) => sum + worth[p.seat], 0);
  };
  const ranking = state.players
    .map((p) => ({ seat: p.seat, worth: worth[p.seat], bankrupt: p.bankrupt, team: p.team }))
    .sort((a, b) => teamWorth(b.team) - teamWorth(a.team) || Number(a.bankrupt) - Number(b.bankrupt) || b.worth - a.worth);
  state.ranking = ranking;
  state.winnerTeam = team ?? ranking[0].team;
  // The face of the win: the richest player of the winning team.
  state.winner = (ranking.find((r) => r.team === state.winnerTeam) ?? ranking[0]).seat;
  state.offers = [];
  state.phase = "over";
  state.pending = null;
  state.deadline = null;
  log(state, `${state.players[state.winner].name} wins the match.`, state.winner);
}

/** Ends the match if one player is left. Returns true when the match is over. */
function checkOver(state: BusinessGameState): boolean {
  if (state.phase === "over") return true;
  const left = alive(state);
  // The match ends when only one team has anyone left.
  if (new Set(left.map((p) => p.team)).size > 1) return false;
  finish(state, left[0]?.team ?? null);
  return true;
}

function advance(state: BusinessGameState, now: number) {
  if (checkOver(state)) return;
  state.offers = [];
  state.owed = [];
  state.doubles = 0;
  state.again = false;
  state.lapsed = false;
  let i = state.turn;
  for (let k = 0; k < state.players.length * 2; k++) {
    i = (i + 1) % state.players.length;
    if (i === 0) state.round++;
    const p = state.players[i];
    if (p.bankrupt) continue;
    if (p.skip) {
      p.skip = false;
      log(state, `${p.name} is resting and skips this turn.`, p.seat);
      continue;
    }
    break;
  }
  state.turn = i;
  setPhase(state, "roll", now);
}

/** Called whenever a landing (or any step of the turn) has been fully resolved. */
function continueTurn(state: BusinessGameState, now: number) {
  const p = active(state);
  if (p.bankrupt) return advance(state, now);
  if (p.cash < 0) return setPhase(state, "debt", now);
  if (state.phase === "debt") log(state, `${p.name} paid off the debt.`, p.seat);
  settleOwed(state);
  // A loan came due while moving: settle it (or agree an extension) before the turn goes on.
  const dueLoan = state.loans.find((l) => l.borrower === p.seat && l.dueNow);
  if (dueLoan) {
    if (state.lapsed) {
      settleLoan(state, dueLoan);
      return continueTurn(state, now);
    }
    return setPhase(state, "loandue", now, { type: "loanDue", id: dueLoan.id });
  }
  // A timer already ran out on this player: the turn passes on at once, no extra roll.
  if (state.lapsed) return advance(state, now);
  if (state.again && !p.jail) {
    state.again = false;
    return setPhase(state, "roll", now);
  }
  state.again = false;
  setPhase(state, "end", now);
}

function sendToJail(state: BusinessGameState, p: BusinessPlayer, why: "speeding" | "gojail" | "card", text: string) {
  p.pos = BUSINESS_JAIL_INDEX;
  p.jail = 1;
  state.again = false;
  state.doubles = 0;
  log(state, text, p.seat, undefined, { kind: "jail", from: p.seat, to: null, amount: 0, why });
}

/** A due loan paid in full, now. The borrower may go short; the lender is paid once they raise it. */
function settleLoan(state: BusinessGameState, loan: BusinessLoan) {
  const p = state.players[loan.borrower];
  state.loans = state.loans.filter((l) => l.id !== loan.id);
  pay(state, p.seat, loan.lender, loan.due);
  log(state, `${p.name} paid back the loan from ${state.players[loan.lender].name}: ${rs(loan.due)}.`, p.seat, [p.seat, loan.lender], {
    kind: "repay",
    from: p.seat,
    to: loan.lender,
    amount: loan.due,
  });
}

/* ---------- movement and landing ---------- */

function paySalary(state: BusinessGameState, p: BusinessPlayer, landed: boolean) {
  p.cash += BUSINESS_RULES.SALARY;
  log(state, `${p.name} ${landed ? "landed on" : "passed"} Launch: +${rs(BUSINESS_RULES.SALARY)} salary.`, p.seat, undefined, {
    kind: "salary",
    from: null,
    to: p.seat,
    amount: BUSINESS_RULES.SALARY,
  });
}

/** A lap is complete: salary, interest on "each lap" loans, and deals counting down. */
function passLaunch(state: BusinessGameState, p: BusinessPlayer) {
  paySalary(state, p, false);

  for (const loan of state.loans) {
    if (loan.borrower !== p.seat || loan.dueNow) continue;
    if (loan.perLap > 0) {
      const lender = state.players[loan.lender];
      pay(state, p.seat, lender.seat, loan.perLap);
      log(state, `${p.name} paid ${lender.name} ${rs(loan.perLap)} interest on the loan.`, p.seat, [p.seat, lender.seat], {
        kind: "interest",
        from: p.seat,
        to: lender.seat,
        amount: loan.perLap,
      });
    }
    loan.lapsLeft--;
    if (loan.lapsLeft > 0) continue;
    // No automatic charge: the borrower is asked to pay or extend once the landing is done.
    loan.dueNow = true;
    log(state, `${p.name}'s loan from ${state.players[loan.lender].name} is due: ${rs(loan.due)}.`, p.seat, [p.seat, loan.lender]);
  }

  for (const i of ownedBy(state, p.seat)) {
    const prop = state.props[i];
    if (!prop.lend) continue;
    prop.lend.lapsLeft--;
    if (prop.lend.lapsLeft > 0) continue;
    const lender = prop.lend.to;
    prop.owner = lender;
    delete prop.lend;
    log(state, `${p.name} did not pay back in time. ${BUSINESS_BOARD[i].name} now belongs to ${state.players[lender].name}.`, lender);
  }
}

function startAuction(state: BusinessGameState, space: number, now: number) {
  const endsAt = now + BUSINESS_RULES.AUCTION_SECONDS * 1000;
  const open = Math.floor((BUSINESS_BOARD[space].price ?? 0) * BUSINESS_RULES.AUCTION_OPEN_RATE);
  setPhase(state, "auction", now, { type: "auction", space, open, bid: 0, by: null, passed: [], endsAt });
}

function finishAuction(state: BusinessGameState, now: number) {
  const a = state.pending;
  if (a?.type !== "auction") return;
  const name = BUSINESS_BOARD[a.space].name;
  if (a.by === null) {
    log(state, `Auction: no bids for ${name}. It stays unowned.`);
  } else {
    const w = state.players[a.by];
    // A deal struck during the auction may have left the winner short: then nobody gets it.
    if (w.cash < a.bid) {
      log(state, `Auction: ${w.name} can no longer pay ${rs(a.bid)} for ${name}. It stays unowned.`, w.seat);
      return continueTurn(state, now);
    }
    w.cash -= a.bid;
    state.props[a.space] = { owner: w.seat, houses: 0, mortgaged: false };
    log(state, `Auction: ${w.name} wins ${name} for ${rs(a.bid)}.`, w.seat, undefined, { kind: "buy", from: w.seat, to: null, amount: a.bid, space: a.space });
  }
  continueTurn(state, now);
}

/**
 * Rent goes to the owner, and part of it to the lender when the property is
 * mortgaged to a player. Nobody pays themselves or a teammate: a lender who
 * lands on a property they hold a share of pays only the owner's part.
 */
function chargeRent(state: BusinessGameState, p: BusinessPlayer, space: number) {
  const prop = state.props[space];
  const name = BUSINESS_BOARD[space].name;
  const owner = state.players[prop.owner];
  const rent = rentFor(state, space, state.dice[0] + state.dice[1]);
  const lender = prop.lend ? state.players[prop.lend.to] : null;
  const cut = prop.lend ? lenderCut(rent, prop.lend.share) : 0;
  const free = (q: BusinessPlayer) => q.team === p.team;
  const toOwner = free(owner) ? 0 : rent - cut;
  const toLender = lender && !free(lender) ? cut : 0;

  if (toOwner + toLender === 0) {
    const mate = owner.seat !== p.seat ? owner : lender;
    log(state, `${p.name} landed on ${name}. No rent between ${mate && mate.seat !== p.seat ? "teammates" : "its owners"}.`, p.seat);
    return;
  }
  pay(state, p.seat, owner.seat, toOwner);
  if (lender) pay(state, p.seat, lender.seat, toLender);
  const paid = toOwner + toLender;
  const text =
    toOwner && toLender
      ? `${p.name} paid ${rs(paid)} rent on ${name}: ${rs(toOwner)} to ${owner.name}, ${rs(toLender)} to ${lender?.name}.`
      : `${p.name} paid ${rs(paid)} rent to ${toOwner ? owner.name : lender?.name} for ${name}.`;
  log(state, text, p.seat, undefined, { kind: "rent", from: p.seat, to: toOwner ? owner.seat : (lender?.seat ?? owner.seat), amount: paid, space });
}

function land(state: BusinessGameState, now: number) {
  const p = active(state);
  const space = p.pos;
  const tile = BUSINESS_BOARD[space];

  if (isBuyable(space)) {
    const prop = state.props[space];
    if (!prop) {
      if (p.cash >= (tile.price ?? 0) && !state.lapsed) return setPhase(state, "buy", now, { type: "buy", space });
      log(state, `${p.name} cannot afford ${tile.name}. It goes to auction.`, p.seat);
      return startAuction(state, space, now);
    }
    if (prop.owner === p.seat && !prop.lend) log(state, `${p.name} owns ${tile.name}. Nothing to pay.`, p.seat);
    else if (prop.mortgaged) log(state, `${tile.name} is mortgaged to the bank. No rent due.`, p.seat);
    else chargeRent(state, p, space);
    return continueTurn(state, now);
  }

  // A player who already ran out of time this turn gets no more choices to make.
  const choice = tile.kind === "chance" || tile.kind === "market" || tile.kind === "break";
  if (choice && state.lapsed) return continueTurn(state, now);

  switch (tile.kind) {
    case "chance":
      return setPhase(state, "card", now, { type: "card", card: drawCard(state) });
    case "market":
      if (ownedBy(state, p.seat).length && p.cash >= BUSINESS_RULES.MARKET_MIN_STAKE)
        return setPhase(state, "market", now, { type: "market" });
      log(state, `${p.name} needs a property and some cash to play the Market.`, p.seat);
      // Say why on screen too, so the Market never looks like it did nothing.
      return setPhase(state, "result", now, {
        type: "result",
        tone: "mid",
        title: "Market closed",
        text: `To play the Market you need at least one property and ${rs(BUSINESS_RULES.MARKET_MIN_STAKE)} in cash.`,
      });
    case "levy":
      pay(state, p.seat, null, tile.fee ?? 0);
      log(state, `${p.name} paid the ${tile.name}: ${rs(tile.fee ?? 0)} to the bank.`, p.seat, undefined, {
        kind: "tax",
        from: p.seat,
        to: null,
        amount: tile.fee ?? 0,
        space,
      });
      break;
    case "break":
      return setPhase(state, "break", now, { type: "break" });
    case "gojail":
      sendToJail(state, p, "gojail", `${p.name} was sent to Jail.`);
      break;
    case "jail":
      log(state, `${p.name} is just visiting Jail.`, p.seat);
      break;
    default:
      break;
  }
  continueTurn(state, now);
}

function moveBy(state: BusinessGameState, steps: number, now: number) {
  const p = active(state);
  const from = p.pos;
  p.pos = (from + steps) % N;
  log(state, `${p.name} rolled ${state.dice[0]} + ${state.dice[1]} and landed on ${BUSINESS_BOARD[p.pos].name}.`, p.seat);
  if (p.pos < from) passLaunch(state, p);
  land(state, now);
}

function doRoll(state: BusinessGameState, now: number) {
  const p = active(state);
  const a = rollDie(state);
  const b = rollDie(state);
  state.dice = [a, b];
  state.rollSeq++;
  const doubles = a === b;

  if (p.jail > 0) {
    state.again = false;
    if (doubles) {
      p.jail = 0;
      log(state, `${p.name} rolled doubles and walks out of Jail free.`, p.seat);
      return moveBy(state, a + b, now);
    }
    if (p.jail >= BUSINESS_RULES.JAIL_TRIES) {
      p.jail = 0;
      pay(state, p.seat, null, BUSINESS_RULES.JAIL_FEE);
      log(state, `${p.name} missed doubles three times, pays ${rs(BUSINESS_RULES.JAIL_FEE)} and leaves Jail.`, p.seat, undefined, {
        kind: "tax",
        from: p.seat,
        to: null,
        amount: BUSINESS_RULES.JAIL_FEE,
      });
      return moveBy(state, a + b, now);
    }
    log(state, `${p.name} rolled ${a} + ${b}. No doubles, still in Jail (try ${p.jail} of ${BUSINESS_RULES.JAIL_TRIES}).`, p.seat);
    p.jail++;
    return setPhase(state, "end", now);
  }

  if (doubles) {
    state.doubles++;
    if (state.doubles > BUSINESS_RULES.MAX_EXTRA_ROLLS) {
      sendToJail(state, p, "speeding", `${p.name} rolled doubles three times in a row: overspeeding, straight to Jail.`);
      return continueTurn(state, now);
    }
    state.again = true;
  } else {
    state.again = false;
  }
  moveBy(state, a + b, now);
}

function applyCard(state: BusinessGameState, now: number) {
  const pending = state.pending;
  if (pending?.type !== "card") return;
  const p = active(state);
  const { effect, text } = pending.card;

  if (effect.type === "back" || effect.type === "jail") log(state, `${p.name} drew a Chance card: ${text}`, p.seat);
  if (effect.type === "back") {
    p.pos = (p.pos - effect.steps + N) % N;
    // Landing on Launch again pays the salary again. Only the salary: it is not a new lap.
    if (p.pos === 0) paySalary(state, p, true);
    return land(state, now);
  }
  if (effect.type === "jail") {
    sendToJail(state, p, "card", `${p.name} drew "Go to Jail" and goes straight there.`);
    return continueTurn(state, now);
  }

  let delta = 0;
  if (effect.type === "cash") delta = effect.amount;
  if (effect.type === "tax") delta = -BUSINESS_RULES.TAX_PER_PROPERTY * ownedBy(state, p.seat).length;
  if (effect.type === "repair") {
    for (const i of ownedBy(state, p.seat)) {
      const h = state.props[i].houses;
      delta -= h === BUSINESS_RULES.MAX_HOUSES ? BUSINESS_RULES.REPAIR_PER_HOTEL : h * BUSINESS_RULES.REPAIR_PER_HOUSE;
    }
  }
  log(state, `${p.name} drew a Chance card: ${text}`, p.seat, undefined, {
    kind: "card",
    from: delta >= 0 ? null : p.seat,
    to: delta >= 0 ? p.seat : null,
    amount: Math.abs(delta),
  });
  if (delta > 0) p.cash += delta;
  else pay(state, p.seat, null, -delta);
  continueTurn(state, now);
}

function playMarket(state: BusinessGameState, stake: number, now: number) {
  const p = active(state);
  if (stake === 0) {
    log(state, `${p.name} skipped the Market.`, p.seat);
    return continueTurn(state, now);
  }
  const max = Math.min(p.cash, BUSINESS_RULES.MARKET_MAX_STAKE);
  if (stake < BUSINESS_RULES.MARKET_MIN_STAKE || stake > max) fail(`Stake between ${rs(BUSINESS_RULES.MARKET_MIN_STAKE)} and ${rs(max)}.`);
  const dice: [number, number] = [rollDie(state), rollDie(state)];
  const sum = dice[0] + dice[1];
  let pending: BusinessPending;
  if (sum <= BUSINESS_RULES.MARKET_LOSE_MAX) {
    const loss = Math.floor(stake * BUSINESS_RULES.MARKET_LOSS_RATE);
    pay(state, p.seat, null, loss);
    pending = { type: "result", dice, tone: "bad", title: "Market crash", text: `${p.name} rolled ${sum} and loses half the stake: ${rs(loss)}.` };
  } else if (sum <= BUSINESS_RULES.MARKET_FLAT_MAX) {
    pending = { type: "result", dice, tone: "mid", title: "Flat market", text: `${p.name} rolled ${sum}. Nothing gained, nothing lost.` };
  } else {
    p.cash += stake;
    pending = { type: "result", dice, tone: "good", title: "Market boom", text: `${p.name} rolled ${sum} and doubles the stake: +${rs(stake)}.` };
  }
  const won = pending.tone === "good" ? stake : pending.tone === "bad" ? -Math.floor(stake * BUSINESS_RULES.MARKET_LOSS_RATE) : 0;
  log(state, `Market: ${pending.text}`, p.seat, undefined, {
    kind: "market",
    from: won >= 0 ? null : p.seat,
    to: won >= 0 ? p.seat : null,
    amount: Math.abs(won),
  });
  setPhase(state, "result", now, pending);
}

/* ---------- bankruptcy ---------- */

/**
 * Takes a player out of the match, however they went (bankrupt, left, or
 * removed for missed turns), and settles what they owe in cash:
 *
 *  1. A property shared with a player goes to that lender: it was the security.
 *  2. Everything else is sold to the bank: each house at its resale price, each
 *     property at its mortgage value (nothing for one already mortgaged to the
 *     bank), plus any cash in hand. That is the pot.
 *  3. The pot pays the players they owe: unpaid rent or loan money from this
 *     turn, and every cash loan still running. Enough for all: each is paid in
 *     full and the rest goes to the bank. Not enough: each gets their share in
 *     proportion to what they are owed, and the rest is lost.
 *
 * Nobody ever receives the properties themselves; they all return to the bank.
 */
function doBankrupt(state: BusinessGameState, seat: number, forfeit?: string) {
  const p = state.players[seat];
  let pot = Math.max(0, p.cash);
  for (const i of ownedBy(state, seat)) {
    const prop = state.props[i];
    if (prop.lend) {
      prop.owner = prop.lend.to;
      prop.houses = 0;
      delete prop.lend;
      continue;
    }
    pot += prop.houses * houseResale(i);
    if (!prop.mortgaged) pot += mortgageValue(i);
    delete state.props[i];
  }

  // What each other player is owed, in seat order.
  const claims = new Map<number, number>();
  const claim = (to: number, amount: number) => {
    if (!state.players[to].bankrupt) claims.set(to, (claims.get(to) ?? 0) + amount);
  };
  if (seat === state.turn) for (const d of state.owed) if (d.to !== null) claim(d.to, d.amount);
  for (const loan of state.loans) if (loan.borrower === seat) claim(loan.lender, loan.due);

  const total = [...claims.values()].reduce((sum, a) => sum + a, 0);
  const shares = [...claims].sort((a, b) => a[0] - b[0]);
  let left = Math.min(pot, total);
  const paid: string[] = [];
  shares.forEach(([to, owed], k) => {
    // In proportion to what each is owed; the last one takes the odd rupees.
    const part = k === shares.length - 1 ? left : Math.min(left, Math.floor((Math.min(pot, total) * owed) / total));
    left -= part;
    state.players[to].cash += part;
    paid.push(`${state.players[to].name} ${rs(part)} of ${rs(owed)}`);
    if (part > 0) log(state, `${state.players[to].name} received ${rs(part)} from ${p.name}'s sale.`, to, undefined, { kind: "repay", from: seat, to, amount: part });
  });

  for (const i of Object.keys(state.props).map(Number)) {
    if (state.props[i].lend?.to === seat) delete state.props[i].lend;
  }
  state.loans = state.loans.filter((l) => l.lender !== seat && l.borrower !== seat);
  state.offers = state.offers.filter((o) => o.from !== seat && o.to !== seat);
  if (seat === state.turn) state.owed = [];
  p.cash = 0;
  p.bankrupt = true;
  p.jail = 0;
  const why = forfeit ? `${p.name} ${forfeit}.` : `${p.name} is bankrupt.`;
  const outcome = paid.length
    ? ` Everything is sold to the bank for ${rs(pot)}: ${paid.join(", ")}.`
    : " Their properties return to the bank.";
  log(state, why + outcome, seat, undefined, { kind: "out", from: seat, to: null, amount: 0 });
}

/* ---------- offers ---------- */

function executeOffer(state: BusinessGameState, from: number, to: number, terms: BusinessOfferTerms) {
  const P = state.players;
  if (terms.kind === "loan") {
    P[terms.lender].cash -= terms.amount;
    P[terms.borrower].cash += terms.amount;
    const due = loanDue(terms.amount, terms.interestPct, terms.interestMode);
    const perLap = terms.interestMode === "lap" ? lapInterest(terms.amount, terms.interestPct) : 0;
    state.loans.push({
      id: ++state.idSeq,
      lender: terms.lender,
      borrower: terms.borrower,
      amount: terms.amount,
      interestPct: terms.interestPct,
      interestMode: terms.interestMode,
      perLap,
      due,
      lapsLeft: terms.laps,
    });
    log(state, `${P[terms.lender].name} lent ${P[terms.borrower].name} some cash.`, terms.lender, othersThan(state, from, to), {
      kind: "loan",
      from: terms.lender,
      to: terms.borrower,
      amount: 0,
    });
    log(state, `${P[terms.lender].name} lent ${P[terms.borrower].name} ${rs(terms.amount)}. ${rs(due)} is due within ${terms.laps} lap${terms.laps === 1 ? "" : "s"}.`, terms.lender, [from, to], {
      kind: "loan",
      from: terms.lender,
      to: terms.borrower,
      amount: terms.amount,
    });
    return;
  }
  if (terms.kind === "mortgage") {
    P[terms.lender].cash -= terms.advance;
    P[terms.owner].cash += terms.advance;
    state.props[terms.space].lend = { to: terms.lender, share: terms.share, advance: terms.advance, lapsLeft: terms.laps };
    log(state, `${P[terms.owner].name} mortgaged ${BUSINESS_BOARD[terms.space].name} to ${P[terms.lender].name}.`, terms.owner, othersThan(state, from, to), {
      kind: "loan",
      from: terms.lender,
      to: terms.owner,
      amount: 0,
      space: terms.space,
    });
    log(state, `${P[terms.owner].name} mortgaged ${BUSINESS_BOARD[terms.space].name} to ${P[terms.lender].name} for ${rs(terms.advance)} and ${terms.share}% of the rent.`, terms.owner, [from, to], {
      kind: "loan",
      from: terms.lender,
      to: terms.owner,
      amount: terms.advance,
      space: terms.space,
    });
    return;
  }
  if (terms.kind === "renew") {
    const loan = state.loans.find((l) => l.id === terms.loan);
    if (!loan) return;
    P[from].cash += terms.extra - terms.pay;
    P[to].cash += terms.pay - terms.extra;
    loan.amount = loan.due - terms.pay + terms.extra;
    loan.interestPct = terms.interestPct;
    loan.interestMode = terms.interestMode;
    loan.perLap = terms.interestMode === "lap" ? lapInterest(loan.amount, terms.interestPct) : 0;
    loan.due = loanDue(loan.amount, terms.interestPct, terms.interestMode);
    loan.lapsLeft = terms.laps;
    loan.dueNow = false;
    log(
      state,
      `${P[from].name} and ${P[to].name} extended a loan: ${rs(loan.amount)} for ${terms.laps} more lap${terms.laps === 1 ? "" : "s"}.`,
      from,
      [from, to],
      { kind: "loan", from: to, to: from, amount: loan.amount },
    );
    return;
  }
  P[from].cash += terms.get.cash - terms.give.cash;
  P[to].cash += terms.give.cash - terms.get.cash;
  for (const i of terms.give.spaces) state.props[i].owner = to;
  for (const i of terms.get.spaces) state.props[i].owner = from;
  // Public: everyone sees that a trade happened. What was swapped shows only on the board.
  log(state, `${P[from].name} and ${P[to].name} made a trade.`, from, undefined, { kind: "trade", from, to, amount: 0 });
}

/* ---------- public API ---------- */

export function createGame(
  seats: { name: string; color: string; team: number }[],
  config: BusinessRoomConfig,
  seed: number,
  now: number,
): BusinessGameState {
  const state: BusinessGameState = {
    rev: 1,
    phase: "roll",
    turn: 0,
    round: 1,
    players: seats.map((s, seat) => ({
      seat,
      name: s.name,
      color: s.color,
      cash: BUSINESS_RULES.START_CASH,
      pos: 0,
      jail: 0,
      skip: false,
      bankrupt: false,
      missed: 0,
      team: s.team,
    })),
    props: {},
    dice: [1, 1],
    rollSeq: 0,
    doubles: 0,
    again: false,
    pending: null,
    owed: [],
    loans: [],
    offers: [],
    log: [],
    logSeq: 0,
    idSeq: 0,
    deadline: null,
    endsAt: config.minutes > 0 ? now + config.minutes * 60_000 : null,
    missLimit: config.missLimit,
    lapsed: false,
    winner: null,
    winnerTeam: null,
    ranking: null,
    rng: seed | 0,
    deck: [],
  };
  shuffleDeck(state);
  log(state, `The match begins. ${state.players[0].name} rolls first.`);
  setPhase(state, "roll", now);
  return state;
}

/**
 * What one seat may see. Server-only fields are dropped, and so are deals the
 * seat is not part of: offers between other players, and their private log lines.
 */
export function publicView(state: BusinessGameState, seat: number): BusinessPublicState {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { rng, deck, ...rest } = state;
  return {
    ...rest,
    offers: rest.offers.filter((o) => o.from === seat || o.to === seat),
    log: rest.log.filter((entry) => !entry.only || entry.only.includes(seat)),
  };
}

const MANAGE_PHASES: BusinessPhase[] = ["roll", "end"];
const RAISE_PHASES: BusinessPhase[] = ["roll", "end", "debt", "loandue"];

/** Validates and applies one player command. Throws `BusinessRuleError` when it is not allowed. */
export function applyCommand(
  prev: BusinessGameState,
  seat: number,
  cmd: BusinessCommand,
  now: number,
): BusinessGameState {
  const state = structuredClone(prev);
  if (state.phase === "over") fail("The match is over.");
  const me = state.players[seat];
  if (!me || me.bankrupt) fail("You are out of the match.");
  const mine = seat === state.turn;
  const need = (...phases: BusinessPhase[]) => {
    if (!mine) fail(BUSINESS_ERRORS.NOT_YOUR_TURN);
    if (!phases.includes(state.phase)) fail(BUSINESS_ERRORS.WRONG_PHASE);
  };
  const guard = (reason: string | null) => {
    if (reason) fail(reason);
  };

  switch (cmd.type) {
    case "roll":
      need("roll");
      me.missed = 0;
      doRoll(state, now);
      break;

    case "payJail":
      need("roll");
      if (!me.jail) fail("You are not in Jail.");
      if (me.cash < BUSINESS_RULES.JAIL_FEE) fail("Not enough cash.");
      me.cash -= BUSINESS_RULES.JAIL_FEE;
      me.jail = 0;
      log(state, `${me.name} paid ${rs(BUSINESS_RULES.JAIL_FEE)} and left Jail.`, seat, undefined, { kind: "tax", from: seat, to: null, amount: BUSINESS_RULES.JAIL_FEE });
      break;

    case "buy": {
      need("buy");
      if (state.pending?.type !== "buy") fail(BUSINESS_ERRORS.WRONG_PHASE);
      const space = state.pending.space;
      const tile = BUSINESS_BOARD[space];
      if (me.cash < (tile.price ?? 0)) fail("Not enough cash.");
      me.cash -= tile.price ?? 0;
      state.props[space] = { owner: seat, houses: 0, mortgaged: false };
      log(state, `${me.name} bought ${tile.name} for ${rs(tile.price ?? 0)}.`, seat, undefined, { kind: "buy", from: seat, to: null, amount: tile.price ?? 0, space });
      if (tile.set && ownsSet(state, seat, tile.set))
        log(state, `${me.name} completed the ${BUSINESS_SETS[tile.set].name} set. Rent there is now 3 times base.`, seat);
      continueTurn(state, now);
      break;
    }

    case "auction":
      need("buy");
      if (state.pending?.type !== "buy") fail(BUSINESS_ERRORS.WRONG_PHASE);
      log(state, `${me.name} declined ${BUSINESS_BOARD[state.pending.space].name}. It goes to auction.`, seat);
      startAuction(state, state.pending.space, now);
      break;

    case "bid": {
      const a = state.pending;
      if (state.phase !== "auction" || a?.type !== "auction") fail(BUSINESS_ERRORS.WRONG_PHASE);
      if (a.by === seat) fail("You already hold the highest bid.");
      if (a.passed.includes(seat)) fail("You passed on this auction.");
      const min = a.by === null ? a.open : a.bid + BUSINESS_RULES.BID_STEP;
      if (cmd.amount < min) fail(`Bid at least ${rs(min)}.`);
      if (cmd.amount > me.cash) fail("Not enough cash.");
      a.bid = cmd.amount;
      a.by = seat;
      const floor = now + BUSINESS_RULES.AUCTION_EXTEND_SECONDS * 1000;
      if (a.endsAt < floor) a.endsAt = floor;
      state.deadline = a.endsAt;
      break;
    }

    case "passBid": {
      const a = state.pending;
      if (state.phase !== "auction" || a?.type !== "auction") fail(BUSINESS_ERRORS.WRONG_PHASE);
      if (a.by === seat) fail("You hold the highest bid.");
      if (!a.passed.includes(seat)) a.passed.push(seat);
      if (alive(state).every((p) => p.seat === a.by || a.passed.includes(p.seat))) finishAuction(state, now);
      break;
    }

    case "ack":
      need("card", "result");
      if (state.phase === "card") applyCard(state, now);
      else continueTurn(state, now);
      break;

    case "market":
      need("market");
      playMarket(state, cmd.stake, now);
      break;

    case "break":
      need("break");
      me.skip = cmd.rest;
      log(state, cmd.rest ? `${me.name} chose to rest and will skip the next turn.` : `${me.name} took a short break and keeps playing.`, seat);
      continueTurn(state, now);
      break;

    case "endTurn":
      need("end");
      advance(state, now);
      break;

    case "build": {
      need(...MANAGE_PHASES);
      guard(canBuild(state, seat, cmd.space));
      me.cash -= houseCost(cmd.space);
      const built = ++state.props[cmd.space].houses;
      log(state, `${me.name} built ${built === BUSINESS_RULES.MAX_HOUSES ? "a hotel" : "a house"} in ${BUSINESS_BOARD[cmd.space].name}.`, seat, undefined, {
        kind: "build",
        from: seat,
        to: null,
        amount: houseCost(cmd.space),
        space: cmd.space,
      });
      break;
    }

    case "sellHouse":
      need(...RAISE_PHASES);
      guard(canSellHouse(state, seat, cmd.space));
      state.props[cmd.space].houses--;
      me.cash += houseResale(cmd.space);
      log(state, `${me.name} sold a house in ${BUSINESS_BOARD[cmd.space].name} for ${rs(houseResale(cmd.space))}.`, seat, undefined, {
        kind: "bank",
        from: null,
        to: seat,
        amount: houseResale(cmd.space),
        space: cmd.space,
      });
      break;

    case "mortgage":
      need(...RAISE_PHASES);
      guard(canMortgage(state, seat, cmd.space));
      state.props[cmd.space].mortgaged = true;
      me.cash += mortgageValue(cmd.space);
      log(state, `${me.name} mortgaged ${BUSINESS_BOARD[cmd.space].name} to the bank for ${rs(mortgageValue(cmd.space))}.`, seat, undefined, {
        kind: "bank",
        from: null,
        to: seat,
        amount: mortgageValue(cmd.space),
        space: cmd.space,
      });
      break;

    case "redeem":
      need(...MANAGE_PHASES);
      guard(canRedeem(state, seat, cmd.space));
      me.cash -= redeemCost(cmd.space);
      state.props[cmd.space].mortgaged = false;
      log(state, `${me.name} redeemed ${BUSINESS_BOARD[cmd.space].name} from the bank for ${rs(redeemCost(cmd.space))}.`, seat, undefined, {
        kind: "bank",
        from: seat,
        to: null,
        amount: redeemCost(cmd.space),
        space: cmd.space,
      });
      break;

    case "offer": {
      need(...RAISE_PHASES);
      guard(validateOffer(state, seat, cmd.to, cmd.terms));
      state.offers = state.offers.filter((o) => o.from !== seat);
      state.offers.push({
        id: ++state.idSeq,
        from: seat,
        to: cmd.to,
        terms: cmd.terms,
        expiresAt: now + BUSINESS_RULES.OFFER_SECONDS * 1000,
      });
      // Keep the turn open long enough for the other player to answer.
      if (state.deadline !== null) state.deadline = Math.max(state.deadline, now + (BUSINESS_RULES.OFFER_SECONDS + 2) * 1000);
      break;
    }

    case "respond": {
      const offer = state.offers.find((o) => o.id === cmd.id);
      if (!offer || offer.to !== seat) fail("That offer is no longer open.");
      state.offers = state.offers.filter((o) => o.id !== offer.id);
      if (!cmd.accept) {
        log(state, `${me.name} declined ${state.players[offer.from].name}'s offer.`, seat, [seat, offer.from]);
        break;
      }
      guard(validateOffer(state, offer.from, offer.to, offer.terms));
      executeOffer(state, offer.from, offer.to, offer.terms);
      break;
    }

    case "cancelOffer": {
      const offer = state.offers.find((o) => o.id === cmd.id);
      if (!offer || offer.from !== seat) fail("That offer is no longer open.");
      state.offers = state.offers.filter((o) => o.id !== offer.id);
      break;
    }

    case "settleLoan": {
      need("loandue");
      const loan = state.loans.find((l) => l.id === cmd.id);
      if (!loan || loan.borrower !== seat || !loan.dueNow) fail("That loan is not due.");
      settleLoan(state, loan);
      break;
    }

    case "repayLoan": {
      need(...MANAGE_PHASES, "loandue");
      const loan = state.loans.find((l) => l.id === cmd.id);
      if (!loan || loan.borrower !== seat) fail("That loan is not yours.");
      if (me.cash < loan.due) fail("Not enough cash.");
      me.cash -= loan.due;
      state.players[loan.lender].cash += loan.due;
      state.loans = state.loans.filter((l) => l.id !== loan.id);
      log(state, `${me.name} repaid ${state.players[loan.lender].name} ${rs(loan.due)}.`, seat, [seat, loan.lender], {
        kind: "repay",
        from: seat,
        to: loan.lender,
        amount: loan.due,
      });
      break;
    }

    case "repayMortgage": {
      need(...MANAGE_PHASES);
      const prop = state.props[cmd.space];
      if (!prop || prop.owner !== seat || !prop.lend) fail("That property is not mortgaged to a player.");
      if (me.cash < prop.lend.advance) fail("Not enough cash.");
      const lender = state.players[prop.lend.to];
      me.cash -= prop.lend.advance;
      lender.cash += prop.lend.advance;
      log(state, `${me.name} paid ${lender.name} ${rs(prop.lend.advance)} and took ${BUSINESS_BOARD[cmd.space].name} back.`, seat, [seat, lender.seat], {
        kind: "repay",
        from: seat,
        to: lender.seat,
        amount: prop.lend.advance,
        space: cmd.space,
      });
      delete prop.lend;
      break;
    }

    case "bankrupt":
      need("debt");
      doBankrupt(state, seat);
      advance(state, now);
      break;

    case "leave": {
      const a = state.pending;
      if (a?.type === "auction") {
        if (a.by === seat) {
          a.by = null;
          a.bid = 0;
        }
        a.passed = a.passed.filter((s) => s !== seat);
      }
      doBankrupt(state, seat, "left the match");
      if (mine) advance(state, now);
      else checkOver(state);
      break;
    }
  }

  // Raising cash (or an accepted offer) may have cleared the active player's debt.
  if (state.phase === "debt" && active(state).cash >= 0) continueTurn(state, now);
  // The due loan was paid or extended: carry on with the turn, or move to the next loan that is due.
  if (state.phase === "loandue") {
    const asked = state.pending?.type === "loanDue" ? state.pending.id : null;
    if (!state.loans.some((l) => l.id === asked && l.dueNow)) continueTurn(state, now);
  }
  state.rev++;
  return state;
}

/**
 * Runs the clock: expires offers, ends the match at the time limit, and takes
 * the default action when a phase deadline passes. Returns the same object
 * when nothing changed.
 */
export function tick(prev: BusinessGameState, now: number): BusinessGameState {
  if (prev.phase === "over") return prev;
  const offersExpired = prev.offers.some((o) => o.expiresAt <= now);
  const timeUp = prev.endsAt !== null && now >= prev.endsAt;
  const phaseDue = prev.deadline !== null && now >= prev.deadline;
  if (!offersExpired && !timeUp && !phaseDue) return prev;

  const state = structuredClone(prev);
  state.offers = state.offers.filter((o) => o.expiresAt > now);

  if (timeUp) {
    log(state, "Time is up. The richest player wins.");
    finish(state, null);
  } else if (phaseDue) {
    const p = active(state);
    // No bot plays for an absent player. A turn where any of their timers ran out
    // counts as missed (once per turn); rolling the dice clears the count.
    // An auction is everyone's clock, debt has its own ending, and a result pop-up only needs an OK.
    const counts = state.phase !== "auction" && state.phase !== "debt" && state.phase !== "result";
    if (counts && !state.lapsed) {
      state.lapsed = true;
      p.missed++;
      if (state.phase !== "roll" && p.missed < state.missLimit)
        log(state, `${p.name} ran out of time (${p.missed} of ${state.missLimit} missed).`, p.seat);
    }
    switch (state.phase) {
      case "roll":
        if (p.missed >= state.missLimit) {
          doBankrupt(state, p.seat, `missed ${p.missed} turns in a row and is out`);
        } else {
          log(state, `${p.name} missed the turn (${p.missed} of ${state.missLimit}).`, p.seat);
        }
        advance(state, now);
        break;
      case "buy":
        if (state.pending?.type === "buy") startAuction(state, state.pending.space, now);
        break;
      case "auction":
        finishAuction(state, now);
        break;
      case "card":
        applyCard(state, now);
        break;
      case "result":
        continueTurn(state, now);
        break;
      case "market":
        playMarket(state, 0, now);
        break;
      case "break":
        p.skip = false;
        continueTurn(state, now);
        break;
      case "debt":
        doBankrupt(state, p.seat);
        advance(state, now);
        break;
      case "loandue":
        // No answer: the loan is paid in full (continueTurn settles it, as the turn has lapsed).
        continueTurn(state, now);
        break;
      case "end":
        advance(state, now);
        break;
      default:
        break;
    }
  }

  state.rev++;
  return state;
}

