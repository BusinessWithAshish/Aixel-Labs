'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeftRight, Bot, Building2, Hammer, HandCoins, LockKeyhole, LogOut, Pause, Play, ScrollText, Signal, SignalHigh, SignalLow, SignalMedium, Timer, WifiOff } from 'lucide-react';
import { BUSINESS_BOARD, BUSINESS_JAIL_INDEX, BUSINESS_PHASE_SECONDS, BUSINESS_RULES } from '@aixellabs/backend/business/constants';
import type { BusinessCommand, BusinessPublicState, BusinessRoomView } from '@aixellabs/backend/business/types';
import { cn } from '@/lib/utils';
import type { BusinessSend } from '../_hooks/use-business-room';
import { cssVars, Die } from '../_lib/art';
import { fmt, rs } from '../_lib/client';
import { buzz } from '../_lib/haptic';
import { sfx, sfxQueued, sfxShared } from '../_lib/sound';
import { canBuild, canMortgage, canSellHouse, houseCost, ownedBy, setSpaces, shareOfCash, visitingJail } from '@aixellabs/backend/business/compute';
import { DealBanner, dealFromLog, dealSound, quietSound, type Deal } from './DealBanner';
import { notify } from '../_lib/toast';
import { AudioToggles, Avatar, Cash, GButton, Pop } from './bits';
import { Board } from './Board';
import { OfferComposer, type OfferDraft } from './OfferComposer';
import { PlayerPanel } from './PlayerPanel';
import {
    AuctionPopup,
    BreakPopup,
    CardPopup,
    ChanceBook,
    DebtPopup,
    describeOffer,
    GuidePopup,
    LoanDuePopup,
    LogPopup,
    MarketBook,
    MarketPopup,
    MenuPopup,
    OfferInbox,
    ResultPopup,
    WinnerPopup,
} from './Popups';
import { PropertyCard } from './PropertyCard';

const N = BUSINESS_BOARD.length;
const GO_TO_JAIL_INDEX = BUSINESS_BOARD.findIndex((s) => s.kind === 'gojail');
/** How long the dice tumble before the pawn sets off. Matches the cube's CSS transition. */
const TUMBLE_MS = 1050;
/** One space of a normal walk. The pawn glides for exactly this long, so it never stops between spaces. */
const STEP_MS = 230;
const BACK_STEP_MS = 170;
/** The whole trip to Jail takes about this long, however far away the pawn is. */
const JAIL_TRIP_MS = 1500;
/** A beat after the pawn lands before pop-ups and landing sounds, so they do not pile onto the last step. */
const SETTLE_MS = 280;

/** How long each money banner stays up; shorter when several are waiting. */
const DEAL_MS = 2000;
const DEAL_FAST_MS = 1100;
const FLOAT_MS = 1500;

/**
 * False while the window is in the background, and for a moment after it comes
 * back. Browsers pause animations in hidden windows; without this, the moves
 * that happened meanwhile all replay the moment you switch back.
 */
function useAwake(): boolean {
    const [awake, setAwake] = useState(true);
    useEffect(() => {
        let timer: number | undefined;
        const onChange = () => {
            window.clearTimeout(timer);
            if (document.hidden) setAwake(false);
            else timer = window.setTimeout(() => setAwake(true), 150);
        };
        document.addEventListener('visibilitychange', onChange);
        return () => {
            window.clearTimeout(timer);
            document.removeEventListener('visibilitychange', onChange);
        };
    }, []);
    return awake;
}

/** Server clock, ticking a few times a second, for countdowns. */
function useNow(offset: number): number {
    const [now, setNow] = useState(() => Date.now() + offset);
    useEffect(() => {
        const timer = window.setInterval(() => setNow(Date.now() + offset), 250);
        return () => window.clearInterval(timer);
    }, [offset]);
    return now;
}

/**
 * Animates every pawn move for the viewer. The server has already moved the
 * pawn; this walks the drawn pawn there:
 *  - a roll: the dice tumble, then the pawn walks forward space by space;
 *  - "go back 3 spaces": it walks backwards;
 *  - Jail: it runs backwards round the board, with a siren.
 * `busy` is true until the drawn pawns match the server, so pop-ups and
 * landing sounds wait for the pawn to arrive.
 */
function useWalk(state: BusinessPublicState) {
    const [shown, setShown] = useState(() => state.players.map((p) => p.pos));
    const [moving, setMoving] = useState<number | null>(null);
    const [pace, setPace] = useState(STEP_MS);
    const [doneSeq, setDoneSeq] = useState(state.rollSeq);
    /** Bumped when an animation ends, to look for the next pawn that is out of place. */
    const [round, setRound] = useState(0);
    /** Bumped when a walking pawn reaches Launch, so the salary banner shows mid-walk. */
    const [launch, setLaunch] = useState({ seq: 0, seat: -1 });
    const rolling = doneSeq !== state.rollSeq;
    const adrift = state.players.some((p) => !p.bankrupt && shown[p.seat] !== p.pos);
    const busy = rolling || adrift;
    const latest = useRef(state);
    const shownRef = useRef(shown);
    const running = useRef(false);
    const timers = useRef<number[]>([]);
    latest.current = state;
    shownRef.current = shown;

    useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

    const later = (fn: () => void, ms: number) => timers.current.push(window.setTimeout(fn, ms));
    const snap = () => setShown(latest.current.players.map((p) => p.pos));
    /** No animation: reduced motion, or the window is in the background (it would only replay later). */
    const still = () => document.hidden || window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Going to the background mid-walk: jump straight to the end instead of replaying it on return.
    useEffect(() => {
        const onHide = () => {
            if (!document.hidden || !running.current) return;
            timers.current.forEach((t) => window.clearTimeout(t));
            timers.current = [];
            running.current = false;
            setMoving(null);
            snap();
            setDoneSeq(latest.current.rollSeq);
            setRound((r) => r + 1);
        };
        document.addEventListener('visibilitychange', onHide);
        return () => document.removeEventListener('visibilitychange', onHide);
    }, []);

    /** Moves one pawn `steps` spaces in `dir`, one space per `ms`, then calls `done`. */
    const walk = (seat: number, steps: number, dir: 1 | -1, ms: number, sound: boolean, done: () => void) => {
        let left = steps;
        let at = shownRef.current[seat];
        setPace(ms);
        setMoving(seat);
        const hop = () => {
            at = (at + dir + N) % N;
            setShown((prev) => prev.map((pos, s) => (s === seat ? (pos + dir + N) % N : pos)));
            if (dir === 1 && at === 0) later(() => setLaunch((l) => ({ seq: l.seq + 1, seat })), ms);
            // The step is heard as the pawn touches the space, one sound per space.
            if (sound) later(() => sfx('step'), ms);
            if (--left > 0) return later(hop, ms);
            later(() => {
                setMoving(null);
                done();
            }, ms + SETTLE_MS);
        };
        hop();
    };

    // A new roll: tumble the dice, then walk the roller forward by the dice total.
    useEffect(() => {
        if (!rolling || running.current) return;
        running.current = true;
        // A roll never passes the turn on, so the roller is still the active player.
        const mover = state.turn;
        const finish = () => {
            running.current = false;
            setDoneSeq(latest.current.rollSeq);
            setRound((r) => r + 1);
        };
        if (still()) {
            snap();
            return finish();
        }
        const start = shownRef.current[mover];
        const steps = state.dice[0] + state.dice[1];
        sfx('dice');
        later(() => {
            const p = latest.current.players[mover];
            const stayedInJail = p.pos === start && p.jail > 0;
            // Three doubles in a row: no walk, straight to Jail (handled below).
            const sentWithoutMoving = p.jail > 0 && p.pos === BUSINESS_JAIL_INDEX && (start + steps) % N !== GO_TO_JAIL_INDEX;
            if (stayedInJail || sentWithoutMoving) return finish();
            walk(mover, steps, 1, STEP_MS, true, finish);
        }, TUMBLE_MS);
        // `round` re-checks after another animation ends, in case this roll arrived while it ran.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rolling, state.rollSeq, round]);

    // Any pawn the server moved without a roll: walk it to where it now is.
    useEffect(() => {
        if (rolling || running.current) return;
        const p = latest.current.players.find((q) => !q.bankrupt && shownRef.current[q.seat] !== q.pos);
        if (!p) return;
        if (still()) return snap();
        const back = (shownRef.current[p.seat] - p.pos + N) % N;
        const finish = () => {
            running.current = false;
            setRound((r) => r + 1);
        };
        if (p.jail > 0 && p.pos === BUSINESS_JAIL_INDEX) {
            running.current = true;
            sfx('siren');
            walk(p.seat, back, -1, Math.max(28, Math.min(90, JAIL_TRIP_MS / back)), false, finish);
        } else if (back <= 6) {
            running.current = true;
            walk(p.seat, back, -1, BACK_STEP_MS, true, finish);
        } else {
            snap();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [state.rev, rolling, round]);

    return { shown, moving, pace, busy, launch };
}

/** Sounds and notices for things that changed since the last settled state. */
function useTableEvents(state: BusinessPublicState, me: number, busy: boolean) {
    const [shownCash, setShownCash] = useState(() => state.players.map((p) => p.cash));
    const snap = () => ({
        cash: state.players.map((p) => p.cash),
        out: state.players.map((p) => p.bankrupt),
        missed: state.players.map((p) => p.missed),
        turn: state.turn,
        phase: state.phase,
    });
    const prev = useRef(snap());

    useEffect(() => {
        if (busy) return;
        const before = prev.current;
        const now = snap();
        prev.current = now;
        // Plates show cash as of the last landing, so money never moves before the pawn arrives.
        setShownCash(now.cash);

        // Queued, so the sounds of one landing play one after another instead of on top of each other.
        state.players.forEach((p, seat) => {
            // A player going out gets a banner on the board (see useDeals); the timeout buzzer is on the clock.
            if (!before.out[seat] && now.out[seat]) return;
            if (now.missed[seat] > before.missed[seat]) {
                notify(`${p.name} ran out of time (${now.missed[seat]} of ${state.missLimit})`, 'error');
            } else if (before.cash[seat] < 0 && now.cash[seat] >= 0) {
                sfxQueued('paidOff');
                notify(`${p.name} paid off`, 'gold');
            }
        });

        if (now.phase === 'card' && before.phase !== 'card') sfxQueued('card');
        if (now.turn !== before.turn && now.phase !== 'over') sfxQueued(now.turn === me ? 'myTurn' : 'turn');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [state.rev, busy]);
    return shownCash;
}

const TURN_SPLASH_MS = 1500;

type Float = { id: number; seat: number; amount: number };

/**
 * Every money move (a purchase, rent, a Chance card, a loan) becomes a banner
 * everyone sees, one at a time, with its own sound, and a "+₹ / −₹" that
 * floats off the players' cash.
 */
function useDeals(state: BusinessPublicState, busy: boolean, hold: boolean, launch: { seq: number; seat: number }) {
    const seen = useRef(state.logSeq);
    /** Log entries already shown early (a salary while the pawn was still walking). */
    const early = useRef(new Set<number>());
    const queue = useRef<Deal[]>([]);
    const timer = useRef<number | undefined>(undefined);
    const current = useRef<{ deal: Deal; at: number } | null>(null);
    const holdRef = useRef(hold);
    holdRef.current = hold;
    const [deal, setDeal] = useState<Deal | null>(null);
    const [floats, setFloats] = useState<Float[]>([]);

    const display = (next: Deal) => {
        current.current = { deal: next, at: performance.now() };
        setDeal(next);
        if (!next.quiet) {
            const sound = dealSound(next.fx);
            if (sound) sfxQueued(sound);
        }
        const { from, to } = next.fx;
        const amount = next.quiet ? 0 : next.fx.amount;
        const added: Float[] = [];
        if (amount > 0 && from !== null) added.push({ id: next.id * 2, seat: from, amount: -amount });
        if (amount > 0 && to !== null) added.push({ id: next.id * 2 + 1, seat: to, amount });
        setFloats((list) => [...list, ...added]);
        window.setTimeout(() => setFloats((list) => list.filter((f) => !added.includes(f))), FLOAT_MS);
        timer.current = window.setTimeout(showNext, queue.current.length > 1 ? DEAL_FAST_MS : DEAL_MS);
    };

    const showNext = () => {
        timer.current = undefined;
        current.current = null;
        // A pop-up covers the board: keep the rest for when it closes.
        const next = holdRef.current ? null : (queue.current.shift() ?? null);
        setDeal(null);
        if (next) display(next);
    };

    // The salary shows the moment the pawn reaches Launch, ahead of anything else.
    useEffect(() => {
        if (!launch.seq) return;
        const entry = state.log.find((e) => e.n > seen.current && e.fx?.kind === 'salary' && e.fx.to === launch.seat && !early.current.has(e.n));
        const salary = entry && dealFromLog(entry);
        if (!salary) return;
        early.current.add(salary.id);
        if (current.current) queue.current.unshift(current.current.deal);
        window.clearTimeout(timer.current);
        display(salary);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [launch.seq]);

    useEffect(() => {
        if (busy) return;
        const unseen = state.log.filter((entry) => entry.n > seen.current && !early.current.has(entry.n)).reverse();
        // Building, selling a house, mortgaging and redeeming show on the board, not in a banner: everyone hears them.
        for (const entry of unseen) {
            const sound = entry.fx && quietSound(entry.fx);
            if (sound) sfxQueued(sound);
        }
        const fresh = unseen
            .map(dealFromLog)
            .filter((d): d is Deal => d !== null);
        seen.current = Math.max(seen.current, state.logSeq);
        if (!fresh.length) return;
        // A window that was in the background only shows the latest few.
        queue.current = [...queue.current, ...fresh].slice(-4);
        if (timer.current === undefined) showNext();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [state.rev, busy]);

    // A pop-up opened over a banner that had barely shown: put it back to show again after.
    useEffect(() => {
        if (hold && current.current) {
            if (performance.now() - current.current.at < DEAL_MS * 0.6) queue.current.unshift({ ...current.current.deal, quiet: true });
            window.clearTimeout(timer.current);
            showNext();
        } else if (!hold && timer.current === undefined && queue.current.length) showNext();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hold]);

    useEffect(() => () => window.clearTimeout(timer.current), []);
    return { deal, floats };
}

/** Cash that counts up or down to its new value instead of jumping. */
function TweenCash({ value }: { value: number }) {
    const [shown, setShown] = useState(value);
    const from = useRef(value);
    useEffect(() => {
        const start = from.current;
        if (start === value) return;
        if (document.hidden) {
            from.current = value;
            setShown(value);
            return;
        }
        const t0 = performance.now();
        let raf = 0;
        const step = (t: number) => {
            const k = Math.min(1, (t - t0) / 700);
            const v = Math.round(start + (value - start) * (1 - (1 - k) ** 3));
            from.current = v;
            setShown(v);
            if (k < 1) raf = requestAnimationFrame(step);
        };
        raf = requestAnimationFrame(step);
        return () => cancelAnimationFrame(raf);
    }, [value]);
    const moving = shown !== value ? (value < shown ? 'down' : 'up') : undefined;
    return <Cash value={shown} className={cn(shown < 0 && 'neg', moving)} />;
}

function signalOf(online: boolean, rtt: number | null) {
    if (!online) return { Icon: WifiOff, tone: 'bad', label: 'Offline. Reconnecting…' };
    if (rtt === null) return { Icon: SignalLow, tone: 'offc', label: 'Checking the connection…' };
    if (rtt < 150) return { Icon: Signal, tone: 'good', label: `Strong connection (${rtt} ms)` };
    if (rtt < 350) return { Icon: SignalHigh, tone: 'good', label: `Good connection (${rtt} ms)` };
    if (rtt < 700) return { Icon: SignalMedium, tone: 'warn', label: `Slow connection (${rtt} ms)` };
    return { Icon: SignalLow, tone: 'bad', label: `Weak connection (${rtt} ms)` };
}

type View =
    | null
    | { t: 'space'; i: number }
    | { t: 'player'; seat: number }
    | { t: 'offer'; draft: OfferDraft }
    | { t: 'deal' }
    | { t: 'market' }
    | { t: 'chance' }
    | { t: 'log' }
    | { t: 'guide' }
    | { t: 'menu' };

/** What the board is showing while the player works on their own properties. */
type Mode = null | 'mine' | 'build' | 'cash';

const MODE_HINT: Record<Exclude<Mode, null>, [string, string]> = {
    build: ['Build: tap a lit city to add a house. A set fills up evenly.', 'Nothing to build on right now. You need a full colour set and the cash.'],
    cash: ['Sell: tap a lit property. Houses are sold one a tap, evenly; with none left it is mortgaged.', 'Nothing left to sell or mortgage.'],
    mine: ['Your properties are lit. Tap one to see it.', 'You do not own a property yet.'],
};

/** In Build and Sell a second tap is ignored until the first has landed on the board, or this long has passed. */
const TAP_GUARD_MS = 1500;

type TableProps = {
    room: BusinessRoomView;
    send: BusinessSend;
    clockOffset: number;
    online: boolean;
    rtt: number | null;
    homeHref: string;
    /** Host only: freeze or restart every clock. */
    onPause: (on: boolean) => void;
    /** Host only: end the room for everyone. */
    onClose: () => void;
    /** Open already in the "raising cash on the board" view (used by the design preview). */
    startRaising?: boolean;
    /** Something covers the whole table (the start countdown): turn announcements wait for it. */
    curtain?: boolean;
};

export function Table({ room, send, clockOffset, online, rtt, homeHref, onPause, onClose, startRaising = false, curtain = false }: TableProps) {
    const router = useRouter();
    const state = room.state as BusinessPublicState;
    const me = room.you;
    const mePlayer = state.players[me];
    const active = state.players[state.turn];
    const over = state.phase === 'over';
    const myTurn = state.turn === me && !over;
    const host = me === room.hostSeat;
    const paused = room.pausedAt !== null;
    const liveNow = useNow(clockOffset);
    // While the host has the match paused, every countdown stands still at the moment of the pause.
    const now = room.pausedAt ?? liveNow;
    const walk = useWalk(state);
    const shownCash = useTableEvents(state, me, walk.busy);
    const awake = useAwake();
    const [view, setView] = useState<View>(null);
    // Banners wait while a pop-up covers the board, so none is missed behind it.
    const covered =
        view !== null ||
        state.offers.some((o) => o.to === me) ||
        (!walk.busy && (state.pending !== null || state.phase === 'loandue' || (state.phase === 'debt' && state.turn === me)));
    const deals = useDeals(state, walk.busy, covered, walk.launch);
    const [raising, setRaising] = useState(startRaising);
    // The moment the turn becomes yours: a stamp across the screen and a buzz in the hand.
    const [splash, setSplash] = useState(0);
    const turnSeen = useRef<number | null>(null);
    useEffect(() => {
        if (walk.busy || curtain || turnSeen.current === state.turn) return;
        turnSeen.current = state.turn;
        if (!myTurn) return;
        setSplash(state.rev);
        buzz(2);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [state.turn, walk.busy, curtain]);
    useEffect(() => {
        if (!splash) return;
        const timer = window.setTimeout(() => setSplash(0), TURN_SPLASH_MS);
        return () => window.clearTimeout(timer);
    }, [splash]);
    const pending = state.pending;

    useEffect(() => {
        if (state.phase !== 'debt') setRaising(false);
    }, [state.phase]);

    // While the turn clock stands still (a deal is being made) it shows the time that was left when it stopped.
    const held = state.hold !== null;
    const secsLeft = state.deadline === null ? null : Math.max(0, Math.ceil((state.deadline - (state.hold?.at ?? now)) / 1000));
    const phaseSeconds =
        state.phase === 'auction'
            ? BUSINESS_RULES.AUCTION_SECONDS
            : (BUSINESS_PHASE_SECONDS[state.phase as keyof typeof BUSINESS_PHASE_SECONDS] ?? 45);
    const ringPct = secsLeft === null ? 0 : Math.min(100, (secsLeft / phaseSeconds) * 100);
    const matchLeft = state.endsAt === null ? 0 : Math.max(0, state.endsAt - now);
    const clock = `${Math.floor(matchLeft / 60000)}:${String(Math.floor((matchLeft % 60000) / 1000)).padStart(2, '0')}`;
    const incoming = state.offers.find((o) => o.to === me);
    const outgoing = state.offers.find((o) => o.from === me);
    const selected = view?.t === 'space' ? view.i : !walk.busy && pending && 'space' in pending ? pending.space : null;
    const signal = signalOf(online, rtt);
    // The match clock: a chime and a notice at 5 minutes and 1 minute, then a tick for each of the last 10 seconds.
    useEffect(() => {
        if (over || paused || state.endsAt === null) return;
        const left = state.endsAt - (Date.now() + clockOffset);
        const timers: number[] = [];
        const at = (ms: number, fn: () => void) => {
            if (left - ms >= 0) timers.push(window.setTimeout(fn, left - ms));
        };
        at(5 * 60_000, () => {
            sfxShared('chime');
            notify('5 minutes left in the match', 'gold');
        });
        at(60_000, () => {
            sfxShared('chime');
            notify('1 minute left in the match', 'gold');
        });
        for (let k = 10; k >= 1; k--) at(k * 1000, () => sfxShared('tick'));
        return () => timers.forEach((t) => window.clearTimeout(t));
    }, [state.endsAt, over, paused, clockOffset]);

    // The last five seconds of any timer tick, for everyone at the table. Nothing ticks while the clock stands still.
    useEffect(() => {
        // A card or a result only needs an OK: no ticking there either.
        if (over || paused || held || state.deadline === null || state.phase === 'card' || state.phase === 'result') return;
        // Scheduled on the server clock, so every window at the table ticks at the same moment.
        const deadline = state.deadline;
        const left = deadline - (Date.now() + clockOffset);
        const timers: number[] = [];
        for (let k = 5; k >= 1; k--) {
            if (left - k * 1000 >= 0) timers.push(window.setTimeout(() => sfxShared('tick'), left - k * 1000));
        }
        // The buzzer when it runs out on a player (an auction just closes).
        if (state.phase !== 'auction' && state.phase !== 'debt' && left >= 0)
            timers.push(window.setTimeout(() => sfxShared('timeout'), left));
        return () => timers.forEach((t) => window.clearTimeout(t));
    }, [state.deadline, state.phase, over, paused, held, clockOffset]);

    // --- the toolbar: trade, build, raise cash, see your own properties ---
    const [mode, setMode] = useState<Mode>(null);
    const managing = myTurn && !walk.busy && (state.phase === 'roll' || state.phase === 'end');
    const inDebt = myTurn && state.phase === 'debt' && raising;
    const showTools = managing || inDebt;
    useEffect(() => {
        if (!showTools) setMode(null);
    }, [showTools]);
    // Raising cash to clear a debt starts in that view.
    const boardMode: Mode = showTools ? (mode ?? (inDebt ? 'cash' : null)) : null;
    // Mine, plus the third city of any set I split as the partner with two (I manage its houses).
    const mine = [...new Set([...ownedBy(state, me), ...state.splits.filter((s) => s.major === me).flatMap((s) => setSpaces(s.set))])];
    const lit =
        boardMode === null
            ? null
            : new Set(
                  boardMode === 'build'
                      ? mine.filter((i) => canBuild(state, me, i) === null)
                      : boardMode === 'cash'
                        ? mine.filter((i) => canSellHouse(state, me, i) === null || canMortgage(state, me, i) === null)
                        : mine,
              );
    const others = state.players.filter((p) => p.seat !== me && !p.bankrupt);
    const tapSent = useRef({ rev: -1, at: 0 });

    // The turn clock stands still while its player is making a deal.
    const dealing = myTurn && !over && (view?.t === 'deal' || view?.t === 'offer' || (view?.t === 'player' && view.seat !== me));
    const turnRef = useRef({ mine: false, phase: state.phase });
    turnRef.current = { mine: myTurn, phase: state.phase };
    useEffect(() => {
        const canHold = () => turnRef.current.mine && ['roll', 'end', 'debt', 'loandue'].includes(turnRef.current.phase);
        if (!dealing || !canHold()) return;
        send({ type: 'hold', on: true });
        return () => {
            if (canHold()) send({ type: 'hold', on: false });
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dealing]);

    /** In Build and Sell a tap acts at once, with no card in between. Null when the tap should open the card instead. */
    const tapAction = (i: number): BusinessCommand | string | null => {
        if (boardMode === 'build') return canBuild(state, me, i) ?? { type: 'build', space: i };
        if (boardMode !== 'cash') return null;
        // Houses go first, one a tap; a property with nothing built in its set is mortgaged.
        if (canSellHouse(state, me, i) === null) return { type: 'sellHouse', space: i };
        return canMortgage(state, me, i) ?? { type: 'mortgage', space: i };
    };
    const tapTile = (i: number) => {
        if (boardMode !== 'build' && boardMode !== 'cash') return openSpace(i);
        if (!mine.includes(i)) return;
        const action = tapAction(i);
        if (action === null) return openSpace(i);
        if (typeof action === 'string') return notify(action, 'error');
        // One move per tap that has landed: a fast double tap can never build or sell twice.
        const last = tapSent.current;
        if (last.rev === state.rev && performance.now() - last.at < TAP_GUARD_MS) return;
        tapSent.current = { rev: state.rev, at: performance.now() };
        buzz();
        send(action);
    };

    const openSpace = (i: number) => {
        const kind = BUSINESS_BOARD[i].kind;
        setView(kind === 'market' ? { t: 'market' } : kind === 'chance' ? { t: 'chance' } : { t: 'space', i });
    };

    /** The active plate's border drains with the timer: gold, then orange, then red. */
    const timerColor = ringPct > 50 ? '#FFC83D' : ringPct > 25 ? '#FF9A2E' : '#FF5568';

    const plate = (seat: number) => {
        const p = state.players[seat];
        const isActive = seat === state.turn && !over;
        return (
            <button
                key={seat}
                type="button"
                className={cn('pp', isActive && 'now', p.bankrupt && 'gone')}
                style={isActive ? cssVars({ '--p': ringPct, '--tc': timerColor }) : undefined}
                onClick={() => setView({ t: 'player', seat })}
            >
                <Avatar name={p.name} color={p.color} />
                <span className="nm">
                    <span>{seat === me ? `${p.name} (you)` : p.name}</span>
                    {/* Away: a simple bot plays this seat until the player is back. */}
                    {!room.seats[seat]?.connected && !p.bankrupt && (
                        <i className="botchip" title="Away. A bot is playing for them.">
                            <Bot />
                        </i>
                    )}
                </span>
                {p.bankrupt ? (
                    <span className="strikes" />
                ) : (
                    <span className="strikes" title={`${p.missed} of ${state.missLimit} missed turns`}>
                        {Array.from({ length: state.missLimit }, (_, k) => (
                            <i key={k} className={k < p.missed ? 'hit' : undefined} />
                        ))}
                    </span>
                )}
                {p.bankrupt ? <span className="small">Out</span> : <TweenCash value={shownCash[seat] ?? p.cash} />}
                {deals.floats
                    .filter((f) => f.seat === seat)
                    .map((f) => (
                        <span key={f.id} className={cn('fl', f.amount < 0 ? 'down' : 'up')}>
                            {f.amount < 0 ? '−' : '+'}₹{fmt(Math.abs(f.amount))}
                        </span>
                    ))}
            </button>
        );
    };

    let mainLabel: React.ReactNode = '';
    let mainAction: (() => void) | null = null;
    let mainClass = '';
    if (walk.busy) mainLabel = 'Rolling';
    else if (myTurn && state.phase === 'roll') {
        mainLabel = 'Roll';
        mainAction = () => send({ type: 'roll' });
    } else if (myTurn && state.phase === 'end') {
        mainLabel = (
            <>
                End
                <br />
                turn
            </>
        );
        mainAction = () => send({ type: 'endTurn' });
        mainClass = 'end';
    } else if (myTurn) mainLabel = 'Decide';

    // One pop-up at a time, most urgent first. All of them cover the whole screen.
    let pop: React.ReactNode = null;
    /** The pop-up is a timed decision, so the countdown must stay visible on top of it. */
    let timed = false;
    if (over) pop = <WinnerPopup state={state} me={me} homeHref={homeHref} />;
    else if (incoming) pop = <OfferInbox state={state} me={me} send={send} offer={incoming} now={now} />;
    else if (view?.t === 'menu')
        pop = (
            <MenuPopup
                canForfeit={!mePlayer.bankrupt}
                host={host}
                homeHref={homeHref}
                onGuide={() => setView({ t: 'guide' })}
                onLog={() => setView({ t: 'log' })}
                onClose={() => setView(null)}
                onLeave={() => {
                    // The host leaving ends the room for everyone.
                    if (host) onClose();
                    else send({ type: 'leave' });
                    router.push(homeHref);
                }}
            />
        );
    else if (view?.t === 'guide') pop = <GuidePopup onClose={() => setView(null)} />;
    else if (view?.t === 'log') pop = <LogPopup log={state.log} onClose={() => setView(null)} />;
    else if (view?.t === 'market') pop = <MarketBook onClose={() => setView(null)} />;
    else if (view?.t === 'chance') pop = <ChanceBook onClose={() => setView(null)} />;
    else if (view?.t === 'player')
        pop = (
            <PlayerPanel
                state={state}
                me={me}
                seat={view.seat}
                send={send}
                onClose={() => setView(null)}
                onSpace={openSpace}
                onOffer={(draft) => setView({ t: 'offer', draft })}
            />
        );
    else if (view?.t === 'deal')
        pop = (
            <Pop onClose={() => setView(null)}>
                <h3 className="pop-title">Make a deal with</h3>
                <div className="dealwith">
                    {others.map((p) => (
                        <button key={p.seat} type="button" className="plate dw" onClick={() => setView({ t: 'player', seat: p.seat })}>
                            <Avatar name={p.name} color={p.color} />
                            <b>{p.name}</b>
                            <Cash value={p.cash} />
                            <small>{ownedBy(state, p.seat).length} properties</small>
                        </button>
                    ))}
                </div>
                <p className="small center">Your turn clock waits while you make a deal.</p>
            </Pop>
        );
    else if (view?.t === 'offer') pop = <OfferComposer state={state} me={me} send={send} draft={view.draft} onClose={() => setView(null)} />;
    else if (view?.t === 'space')
        pop = (
            <Pop bare onClose={() => setView(null)}>
                <PropertyCard
                    space={view.i}
                    state={state}
                    me={me}
                    send={send}
                />
            </Pop>
        );
    else if (!walk.busy && pending) {
        timed = pending.type !== 'auction';
        if (pending.type === 'buy' && myTurn)
            pop = (
                <Pop bare>
                    <PropertyCard space={pending.space} state={state} me={me} send={send} mode="buy" />
                </Pop>
            );
        else if (pending.type === 'auction') pop = <AuctionPopup state={state} me={me} send={send} pending={pending} now={now} />;
        else if (pending.type === 'card') pop = <CardPopup state={state} me={me} send={send} card={pending.card} />;
        else if (pending.type === 'result') pop = <ResultPopup state={state} me={me} send={send} pending={pending} />;
        else if (pending.type === 'market' && myTurn) pop = <MarketPopup state={state} me={me} send={send} />;
        else if (pending.type === 'break' && myTurn) pop = <BreakPopup state={state} me={me} send={send} />;
        else if (pending.type === 'loanDue' && myTurn) {
            const due = state.loans.find((l) => l.id === pending.id);
            if (due) pop = <LoanDuePopup state={state} me={me} send={send} loan={due} waiting={!!outgoing} />;
        }
    } else if (!walk.busy && state.phase === 'debt' && myTurn && !raising) {
        timed = true;
        pop = (
            <DebtPopup
                state={state}
                me={me}
                send={send}
                onRaise={() => setRaising(true)}
                onAskLoan={() => {
                    setRaising(true);
                    setView({ t: 'offer', draft: { kind: 'loan' } });
                }}
            />
        );
    }

    return (
        <main className={cn('screen', myTurn && !paused && 'myturn')}>
            {splash > 0 && !paused && (
                <div key={splash} className="turnsplash" aria-hidden="true">
                    <b>Your turn</b>
                </div>
            )}
            {/* Notices hang under the top bar, over the table, so showing or hiding one never moves anything. */}
            <div className="hudwrap">
            <div className="hud">
                <button type="button" className="ib" aria-label="Main menu" onClick={() => setView({ t: 'menu' })}>
                    <LogOut className="lu" />
                </button>
                {host && !over ? (
                    <button type="button" className="ib gold" aria-label="Pause the game for everyone" onClick={() => onPause(true)}>
                        <Pause className="lu" />
                    </button>
                ) : (
                    <span className="tag dim">R{state.round}</span>
                )}
                <span className={cn('tag dim', state.endsAt !== null && !over && matchLeft < 60_000 && 'clocklow')}>
                    <Timer className="lu" />
                    {state.endsAt === null ? 'No limit' : clock}
                </span>
                <span className="sp" />
                <button type="button" className={cn('ib', signal.tone)} aria-label={signal.label} onClick={() => notify(signal.label, online ? 'info' : 'error')}>
                    <signal.Icon className="lu" />
                </button>
                <AudioToggles />
            </div>
                <div className="banners">
            {inDebt && boardMode === 'cash' && (
                <div className="banner">
                    <span>Raise {rs(-mePlayer.cash)}. Tap a lit property: a house is sold, or it is mortgaged. Or make a deal.</span>
                    <GButton size="sm" tone="gold" onClick={() => setRaising(false)}>
                        Options
                    </GButton>
                </div>
            )}
            {boardMode !== null && !(inDebt && boardMode === 'cash') && lit && (
                <div className="banner info">
                    <span>{MODE_HINT[boardMode][lit.size ? 0 : 1]}{boardMode === 'build' && lit.size > 0 && ` From ${rs(Math.min(...[...lit].map(houseCost)))}.`}</span>
                    <GButton size="sm" tone="gold" onClick={() => setMode(null)}>
                        Done
                    </GButton>
                </div>
            )}
            {/* Playing on with a debt that was put off: a reminder that the next turn opens with it. */}
            {myTurn && state.phase !== 'debt' && mePlayer.cash < 0 && !walk.busy && (
                <div className="banner">
                    <span>You are {rs(-mePlayer.cash)} short. Raise it now with Sell or Trade, or it must be paid when your next turn starts.</span>
                </div>
            )}
            {myTurn && state.phase === 'roll' && mePlayer.jail > 0 && !walk.busy && (
                <div className="banner info">
                    <span>
                        <LockKeyhole className="lu" /> In Jail, try {mePlayer.jail} of {BUSINESS_RULES.JAIL_TRIES}. Roll doubles to leave free.
                    </span>
                    {/* A player visiting Jail can get you out for a price you agree; otherwise leaving costs a share of your cash. */}
                    {others
                        .filter((p) => visitingJail(state, p.seat))
                        .slice(0, 1)
                        .map((p) => (
                            <GButton key={p.seat} size="sm" tone="blue" onClick={() => setView({ t: 'offer', draft: { kind: 'bail', with: p.seat, prisoner: me } })}>
                                Bail
                            </GButton>
                        ))}
                    <GButton size="sm" tone="gold" disabled={mePlayer.cash < BUSINESS_RULES.PCT_MIN} onClick={() => send({ type: 'payJail' })}>
                        Pay {rs(shareOfCash(mePlayer.cash, BUSINESS_RULES.JAIL_PCT))}
                    </GButton>
                </div>
            )}
            {outgoing && (
                <div className="banner info">
                    <span>
                        Waiting for {state.players[outgoing.to].name}: {describeOffer(state, outgoing)[0]}
                    </span>
                    <GButton size="sm" tone="red" onClick={() => send({ type: 'cancelOffer', id: outgoing.id })}>
                        Cancel
                    </GButton>
                </div>
            )}

                </div>
            </div>

            <Board
                state={state}
                shown={walk.shown}
                moving={walk.moving}
                pace={walk.pace}
                selected={selected}
                onSelect={tapTile}
                onMarket={() => setView({ t: 'market' })}
                onChance={() => setView({ t: 'chance' })}
                lit={lit}
                overlay={deals.deal && <DealBanner state={state} deal={deals.deal} />}
            />


            {/* Only the player on turn has the toolbar; its space is kept so the board never jumps. */}
            <div className={cn('tools', !showTools && 'concealed')} aria-hidden={!showTools}>
                {(
                    [
                        ['deal', 'Trade', ArrowLeftRight, others.length > 0],
                        ['build', 'Build', Hammer, managing],
                        ['cash', 'Sell', HandCoins, true],
                        ['mine', 'Mine', Building2, true],
                    ] as const
                ).map(([key, label, Icon, enabled]) => (
                    <button
                        key={key}
                        type="button"
                        className={cn('tool', `t-${key}`, boardMode === key && 'on')}
                        disabled={!showTools || !enabled}
                        onClick={() => {
                            sfx('click');
                            if (key === 'deal') return setView(others.length === 1 ? { t: 'player', seat: others[0].seat } : { t: 'deal' });
                            setMode(mode === key ? null : key);
                        }}
                    >
                        <Icon className="lu" />
                        <span>{label}</span>
                    </button>
                ))}
            </div>

            <div className="dock">
                <div className="col">{state.players.filter((p) => p.seat % 2 === 0).map((p) => plate(p.seat))}</div>
                <div className="mid">
                    {!over && secsLeft !== null && (
                        <span className={cn('tchip', held ? 'held' : secsLeft <= 5 && 'low')}>
                            {held ? <Pause className="lu" /> : <Timer className="lu" />}
                            {secsLeft}s
                        </span>
                    )}
                    <div className="dice">
                        <Die value={state.dice[0]} spin={state.rollSeq} instant={!awake} />
                        <Die value={state.dice[1]} spin={state.rollSeq} flip instant={!awake} />
                    </div>
                    {/* Only the player whose turn it is sees the button; the space is kept so the board does not jump. */}
                    <button
                        type="button"
                        className={cn('roll', mainClass, !myTurn && 'concealed')}
                        aria-hidden={!myTurn}
                        disabled={!mainAction || walk.busy}
                        onClick={() => {
                            sfx('click');
                            buzz();
                            mainAction?.();
                        }}
                    >
                        {mainLabel}
                    </button>
                </div>
                <div className="col">{state.players.filter((p) => p.seat % 2 === 1).map((p) => plate(p.seat))}</div>
            </div>

            <div className="tick">
                <div className="plate ticker" aria-live="polite">
                    <Avatar name={active.name} color={active.color} size="sm" />
                    <span>{state.log[0]?.text}</span>
                </div>
                <button type="button" className="logbtn" aria-label="Show the activity log" onClick={() => setView({ t: 'log' })}>
                    <ScrollText className="lu" />
                </button>
            </div>

            {pop}
            {paused && !over && (
                <div className="paused" role="status">
                    <div className="pausecard">
                        <Pause className="lu" />
                        <h2>Game paused</h2>
                        <p>{host ? 'You paused the game. Every timer is stopped.' : `${room.seats[room.hostSeat]?.name ?? 'The host'} paused the game for a moment.`}</p>
                        {host ? (
                            <GButton tone="green" size="big" onClick={() => onPause(false)}>
                                <Play className="lu" />
                                Resume
                            </GButton>
                        ) : (
                            <span className="small">It carries on when the host resumes.</span>
                        )}
                    </div>
                </div>
            )}
            {pop && timed && secsLeft !== null && (
                <span className={cn('tchip float', secsLeft <= 5 && 'low')}>
                    <Timer className="lu" />
                    {secsLeft}s
                </span>
            )}
        </main>
    );
}
