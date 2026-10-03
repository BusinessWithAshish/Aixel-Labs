'use client';

import { ArrowLeftRight, ChevronsRight, Gauge, Handshake, Landmark, LockKeyhole, Siren, UserX } from 'lucide-react';
import { BUSINESS_BOARD, BUSINESS_SETS } from '@aixellabs/backend/business/constants';
import type { BusinessFx, BusinessLogEntry, BusinessPublicState } from '@aixellabs/backend/business/types';
import { cn } from '@/lib/utils';
import { cssVars } from '../_lib/art';
import { rs } from '../_lib/client';
import type { BusinessSound } from '../_lib/sound';
import { Avatar } from './bits';

/** One money move to announce to the whole table. */
/** `quiet`: shown again after a pop-up hid it, so no second sound or float. */
export type Deal = { id: number; fx: BusinessFx; text: string; quiet?: boolean };

/** Each kind of move has its own sound. The Market plays its own when its dice land. */
export function dealSound(fx: BusinessFx): BusinessSound | null {
    if (fx.kind === 'market') return null;
    if (fx.kind === 'out') return 'out';
    if (fx.kind === 'jail') return fx.why === 'speeding' ? 'speeding' : 'jail';
    if (fx.kind === 'buy') return 'buy';
    if (fx.kind === 'rent') return 'rent';
    if (fx.kind === 'salary') return 'salary';
    if (fx.kind === 'loan' || fx.kind === 'repay' || fx.kind === 'trade' || fx.kind === 'interest') return 'loan';
    return fx.to === null ? 'pay' : 'income';
}

/** Colour of the banner: gold for buying, green for money in, red for money out, blue for deals. */
function dealTone(fx: BusinessFx): string {
    if (fx.kind === 'buy' || fx.kind === 'build') return 'gold';
    if (fx.kind === 'rent') return 'orange';
    if (fx.kind === 'loan' || fx.kind === 'repay' || fx.kind === 'trade' || fx.kind === 'interest') return 'blue';
    if (fx.kind === 'out' || fx.kind === 'jail') return 'red';
    if (fx.kind === 'market' && fx.amount === 0) return 'grey';
    return fx.to === null ? 'red' : 'green';
}

export function dealFromLog(entry: BusinessLogEntry): Deal | null {
    // Building is quiet: the new house simply appears on the board.
    if (!entry.fx || entry.fx.kind === 'build') return null;
    // These are news even without an amount: trades, players going out or to Jail, a flat
    // Market, and other players' loans (announced without their numbers).
    const newsAnyway = ['trade', 'out', 'jail', 'market', 'loan'];
    if (entry.fx.amount <= 0 && !newsAnyway.includes(entry.fx.kind)) return null;
    return { id: entry.n, fx: entry.fx, text: entry.text };
}

function caption(state: BusinessPublicState, deal: Deal): string {
    const { fx } = deal;
    const name = (seat: number | null) => (seat === null ? 'the bank' : state.players[seat].name);
    const space = fx.space === undefined ? '' : BUSINESS_BOARD[fx.space].name;
    switch (fx.kind) {
        case 'buy':
            return `${name(fx.from)} bought ${space}`;
        case 'rent':
            return `Rent for ${space}`;
        case 'salary':
            return 'Salary for passing Launch';
        case 'card':
            // "Drew a Chance card: Doctor's fees. Pay ₹100." → "Doctor's fees"
            return `Chance: ${(deal.text.split(': ')[1] ?? '').split('.')[0]}`;
        case 'tax':
            return space || 'Jail fee';
        case 'market':
            return fx.amount === 0 ? 'Flat market: nothing won or lost' : fx.to === null ? 'Market crash' : 'Market boom';
        case 'loan':
            if (fx.amount === 0) return space ? `${name(fx.to)} mortgaged ${space} to ${name(fx.from)}` : `${name(fx.from)} lent ${name(fx.to)} cash`;
            return space ? `Mortgage on ${space}` : 'Cash loan';
        case 'interest':
            return 'Loan interest for this lap';
        case 'jail':
            return fx.why === 'speeding' ? 'Overspeeding! 3 doubles in a row' : fx.why === 'card' ? 'Chance: go straight to Jail' : `${name(fx.from)} is sent to Jail`;
        case 'repay':
            return space ? `Took ${space} back` : 'Loan paid back';
        case 'bank':
            return fx.to === null ? `Redeemed ${space}` : `Bank cash for ${space}`;
        case 'build':
            return `Built in ${space}`;
        case 'trade':
            return `${name(fx.from)} and ${name(fx.to)} made a trade`;
        case 'out':
            return `${name(fx.from)} is out of the match`;
    }
}

function Party({ state, seat, space }: { state: BusinessPublicState; seat: number | null; space?: number }) {
    if (seat !== null) {
        const p = state.players[seat];
        return (
            <span className="dl-party">
                <Avatar name={p.name} color={p.color} />
                <b>{p.name}</b>
            </span>
        );
    }
    if (space !== undefined) {
        // The property itself, as a little tile in its set colour.
        const tile = BUSINESS_BOARD[space];
        return (
            <span className="dl-party">
                <span className="dl-ph" style={cssVars({ '--sc': tile.set ? BUSINESS_SETS[tile.set].color : '#241A3D' })} />
                <b>{tile.name}</b>
            </span>
        );
    }
    return (
        <span className="dl-party">
            <span className="av dl-bank">
                <Landmark />
            </span>
            <b>Bank</b>
        </span>
    );
}

/**
 * Shown to everyone in the middle of the board: who paid whom, how much, and
 * what for, with the money sliding along the arrow.
 */
export function DealBanner({ state, deal }: { state: BusinessPublicState; deal: Deal }) {
    const { fx } = deal;
    if (fx.kind === 'out' && fx.from !== null) {
        const p = state.players[fx.from];
        return (
            <div key={deal.id} className="deal red">
                <span className="dl-party out">
                    <Avatar name={p.name} color={p.color} />
                    <UserX className="dl-x" />
                </span>
                <div className="dl-cap">{caption(state, deal)}</div>
            </div>
        );
    }
    if (fx.kind === 'jail' && fx.from !== null) {
        const p = state.players[fx.from];
        const Icon = fx.why === 'speeding' ? Gauge : Siren;
        return (
            <div key={deal.id} className="deal red jailed">
                <span className="dl-party out">
                    <span className="bars">
                        <Avatar name={p.name} color={p.color} />
                    </span>
                    <LockKeyhole className="dl-x" />
                </span>
                <Icon className="dl-siren" />
                <div className="dl-cap">{caption(state, deal)}</div>
                <div className="dl-sub">{p.name} goes to Jail</div>
            </div>
        );
    }
    if (fx.kind === 'trade') {
        // Only that a trade happened, never what was in it.
        return (
            <div key={deal.id} className="deal blue">
                <div className="dl-row">
                    <Party state={state} seat={fx.from} />
                    <span className="dl-arrow" aria-hidden="true">
                        <ArrowLeftRight className="dl-chev swap" />
                    </span>
                    <Party state={state} seat={fx.to} />
                </div>
                <div className="dl-cap">Trade done</div>
            </div>
        );
    }
    return (
        <div key={deal.id} className={cn('deal', dealTone(fx))}>
            <div className="dl-row">
                <Party state={state} seat={fx.from} />
                <span className="dl-arrow" aria-hidden="true">
                    {fx.amount === 0 && fx.kind === 'loan' ? (
                        // Someone else's deal: that it happened, not how much.
                        <Handshake className="dl-chev swap" />
                    ) : (
                        <>
                            <span className="dl-amt">{rs(fx.amount)}</span>
                            <ChevronsRight className="dl-chev" />
                        </>
                    )}
                </span>
                <Party state={state} seat={fx.to} space={fx.space} />
            </div>
            <div className="dl-cap">{caption(state, deal)}</div>
        </div>
    );
}
