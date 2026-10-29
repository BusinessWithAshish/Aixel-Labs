'use client';

import { memo, useEffect, useState, type ReactNode } from 'react';
import { CircleHelp, Handshake, Landmark as BankIcon, TrendingUp } from 'lucide-react';
import {
    BUSINESS_BOARD,
    BUSINESS_JAIL_INDEX,
    BUSINESS_FESTIVAL_SETS,
    BUSINESS_RULES,
    BUSINESS_SETS,
    type BusinessSetKey,
    type BusinessSpace,
} from '@aixellabs/backend/business/constants';
import { festivalAt, splitAt } from '@aixellabs/backend/business/compute';
import { useBoardUnit } from '../_hooks/use-board-unit';
import type { BusinessProperty, BusinessPublicState } from '@aixellabs/backend/business/types';
import { cn } from '@/lib/utils';
import { cssVars, HomeMark, HotelMark, HouseMark, Pawn, SPACE_ICONS } from '../_lib/art';
import { rs, initial } from '../_lib/client';
import { Logo } from './bits';

const N = BUSINESS_BOARD.length;
const CORNER_LABELS: Record<string, string> = { launch: 'Launch', jail: 'Jail', break: 'Break', gojail: 'Go to jail' };
const CORNER_SUBS: Record<string, string> = { launch: 'Collect salary', break: 'Rest or jail one', gojail: 'No salary' };
/** What moves behind each corner's icon: a launch ring and flame, rising steam, a police light's sweep. */
const CORNER_ART: Record<string, ReactNode> = {
    launch: (
        <>
            <i className="ring" />
            <i className="flame" />
        </>
    ),
    break: (
        <span className="steam">
            <i />
            <i />
            <i />
        </span>
    ),
    gojail: <i className="beam" />,
};
/** How long the Launch pad's lift-off plays once a pawn comes onto it. */
const LAUNCH_MS = 1800;

/**
 * Board geometry as percentages of the board width. These mirror the CSS grid
 * in business.css (padding 0.6 units, gaps 0.3 units, corner tracks 2.4fr): change both together.
 * A thin frame and deep tiles: on a phone each property is as wide as the board allows and
 * 2.4 times as deep, which is what gives its name and price room.
 */
const PAD = 0.6;
const GAP = 0.3;
const CORNER_FR = 2.4;
const UNIT = (100 - 2 * PAD - 12 * GAP) / (11 + 2 * CORNER_FR);
const DEPTH = UNIT * CORNER_FR;
/** Where the ring of tiles ends and the middle of the board begins. */
const INNER = PAD + DEPTH + GAP;
/** How far inside that edge an ownership marker sits (its centre). Keep it under UNIT/2 minus 0.7 marker widths. */
const MARKER_INSET = 1.05;

/**
 * The Jail corner is split in two (business.css `.jailbox`): the cell takes its top 58%, the
 * visitors' walkway the rest. A pawn's feet sit at its `top`, so these move them into each room.
 */
const JAIL_CELL_LIFT = DEPTH * 0.06;
const JAIL_WALK_DROP = DEPTH * 0.43;

/** Grid cell for a board index: Launch bottom-right, then clockwise. */
function cell(i: number): [row: number, col: number] {
    if (i <= 12) return [13, 13 - i];
    if (i <= 24) return [13 - (i - 12), 1];
    if (i <= 36) return [1, 1 + (i - 24)];
    return [1 + (i - 36), 13];
}

function side(i: number): 'corner' | 's-bottom' | 's-left' | 's-top' | 's-right' {
    if (i % 12 === 0) return 'corner';
    return i < 12 ? 's-bottom' : i < 24 ? 's-left' : i < 36 ? 's-top' : 's-right';
}

/** Centre of grid track `n` (1–13). */
function trackCentre(n: number): number {
    if (n === 1) return PAD + DEPTH / 2;
    if (n === 13) return 100 - PAD - DEPTH / 2;
    return INNER + (n - 2) * (UNIT + GAP) + UNIT / 2;
}

/**
 * Spot just inside the board for a property's ownership marker, always centred
 * on its own property. It hugs the tile: that close in, the two properties
 * beside a corner have room for a marker each without touching.
 */
function markerSpot(i: number): { left: string; top: string } {
    const [row, col] = cell(i);
    const where = side(i);
    const near = INNER + MARKER_INSET;
    const far = 100 - INNER - MARKER_INSET;
    if (where === 's-bottom') return { left: `${trackCentre(col)}%`, top: `${far}%` };
    if (where === 's-top') return { left: `${trackCentre(col)}%`, top: `${near}%` };
    if (where === 's-left') return { left: `${near}%`, top: `${trackCentre(row)}%` };
    return { left: `${far}%`, top: `${trackCentre(row)}%` };
}

/**
 * What is built on a city, drawn on its colour band the way a board game shows
 * it: one small house per house, all the same size (two rows of two at most), or
 * one hotel building, in the owner's colour. The band never changes size.
 */
export function Houses({ count, color }: { count: number; color: string }) {
    const tint = cssVars({ '--hc': color });
    if (count >= BUSINESS_RULES.MAX_HOUSES)
        return (
            <span className="bh hotel" style={tint} role="img" aria-label="Hotel">
                <HotelMark />
            </span>
        );
    return (
        <span className="bh" style={tint} role="img" aria-label={`${count} house${count === 1 ? '' : 's'}`}>
            {Array.from({ length: count }, (_, k) => (
                <HouseMark key={k} />
            ))}
        </span>
    );
}

type TileProps = {
    index: number;
    space: BusinessSpace;
    prop: BusinessProperty | undefined;
    ownerColor: string | undefined;
    lenderColor: string | undefined;
    selected: boolean;
    /** Faded: while a player is raising cash, everything that is not theirs steps back. */
    dim: boolean;
    /** Its set is holding a festival: rent is multiplied, and the tile says so. */
    festival: boolean;
    /** Launch only: a pawn has just come onto it, so the pad lifts off. */
    launching?: boolean;
    onSelect: (index: number) => void;
};

const Tile = memo(function Tile({ index, space, prop, ownerColor, lenderColor, selected, dim, festival, launching = false, onSelect }: TileProps) {
    const [row, col] = cell(index);
    const where = side(index);
    const set = space.set ? BUSINESS_SETS[space.set] : null;
    const Icon = space.icon ? SPACE_ICONS[space.icon] : null;
    const houses = prop?.houses ?? 0;
    // Railways and utilities can never be built on, so they carry their icon where a city has its colour band.
    const city = space.kind === 'city';
    // The cheap sets are villages: a meadow tint tells them apart, and only they can hold a festival.
    const village = !!space.set && BUSINESS_FESTIVAL_SETS.includes(space.set);

    return (
        <button
            type="button"
            className={cn('tile', where, `k-${space.kind}`, selected && 'sel', dim && 'dim', prop?.mortgaged && 'mort', houses > 0 && 'built', village && 'village', festival && 'festival', launching && 'go', space.name.length > 8 && 'long')}
            style={{ gridArea: `${row} / ${col}` }}
            aria-label={space.price ? `${space.name}, ${rs(space.price)}` : space.name}
            onClick={() => onSelect(index)}
        >
            {space.price !== undefined ? (
                <>
                    {city ? (
                        <span className="band" style={{ background: set?.color ?? '#241A3D' }}>
                            {houses > 0 && <Houses count={houses} color={ownerColor ?? '#fff'} />}
                        </span>
                    ) : (
                        <span className="band sign">{Icon && <Icon />}</span>
                    )}
                    <span className="pic">
                        <span className="lbl">
                            <span className="nm">{space.name}</span>
                            <span className="px">{space.price}</span>
                        </span>
                    </span>
                </>
            ) : (
                space.kind === 'jail' ? (
                    // Two rooms in one corner: the cell for players held there, and the walkway for visitors.
                    <span className="jailbox">
                        <span className="cellroom">
                            {Icon && <Icon className="ticon" />}
                            <span className="cn">Jail</span>
                        </span>
                        <span className="walkway">Visiting</span>
                    </span>
                ) : where === 'corner' ? (
                    <span className="body">
                        <span className="halo">
                            {CORNER_ART[space.kind]}
                            {Icon && <Icon className="ticon" />}
                        </span>
                        <span className="cn">{CORNER_LABELS[space.kind]}</span>
                        {CORNER_SUBS[space.kind] && <span className="sub">{CORNER_SUBS[space.kind]}</span>}
                    </span>
                ) : (
                    <span className="body">
                        {Icon && <Icon className="ticon" />}
                        <span className="nm">{space.name}</span>
                    </span>
                )
            )}
            {/* A big red bank over the property when it is mortgaged to the bank; a handshake in the partner's colour on its colour band when its set is split. */}
            {prop?.mortgaged && (
                <span className="cover bank">
                    <BankIcon />
                </span>
            )}
            {lenderColor && (
                <span className="cover share" style={cssVars({ '--bc': lenderColor ?? '#6A35E0' })}>
                    <Handshake />
                </span>
            )}
        </button>
    );
});

/** Lit and dark windows on a block, in a fixed pattern so the skyline never flickers between renders. */
function Windows({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
    const out: ReactNode[] = [];
    for (let wy = y + 3; wy < y + h - 2; wy += 5)
        for (let wx = x + 2; wx < x + w - 2; wx += 4) if ((wx * 7 + wy * 13) % 5 < 2) out.push(<rect key={`${wx}-${wy}`} className="win" x={wx} y={wy} width={1.6} height={2} />);
    return <>{out}</>;
}

function Block({ x, w, h }: { x: number; w: number; h: number }) {
    return (
        <>
            <rect className="fr" x={x} y={60 - h} width={w} height={h} />
            <Windows x={x} y={60 - h} w={w} h={h} />
        </>
    );
}

const Tree = ({ x, r = 5 }: { x: number; r?: number }) => (
    <>
        <rect className="fr" x={x - 0.8} y={60 - r * 2} width={1.6} height={r * 2} />
        <circle className="leaf" cx={x} cy={60 - r * 2.1} r={r} />
    </>
);

const Hut = ({ x }: { x: number }) => (
    <>
        <path className="fr" d={`M${x} 60v-9l8-7 8 7v9z`} />
        <path className="roof" d={`M${x - 2} 51.5 ${x + 8} 43l10 8.5`} />
        <rect className="win" x={x + 6.5} y={53} width={3} height={7} />
    </>
);

/**
 * Four skylines line the middle of the board, each standing on the row of tiles it belongs to and
 * rising inwards, the way the ownership markers point: villages along the bottom (brown, sky, pink),
 * PCMC's factory towns on the left (orange, red), the suburbs along the top (yellow, green), and
 * Pune's prime towers on the right (blue, purple). Each is drawn rising from a 400×60 ground line
 * and turned to face its row; its tints come from the sets on that side.
 */
const SKYLINES: { side: 's-bottom' | 's-left' | 's-top' | 's-right'; sets: BusinessSetKey[]; art: ReactNode }[] = [
    {
        side: 's-bottom',
        sets: ['sky', 'brown'],
        art: (
            <>
                <path className="bk" d="M0 60V46C40 32 70 32 110 42S190 30 240 40s90-10 160 2V60z" />
                <Hut x={22} />
                <Tree x={52} />
                <Tree x={64} r={4} />
                <path className="fr" d="M104 60V49h4l7-18 7 18h4v11z" />
                <path className="flag" d="M115 31v-7l6 2.2-6 2.3" />
                <Hut x={150} />
                <Tree x={180} r={6} />
                <path className="fr" d="M200 60c0-7 4-11 9-11s9 4 9 11z" />
                <Hut x={236} />
                <Tree x={266} />
                <Hut x={300} />
                <Tree x={330} r={4} />
                <Tree x={344} r={6} />
                <Hut x={366} />
            </>
        ),
    },
    {
        side: 's-left',
        sets: ['orange', 'red'],
        art: (
            <>
                <path className="bk" d="M0 60V48h30v-6h24v10h30V40h20v12h36v-8h28v8h40V42h30v6h40V36h30v14h40v-8h52V60z" />
                <path className="fr" d="M18 60V44l14-8v8l14-8v8l14-8v8l14-8v24z" />
                <rect className="fr" x={84} y={22} width={6} height={38} />
                <rect className="fr" x={96} y={30} width={5} height={30} />
                <circle className="smoke" cx={87} cy={17} r={4} />
                <circle className="smoke s2" cx={99} cy={25} r={3} />
                <rect className="fr" x={124} y={40} width={2} height={20} />
                <rect className="fr" x={138} y={40} width={2} height={20} />
                <rect className="fr" x={120} y={28} width={24} height={13} rx={5} />
                <Block x={160} w={22} h={30} />
                <path className="fr" d="M192 60V46l13-7v7l13-7v7l13-7v21z" />
                <rect className="fr" x={240} y={26} width={6} height={34} />
                <circle className="smoke s3" cx={243} cy={21} r={3.5} />
                <Block x={258} w={18} h={24} />
                <Block x={282} w={26} h={34} />
                <Block x={314} w={16} h={20} />
                <path className="fr" d="M336 60V46l12-7v7l12-7v7l12-7v7l12-7v21z" />
            </>
        ),
    },
    {
        side: 's-top',
        sets: ['yellow', 'green'],
        art: (
            <>
                <path className="bk" d="M0 60V42Q60 24 120 38t140-4 140 2V60z" />
                <Block x={14} w={20} h={30} />
                <Block x={38} w={16} h={22} />
                <Tree x={62} />
                <Block x={74} w={24} h={36} />
                <Block x={102} w={18} h={26} />
                <Tree x={128} r={4} />
                <Block x={138} w={22} h={32} />
                <path className="fr" d="M170 60V30l34-8v38z" />
                <Windows x={170} y={30} w={34} h={30} />
                <Block x={212} w={16} h={24} />
                <Tree x={236} />
                <Block x={248} w={24} h={34} />
                <Block x={276} w={18} h={22} />
                <Tree x={302} r={4} />
                <Block x={312} w={22} h={30} />
                <Block x={338} w={18} h={38} />
                <Block x={360} w={24} h={26} />
            </>
        ),
    },
    {
        side: 's-right',
        sets: ['blue', 'purple'],
        art: (
            <>
                <path className="bk" d="M0 60V44h24V34h18v12h26V28h20v16h30V36h24v10h28V30h22v14h36V38h26v8h30V32h24v14h30V40h42v20z" />
                <Block x={12} w={16} h={34} />
                <path className="fr" d="M36 60V20h7V10h2v10h7v40z" />
                <Windows x={36} y={20} w={16} h={40} />
                <Block x={58} w={20} h={44} />
                <path className="fr" d="M86 60V24l9-9 9 9v36z" />
                <Windows x={86} y={24} w={18} h={36} />
                <Block x={112} w={14} h={30} />
                <rect className="fr" x={134} y={26} width={10} height={34} />
                <path className="fr" d="M132 27l7-8 7 8z" />
                <circle className="win" cx={139} cy={32} r={2.6} />
                <Block x={152} w={22} h={50} />
                <Block x={180} w={16} h={38} />
                <path className="fr" d="M204 60V14l10-6 10 6v46z" />
                <Windows x={204} y={14} w={20} h={46} />
                <Block x={232} w={18} h={30} />
                <Block x={256} w={24} h={46} />
                <Block x={286} w={14} h={34} />
                <path className="fr" d="M306 60V18h8V8h2v10h8v42z" />
                <Windows x={306} y={18} w={18} h={42} />
                <Block x={332} w={20} h={40} />
                <Block x={358} w={16} h={28} />
                <Block x={380} w={16} h={36} />
            </>
        ),
    },
];

function Skylines() {
    return (
        <>
            {SKYLINES.map(({ side: where, sets, art }) => (
                <span key={where} className={cn('sky', where)} style={cssVars({ '--sa': BUSINESS_SETS[sets[0]].color, '--sb': BUSINESS_SETS[sets[1]].color })}>
                    <svg viewBox="0 0 400 60" preserveAspectRatio="xMidYMax meet" aria-hidden="true">
                        {art}
                    </svg>
                </span>
            ))}
        </>
    );
}

type BoardProps = {
    state: BusinessPublicState;
    /** Positions as drawn (they trail the real ones while a pawn is walking). */
    shown: number[];
    moving: number | null;
    /** Milliseconds per space for the pawn that is walking. */
    pace: number;
    selected: number | null;
    onSelect: (index: number) => void;
    onMarket: () => void;
    onChance: () => void;
    /** Shown over the middle of the board, e.g. who just paid whom. */
    overlay?: React.ReactNode;
    /** A seat raising cash: only that player's properties stay lit, so they are easy to find and tap. */
    spotlight?: number | null;
    /** When given, only these spaces stay lit (the ones a tap would act on); it wins over `spotlight`. */
    lit?: ReadonlySet<number> | null;
};

export function Board({ state, shown, moving, pace, selected, onSelect, onMarket, onChance, overlay, spotlight = null, lit = null }: BoardProps) {
    /** On a city of a split set: the colour of the partner who does not own that city. */
    const partnerColor = (i: number, owner?: number) => {
        const split = splitAt(state, i);
        if (!split || owner === undefined) return undefined;
        return state.players[owner === split.major ? split.minor : split.major].color;
    };
    const area = useBoardUnit<HTMLDivElement>();
    const faded = (i: number, owner?: number) => (lit ? !lit.has(i) : spotlight !== null && owner !== spotlight);
    // A pawn coming onto Launch (landing or passing) lifts the pad off for a moment.
    const onLaunch = shown.some((pos, seat) => pos % N === 0 && !state.players[seat].bankrupt);
    const [launching, setLaunching] = useState(false);
    useEffect(() => {
        if (!onLaunch) return;
        setLaunching(true);
        const t = setTimeout(() => setLaunching(false), LAUNCH_MS);
        return () => clearTimeout(t);
    }, [onLaunch]);
    const groups = new Map<number, number[]>();
    shown.forEach((pos, seat) => {
        if (state.players[seat].bankrupt) return;
        groups.set(pos, [...(groups.get(pos) ?? []), seat]);
    });

    return (
        <div className="board-area" ref={area}>
            <div className="board-box">
                <div className={cn('board plain', (spotlight !== null || lit) && 'spot')}>
                    {BUSINESS_BOARD.map((space, i) => {
                        const prop = state.props[i];
                        return (
                            <Tile
                                key={i}
                                index={i}
                                space={space}
                                prop={prop}
                                ownerColor={prop ? state.players[prop.owner].color : undefined}
                                lenderColor={partnerColor(i, prop?.owner)}
                                selected={selected === i}
                                dim={faded(i, prop?.owner)}
                                festival={!!festivalAt(state, i)}
                                launching={i === 0 && launching}
                                onSelect={onSelect}
                            />
                        );
                    })}
                    <div className="centre">
                        <span className="stars" aria-hidden="true" />
                        <Skylines />
                        <Logo />
                        <div className="decks">
                            <button type="button" className="deck ch" onClick={onChance}>
                                <CircleHelp />
                                Chance
                            </button>
                            <button type="button" className="deck mk2" onClick={onMarket}>
                                <span>
                                    <TrendingUp />
                                    Market
                                </span>
                                <div className="odds">
                                    <b className="bad">2–{BUSINESS_RULES.MARKET_LOSE_MAX} lose stake</b>
                                    <b className="mid">
                                        {BUSINESS_RULES.MARKET_LOSE_MAX + 1}–{BUSINESS_RULES.MARKET_FLAT_MAX} nothing
                                    </b>
                                    <b className="good">{BUSINESS_RULES.MARKET_FLAT_MAX + 1}–12 double</b>
                                </div>
                            </button>
                        </div>
                        <div className="rules">
                            <span>
                                Salary <b>+{rs(BUSINESS_RULES.SALARY_STEP)}</b> each lap
                            </span>
                            <span>
                                Full set <b>3× rent</b>
                            </span>
                            <span className="vil">
                                <i /> Villages hold a <b>festival</b>
                            </span>
                        </div>
                        {overlay && <div className="overlay">{overlay}</div>}
                    </div>
                </div>

                <div className="mlayer">
                    {Object.keys(state.props).map((key) => {
                        const i = Number(key);
                        const prop = state.props[i];
                        const color = state.players[prop.owner].color;
                        // A festival's ×3 sits beside the owner's marker, inside the board, clear of the houses on the band.
                        return (
                            <span key={i} className={cn('mk', side(i), faded(i, prop.owner) && 'dim')} style={markerSpot(i)}>
                                <HomeMark color={color} />
                                {festivalAt(state, i) && <i className="mx">×{BUSINESS_RULES.FESTIVAL_RENT_MULTIPLIER}</i>}
                            </span>
                        );
                    })}
                </div>

                <div className="tlayer">
                    {state.players.map((p) => {
                        const pos = shown[p.seat] % N;
                        const [row, col] = cell(pos);
                        // On the Jail corner the held players stand in the cell and the visitors on the walkway below it.
                        const atJail = pos === BUSINESS_JAIL_INDEX;
                        const held = atJail && p.jail > 0 && moving !== p.seat;
                        const group = (groups.get(pos) ?? [p.seat]).filter((seat) => !atJail || state.players[seat].jail > 0 === p.jail > 0);
                        // Spread pawns sharing a space, but never wider than the space itself.
                        const offset = (group.indexOf(p.seat) - (group.length - 1) / 2) * Math.min(2.6, 7 / group.length);
                        const lift = atJail ? (held ? JAIL_CELL_LIFT : JAIL_WALK_DROP) : 0;
                        return (
                            <span
                                key={p.seat}
                                className={cn('tk', p.seat === state.turn && 'now', moving === p.seat && 'moving', p.bankrupt && 'out')}
                                style={{
                                    left: `${trackCentre(col) + offset}%`,
                                    top: `${trackCentre(row) + lift}%`,
                                    // A walking pawn glides at a steady speed, one space per beat, with no pause between spaces.
                                    ...(moving === p.seat ? { transition: `left ${pace}ms linear, top ${pace}ms linear` } : {}),
                                }}
                            >
                                <Pawn color={p.color} label={initial(p.name)} />
                            </span>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
