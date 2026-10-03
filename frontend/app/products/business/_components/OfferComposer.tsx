'use client';

import { useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, IndianRupee } from 'lucide-react';
import { BUSINESS_RULES } from '@aixellabs/backend/business/constants';
import { canMortgage, lapInterest, lenderCut, loanDue, maxLoan, ownedBy, validateOffer } from '@aixellabs/backend/business/compute';
import type { BusinessInterestMode, BusinessOfferTerms, BusinessPublicState } from '@aixellabs/backend/business/types';
import type { BusinessSend } from '../_hooks/use-business-room';
import { rs } from '../_lib/client';
import { Avatar, Cash, GButton, Pop, Ribbon, Slider } from './bits';
import { MiniCard, MiniCards } from './MiniCard';

export type OfferDraft =
    | { kind: 'loan'; with?: number }
    | { kind: 'mortgage'; with?: number; space?: number }
    | { kind: 'trade'; with: number };

type ComposerProps = {
    state: BusinessPublicState;
    me: number;
    send: BusinessSend;
    draft: OfferDraft;
    onClose: () => void;
};

const round10 = (n: number) => Math.max(0, Math.floor(n / 10) * 10);

function PlayerPicker({ state, me, value, onPick }: { state: BusinessPublicState; me: number; value: number | undefined; onPick: (seat: number) => void }) {
    return (
        <div className="picks">
            {state.players
                .filter((p) => p.seat !== me && !p.bankrupt)
                .map((p) => (
                    <button key={p.seat} type="button" className={`pick${value === p.seat ? ' on' : ''}`} onClick={() => onPick(p.seat)}>
                        <i style={{ background: p.color, borderRadius: '50%' }} />
                        {p.name}
                    </button>
                ))}
        </div>
    );
}

function SpacePicker({
    state,
    spaces,
    picked,
    onToggle,
}: {
    state: BusinessPublicState;
    spaces: number[];
    picked: number[];
    onToggle: (space: number) => void;
}) {
    if (!spaces.length) return <p className="small">No properties to choose.</p>;
    return (
        <MiniCards>
            {spaces.map((i) => (
                <MiniCard key={i} state={state} space={i} picked={picked.includes(i)} onClick={() => onToggle(i)} />
            ))}
        </MiniCards>
    );
}

/** When the interest is paid: two fixed choices. */
export function InterestMode({ value, onChange }: { value: BusinessInterestMode; onChange: (mode: BusinessInterestMode) => void }) {
    return (
        <div className="seg" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <GButton size="sm" tone="blue" className={value === 'lap' ? undefined : 'off'} onClick={() => onChange('lap')}>
                Interest each lap
            </GButton>
            <GButton size="sm" tone="blue" className={value === 'end' ? undefined : 'off'} onClick={() => onChange('end')}>
                Interest at the end
            </GButton>
        </div>
    );
}

/** Builds a loan, a mortgage to a player, or a trade, and sends it as one offer. */
export function OfferComposer({ state, me, send, draft, onClose }: ComposerProps) {
    const others = state.players.filter((p) => p.seat !== me && !p.bankrupt);
    const [other, setOther] = useState<number | undefined>(draft.with ?? (others.length === 1 ? others[0].seat : undefined));
    // loan
    const [lending, setLending] = useState(false);
    const [amount, setAmount] = useState(200);
    const [interest, setInterest] = useState(10);
    const [mode, setMode] = useState<BusinessInterestMode>('end');
    const [laps, setLaps] = useState(3);
    // mortgage
    const mortgageable = ownedBy(state, me).filter((i) => canMortgage(state, me, i) === null);
    const [space, setSpace] = useState<number | undefined>(draft.kind === 'mortgage' ? (draft.space ?? mortgageable[0]) : undefined);
    const [advance, setAdvance] = useState(150);
    const [share, setShare] = useState(50);
    // trade
    const [give, setGive] = useState<number[]>([]);
    const [get, setGet] = useState<number[]>([]);
    const [giveCash, setGiveCash] = useState(0);
    const [getCash, setGetCash] = useState(0);

    const mePlayer = state.players[me];
    const otherPlayer = other === undefined ? null : state.players[other];
    const toggle = (list: number[], set: (v: number[]) => void) => (i: number) =>
        set(list.includes(i) ? list.filter((x) => x !== i) : [...list, i]);

    let terms: BusinessOfferTerms | null = null;
    let title = 'Trade';
    let body: React.ReactNode = null;

    if (draft.kind === 'loan') {
        title = 'Cash loan';
        const lender = lending ? me : other;
        const borrower = lending ? other : me;
        const cap = lender === undefined ? 0 : round10(maxLoan(state, lender));
        const value = Math.min(amount, cap);
        if (lender !== undefined && borrower !== undefined && value >= 10)
            terms = { kind: 'loan', lender, borrower, amount: value, interestPct: interest, interestMode: mode, laps };
        const perLap = lapInterest(value, interest);
        const total = mode === 'lap' ? value + perLap * laps : loanDue(value, interest);
        body = (
            <>
                <div className="seg" style={{ gridTemplateColumns: '1fr 1fr' }}>
                    <GButton size="sm" tone="gold" className={lending ? 'off' : undefined} onClick={() => setLending(false)}>
                        I borrow
                    </GButton>
                    <GButton size="sm" tone="gold" className={lending ? undefined : 'off'} onClick={() => setLending(true)}>
                        I lend
                    </GButton>
                </div>
                <Slider label="Amount" value={value} display={rs(value)} min={10} max={cap} step={10} onChange={setAmount} />
                <p className="small">
                    A lender can give at most {Math.round(BUSINESS_RULES.LOAN_MAX_CASH_SHARE * 100)}% of their cash
                    {lender !== undefined ? `: ${rs(cap)} for ${state.players[lender].name}.` : '.'}
                </p>
                <Slider label="Interest" value={interest} display={`${interest}%`} min={0} max={BUSINESS_RULES.LOAN_MAX_INTEREST_PCT} step={5} onChange={setInterest} />
                <InterestMode value={mode} onChange={setMode} />
                <Slider label="Repay within" value={laps} display={`${laps} lap${laps === 1 ? '' : 's'}`} min={1} max={BUSINESS_RULES.DEAL_MAX_LAPS} step={1} onChange={setLaps} />
                <div className="due">
                    <span>{borrower === undefined ? 'Borrower' : borrower === me ? 'You pay' : `${state.players[borrower].name} pays`} back in all</span>
                    <Cash value={total} />
                    <small>
                        {mode === 'lap'
                            ? `${rs(perLap)} interest at every Launch, then ${rs(value)} at the end.`
                            : `${rs(value)} plus ${rs(total - value)} interest, all at the end.`}
                    </small>
                </div>
            </>
        );
    } else if (draft.kind === 'mortgage') {
        title = 'Mortgage to a player';
        const cap = otherPlayer ? round10(otherPlayer.cash) : 0;
        const value = Math.min(advance, cap);
        if (other !== undefined && space !== undefined && value >= 10)
            terms = { kind: 'mortgage', space, owner: me, lender: other, advance: value, share, laps };
        const cut = lenderCut(25, share);
        body = (
            <>
                <span className="small">Which property?</span>
                <SpacePicker state={state} spaces={mortgageable} picked={space === undefined ? [] : [space]} onToggle={setSpace} />
                <Slider label={`${otherPlayer?.name ?? 'They'} pay${otherPlayer ? 's' : ''} you now`} value={value} display={rs(value)} min={10} max={cap} step={10} onChange={setAdvance} />
                <Slider label={`${otherPlayer?.name ?? 'Their'}${otherPlayer ? "'s" : ''} share of the rent`} value={share} display={`${share}%`} min={0} max={100} step={5} onChange={setShare} />
                <div className="rentsplit">
                    <div className="share" style={{ color: '#5BE39A' }}>
                        {100 - share}%<small>to you</small>
                    </div>
                    <div className="donut" style={{ background: `conic-gradient(${otherPlayer?.color ?? '#FFB703'} 0 ${share}%, ${mePlayer.color} 0)` }}>
                        <b>
                            <IndianRupee style={{ width: 16, height: 16 }} />
                        </b>
                    </div>
                    <div className="share" style={{ color: '#FFD25E' }}>
                        {share}%<small>to {otherPlayer?.name ?? 'them'}</small>
                    </div>
                </div>
                <p className="small center">
                    On a ₹25 rent you get ₹{25 - cut} and they get ₹{cut}. An odd rupee always goes to the owner.
                </p>
                <Slider label="You pay back within" value={laps} display={`${laps} lap${laps === 1 ? '' : 's'}`} min={1} max={BUSINESS_RULES.DEAL_MAX_LAPS} step={1} onChange={setLaps} />
                <p className="small center">Pay back {rs(value)} in time and the deal ends. If not, they take the property.</p>
            </>
        );
    } else if (otherPlayer) {
        const tradable = (seat: number) => ownedBy(state, seat).filter((i) => !state.props[i].lend);
        terms = { kind: 'trade', give: { cash: giveCash, spaces: give }, get: { cash: getCash, spaces: get } };
        // "Send" is what leaves your hands, "ask for" is what you want back.
        body = (
            <>
                <div className="dealside send">
                    <small>
                        <ArrowUpRight className="lu" />
                        You send
                    </small>
                    <SpacePicker state={state} spaces={tradable(me)} picked={give} onToggle={toggle(give, setGive)} />
                    <Slider label="Cash you send" value={giveCash} display={rs(giveCash)} min={0} max={round10(mePlayer.cash)} step={10} onChange={setGiveCash} />
                </div>
                <div className="dealside get">
                    <small>
                        <ArrowDownLeft className="lu" />
                        You ask {otherPlayer.name} for
                    </small>
                    <SpacePicker state={state} spaces={tradable(otherPlayer.seat)} picked={get} onToggle={toggle(get, setGet)} />
                    <Slider label="Cash you ask for" value={getCash} display={rs(getCash)} min={0} max={round10(otherPlayer.cash)} step={10} onChange={setGetCash} />
                </div>
            </>
        );
    }

    const problem = other === undefined ? 'Pick a player.' : terms ? validateOffer(state, me, other, terms) : 'Fill in the offer.';

    return (
        <Pop onClose={onClose}>
            <Ribbon>{title}</Ribbon>
            {draft.kind !== 'trade' || !otherPlayer ? (
                <>
                    <span className="small">With which player?</span>
                    <PlayerPicker state={state} me={me} value={other} onPick={setOther} />
                </>
            ) : (
                <div className="aucwho">
                    <Avatar name={mePlayer.name} color={mePlayer.color} size="sm" />⇄
                    <Avatar name={otherPlayer.name} color={otherPlayer.color} size="sm" />
                    {otherPlayer.name}
                </div>
            )}
            {body}
            {problem && <p className="small center" style={{ color: '#FFB3BC' }}>{problem}</p>}
            <div className="btns">
                <GButton
                    tone="green"
                    size="big"
                    disabled={!!problem}
                    onClick={() => {
                        if (other === undefined || !terms) return;
                        send({ type: 'offer', to: other, terms });
                        onClose();
                    }}
                >
                    Send offer
                </GButton>
                <GButton tone="red" onClick={onClose}>
                    Cancel
                </GButton>
            </div>
        </Pop>
    );
}
