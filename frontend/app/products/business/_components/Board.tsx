'use client';

import { memo } from 'react';
import { CircleHelp, Handshake, Landmark as BankIcon, TrendingUp } from 'lucide-react';
import {
    BUSINESS_BOARD,
    BUSINESS_RULES,
    BUSINESS_SETS,
    type BusinessSpace,
} from '@aixellabs/backend/business/constants';
import type { BusinessProperty, BusinessPublicState } from '@aixellabs/backend/business/types';
import { cn } from '@/lib/utils';
import { cssVars, HomeMark, HotelMark, HouseMark, Pawn, SPACE_ICONS } from '../_lib/art';
import { rs } from '../_lib/client';
import { Logo } from './bits';

const N = BUSINESS_BOARD.length;
const CORNER_LABELS: Record<string, string> = { launch: 'Launch', jail: 'Jail', break: 'Break', gojail: 'Go to jail' };

/**
 * Board geometry as percentages of the board width. These mirror the CSS grid
 * in business.css (0.6cqw padding, 0.3cqw gaps, corner tracks 2.4fr): change both together.
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
    onSelect: (index: number) => void;
};

const Tile = memo(function Tile({ index, space, prop, ownerColor, lenderColor, selected, dim, onSelect }: TileProps) {
    const [row, col] = cell(index);
    const where = side(index);
    const set = space.set ? BUSINESS_SETS[space.set] : null;
    const Icon = space.icon ? SPACE_ICONS[space.icon] : null;
    const houses = prop?.houses ?? 0;
    // Railways and utilities can never be built on, so they carry their icon where a city has its colour band.
    const city = space.kind === 'city';

    return (
        <button
            type="button"
            className={cn('tile', where, `k-${space.kind}`, selected && 'sel', dim && 'dim', prop?.mortgaged && 'mort', houses > 0 && 'built', space.name.length > 8 && 'long')}
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
                <span className="body">
                    {Icon && <Icon className="ticon" />}
                    {where === 'corner' ? <span className="cn">{CORNER_LABELS[space.kind]}</span> : <span className="nm">{space.name}</span>}
                </span>
            )}
            {/* A big red bank over the property when it is mortgaged to the bank; a handshake in the lender's colour on its colour band when it is shared with a player. */}
            {prop?.mortgaged && (
                <span className="cover bank">
                    <BankIcon />
                </span>
            )}
            {prop?.lend && (
                <span className="cover share" style={cssVars({ '--bc': lenderColor ?? '#6A35E0' })}>
                    <Handshake />
                </span>
            )}
        </button>
    );
});

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
};

export function Board({ state, shown, moving, pace, selected, onSelect, onMarket, onChance, overlay, spotlight = null }: BoardProps) {
    const groups = new Map<number, number[]>();
    shown.forEach((pos, seat) => {
        if (state.players[seat].bankrupt) return;
        groups.set(pos, [...(groups.get(pos) ?? []), seat]);
    });

    return (
        <div className="board-area">
            <div className="board-box">
                <div className={cn('board plain', spotlight !== null && 'spot')}>
                    {BUSINESS_BOARD.map((space, i) => {
                        const prop = state.props[i];
                        return (
                            <Tile
                                key={i}
                                index={i}
                                space={space}
                                prop={prop}
                                ownerColor={prop ? state.players[prop.owner].color : undefined}
                                lenderColor={prop?.lend ? state.players[prop.lend.to].color : undefined}
                                selected={selected === i}
                                dim={spotlight !== null && prop?.owner !== spotlight}
                                onSelect={onSelect}
                            />
                        );
                    })}
                    <div className="centre">
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
                                    <b className="bad">2–{BUSINESS_RULES.MARKET_LOSE_MAX} lose half</b>
                                    <b className="mid">
                                        {BUSINESS_RULES.MARKET_LOSE_MAX + 1}–{BUSINESS_RULES.MARKET_FLAT_MAX} nothing
                                    </b>
                                    <b className="good">{BUSINESS_RULES.MARKET_FLAT_MAX + 1}–12 double</b>
                                </div>
                            </button>
                        </div>
                        <div className="rules">
                            Pass Launch <b>+{rs(BUSINESS_RULES.SALARY)}</b>
                            <br />
                            Full colour set <b>3× rent</b>
                        </div>
                        {overlay && <div className="overlay">{overlay}</div>}
                    </div>
                </div>

                <div className="mlayer">
                    {Object.keys(state.props).map((key) => {
                        const i = Number(key);
                        const prop = state.props[i];
                        const color = state.players[prop.owner].color;
                        return (
                            <span key={i} className={cn('mk', side(i), spotlight !== null && prop.owner !== spotlight && 'dim')} style={markerSpot(i)}>
                                <HomeMark color={color} />
                            </span>
                        );
                    })}
                </div>

                <div className="tlayer">
                    {state.players.map((p) => {
                        const pos = shown[p.seat] % N;
                        const [row, col] = cell(pos);
                        const group = groups.get(pos) ?? [p.seat];
                        // Spread pawns sharing a space, but never wider than the space itself.
                        const offset = (group.indexOf(p.seat) - (group.length - 1) / 2) * Math.min(2.6, 7 / group.length);
                        return (
                            <span
                                key={p.seat}
                                className={cn('tk', p.seat === state.turn && 'now', moving === p.seat && 'moving', p.bankrupt && 'out')}
                                style={{
                                    left: `${trackCentre(col) + offset}%`,
                                    top: `${trackCentre(row)}%`,
                                    // A walking pawn glides at a steady speed, one space per beat, with no pause between spaces.
                                    ...(moving === p.seat ? { transition: `left ${pace}ms linear, top ${pace}ms linear` } : {}),
                                }}
                            >
                                <Pawn color={p.color} label={p.name.charAt(0).toUpperCase()} />
                            </span>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
