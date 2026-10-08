'use client';

import { ArrowLeftRight, ChevronsRight, Dices, Gauge, Gavel, Handshake, KeyRound, Landmark, LockKeyhole, Siren, UserX } from 'lucide-react';
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
    if (fx.kind === 'loan' || fx.kind === 'repay' || fx.kind === 'trade' || fx.kind === 'interest' || fx.kind === 'split' || fx.kind === 'bail') return 'loan';
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

/**
 * Moves a player makes on their own properties (build, sell a house, mortgage, redeem) show on
 * the board itself, so they get a sound and no banner. Null for everything that has a banner.
 */
export function quietSound(fx: BusinessFx): BusinessSound | null {
    if (fx.kind === 'build') return 'build';
    if (fx.kind === 'bank') return fx.to === null ? 'pay' : 'income';
    return null;
}

export function dealFromLog(entry: BusinessLogEntry): Deal | null {
    if (!entry.fx || quietSound(entry.fx)) return null;
    // These are news even without an amount: trades, players going out or to Jail, a flat
    // Market, and other players' loans (announced without their numbers).
    const newsAnyway = ['trade', 'out', 'jail', 'market', 'loan', 'split', 'bail'];
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
            if (fx.amount === 0) return `${name(fx.from)} lent ${name(fx.to)} cash`;
            return 'Cash loan';
        case 'interest':
            return 'Loan interest for this lap';
        case 'jail':
            return fx.why === 'speeding' ? 'Overspeeding! 3 doubles in a row' : fx.why === 'card' ? 'Chance: go straight to Jail' :  `${name(fx.from)} is sent to Jail`;
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
        case 'bail':
            return `${name(fx.to)} bailed ${name(fx.from)} out of Jail`;
        case 'split':
            return fx.amount === 0 && !deal.text.includes('no longer') ? `${name(fx.from)} and ${name(fx.to)} split a colour set` : 'Split ended: the houses went back to the bank';
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
    if (fx.kind === 'jail' && fx.from !== null && fx.to !== null) {
        // One player put another away: the culprit, grinning, beside the victim behind bars.
        const victim = state.players[fx.from];
        const culprit = state.players[fx.to];
        const backfired = victim.seat === culprit.seat;
        const [line, sub] = backfired
            ? [`${culprit.name} spun the wheel…`, 'and locked themselves up. Instant karma.']
            : fx.why === 'random'
              ? [`${culprit.name} spun the wheel of doom`, `${victim.name} drew the short straw. Off to Jail!`]
              : [`${culprit.name} threw ${victim.name} in Jail`, 'No trial. No mercy. Mwahaha.'];
        return (
            <div key={deal.id} className="deal red jailed evil">
                <div className={cn('dl-row', backfired && 'solo')}>
                    {!backfired && (
                        <>
                            <span className="dl-party villain">
                                <span className="horns" aria-hidden="true" />
                                <Avatar name={culprit.name} color={culprit.color} />
                                <b>{culprit.name}</b>
                            </span>
                            <span className="dl-arrow" aria-hidden="true">
                                {fx.why === 'random' ? <Dices className="dl-chev swap" /> : <Gavel className="dl-chev swap" />}
                            </span>
                        </>
                    )}
                    <span className="dl-party out">
                        {/* Caught by their own trap: the horns stay on, behind the bars. */}
                        {backfired && <span className="horns" aria-hidden="true" />}
                        <span className="bars">
                            <Avatar name={victim.name} color={victim.color} />
                        </span>
                        <LockKeyhole className="dl-x" />
                        <b>{victim.name}</b>
                    </span>
                </div>
                <div className="dl-cap">{line}</div>
                <div className="dl-sub">{sub}</div>
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
    if (fx.kind === 'bail') {
        // A rescue, not a swap: the helper, a key, and the player it frees. `to` is the helper.
        return (
            <div key={deal.id} className="deal blue">
                <div className="dl-row">
                    <Party state={state} seat={fx.to} />
                    <span className="dl-arrow" aria-hidden="true">
                        {fx.amount > 0 && <span className="dl-amt">{rs(fx.amount)}</span>}
                        <KeyRound className="dl-chev swap" />
                    </span>
                    <Party state={state} seat={fx.from} />
                </div>
                <div className="dl-cap">{caption(state, deal)}</div>
            </div>
        );
    }
    if (fx.kind === 'trade' || fx.kind === 'split') {
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
                <div className="dl-cap">{fx.kind === 'trade' ? 'Trade done' : caption(state, deal)}</div>
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
