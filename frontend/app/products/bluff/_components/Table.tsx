'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import {
    Bot,
    Gavel,
    Lock,
    LogOut,
    Pause,
    Play,
    ScrollText,
    Signal,
    SignalHigh,
    SignalLow,
    SignalMedium,
    Timer,
    Trash2,
    WifiOff,
} from 'lucide-react';
import { BLUFF_RANKS, BLUFF_RULES, bluffRankName, type BluffRank } from '@aixellabs/backend/bluff/constants';
import { bluffCanCall, bluffOnTurn } from '@aixellabs/backend/bluff/compute';
import type { BluffFx, BluffPublicPlayer, BluffPublicState, BluffRoomView } from '@aixellabs/backend/bluff/types';
import { cn } from '@/lib/utils';
import { AudioToggles, Avatar, GButton } from '../../business/_components/bits';
import { cssVars } from '../../business/_lib/art';
import { buzz } from '../../business/_lib/haptic';
import { sfx, sfxShared } from '../../business/_lib/sound';
import { notify } from '../../business/_lib/toast';
import type { BluffSend } from '../_hooks/use-bluff-room';
import { PlayingCard } from './bits';
import { CallPopup, LogPopup, MenuPopup, ResultPopup, RulesPopup } from './Popups';

/** Where the other players sit around the felt (left %, top %), for 1 to 5 of them, clockwise from your left. */
const SPOTS: Record<number, [number, number][]> = {
    1: [[50, 0]],
    2: [
        [26, 3],
        [74, 3],
    ],
    3: [
        [9, 36],
        [50, 0],
        [91, 36],
    ],
    4: [
        [8, 50],
        [28, 4],
        [72, 4],
        [92, 50],
    ],
    5: [
        [8, 50],
        [15, 12],
        [50, 0],
        [85, 12],
        [92, 50],
    ],
};
const ORDINALS = ['', '1st', '2nd', '3rd', '4th', '5th', '6th'];
const TURN_SPLASH_MS = 1500;
/** Gap between two cards leaving a seat, and how long one is in the air. */
const CARD_GAP_MS = 170;
const FLIGHT_MS = 520;
const BUBBLE_MS = 2000;
const BANNER_MS = 2400;
/** Most card backs drawn for the pile, and most sent flying at once. */
const PILE_SHOWN = 12;
const FLY_MAX = 10;
/** Cards per row in your hand before it wraps to another row. */
const ROW_ONE = 13;
const ROW_TWO = 40;

/** Server clock, ticking a few times a second, for countdowns. */
function useNow(offset: number): number {
    const [now, setNow] = useState(() => Date.now() + offset);
    useEffect(() => {
        const timer = window.setInterval(() => setNow(Date.now() + offset), 250);
        return () => window.clearInterval(timer);
    }, [offset]);
    return now;
}

function signalOf(online: boolean, rtt: number | null) {
    if (!online) return { Icon: WifiOff, tone: 'bad', text: 'offline', label: 'Offline. Reconnecting…' };
    if (rtt === null) return { Icon: SignalLow, tone: 'offc', text: '…', label: 'Checking the connection…' };
    const text = rtt >= 5000 ? 'no reply' : `${rtt}ms`;
    if (rtt < 150) return { Icon: Signal, tone: 'good', text, label: `Strong connection (${rtt} ms)` };
    if (rtt < 350) return { Icon: SignalHigh, tone: 'good', text, label: `Good connection (${rtt} ms)` };
    if (rtt < 700) return { Icon: SignalMedium, tone: 'warn', text, label: `Slow connection (${rtt} ms)` };
    return { Icon: SignalLow, tone: 'bad', text, label: `Weak connection (${rtt} ms)` };
}

type Flight = { key: number; x: number; y: number; dx: number; dy: number; delay: number; rot: number; bin: boolean };
type Bubble = { key: number; seat: number; text: string; grey: boolean };
type Float = { key: number; seat: number; text: string };

/**
 * Turns new log lines into what the table shows: cards in the air, a word on a seat, the bin
 * shaking, a banner. The server has already changed the state; this only plays it back.
 */
function useTableFx(state: BluffPublicState, me: number, main: React.RefObject<HTMLElement | null>, quiet: boolean) {
    const [flights, setFlights] = useState<Flight[]>([]);
    const [bubbles, setBubbles] = useState<Bubble[]>([]);
    const [floats, setFloats] = useState<Float[]>([]);
    const [banner, setBanner] = useState<{ key: number; node: ReactNode } | null>(null);
    /** Changes whenever a card lands in the bin, to replay its shake. */
    const [binBump, setBinBump] = useState(0);
    /** A rank that has just been named: its card on the felt pops in. */
    const [freshRank, setFreshRank] = useState(0);
    const seen = useRef<number | null>(null);
    const keys = useRef(0);
    const timers = useRef<number[]>([]);
    const latest = useRef(state);
    latest.current = state;
    useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

    const later = useCallback((fn: () => void, ms: number) => {
        timers.current.push(window.setTimeout(fn, ms));
    }, []);

    /** The middle of an element, measured from the table's top-left corner. */
    const point = useCallback(
        (selector: string): [number, number] | null => {
            const table = main.current?.querySelector('.bl-table');
            const el = main.current?.querySelector(selector);
            if (!table || !el) return null;
            const box = table.getBoundingClientRect();
            const b = el.getBoundingClientRect();
            return [b.left + b.width / 2 - box.left, b.top + b.height / 2 - box.top];
        },
        [main],
    );
    const seatPoint = useCallback(
        (seat: number) => point(seat === me ? '.bl-hand' : `.bl-seat[data-seat="${seat}"] .av`),
        [me, point],
    );

    const fly = useCallback(
        (
            from: [number, number] | null,
            to: [number, number] | null,
            count: number,
            gap: number,
            bin: boolean,
            onLand?: () => void,
        ) => {
            if (!from || !to) return;
            const added: Flight[] = [];
            for (let i = 0; i < count; i++) {
                const key = ++keys.current;
                added.push({
                    key,
                    x: from[0],
                    y: from[1],
                    dx: to[0] - from[0] + (bin ? 0 : (i % 3) * 10 - 10),
                    dy: to[1] - from[1],
                    delay: i * gap,
                    rot: (i % 2 ? 1 : -1) * (150 + ((i * 47) % 90)),
                    bin,
                });
                later(
                    () => {
                        onLand?.();
                        setFlights((list) => list.filter((f) => f.key !== key));
                    },
                    i * gap + FLIGHT_MS,
                );
            }
            setFlights((list) => [...list, ...added]);
        },
        [later],
    );

    const say = useCallback(
        (seat: number, text: string, grey = false) => {
            if (seat === me) return;
            const key = ++keys.current;
            setBubbles((list) => [...list.filter((b) => b.seat !== seat), { key, seat, text, grey }]);
            later(() => setBubbles((list) => list.filter((b) => b.key !== key)), BUBBLE_MS);
        },
        [later, me],
    );

    const show = useCallback(
        (node: ReactNode) => {
            const key = ++keys.current;
            setBanner({ key, node });
            later(() => setBanner((b) => (b?.key === key ? null : b)), BANNER_MS);
        },
        [later],
    );

    const run = useCallback(
        (fx: BluffFx) => {
            const s = latest.current;
            const name = (seat: number) => s.players[seat]?.name ?? '';
            if (fx.kind === 'play') {
                fly(seatPoint(fx.seat), point('.bl-pile'), fx.count, CARD_GAP_MS, false);
                for (let i = 0; i < fx.count; i++) later(() => sfx('card'), i * CARD_GAP_MS);
                say(fx.seat, `${fx.count} ${fx.rank}${fx.count === 1 ? '' : "'s"}`);
                if (fx.opened) setFreshRank((n) => n + 1);
            } else if (fx.kind === 'pass') {
                say(fx.seat, 'Pass', true);
                sfx('turn');
            } else if (fx.kind === 'call') {
                sfx('siren');
                const reveal = s.reveal;
                // The stamp lands once every called card has flipped.
                if (reveal) later(() => sfxShared(reveal.bluff ? 'jail' : 'paidOff'), 500 + reveal.cards.length * 280 + 450);
            } else if (fx.kind === 'take') {
                fly(point('.bl-mid'), seatPoint(fx.taker), Math.min(fx.count, FLY_MAX), 70, false);
                const key = ++keys.current;
                setFloats((list) => [
                    ...list,
                    { key, seat: fx.taker, text: `+${fx.count} card${fx.count === 1 ? '' : 's'}` },
                ]);
                later(() => setFloats((list) => list.filter((f) => f.key !== key)), 2200);
                sfx('pay');
            } else if (fx.kind === 'trash') {
                const n = Math.min(fx.count, FLY_MAX);
                fly(point('.bl-mid'), point('.bl-trash'), n, 70, true, () => {
                    setBinBump((k) => k + 1);
                    sfx('bid');
                });
                later(
                    () => {
                        sfx(fx.closed ? 'timeout' : 'chime');
                        show(
                            fx.closed ? (
                                <div className="deal grey">
                                    <span className="bl-now">
                                        <small>Closed</small>
                                        <b>{fx.rank}</b>
                                    </span>
                                    <div className="dl-cap">{bluffRankName(fx.rank)} are closed</div>
                                    <div className="dl-sub">Nobody can open with them again</div>
                                </div>
                            ) : (
                                <div className="deal green">
                                    <div className="dl-cap">Nobody called {fx.seat === me ? 'you' : name(fx.seat)}</div>
                                    <div className="dl-sub">
                                        {fx.count} card{fx.count === 1 ? '' : 's'} to the trash
                                    </div>
                                </div>
                            ),
                        );
                    },
                    n * 70 + FLIGHT_MS,
                );
            } else if (fx.kind === 'out') {
                sfx('income');
                show(
                    <div className="deal green">
                        <div className="dl-cap">
                            {fx.seat === me ? 'You are out of cards' : `${name(fx.seat)} is out of cards`}
                        </div>
                        <div className="dl-sub">{ORDINALS[fx.place]} place</div>
                    </div>,
                );
            } else if (fx.kind === 'gone') {
                sfx('out');
            }
        },
        [fly, later, me, point, say, seatPoint, show],
    );

    useEffect(() => {
        // Nothing is replayed for moves made before this screen was up, or while the window was hidden.
        if (seen.current === null || quiet || document.hidden) {
            seen.current = state.logSeq;
            return;
        }
        const fresh = state.log.filter((entry) => entry.n > (seen.current as number) && entry.fx).reverse();
        seen.current = state.logSeq;
        let wait = 0;
        for (const entry of fresh) {
            const fx = entry.fx as BluffFx;
            later(() => run(fx), wait);
            // An "out of cards" banner waits for the banner before it.
            wait += fx.kind === 'trash' || fx.kind === 'take' ? 900 : 0;
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [state.logSeq, quiet]);

    return { flights, bubbles, floats, banner, binBump, freshRank };
}

function Seat({
    p,
    spot,
    now,
    state,
    away,
    bubble,
    float,
}: {
    p: BluffPublicPlayer;
    spot: [number, number];
    now: number;
    state: BluffPublicState;
    away: boolean;
    bubble?: Bubble;
    float?: Float;
}) {
    const turn = state.phase === 'play' && state.turn === p.seat && state.round.closingAt === null;
    const left = state.deadline === null ? 0 : Math.max(0, Math.min(1, (state.deadline - now) / (state.turnSeconds * 1000)));
    const done = p.place !== null;
    return (
        <div
            className={cn(
                'bl-seat',
                turn && 'now',
                done && 'done',
                !done && p.passed && 'passed',
                spot[0] > 80 && 'edge-r',
                spot[0] < 20 && 'edge-l',
            )}
            data-seat={p.seat}
            style={cssVars({ left: `${spot[0]}%`, top: `${spot[1]}%`, '--p': Math.round(left * 100) })}
        >
            <span className="bl-ring">
                <Avatar name={p.name} color={p.color} />
                {!done && p.passed && <span className="tag bl-passed">Passed</span>}
                {done ? (
                    <span className="tag green bl-place">{p.gone ? 'Out' : ORDINALS[p.place as number]}</span>
                ) : (
                    <span className={cn('bl-cnt', p.cards <= 3 && 'few')}>{p.cards}</span>
                )}
                {away && !done && (
                    <span className="botchip" aria-label="Away: a stand-in is playing">
                        <Bot />
                    </span>
                )}
            </span>
            <span className="bl-nm">{p.name}</span>
            {!done && (
                <span className="strikes" title={`${p.missed} of ${state.missLimit} missed turns`}>
                    {Array.from({ length: state.missLimit }, (_, i) => (
                        <i key={i} className={i < p.missed ? 'hit' : undefined} />
                    ))}
                </span>
            )}
            {bubble && (
                <span key={bubble.key} className={cn('bl-say', bubble.grey && 'grey')}>
                    {bubble.text}
                </span>
            )}
            {float && (
                <span key={float.key} className="bl-fl">
                    <b>{float.text}</b>
                </span>
            )}
        </div>
    );
}

type TableProps = {
    room: BluffRoomView;
    send: BluffSend;
    clockOffset: number;
    online: boolean;
    rtt: number | null;
    homeHref: string;
    onPause: (on: boolean) => void;
    /** Host only: ends the room for everyone. */
    onClose: () => void;
    /** Host only: ends the match now. */
    onEnd: () => void;
    /** The 3, 2, 1 is still on screen: nothing is announced yet. */
    curtain?: boolean;
};

export function Table({
    room,
    send,
    clockOffset,
    online,
    rtt,
    homeHref,
    onPause,
    onClose,
    onEnd,
    curtain = false,
}: TableProps) {
    const router = useRouter();
    const state = room.state as BluffPublicState;
    const me = room.you;
    const mePlayer = state.players[me];
    const n = state.players.length;
    const over = state.phase === 'over';
    const host = me === room.hostSeat;
    const paused = room.pausedAt !== null;
    const liveNow = useNow(clockOffset);
    // While the host has the match paused, every countdown stands still at the moment of the pause.
    const now = room.pausedAt ?? liveNow;
    const main = useRef<HTMLElement | null>(null);
    const fx = useTableFx(state, me, main, curtain);
    const [view, setView] = useState<null | 'menu' | 'rules' | 'log' | 'call'>(null);

    const { round } = state;
    const last = round.lastPlay;
    const myTurn = bluffOnTurn(state, me);
    const holdLeft = Math.max(0, Math.ceil((round.holdUntil - now) / 1000));
    const held = holdLeft > 0;
    const inMatch = !mePlayer.gone && mePlayer.place === null;
    const active = state.players[state.turn];

    // --- your hand: which cards are lifted ---
    const [picked, setPicked] = useState<number[]>([]);
    const handIds = state.hand.map((c) => c.id).join(',');
    useEffect(() => {
        // Cards that left the hand cannot stay picked.
        setPicked((list) => list.filter((id) => state.hand.some((c) => c.id === id)));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [handIds]);
    const canPick = inMatch && !mePlayer.passed && !over;
    const toggle = (id: number) => {
        if (!canPick) return;
        sfx('click');
        setPicked((list) => {
            if (list.includes(id)) return list.filter((x) => x !== id);
            if (list.length >= BLUFF_RULES.MAX_PLAY) {
                notify(`At most ${BLUFF_RULES.MAX_PLAY} cards in one play.`, 'info');
                return list;
            }
            return [...list, id];
        });
    };
    useEffect(() => {
        if (view === 'call' && (!myTurn || round.rank !== null || !picked.length)) setView(null);
    }, [view, myTurn, round.rank, picked.length]);

    // --- Bluff: one tap sends one call ---
    const [calledPlay, setCalledPlay] = useState(0);
    const canCall = bluffCanCall(state, me) && !paused && calledPlay !== last?.id;
    const callBluff = () => {
        if (!last || !canCall) return;
        setCalledPlay(last.id);
        buzz();
        send({ type: 'bluff', play: last.id });
    };

    const play = () => {
        if (!myTurn || held || !picked.length) return;
        if (round.rank === null) return setView('call');
        send({ type: 'play', cards: picked });
        setPicked([]);
    };
    const playAs = (rank: BluffRank) => {
        send({ type: 'play', cards: picked, rank });
        setPicked([]);
        setView(null);
    };

    // The moment the turn becomes yours: a stamp across the screen and a buzz in the hand.
    const [splash, setSplash] = useState(0);
    const turnSeen = useRef<string | null>(null);
    const turnKey = `${state.turn}:${state.roundNo}:${last?.id ?? 0}`;
    useEffect(() => {
        if (curtain || over || turnSeen.current === turnKey) return;
        const first = turnSeen.current === null;
        turnSeen.current = turnKey;
        if (!myTurn) return void (!first && sfx('turn'));
        setSplash(state.rev);
        sfx('myTurn');
        buzz(2);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [turnKey, curtain, over, myTurn]);
    useEffect(() => {
        if (!splash) return;
        const timer = window.setTimeout(() => setSplash(0), TURN_SPLASH_MS);
        return () => window.clearTimeout(timer);
    }, [splash]);

    // The last five seconds of a turn tick for everyone at the table, then the buzzer.
    useEffect(() => {
        if (over || paused || state.deadline === null || state.phase !== 'play') return;
        const left = state.deadline - (Date.now() + clockOffset);
        const timers: number[] = [];
        for (let k = BLUFF_RULES.TICK_LAST_SECONDS; k >= 1; k--) {
            if (left - k * 1000 >= 0) timers.push(window.setTimeout(() => sfxShared('tick'), left - k * 1000));
        }
        if (left >= 0) timers.push(window.setTimeout(() => sfxShared('timeout'), left));
        return () => timers.forEach((t) => window.clearTimeout(t));
    }, [state.deadline, state.phase, over, paused, clockOffset]);

    const pauseLeft =
        room.pausedAt === null ? 0 : Math.max(0, BLUFF_RULES.PAUSE_MAX_SECONDS * 1000 - (liveNow - room.pausedAt));
    const pauseClock = `${Math.floor(pauseLeft / 60000)}:${String(Math.floor((pauseLeft % 60000) / 1000)).padStart(2, '0')}`;
    const signal = signalOf(online, rtt);
    const secsLeft = state.deadline === null ? null : Math.max(0, Math.ceil((state.deadline - now) / 1000));

    const others = Array.from({ length: n - 1 }, (_, k) => state.players[(me + 1 + k) % n]);
    const spots = SPOTS[others.length] ?? SPOTS[5];
    const who = (seat: number) => (seat === me ? 'You' : state.players[seat].name);

    // --- the middle of the felt ---
    const reveal = state.reveal;
    const shown = Math.min(round.pile, PILE_SHOWN);
    const callLine =
        round.rank === null || !last ? (
            <div className="bl-call open">
                <small>New round</small>
                <b>{over ? 'Match over' : state.turn === me ? 'You open' : `${active?.name ?? ''} opens`}</b>
            </div>
        ) : (
            <div className="bl-call">
                <span className="line">
                    <Avatar name={state.players[last.seat].name} color={state.players[last.seat].color} size="sm" />
                    {who(last.seat)} put {last.count} {bluffRankName(round.rank, last.count)}
                </span>
            </div>
        );

    // --- your hand, in as many rows as it needs ---
    const rowCount = state.hand.length <= ROW_ONE ? 1 : state.hand.length <= ROW_TWO ? 2 : 3;
    const perRow = Math.ceil(state.hand.length / rowCount);
    const rows = Array.from({ length: rowCount }, (_, r) => state.hand.slice(r * perRow, (r + 1) * perRow)).filter(
        (row) => row.length,
    );

    const playLabel = !inMatch
        ? mePlayer.gone
            ? 'You are out'
            : `${ORDINALS[mePlayer.place as number]} place`
        : state.phase === 'reveal'
          ? 'Cards up…'
          : mePlayer.passed
            ? 'You passed'
            : !myTurn
              ? round.closingAt !== null
                  ? 'Last call…'
                  : `${active?.name ?? ''}'s turn`
              : held
                ? `Wait ${holdLeft}`
                : !picked.length
                  ? 'Pick cards'
                  : round.rank
                    ? `Play ${round.rank}${picked.length === 1 ? '' : "'s"}`
                    : 'Play…';

    const leave = () => {
        // The host leaving a running match ends it for everyone; with no match running it closes the room.
        if (over && host) onClose();
        else if (!over) send({ type: 'leave' });
        router.push(homeHref);
    };

    let pop: ReactNode = null;
    if (view === 'menu')
        pop = (
            <MenuPopup
                playing={inMatch && !over}
                host={host}
                homeHref={homeHref}
                onRules={() => setView('rules')}
                onLog={() => setView('log')}
                onLeave={leave}
                onEnd={host && !over ? onEnd : undefined}
                onClose={() => setView(null)}
            />
        );
    else if (view === 'rules') pop = <RulesPopup onClose={() => setView(null)} />;
    else if (view === 'log') pop = <LogPopup log={state.log} onClose={() => setView(null)} />;
    else if (view === 'call')
        pop = (
            <CallPopup
                cards={state.hand.filter((c) => picked.includes(c.id))}
                closed={state.closed}
                onPlay={playAs}
                onClose={() => setView(null)}
            />
        );
    else if (over) pop = <ResultPopup state={state} me={me} homeHref={homeHref} />;

    const ticker = state.log[0];

    return (
        <main ref={main} className={cn('screen', myTurn && !paused && !over && 'myturn')}>
            {splash > 0 && !paused && (
                <div key={splash} className="turnsplash" aria-hidden="true">
                    <b>Your turn</b>
                </div>
            )}
            <div className="hudwrap">
                <div className="hud">
                    <button type="button" className="ib" aria-label="Main menu" onClick={() => setView('menu')}>
                        <LogOut className="lu" />
                    </button>
                    {host && !over && (
                        <button
                            type="button"
                            className="ib gold"
                            aria-label="Pause the game for everyone"
                            onClick={() => onPause(true)}
                        >
                            <Pause className="lu" />
                        </button>
                    )}
                    <span className="tag dim">Round {state.roundNo}</span>
                    <span className="sp" />
                    <button
                        type="button"
                        className={cn('ib net', signal.tone)}
                        aria-label={signal.label}
                        onClick={() => notify(signal.label, online ? 'info' : 'error')}
                    >
                        <signal.Icon className="lu" />
                        {signal.text}
                    </button>
                    <AudioToggles />
                </div>
            </div>

            <div className="bl-table">
                <div className="bl-felt" />
                <div className="bl-mid">
                    {callLine}
                    <div className="bl-stage">
                        {round.rank && (
                            <div
                                key={fx.freshRank}
                                className={cn('bl-now', fx.freshRank > 0 && 'fresh')}
                                aria-label={`Rank in play: ${bluffRankName(round.rank)}`}
                            >
                                <small>Playing</small>
                                <b>{round.rank}</b>
                                <em>{bluffRankName(round.rank)}</em>
                            </div>
                        )}
                        {round.pile ? (
                            <div className="bl-pile">
                                {Array.from({ length: shown }, (_, k) => (
                                    <span
                                        key={k}
                                        className={cn('bl-back', last && k >= shown - last.count && 'last')}
                                        style={cssVars({
                                            '--x': `${((k * 53) % 46) - 23}px`,
                                            '--y': `${((k * 31) % 14) - 7}px`,
                                            '--r': `${((k * 67) % 70) - 35}deg`,
                                        })}
                                    />
                                ))}
                            </div>
                        ) : (
                            <div className="bl-pile empty" />
                        )}
                    </div>
                    <span className="tag dim">{round.pile ? `${round.pile} in the pile` : 'Pile is empty'}</span>
                </div>

                {others.map((p, k) => (
                    <Seat
                        key={p.seat}
                        p={p}
                        spot={spots[k]}
                        now={now}
                        state={state}
                        away={!room.seats[p.seat]?.connected}
                        bubble={fx.bubbles.find((b) => b.seat === p.seat)}
                        float={fx.floats.find((f) => f.seat === p.seat)}
                    />
                ))}

                <div
                    key={fx.binBump}
                    className={cn('bl-trash', fx.binBump > 0 && 'bump')}
                    aria-label={`Trash: ${state.trash.count} cards`}
                >
                    <Trash2 />
                    <b>{state.trash.count}</b>
                </div>

                {fx.flights.map((f) => (
                    <span
                        key={f.key}
                        className={cn('bl-back bl-fly anim', f.bin && 'bin')}
                        style={cssVars({
                            left: `${f.x}px`,
                            top: `${f.y}px`,
                            '--dx': `${f.dx}px`,
                            '--dy': `${f.dy}px`,
                            '--rot': `${f.rot}deg`,
                            animationDelay: `${f.delay}ms`,
                        })}
                    />
                ))}

                <div className="bl-over">
                    {reveal ? (
                        <div
                            key={reveal.playId}
                            className="bl-reveal"
                            style={cssVars({ '--at': `${(0.5 + reveal.cards.length * 0.28 + 0.45).toFixed(2)}s` })}
                        >
                            <div className="said">
                                <Gavel className="lu" /> {who(reveal.caller)} called{' '}
                                {reveal.target === me ? 'you' : state.players[reveal.target].name}:{' '}
                                <b>
                                    {reveal.cards.length} {bluffRankName(round.rank as BluffRank, reveal.cards.length)}
                                </b>
                            </div>
                            <div className="bl-flips">
                                {reveal.cards.map((card, i) => (
                                    <div
                                        key={card.id}
                                        className={cn('bl-flip', card.rank === round.rank ? 'true' : 'lie')}
                                        style={cssVars({ '--i': i })}
                                    >
                                        <div className="in">
                                            <span className="bl-back" />
                                            <PlayingCard card={card} />
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <div className={cn('bl-stamp', !reveal.bluff && 'truth')}>
                                {reveal.bluff ? 'Bluff!' : 'Truth!'}
                            </div>
                            <div className="takes">
                                {who(reveal.taker)} {reveal.taker === me ? 'take' : 'takes'} all {reveal.count} cards
                            </div>
                        </div>
                    ) : (
                        fx.banner && <div key={fx.banner.key}>{fx.banner.node}</div>
                    )}
                </div>
            </div>

            <div className="bl-strip" aria-label="Ranks: the one in play, and the closed ones">
                {BLUFF_RANKS.map((r) => (
                    <span key={r} className={r === round.rank ? 'on' : state.closed.includes(r) ? 'dead' : undefined}>
                        {r}
                    </span>
                ))}
            </div>

            <div className="tick">
                <div className="plate ticker" aria-live="polite">
                    {ticker?.seat !== undefined && (
                        <Avatar name={state.players[ticker.seat].name} color={state.players[ticker.seat].color} size="sm" />
                    )}
                    <span>{ticker?.text}</span>
                </div>
                <button type="button" className="logbtn" aria-label="Show the activity log" onClick={() => setView('log')}>
                    <ScrollText className="lu" />
                </button>
            </div>

            <div className="bl-me">
                <Avatar name={mePlayer.name} color={mePlayer.color} />
                <span className="who">{mePlayer.name} (you)</span>
                <span className="tag dim">
                    {state.hand.length} card{state.hand.length === 1 ? '' : 's'}
                </span>
                {inMatch && mePlayer.passed && <span className="tag out">Passed</span>}
                {mePlayer.place !== null && (
                    <span className="tag green">{mePlayer.gone ? 'Out' : ORDINALS[mePlayer.place]}</span>
                )}
                {inMatch && (
                    <span className="strikes" title={`${mePlayer.missed} of ${state.missLimit} missed turns`}>
                        {Array.from({ length: state.missLimit }, (_, i) => (
                            <i key={i} className={i < mePlayer.missed ? 'hit' : undefined} />
                        ))}
                    </span>
                )}
                <span className="sp" />
                {myTurn && !held && secsLeft !== null && (
                    <span className={cn('tchip', secsLeft <= 10 && 'low')}>
                        <Timer className="lu" />
                        {secsLeft}s
                    </span>
                )}
                {fx.floats
                    .filter((f) => f.seat === me)
                    .map((f) => (
                        <span key={f.key} className="tag gold">
                            {f.text}
                        </span>
                    ))}
            </div>

            <div className="bl-acts">
                <GButton
                    tone="blue"
                    disabled={!myTurn || held || round.rank === null || paused}
                    onClick={() => send({ type: 'pass' })}
                >
                    Pass
                </GButton>
                <GButton tone="red" disabled={!canCall} onClick={callBluff}>
                    Bluff!
                </GButton>
                <GButton tone="green" disabled={!myTurn || held || !picked.length || paused} onClick={play}>
                    {myTurn && held && <Lock className="lu" />}
                    {playLabel}
                </GButton>
            </div>

            <div className={cn('bl-hand', !canPick && 'idle')}>
                {rows.map((row, r) => (
                    <div
                        key={r}
                        className="bl-row"
                        style={cssVars({ '--step': `min(36px, calc((100% - 48px) / ${Math.max(1, row.length - 1)}))` })}
                    >
                        {row.map((card) => (
                            <PlayingCard
                                key={card.id}
                                card={card}
                                selected={picked.includes(card.id)}
                                onClick={() => toggle(card.id)}
                            />
                        ))}
                    </div>
                ))}
            </div>

            {pop}
            {paused && !over && (
                <div className="paused" role="status">
                    <div className="pausecard">
                        <Pause className="lu" />
                        <h2>Game paused</h2>
                        <p>
                            {host
                                ? 'You paused the game. Every timer is stopped.'
                                : `${room.seats[room.hostSeat]?.name ?? 'The host'} paused the game for a moment.`}
                        </p>
                        <span className="tchip">
                            <Timer className="lu" />
                            Resumes by itself in {pauseClock}
                        </span>
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
        </main>
    );
}
