'use client';

import { useEffect, useRef } from 'react';
import { Check, Handshake, Hotel, House, IndianRupee, Landmark as BankIcon } from 'lucide-react';
import { BUSINESS_BOARD, BUSINESS_RULES, BUSINESS_SETS } from '@aixellabs/backend/business/constants';
import type { BusinessPublicState } from '@aixellabs/backend/business/types';
import { cn } from '@/lib/utils';
import { cssVars, photoUrl } from '../_lib/art';
import { fmt } from '../_lib/client';

type MiniCardProps = {
    state: BusinessPublicState;
    space: number;
    /** Lit up, with a tick: chosen for a deal. */
    picked?: boolean;
    onClick?: () => void;
};

/** A property card shrunk to a thumbnail: photo, colour band with the name, price, and what is built on it. */
export function MiniCard({ state, space, picked, onClick }: MiniCardProps) {
    const tile = BUSINESS_BOARD[space];
    const set = tile.set ? BUSINESS_SETS[tile.set] : null;
    const prop = state.props[space];
    const photo = photoUrl(space, 160);
    const hotel = prop?.houses === BUSINESS_RULES.MAX_HOUSES;
    const Tag = onClick ? 'button' : 'div';
    return (
        <Tag
            {...(onClick ? { type: 'button' as const, onClick } : {})}
            className={cn('minicard', picked && 'on', prop?.mortgaged && 'mort')}
            style={cssVars({ '--sc': set?.color ?? '#241A3D', '--st': set?.text ?? '#FFFFFF' })}
        >
            <span className="mc-ph" style={photo ? { backgroundImage: `url(${photo})` } : undefined}>
                {prop && prop.houses > 0 && (
                    <span className={cn('mc-h', hotel && 'hotel')}>
                        {hotel ? <Hotel className="lu" /> : <House className="lu" />}
                        {hotel ? null : prop.houses}
                    </span>
                )}
                {prop?.mortgaged && <BankIcon className="mc-b" />}
                {prop?.lend && <Handshake className="mc-b" style={cssVars({ '--bc': state.players[prop.lend.to].color })} />}
                {picked && <Check className="mc-ok" />}
            </span>
            <span className="mc-band">{tile.name}</span>
            <span className="mc-price">
                <IndianRupee className="lu" />
                {fmt(tile.price ?? 0)}
            </span>
        </Tag>
    );
}

/**
 * A side-scrolling row of mini cards. Fingers swipe it natively; a mouse can
 * drag it or turn the wheel over it. A drag never counts as a tap on a card.
 */
export function MiniCards({ children }: { children: React.ReactNode }) {
    const ref = useRef<HTMLDivElement>(null);
    const drag = useRef<{ x: number; left: number; moved: boolean } | null>(null);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        // An ordinary up/down wheel scrolls the row sideways (non-passive, so the page does not scroll too).
        const onWheel = (e: WheelEvent) => {
            if (Math.abs(e.deltaY) <= Math.abs(e.deltaX) || el.scrollWidth <= el.clientWidth) return;
            e.preventDefault();
            el.scrollLeft += e.deltaY;
        };
        el.addEventListener('wheel', onWheel, { passive: false });
        return () => el.removeEventListener('wheel', onWheel);
    }, []);

    return (
        <div
            ref={ref}
            className="mcards"
            onPointerDown={(e) => {
                if (e.pointerType !== 'mouse' || !ref.current) return;
                drag.current = { x: e.clientX, left: ref.current.scrollLeft, moved: false };
            }}
            onPointerMove={(e) => {
                const d = drag.current;
                if (!d || !ref.current) return;
                if (Math.abs(e.clientX - d.x) > 4) d.moved = true;
                ref.current.scrollLeft = d.left - (e.clientX - d.x);
            }}
            onPointerUp={() => {
                window.setTimeout(() => (drag.current = null), 0);
            }}
            onPointerLeave={() => (drag.current = null)}
            onClickCapture={(e) => {
                if (drag.current?.moved) e.stopPropagation();
            }}
        >
            {children}
        </div>
    );
}

/** Cash as a coin chip that sits in the same row as the cards of a deal. */
export function CashChip({ value }: { value: number }) {
    return (
        <div className="minicard cashchip">
            <IndianRupee className="lu" />
            <b>{fmt(value)}</b>
            <span>cash</span>
        </div>
    );
}
