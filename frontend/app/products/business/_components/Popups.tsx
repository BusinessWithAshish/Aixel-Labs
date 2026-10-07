'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowDownLeft, ArrowLeft, ArrowRight, ArrowUpRight, CircleHelp, Coffee, Dices, HandCoins, Handshake, House, IndianRupee, LockKeyhole, Landmark as BankIcon, Map, Minus, ScrollText, Siren, TrendingDown, TrendingUp } from 'lucide-react';
import { BUSINESS_BOARD, BUSINESS_RULES, BUSINESS_SETS, type BusinessCard } from '@aixellabs/backend/business/constants';
import { canMortgage, canSellHouse, cardDelta, lapInterest, loanDue, maxLoan, ownedBy, shareOfCash, splitPair, validateOffer } from '@aixellabs/backend/business/compute';
import type { BusinessInterestMode, BusinessLoan, BusinessLogEntry, BusinessOffer, BusinessPending, BusinessPublicState } from '@aixellabs/backend/business/types';
import type { BusinessSend } from '../_hooks/use-business-room';
import { cn } from '@/lib/utils';
import { cssVars, Die, HomeMark } from '../_lib/art';
import { sfx, sfxShared } from '../_lib/sound';
import { rs } from '../_lib/client';
import { Avatar, Cash, GButton, Pop, Ribbon, Slider } from './bits';
import { Houses } from './Board';
import { CashChip, MiniCard, MiniCards } from './MiniCard';
import { SplitView } from './SplitView';
import { InterestMode } from './OfferComposer';

const LOSE_MAX = BUSINESS_RULES.MARKET_LOSE_MAX;
const FLAT_MAX = BUSINESS_RULES.MARKET_FLAT_MAX;

/** The three Market outcomes, shown the same way on the board, in the book and when playing. `hit` lights the band a roll fell in. */
function MarketOdds({ hit }: { hit?: number }) {
    const band = hit === undefined ? null : hit <= LOSE_MAX ? 'bad' : hit <= FLAT_MAX ? 'mid' : 'good';
    return (
        <div className={cn('odds big', band && 'lit', band && `lit-${band}`)}>
            <b className="bad">
                2–{LOSE_MAX}
                <small>lose your stake</small>
            </b>
            <b className="mid">
                {LOSE_MAX + 1}–{FLAT_MAX}
                <small>nothing happens</small>
            </b>
            <b className="good">
                {FLAT_MAX + 1}–12
                <small>double your stake</small>
            </b>
        </div>
    );
}

type Base = { state: BusinessPublicState; me: number; send: BusinessSend };

export function CardPopup({ state, me, send, card }: Base & { card: BusinessCard }) {
    const p = state.players[state.turn];
    // A card names a share ("10% of your cash"): the amount it comes to is shown with it.
    const delta = cardDelta(state, state.turn, card.effect);
    return (
        <Pop>
            <div className="bigcard ch">
                <CircleHelp className="lu" />
                <small>Chance</small>
                {card.text}
                {delta !== 0 && <b className={delta > 0 ? 'cardamt good' : 'cardamt bad'}>{delta > 0 ? `+${rs(delta)}` : `−${rs(-delta)}`}</b>}
            </div>
            {state.turn === me ? (
                <GButton tone="gold" size="big" onClick={() => send({ type: 'ack' })}>
                    OK
                </GButton>
            ) : (
                <p className="small center">{p.name} drew this card.</p>
            )}
        </Pop>
    );
}

/** How long the Market dice tumble before the result shows. */
const MARKET_ROLL_MS = 1300;

export function ResultPopup({ state, me, send, pending }: Base & { pending: Extract<BusinessPending, { type: 'result' }> }) {
    const Icon = pending.tone === 'bad' ? TrendingDown : pending.tone === 'good' ? TrendingUp : Minus;
    const dice = pending.dice;
    // Market: the dice tumble first, then the total, the band it fell in, and the result.
    const [spin, setSpin] = useState(0);
    const [shown, setShown] = useState(!dice);
    useEffect(() => {
        if (!dice) return;
        sfx('dice');
        const raf = requestAnimationFrame(() => setSpin(2));
        const timer = window.setTimeout(() => {
            setShown(true);
            sfx(pending.tone === 'good' ? 'income' : pending.tone === 'bad' ? 'pay' : 'card');
        }, MARKET_ROLL_MS);
        return () => {
            cancelAnimationFrame(raf);
            window.clearTimeout(timer);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    const sum = dice ? dice[0] + dice[1] : 0;
    return (
        <Pop>
            <div className={cn('bigcard', shown ? pending.tone : 'mid')}>
                {dice ? (
                    <>
                        <small>{shown ? pending.title : 'Rolling the market…'}</small>
                        <div className="mdice">
                            <Die value={dice[0]} spin={spin} />
                            <Die value={dice[1]} spin={spin} flip />
                        </div>
                        <b className={cn('msum', shown && 'on')}>{shown ? sum : '?'}</b>
                        <MarketOdds hit={shown ? sum : undefined} />
                        <span className={cn('mtext', shown && 'on')}>{pending.text}</span>
                    </>
                ) : (
                    <>
                        <Icon className="lu" />
                        <small>{pending.title}</small>
                        {pending.text}
                    </>
                )}
            </div>
            {state.turn === me && (
                <GButton tone="gold" size="big" disabled={!shown} onClick={() => send({ type: 'ack' })}>
                    OK
                </GButton>
            )}
        </Pop>
    );
}

export function BreakPopup({ state, me, send, startPicking = false }: Base & { startPicking?: boolean }) {
    const [picking, setPicking] = useState(startPicking);
    /** Anyone still playing who is not already in Jail can be sent there. */
    const targets = state.players.filter((p) => p.seat !== me && !p.bankrupt && !p.jail);
    return (
        <Pop>
            <Ribbon>Take a break</Ribbon>
            <div className="stackc">{picking ? <Siren style={{ width: 44, height: 44 }} /> : <Coffee style={{ width: 44, height: 44 }} />}</div>
            <p className="center" style={{ fontWeight: 800 }}>
                {picking ? 'Who goes to Jail?' : 'Rest and skip your next turn, keep playing, or send someone to Jail?'}
            </p>
            {picking ? (
                <>
                    <div className="dealwith">
                        {targets.map((p) => (
                            <button key={p.seat} type="button" className="plate dw" onClick={() => send({ type: 'break', rest: false, jail: p.seat })}>
                                <Avatar name={p.name} color={p.color} />
                                <b>{p.name}</b>
                                <Cash value={p.cash} />
                                <small>Straight to Jail</small>
                            </button>
                        ))}
                    </div>
                    <GButton tone="red" onClick={() => setPicking(false)}>
                        Back
                    </GButton>
                </>
            ) : (
                <>
                    <div className="btns">
                        <GButton tone="blue" size="big" onClick={() => send({ type: 'break', rest: true })}>
                            Rest
                        </GButton>
                        <GButton tone="green" size="big" onClick={() => send({ type: 'break', rest: false })}>
                            Keep playing
                        </GButton>
                    </div>
                    <GButton tone="orange" disabled={!targets.length} onClick={() => setPicking(true)}>
                        <Siren className="lu" />
                        Send someone to Jail
                    </GButton>
                </>
            )}
        </Pop>
    );
}

/**
 * Choose a stake, see exactly what each roll would do to your cash, then roll.
 * Every number has a fixed-width slot, so moving the slider never moves the layout.
 */
export function MarketPopup({ state, me, send }: Base) {
    const cash = state.players[me].cash;
    const max = Math.floor(Math.min(cash, BUSINESS_RULES.MARKET_MAX_STAKE) / 10) * 10;
    const [stake, setStake] = useState(Math.min(100, max));
    const rows = [
        { tone: 'bad', range: `2–${LOSE_MAX}`, label: 'Crash', delta: -stake, Icon: TrendingDown },
        { tone: 'mid', range: `${LOSE_MAX + 1}–${FLAT_MAX}`, label: 'Flat', delta: 0, Icon: Minus },
        { tone: 'good', range: `${FLAT_MAX + 1}–12`, label: 'Boom', delta: stake, Icon: TrendingUp },
    ];
    return (
        <Pop>
            <Ribbon>Play the market</Ribbon>
            <div className="stake">
                <span className="small">Your stake</span>
                <Cash value={stake} />
            </div>
            <input
                type="range"
                className="stakebar"
                aria-label="Your stake"
                min={BUSINESS_RULES.MARKET_MIN_STAKE}
                max={Math.max(BUSINESS_RULES.MARKET_MIN_STAKE, max)}
                step={10}
                value={stake}
                onChange={(e) => setStake(Number(e.target.value))}
            />
            <div className="outcomes">
                <div className="oh">
                    <span>Roll</span>
                    <span>You</span>
                    <span>Cash after</span>
                </div>
                {rows.map(({ tone, range, label, delta, Icon }) => (
                    <div key={tone} className={`orow ${tone}`}>
                        <span className="orange">
                            <Icon className="lu" />
                            <b>{range}</b>
                            <small>{label}</small>
                        </span>
                        <span className="odelta">{delta === 0 ? '±₹0' : `${delta > 0 ? '+' : '−'}${rs(Math.abs(delta))}`}</span>
                        <span className="oafter">{rs(cash + delta)}</span>
                    </div>
                ))}
            </div>
            <div className="btns">
                <GButton tone="green" size="big" style={{ flex: '2 1 0' }} onClick={() => send({ type: 'market', stake })}>
                    <Dices className="lu" />
                    Roll the dice
                </GButton>
                <GButton tone="red" style={{ flex: '1 1 0' }} onClick={() => send({ type: 'market', stake: 0 })}>
                    Skip
                </GButton>
            </div>
        </Pop>
    );
}

/** The Market rules, opened from the board: pictures first, very few words. */
export function MarketBook({ onClose }: { onClose: () => void }) {
    return (
        <Pop onClose={onClose}>
            <Ribbon>Market book</Ribbon>
            <div className="steps3">
                <span>
                    <House className="lu" />
                    Own a property
                </span>
                <ArrowRight className="lu arrow" />
                <span>
                    <IndianRupee className="lu" />
                    Stake {rs(BUSINESS_RULES.MARKET_MIN_STAKE)}–{rs(BUSINESS_RULES.MARKET_MAX_STAKE)}
                </span>
                <ArrowRight className="lu arrow" />
                <span>
                    <Dices className="lu" />
                    Roll 2 dice
                </span>
            </div>
            <MarketOdds />
            <GButton tone="gold" size="big" onClick={onClose}>
                Got it
            </GButton>
        </Pop>
    );
}

export function ChanceBook({ onClose }: { onClose: () => void }) {
    const tile = (tone: string, icon: React.ReactNode, title: string, text: string) => (
        <div className={`mini ${tone}`}>
            {icon}
            <b>{title}</b>
            <small>{text}</small>
        </div>
    );
    return (
        <Pop onClose={onClose}>
            <Ribbon>Chance</Ribbon>
            <div className="minis">
                {tile('good', <IndianRupee className="lu" />, '+ Cash', 'a share of your cash or property')}
                {tile('bad', <IndianRupee className="lu" />, '− Cash', 'a share of your cash')}
                {tile('mid', <ArrowLeft className="lu" />, 'Back 3', 'spaces')}
                {tile('jail', <LockKeyhole className="lu" />, 'Jail', 'straight there')}
            </div>
            <p className="small center">Land on a Chance space to draw one.</p>
            <GButton tone="gold" size="big" onClick={onClose}>
                Got it
            </GButton>
        </Pop>
    );
}

/** Everything that has happened, newest first. */
export function LogPopup({ log, onClose }: { log: BusinessLogEntry[]; onClose: () => void }) {
    return (
        <Pop onClose={onClose}>
            <Ribbon>Activity</Ribbon>
            <ul className="log" style={{ maxHeight: '60dvh' }}>
                {log.map((entry) => (
                    <li key={entry.n}>{entry.text}</li>
                ))}
            </ul>
            <GButton tone="gold" onClick={onClose}>
                Close
            </GButton>
        </Pop>
    );
}

/** How to read the markers on the board. */
export function GuidePopup({ onClose }: { onClose: () => void }) {
    const owner = '#2F9BFF';
    const row = (mark: React.ReactNode, title: string, text: string) => (
        <div className="li guide">
            <span className="gmark">{mark}</span>
            <span>
                <b>{title}</b>
                <br />
                {text}
            </span>
        </div>
    );
    return (
        <Pop onClose={onClose}>
            <Ribbon>Board guide</Ribbon>
            <div className="list">
                {row(
                    <span className="mk demo">
                        <HomeMark color={owner} />
                    </span>,
                    'Owned',
                    'A house in the owner\u2019s colour sits next to the property.',
                )}
                {row(
                    <span className="gdemo">
                        <Houses count={3} color={owner} />
                    </span>,
                    'Houses built',
                    'On the property\u2019s colour band, in the owner\u2019s colour: one small house for each house built.',
                )}
                {row(
                    <span className="gdemo">
                        <Houses count={5} color={owner} />
                    </span>,
                    'Hotel',
                    'One bigger building: the fifth build turns four houses into a hotel.',
                )}
                {row(<BankIcon className="bdg demo" style={cssVars({ '--bc': '#E5383B' })} />, 'Mortgaged to the bank', 'A big red bank mark covers the property. It earns no rent.')}
                {row(<Handshake className="bdg demo" style={cssVars({ '--bc': '#FFB703' })} />, 'Split set', 'A handshake in the partner\u2019s colour on each city. Rent from the whole set is shared.')}
            </div>
            <p className="small center">Houses and mortgages never mix: sell the houses in a colour set before mortgaging any of it, and get every property back before building.</p>
            <GButton tone="gold" onClick={onClose}>
                Got it
            </GButton>
        </Pop>
    );
}

/** The room menu: guides, the log, and the way out. Leaving a live match means giving it up, like bankruptcy. */
export function MenuPopup({
    canForfeit,
    host,
    homeHref,
    onGuide,
    onLog,
    onLeave,
    onClose,
}: {
    canForfeit: boolean;
    /** The host leaving closes the room for everyone. */
    host: boolean;
    homeHref: string;
    onGuide: () => void;
    onLog: () => void;
    onLeave: () => void;
    onClose: () => void;
}) {
    const [confirm, setConfirm] = useState(false);
    return (
        <Pop onClose={onClose}>
            <Ribbon red={confirm}>{confirm ? 'Leave match' : 'Menu'}</Ribbon>
            {!confirm ? (
                <>
                    <div className="opts">
                        <GButton tone="blue" className="opt" onClick={onGuide}>
                            <Map className="lu" />
                            Board guide
                        </GButton>
                        <GButton tone="gold" className="opt" onClick={onLog}>
                            <ScrollText className="lu" />
                            Activity
                        </GButton>
                    </div>
                    <GButton tone="green" size="big" onClick={onClose}>
                        Keep playing
                    </GButton>
                    {canForfeit || host ? (
                        <GButton tone="red" onClick={() => setConfirm(true)}>
                            Exit to main menu
                        </GButton>
                    ) : (
                        <Link href={homeHref} className="gbtn red">
                            Exit to main menu
                        </Link>
                    )}
                </>
            ) : (
                <>
                    <p className="center" style={{ fontWeight: 800 }}>
                        {host
                            ? 'You are the host. If you leave, the room closes for everyone and the match ends.'
                            : 'Leaving ends your match. It counts as bankruptcy: everything you own is sold to the bank, and players you owe are paid from it.'}
                    </p>
                    <GButton tone="green" size="big" onClick={() => setConfirm(false)}>
                        Keep playing
                    </GButton>
                    <GButton tone="red" onClick={onLeave}>
                        {host ? 'Close the room and leave' : 'Declare bankruptcy and leave'}
                    </GButton>
                </>
            )}
        </Pop>
    );
}

export function AuctionPopup({ state, me, send, pending, now }: Base & { pending: Extract<BusinessPending, { type: 'auction' }>; now: number }) {
    const tile = BUSINESS_BOARD[pending.space];
    const set = tile.set ? BUSINESS_SETS[tile.set] : null;
    const secs = Math.max(0, Math.ceil((pending.endsAt - now) / 1000));
    const min = pending.by === null ? pending.open : pending.bid + BUSINESS_RULES.BID_STEP;
    const [amount, setAmount] = useState(min);
    useEffect(() => {
        setAmount((a) => Math.max(a, min));
    }, [min]);
    const mePlayer = state.players[me];
    const leader = pending.by === null ? null : state.players[pending.by];
    const leading = pending.by === me;
    const passed = pending.passed.includes(me);
    const out = mePlayer.bankrupt || passed;

    return (
        <Pop>
            <Ribbon>Auction</Ribbon>
            <div className="aucrow">
                <div
                    className="clock"
                    style={{ background: `conic-gradient(var(--red) ${(secs / BUSINESS_RULES.AUCTION_SECONDS) * 100}%, rgba(0,0,0,.4) 0)` }}
                >
                    <b>{String(secs).padStart(2, '0')}</b>
                </div>
                <div
                    className="lot"
                    style={cssVars({
                        '--lc': set?.color ?? '#241A3D',
                        '--lt': set?.text ?? '#FFFFFF',
                    })}
                >
                    <span>{tile.name}</span>
                    <Cash value={tile.price ?? 0} />
                </div>
            </div>
            <div className="bigbid">
                <span className="small">{leader ? 'Highest bid' : 'Opening bid'}</span>
                <Cash value={leader ? pending.bid : pending.open} />
            </div>
            <div className="aucwho">
                {leader ? (
                    <>
                        <Avatar name={leader.name} color={leader.color} size="sm" />
                        {leading ? 'You lead' : `${leader.name} leads`}
                    </>
                ) : (
                    'No bids yet'
                )}
            </div>
            {!out && !leading && (
                <>
                    <div className="chips">
                        {[5, 10, 25, 50].map((step) => (
                            <GButton key={step} size="sm" tone="blue" onClick={() => setAmount((a) => Math.min(a + step, Math.max(min, mePlayer.cash)))}>
                                +{step}
                            </GButton>
                        ))}
                    </div>
                    <div className="btns">
                        <GButton
                            tone="green"
                            size="big"
                            style={{ flex: '2 1 120px' }}
                            disabled={amount > mePlayer.cash}
                            onClick={() => send({ type: 'bid', amount })}
                        >
                            Bid {rs(amount)}
                        </GButton>
                        <GButton tone="red" onClick={() => send({ type: 'passBid' })}>
                            Pass
                        </GButton>
                    </div>
                </>
            )}
            {passed && <p className="small center">You passed on this auction.</p>}
            <p className="small center">Open bidding. A late bid adds a few seconds.</p>
        </Pop>
    );
}

export function DebtPopup({
    state,
    me,
    send,
    onRaise,
    onAskLoan,
    initialStep = 'choose',
}: Base & { onRaise: () => void; onAskLoan: () => void; initialStep?: 'choose' | 'options' | 'confirm' }) {
    const [step, setStep] = useState(initialStep);
    const short = -state.players[me].cash;
    /** A debt can be put off once: the turn goes on, and the next one opens with it. */
    const canDefer = !state.players[me].deferred;
    const owned = ownedBy(state, me);
    const canBank = owned.some((i) => canMortgage(state, me, i) === null);
    const canSell = owned.some((i) => canSellHouse(state, me, i) === null);
    const others = state.players.some((p) => p.seat !== me && !p.bankrupt);

    return (
        <Pop>
            <Ribbon red>Pay up</Ribbon>
            <div className="meter">You are {rs(short)} short</div>
            {step === 'choose' && (
                <>
                    <p className="center" style={{ fontWeight: 800 }}>
                        {canDefer ? 'Pay it now, or play on and pay it by your next turn.' : 'You put this off once already. It has to be paid now.'}
                    </p>
                    <GButton tone="green" size="big" onClick={() => setStep('options')}>
                        Repay debt
                    </GButton>
                    {canDefer && (
                        <GButton tone="blue" onClick={() => send({ type: 'defer' })}>
                            Pay by my next turn
                        </GButton>
                    )}
                    <GButton tone="red" onClick={() => setStep('confirm')}>
                        Declare bankruptcy
                    </GButton>
                </>
            )}
            {step === 'options' && (
                <>
                    <div className="opts">
                        <GButton tone="blue" className="opt" disabled={!canBank} onClick={onRaise}>
                            <BankIcon className="lu" />
                            To the bank
                            <small>{canBank ? 'tap a property' : 'nothing to mortgage'}</small>
                        </GButton>
                        <GButton className="opt" disabled={!canBank || !others} onClick={onRaise}>
                            <Handshake className="lu" />
                            To a player
                            <small>{canBank ? 'tap a property' : 'nothing to mortgage'}</small>
                        </GButton>
                        <GButton tone="orange" className="opt" disabled={!canSell} onClick={onRaise}>
                            <House className="lu" />
                            Sell houses
                            <small>{canSell ? 'tap a city' : 'none built'}</small>
                        </GButton>
                        <GButton tone="gold" className="opt" disabled={!others} onClick={onAskLoan}>
                            <HandCoins className="lu" />
                            Ask for loan
                            <small>pick a player</small>
                        </GButton>
                    </div>
                    <GButton tone="red" size="sm" onClick={() => setStep('confirm')}>
                        Declare bankruptcy
                    </GButton>
                </>
            )}
            {step === 'confirm' && (
                <>
                    <p className="center" style={{ fontWeight: 800 }}>
                        Bankruptcy ends your match. Everything you own is sold to the bank, and that money goes to the players you owe.
                    </p>
                    <div className="btns">
                        <GButton tone="red" size="big" onClick={() => send({ type: 'bankrupt' })}>
                            I am bankrupt
                        </GButton>
                        <GButton tone="blue" onClick={() => setStep('choose')}>
                            Go back
                        </GButton>
                    </div>
                </>
            )}
        </Pop>
    );
}

function interestLine(amount: number, pct: number, mode: BusinessInterestMode, laps: number): string {
    const within = `${laps} lap${laps === 1 ? '' : 's'}`;
    if (mode === 'lap') return `${pct}% interest at every Launch${amount ? ` (${rs(lapInterest(amount, pct))})` : ''}, paid back within ${within}.`;
    return `${pct}% interest at the end${amount ? ` (${rs(loanDue(amount, pct) - amount)})` : ''}, paid back within ${within}.`;
}

/**
 * A loan's laps ran out. The borrower pays it all, or asks the lender to
 * extend it: pay part now, borrow more if needed, on new terms.
 */
export function LoanDuePopup({ state, me, send, loan, waiting }: Base & { loan: BusinessLoan; waiting: boolean }) {
    const lender = state.players[loan.lender];
    const cash = Math.max(0, state.players[me].cash);
    const [step, setStep] = useState<'choose' | 'extend'>('choose');
    const [pay, setPay] = useState(0);
    const [extra, setExtra] = useState(0);
    const [interest, setInterest] = useState(loan.interestPct);
    const [mode, setMode] = useState<BusinessInterestMode>(loan.interestMode);
    const [laps, setLaps] = useState(2);
    const payMax = Math.floor(Math.min(cash, loan.due) / 10) * 10;
    const extraMax = Math.floor(maxLoan(state, loan.lender) / 10) * 10;
    const next = loan.due - pay + extra;
    const terms = { kind: 'renew' as const, loan: loan.id, pay, extra, interestPct: interest, interestMode: mode, laps };
    const problem = validateOffer(state, me, loan.lender, terms);

    return (
        <Pop>
            <Ribbon red>Loan due</Ribbon>
            <div className="dealhead">
                <Avatar name={state.players[me].name} color={state.players[me].color} />
                <span className="arrows">
                    <ArrowRight className="lu" />
                </span>
                <Avatar name={lender.name} color={lender.color} />
            </div>
            <div className="bigbid">
                <span className="small">You owe {lender.name}</span>
                <Cash value={loan.due} />
            </div>
            {waiting ? (
                <p className="waiting">Waiting for {lender.name} to answer…</p>
            ) : step === 'choose' ? (
                <>
                    <GButton tone="green" size="big" onClick={() => send({ type: 'settleLoan', id: loan.id })}>
                        Pay {rs(loan.due)} now
                    </GButton>
                    <GButton tone="blue" size="big" onClick={() => setStep('extend')}>
                        Ask {lender.name} to extend
                    </GButton>
                    {cash < loan.due && <p className="small center">Paying it all leaves you {rs(loan.due - cash)} short: you would sell or mortgage to cover it.</p>}
                </>
            ) : (
                <>
                    <Slider label="Pay now" value={pay} display={rs(pay)} min={0} max={payMax} step={10} onChange={setPay} />
                    <Slider label={`Borrow more from ${lender.name}`} value={extra} display={rs(extra)} min={0} max={extraMax} step={10} onChange={setExtra} />
                    <Slider label="Interest" value={interest} display={`${interest}%`} min={0} max={BUSINESS_RULES.LOAN_MAX_INTEREST_PCT} step={5} onChange={setInterest} />
                    <InterestMode value={mode} onChange={setMode} />
                    <Slider label="Pay back within" value={laps} display={`${laps} lap${laps === 1 ? '' : 's'}`} min={1} max={BUSINESS_RULES.DEAL_MAX_LAPS} step={1} onChange={setLaps} />
                    <div className="kv">
                        <span>New loan</span>
                        <b>{rs(next)}</b>
                    </div>
                    {problem && <p className="small center" style={{ color: '#FFB3BC' }}>{problem}</p>}
                    <div className="btns">
                        <GButton tone="green" size="big" disabled={!!problem} onClick={() => send({ type: 'offer', to: loan.lender, terms })}>
                            Send to {lender.name}
                        </GButton>
                        <GButton tone="red" onClick={() => setStep('choose')}>
                            Back
                        </GButton>
                    </div>
                </>
            )}
        </Pop>
    );
}

export function describeOffer(state: BusinessPublicState, offer: BusinessOffer): string[] {
    const P = state.players;
    const t = offer.terms;
    if (t.kind === 'loan') {
        return [`${P[t.lender].name} lends ${P[t.borrower].name} ${rs(t.amount)}.`, interestLine(t.amount, t.interestPct, t.interestMode, t.laps)];
    }
    if (t.kind === 'renew') {
        return [`extend the loan: pay ${rs(t.pay)} now${t.extra ? `, borrow ${rs(t.extra)} more` : ''}.`, interestLine(0, t.interestPct, t.interestMode, t.laps)];
    }
    if (t.kind === 'bail') return [`bail ${P[t.prisoner].name} out of Jail for ${rs(t.amount)}.`];
    if (t.kind === 'split') return [`split the ${BUSINESS_SETS[t.set].name} set, ${t.minorPct}% to the player with one city.`];
    if (t.kind === 'unsplit') {
        const split = state.splits.find((s) => s.id === t.split);
        return [`end the ${split ? BUSINESS_SETS[split.set].name : ''} split. Every house there goes back to the bank.`];
    }
    const side = (cash: number, spaces: number[]) =>
        [cash ? rs(cash) : null, ...spaces.map((i) => BUSINESS_BOARD[i].name)].filter(Boolean).join(' + ') || 'nothing';
    return [`you send ${side(t.give.cash, t.give.spaces)}, you ask for ${side(t.get.cash, t.get.spaces)}.`, `Sent to ${P[offer.to].name}.`];
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
    return (
        <div className="stat">
            <small>{label}</small>
            <b>{value}</b>
        </div>
    );
}

/** An offer that needs this player's answer: the deal as pictures and numbers, and two big buttons. */
export function OfferInbox({ state, me, send, offer, now }: Base & { offer: BusinessOffer; now: number }) {
    const from = state.players[offer.from];
    const you = state.players[me];
    const t = offer.terms;
    const secs = Math.max(0, Math.ceil((offer.expiresAt - now) / 1000));
    const laps = (n: number) => `${n} lap${n === 1 ? '' : 's'}`;

    let title = 'Trade offer';
    let ask = `${from.name} wants to trade`;
    let body: React.ReactNode = null;
    if (t.kind === 'loan') {
        const lending = t.lender === me;
        const perLap = lapInterest(t.amount, t.interestPct);
        title = lending ? 'Loan request' : 'Loan offer';
        ask = lending ? `${from.name} asks to borrow` : `${from.name} will lend you`;
        body = (
            <>
                <div className="bigbid">
                    <Cash value={t.amount} />
                </div>
                <div className="stats">
                    <Stat label={t.interestMode === 'lap' ? 'Each lap' : 'Interest'} value={t.interestMode === 'lap' ? `${rs(perLap)}` : `${t.interestPct}%`} />
                    <Stat
                        label={lending ? 'You get back' : 'You pay back'}
                        value={rs(t.interestMode === 'lap' ? t.amount + perLap * t.laps : loanDue(t.amount, t.interestPct))}
                    />
                    <Stat label="Within" value={laps(t.laps)} />
                </div>
                <p className="small center">{t.interestMode === 'lap' ? `${t.interestPct}% interest paid at every Launch, the ${rs(t.amount)} at the end.` : `${t.interestPct}% interest, all paid at the end.`}</p>
            </>
        );
    } else if (t.kind === 'renew') {
        const loan = state.loans.find((l) => l.id === t.loan);
        const owed = loan?.due ?? 0;
        const next = owed - t.pay + t.extra;
        title = 'Extend the loan';
        ask = `${from.name} cannot pay all ${rs(owed)} now`;
        body = (
            <>
                <div className="stats">
                    <Stat label="Paid to you now" value={rs(t.pay)} />
                    <Stat label="You lend more" value={rs(t.extra)} />
                    <Stat label="New loan" value={rs(next)} />
                </div>
                <div className="stats">
                    <Stat label={t.interestMode === 'lap' ? 'Each lap' : 'Interest'} value={t.interestMode === 'lap' ? rs(lapInterest(next, t.interestPct)) : `${t.interestPct}%`} />
                    <Stat label="Within" value={laps(t.laps)} />
                </div>
                <p className="small center">Reject and {from.name} must pay all {rs(owed)} now.</p>
            </>
        );
    } else if (t.kind === 'bail') {
        const mine = t.prisoner === me;
        title = 'Bail';
        ask = mine ? `${from.name} will bail you out of Jail` : `${from.name} asks you for bail`;
        body = (
            <>
                <div className="bigbid">
                    <Cash value={t.amount} />
                </div>
                <p className="small center">
                    {mine
                        ? `You pay ${from.name} ${rs(t.amount)} and walk free. Otherwise leaving Jail costs you ${rs(shareOfCash(you.cash, BUSINESS_RULES.JAIL_PCT))}.`
                        : `${from.name} pays you ${rs(t.amount)} and walks free.`}
                </p>
            </>
        );
    } else if (t.kind === 'split') {
        const pair = splitPair(state, t.set);
        title = 'Split property';
        ask = `${from.name} wants to split the ${BUSINESS_SETS[t.set].name} set`;
        body = pair && <SplitView state={state} set={t.set} major={pair.major} minor={pair.minor} minorPct={t.minorPct} />;
    } else if (t.kind === 'unsplit') {
        const split = state.splits.find((s) => s.id === t.split);
        title = 'End the split';
        ask = `${from.name} wants to end your split`;
        body = split && <SplitView state={state} set={split.set} major={split.major} minor={split.minor} minorPct={split.minorPct} ending />;
    } else {
        ask = `${from.name} offers you a trade`;
        // Seen from the receiver: what the proposer sends is what you get.
        const side = (cash: number, spaces: number[]) =>
            cash || spaces.length ? (
                <MiniCards>
                    {cash > 0 && <CashChip value={cash} />}
                    {spaces.map((i) => (
                        <MiniCard key={i} state={state} space={i} />
                    ))}
                </MiniCards>
            ) : (
                <span className="none">Nothing</span>
            );
        body = (
            <>
                <div className="dealside get">
                    <small>
                        <ArrowDownLeft className="lu" />
                        You get
                    </small>
                    {side(t.give.cash, t.give.spaces)}
                </div>
                <div className="dealside send">
                    <small>
                        <ArrowUpRight className="lu" />
                        You send
                    </small>
                    {side(t.get.cash, t.get.spaces)}
                </div>
            </>
        );
    }

    return (
        <Pop>
            <Ribbon>{title}</Ribbon>
            <div className="dealhead">
                <Avatar name={from.name} color={from.color} />
                <span className="arrows">
                    <ArrowRight className="lu" />
                </span>
                <Avatar name={you.name} color={you.color} />
                <span className="tchip">{secs}s</span>
            </div>
            <p className="center" style={{ fontWeight: 800 }}>
                {ask}
            </p>
            {body}
            <div className="cta">
                <GButton tone="green" size="big" onClick={() => send({ type: 'respond', id: offer.id, accept: true })}>
                    Accept
                </GButton>
                <GButton tone="red" size="big" onClick={() => send({ type: 'respond', id: offer.id, accept: false })}>
                    Reject
                </GButton>
            </div>
        </Pop>
    );
}

const CONFETTI_COLORS = ['#FFC83D', '#FF5568', '#49A6FF', '#34D27B', '#B57BFF', '#FFFFFF'];

/** Paper confetti raining over the whole screen. Positions are fixed per piece so it never reshuffles. */
function Confetti() {
    return (
        <div className="confetti" aria-hidden="true">
            {Array.from({ length: 60 }, (_, i) => (
                <i
                    key={i}
                    style={cssVars({
                        '--x': `${(i * 37) % 100}%`,
                        '--d': `${(i % 10) * 0.28}s`,
                        '--t': `${2.6 + (i % 5) * 0.45}s`,
                        '--r': `${(i * 53) % 360}deg`,
                        '--c': CONFETTI_COLORS[i % CONFETTI_COLORS.length],
                    })}
                />
            ))}
        </div>
    );
}

export function WinnerPopup({ state, me, homeHref }: { state: BusinessPublicState; me: number; homeHref: string }) {
    const ranking = state.ranking ?? [];
    const winner = state.players[state.winner ?? 0];
    const podium = [ranking[1], ranking[0], ranking[2]];
    // Teams win together. With no teams set up, every player is a team of one.
    const myTeam = state.players[me]?.team;
    const won = state.winnerTeam === myTeam;
    const winners = state.players.filter((p) => p.team === state.winnerTeam);
    const team = winners.length > 1;
    const names = winners.map((p) => p.name).join(' & ');
    const teamsInOrder = [...new Set(ranking.map((r) => r.team))];
    const place = teamsInOrder.indexOf(myTeam) + 1;
    // Every window that can be seen plays it: the winner's fanfare, or a soft "aww" for everyone else.
    useEffect(() => sfxShared(won ? 'win' : 'lose'), [won]);
    return (
        <Pop>
            {won && <Confetti />}
            {won && <div className="rays" aria-hidden="true" />}
            <Ribbon>Winner</Ribbon>
            <div className="stackc" style={{ gap: 2 }}>
                <svg className="crown" viewBox="0 0 48 28" aria-hidden="true">
                    <path d="M3 26 6 6l10 10 8-14 8 14 10-10 3 20z" fill="#FFC83D" stroke="#8A5200" strokeWidth="2" strokeLinejoin="round" />
                </svg>
                <Avatar name={winner.name} color={winner.color} size="lg" />
                <h2 className="wintitle">{won ? (team ? 'Your team wins!' : 'You win!') : `${names} ${team ? 'win' : 'wins'}!`}</h2>
                {team && won && <span className="tag dim">{names}</span>}
                {!won && place > 0 && <span className="tag dim">{team ? 'Your team' : 'You'} finished #{place}</span>}
            </div>
            <div className="podium">
                {podium.map((r, k) =>
                    r ? (
                        <div key={r.seat} className={`pod p${k === 1 ? 1 : k === 0 ? 2 : 3}`}>
                            <Avatar name={state.players[r.seat].name} color={state.players[r.seat].color} />
                            {state.players[r.seat].name}
                            <div className="blk">{k === 1 ? 1 : k === 0 ? 2 : 3}</div>
                        </div>
                    ) : (
                        <div key={`empty-${k}`} />
                    ),
                )}
            </div>
            <div className="list">
                {ranking.map((r) => (
                    <div key={r.seat} className="li">
                        <Avatar name={state.players[r.seat].name} color={state.players[r.seat].color} size="sm" />
                        {state.players[r.seat].name}
                        {r.bankrupt ? <span className="small">Bankrupt</span> : <Cash value={r.worth} />}
                    </div>
                ))}
            </div>
            <p className="small center">Net worth counts cash, properties and houses. {state.round} rounds played.</p>
            <Link href={homeHref} className="gbtn green big">
                New room
            </Link>
        </Pop>
    );
}
