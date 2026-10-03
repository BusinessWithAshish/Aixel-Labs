import type { CSSProperties } from 'react';
import {
    CircleHelp,
    Coffee,
    LockKeyhole,
    type LucideIcon,
    Plane,
    Receipt,
    Rocket,
    Siren,
    TrainFront,
    TrendingUp,
    Wifi,
    Zap,
} from 'lucide-react';

/** Board icon names (see BUSINESS_BOARD) mapped to Lucide components. */
export const SPACE_ICONS: Record<string, LucideIcon> = {
    rocket: Rocket,
    'train-front': TrainFront,
    plane: Plane,
    zap: Zap,
    wifi: Wifi,
    receipt: Receipt,
    coffee: Coffee,
    'lock-keyhole': LockKeyhole,
    siren: Siren,
    'trending-up': TrendingUp,
    'circle-help': CircleHelp,
};

/**
 * The owner's marker beside a property: a little home with a pitched roof, a
 * chimney and a door, in the owner's colour.
 */
export function HomeMark({ color }: { color: string }) {
    return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 2.6 22 11.4h-2.6V21H4.6v-9.6H2z" fill={color} stroke="#fff" strokeWidth="2.2" strokeLinejoin="round" />
            <path d="M12 2.6 22 11.4H2z" fill="rgba(0,0,0,.28)" />
            <path d="M16.2 4.4h2.4v4l-2.4-2.1z" fill={color} stroke="#fff" strokeWidth="1.1" strokeLinejoin="round" />
            <rect x="10" y="14.2" width="4" height="6.8" rx="0.8" fill="#fff" />
        </svg>
    );
}

/** One built house, as drawn on a property's colour band. */
export function HouseMark() {
    return (
        <svg viewBox="0 0 12 12" aria-hidden="true">
            <path className="hm-body" d="M6 1 11.4 5.6H10V11H2V5.6H0.6z" />
            <path d="M6 1 11.4 5.6H0.6z" fill="rgba(0,0,0,.3)" />
            <rect x="5" y="7.2" width="2" height="3.8" fill="#fff" />
        </svg>
    );
}

/** A hotel, as drawn on a property's colour band: a wide building with a pediment and lit windows. */
export function HotelMark() {
    return (
        <svg viewBox="0 0 20 15" aria-hidden="true">
            <path className="hm-body" d="M10 0.9 18.6 4.4H17V14H3V4.4H1.4z" />
            <path d="M10 0.9 18.6 4.4H1.4z" fill="rgba(0,0,0,.3)" />
            <g fill="#fff">
                <rect x="5" y="6" width="2.2" height="2.2" />
                <rect x="8.9" y="6" width="2.2" height="2.2" />
                <rect x="12.8" y="6" width="2.2" height="2.2" />
                <rect x="5" y="9.8" width="2.2" height="2.2" />
                <rect x="12.8" y="9.8" width="2.2" height="2.2" />
                <rect x="8.7" y="9.8" width="2.6" height="4.2" />
            </g>
        </svg>
    );
}

/** `label` is the player's initial on the pawn's head: teammates share a colour, so it tells their pawns apart. */
export function Pawn({ color, label }: { color: string; label?: string }) {
    return (
        <svg viewBox="0 0 24 32" aria-hidden="true">
            <ellipse cx="12" cy="29.6" rx="9" ry="2.4" fill="rgba(0,0,0,.4)" />
            <path
                d="M4.5 28.5c0-7 3.2-9.5 4.6-14.5h5.8c1.4 5 4.6 7.5 4.6 14.5z"
                fill={color}
                stroke="#150A3A"
                strokeWidth="1.7"
                strokeLinejoin="round"
            />
            <circle cx="12" cy="8.5" r="6" fill={color} stroke="#150A3A" strokeWidth="1.7" />
            {label ? (
                <text x="12" y="11.4" textAnchor="middle" fontSize="8.5" fontWeight="800" fill="#fff" stroke="#150A3A" strokeWidth="0.5" paintOrder="stroke">
                    {label}
                </text>
            ) : (
                <circle cx="10" cy="6.5" r="1.9" fill="rgba(255,255,255,.7)" />
            )}
        </svg>
    );
}

const PIPS: Record<number, number[]> = {
    1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8],
};

function Face({ value }: { value: number }) {
    return (
        <span className={`f f${value}`}>
            {Array.from({ length: 9 }, (_, k) => (
                <i key={k} className={PIPS[value].includes(k) ? 'on' : undefined} />
            ))}
        </span>
    );
}

/** Cube rotation that brings each face to the front. */
const FACE_TURN: Record<number, [x: number, y: number]> = {
    1: [0, 0], 2: [0, -90], 3: [-90, 0], 4: [90, 0], 5: [0, 90], 6: [0, 180],
};

/**
 * A real cube. Each new `spin` adds full turns, so the die tumbles and then
 * settles on `value` in one smooth motion.
 */
export function Die({ value, spin, flip, instant }: { value: number; spin: number; flip?: boolean; instant?: boolean }) {
    const [x, y] = FACE_TURN[value] ?? [0, 0];
    const turns = spin * 720 * (flip ? -1 : 1);
    return (
        <span className={instant ? 'd3 instant' : 'd3'} role="img" aria-label={String(value)} style={{ transform: `rotateX(${x + turns}deg) rotateY(${y + turns}deg)` }}>
            {[1, 2, 3, 4, 5, 6].map((n) => (
                <Face key={n} value={n} />
            ))}
        </span>
    );
}

export const cssVars = (vars: Record<string, string | number>) => vars as CSSProperties;
