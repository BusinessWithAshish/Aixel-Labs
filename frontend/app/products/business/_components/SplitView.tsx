'use client';

import { Handshake } from 'lucide-react';
import { BUSINESS_RULES, BUSINESS_SETS, type BusinessSetKey } from '@aixellabs/backend/business/constants';
import { houseResale, setSpaces } from '@aixellabs/backend/business/compute';
import type { BusinessPublicState } from '@aixellabs/backend/business/types';
import { cssVars } from '../_lib/art';
import { rs } from '../_lib/client';
import { MiniCard, MiniCards } from './MiniCard';

type SplitViewProps = {
    state: BusinessPublicState;
    set: BusinessSetKey;
    major: number;
    minor: number;
    minorPct: number;
    /** Ending a split: show what happens to the houses instead of how the split works. */
    ending?: boolean;
};

/** A colour set shared by two players: its three cities, the two shares, and what the split means. */
export function SplitView({ state, set, major, minor, minorPct, ending = false }: SplitViewProps) {
    const A = state.players[major];
    const B = state.players[minor];
    const majorPct = 100 - minorPct;
    const ids = setSpaces(set);
    const refund = ids.reduce((sum, i) => sum + (state.props[i]?.houses ?? 0) * houseResale(i), 0);
    const minorRefund = Math.floor((refund * minorPct) / 100);
    return (
        <>
            <MiniCards>
                {ids.map((i) => (
                    <MiniCard key={i} state={state} space={i} />
                ))}
            </MiniCards>
            <div className="rentsplit">
                <div className="share" style={cssVars({ '--pc': A.color })}>
                    {majorPct}%<small>{A.name}</small>
                </div>
                <div className="donut" style={{ background: `conic-gradient(${B.color} 0 ${minorPct}%, ${A.color} 0)` }}>
                    <b>
                        <Handshake style={{ width: 16, height: 16 }} />
                    </b>
                </div>
                <div className="share" style={cssVars({ '--pc': B.color })}>
                    {minorPct}%<small>{B.name}</small>
                </div>
            </div>
            {ending ? (
                <ul className="splitrules">
                    <li>Every house in the {BUSINESS_SETS[set].name} set goes back to the bank.</li>
                    <li>
                        {refund
                            ? `The ${rs(refund)} it pays is shared: ${rs(refund - minorRefund)} to ${A.name}, ${rs(minorRefund)} to ${B.name}.`
                            : 'Nothing is built, so no money changes hands.'}
                    </li>
                    <li>Each city stays with its owner, and rent is no longer shared.</li>
                </ul>
            ) : (
                <ul className="splitrules">
                    <li>The set counts as complete: rent on all three cities triples.</li>
                    <li>
                        Rent from any of the three is shared {majorPct}% / {minorPct}%.
                    </li>
                    <li>
                        Only {A.name} builds. {B.name} pays {minorPct}% of every house, even if it leaves them short, and gets {minorPct}% back when one is sold.
                    </li>
                    <li>{A.name} and {B.name} pay no rent on these cities.</li>
                    <li>Either of you can offer to end it later. Every house then goes back to the bank.</li>
                </ul>
            )}
        </>
    );
}

/** Shares a split can be set to: 10% to 90% in steps of 5, starting from the default. */
export function nextSplitPct(value: number, up: boolean): number {
    const step = BUSINESS_RULES.SPLIT_STEP_PCT;
    const next = up ? Math.floor(value / step) * step + step : Math.ceil(value / step) * step - step;
    return Math.min(BUSINESS_RULES.SPLIT_MAX_PCT, Math.max(BUSINESS_RULES.SPLIT_MIN_PCT, next));
}
