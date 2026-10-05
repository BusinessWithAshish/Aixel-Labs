'use client';

import { useEffect, useRef } from 'react';
import { Check, Handshake, IndianRupee, Landmark as BankIcon } from 'lucide-react';
import { BUSINESS_BOARD, BUSINESS_SETS } from '@aixellabs/backend/business/constants';
import { splitAt } from '@aixellabs/backend/business/compute';
import type { BusinessPublicState } from '@aixellabs/backend/business/types';
import { cn } from '@/lib/utils';
import { cssVars, SPACE_ICONS } from '../_lib/art';
import { fmt } from '../_lib/client';
import { notify } from '../_lib/toast';
import { Houses } from './Board';

type MiniCardProps = {
    state: BusinessPublicState;
    space: number;
    /** Lit up, with a tick: chosen for a deal. */
    picked?: boolean;
    /** Cannot be chosen: the card fades, does nothing when tapped, and explains itself on a tap. */
    off?: string | null;
    onClick?: () => void;
};

/**
 * A property as it looks on the board, shrunk to a thumbnail: the colour band
 * with the same houses or hotel in the owner's colour (an icon instead for
 * railways and utilities), then the name and price. Mortgage marks match the
 * board too: a red bank over a darkened card, a handshake on the band.
 */
export function MiniCard({ state, space, picked, off, onClick }: MiniCardProps) {
    const tile = BUSINESS_BOARD[space];
    const set = tile.set ? BUSINESS_SETS[tile.set] : null;
    const prop = state.props[space];
    const split = splitAt(state, space);
    const Icon = tile.icon ? SPACE_ICONS[tile.icon] : null;
    const Tag = onClick ? 'button' : 'div';
    return (
        <Tag
            {...(onClick ? { type: 'button' as const, onClick: off ? () => notify(off, 'error') : onClick, 'aria-disabled': !!off } : {})}
            className={cn('minicard', `k-${tile.kind}`, picked && 'on', prop?.mortgaged && 'mort', off && 'off')}
            style={set ? cssVars({ '--sc': set.color }) : undefined}
        >
            <span className="mc-ph">
                {tile.kind !== 'city' && Icon && <Icon className="mc-sign" />}
                {prop && prop.houses > 0 && <Houses count={prop.houses} color={state.players[prop.owner].color} />}
                {split && prop && (
                    <Handshake className={cn('mc-b', prop.houses > 0 && 'corner')} style={cssVars({ '--bc': state.players[prop.owner === split.major ? split.minor : split.major].color })} />
                )}
                {prop?.mortgaged && <BankIcon className="mc-b bank" />}
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
