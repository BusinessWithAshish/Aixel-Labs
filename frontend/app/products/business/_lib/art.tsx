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
 * Board index → Unsplash photo id (free to use under the Unsplash licence).
 * Served straight from the Unsplash CDN at the size each spot needs.
 */
const PHOTOS: Record<number, string> = {
    0: '1517976487492-5750f3195933', // Launch
    1: '1679806893392-29f024308936', // Gaya
    2: '1706790574525-d218c4c52b5c', // Puri
    3: '1559480423-85de1db621ed', // Chance
    4: '1597074866923-dc0589150358', // Shimla
    5: '1600242466690-c1c04f081762', // Leh
    6: '1707655315272-33a54a771068', // Ooty
    7: '1442570468985-f63ed5de9086', // North Rail
    8: '1554224155-6726b3ff858f', // Income Tax
    9: '1603195586852-f6beb37b36eb', // Ajmer
    10: '1590572852289-02c47eb0f3f9', // Kota
    11: '1477587458883-47145ed94245', // Jaipur
    12: '1696996161128-4eea344474f2', // Jail
    13: '1564507592333-c60657eea523', // Agra
    14: '1673102166075-7fe2c11c6773', // Patna
    15: '1763277211600-e726e224c5ae', // Kanpur
    16: '1560221328-12fe60f83ab8', // Market
    17: '1473341304170-971dccb5ac1e', // Power
    18: '1703955516799-908293c45470', // Coast Rail
    19: '1559480423-85de1db621ed', // Chance
    20: '1605070208589-90fa3015e068', // Nagpur
    21: '1673369791309-2112df102fe7', // Bhopal
    22: '1754245646627-855c7da68bd1', // Indore
    23: '1560221328-12fe60f83ab8', // Market
    24: '1634299406775-90f32b656536', // Take a Break
    25: '1567005753256-c0529035b300', // Goa
    26: '1659126574791-13313aa424bd', // Mysuru
    27: '1629064511726-841ce84f39df', // Kochi
    28: '1559480423-85de1db621ed', // Chance
    29: '1649042964070-8eb14ea4da7d', // Metro
    30: '1506399309177-3b43e99fead2', // Telecom
    31: '1560221328-12fe60f83ab8', // Market
    32: '1609991148865-40902bd1f594', // Ranchi
    33: '1737171789632-d8cd7aea5852', // Surat
    34: '1713437333017-0d52c1ca50e9', // Mohali
    35: '1559480423-85de1db621ed', // Chance
    36: '1608095476825-d4e0f916372f', // Go to Jail
    37: '1753199694052-2d6f8a6aa274', // Thane
    38: '1694667509674-676629c9d069', // Nashik
    39: '1692458236947-33d25789b2aa', // Rajkot
    40: '1560221328-12fe60f83ab8', // Market
    41: '1708673438435-28b7fd3e3aa4', // Airport
    42: '1589629041152-fb71b9c5dbcd', // Pune
    43: '1688978022482-00702c9eb83c', // Noida
    44: '1655979521437-ae1875109d79', // Vizag
    45: '1601121141461-9d6647bca1ed', // Luxury Tax
    46: '1587474260584-136574528ed5', // Delhi
    47: '1595658658481-d53d3f999875', // Mumbai
};

export function photoUrl(space: number, width: number): string | null {
    const id = PHOTOS[space];
    return id ? `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${width}&h=${width}&q=60` : null;
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
