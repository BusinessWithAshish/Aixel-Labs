'use client';

import { ArrowLeftRight, HandCoins, Handshake, KeyRound, PartyPopper } from 'lucide-react';
import { canBail, canHoldMela, netWorth, ownedBy, splitPair } from '@aixellabs/backend/business/compute';
import type { BusinessPublicState } from '@aixellabs/backend/business/types';
import type { BusinessSend } from '../_hooks/use-business-room';
import { rs } from '../_lib/client';
import { Avatar, Cash, GButton, Pop } from './bits';
import { BUSINESS_MELA_SETS, BUSINESS_SETS, type BusinessSetKey } from '@aixellabs/backend/business/constants';
import { JailCardChip, MelaCardChip, MiniCard, MiniCards } from './MiniCard';
import type { OfferDraft } from './OfferComposer';

type PlayerPanelProps = {
    state: BusinessPublicState;
    me: number;
    seat: number;
    send: BusinessSend;
    onClose: () => void;
    onSpace: (space: number) => void;
    onOffer: (draft: OfferDraft) => void;
    /** Opens the mela pop-up (only offered on your own panel, on your turn, with a card and a set to use it on). */
    onMela: () => void;
};

/** Opens when a player plate is tapped: what they own and owe, plus deals you can start with them. */
export function PlayerPanel({ state, me, seat, send, onClose, onSpace, onOffer, onMela }: PlayerPanelProps) {
    const p = state.players[seat];
    const owned = ownedBy(state, seat);
    const myTurn = state.turn === me;
    const canDeal = myTurn && ['roll', 'end', 'debt'].includes(state.phase) && !state.players[me].bankrupt;
    const canRepay = myTurn && (state.phase === 'roll' || state.phase === 'end');
    const loans = state.loans.filter((l) => l.lender === seat || l.borrower === seat);
    /** Bail is between a player held in Jail and one who may get them out (see canBail): the seat that would be freed, or null. */
    const bailFor = p.jail > 0 && canBail(state, me) ? seat : state.players[me].jail > 0 && canBail(state, seat) ? me : null;
    /** A player held in Jail deals in nothing but their bail. */
    const jailed = p.jail > 0 ? p : state.players[me].jail > 0 ? state.players[me] : null;
    /** With someone in Jail a trade can still swap cards (Jail free, Mela), if either of you holds one. */
    const cardsToTrade = p.jailCards + p.melaCards + state.players[me].jailCards + state.players[me].melaCards > 0;
    const canMela = seat === me && canRepay && BUSINESS_MELA_SETS.some((set) => canHoldMela(state, me, set) === null);
    /** Colour sets this player shares with someone. */
    const splits = state.splits.filter((s) => s.major === seat || s.minor === seat);
    /** A set the two of you could split: held only by the two of you, two and one, or one each. */
    const canSplit = (Object.keys(BUSINESS_SETS) as BusinessSetKey[]).some((k) => {
        const pair = splitPair(state, k);
        return pair && !state.splits.some((s) => s.set === k) && [pair.major, pair.minor].sort().join() === [me, seat].sort().join();
    });

    return (
        <Pop onClose={onClose}>
            <div className="stackc">
                <Avatar name={p.name} color={p.color} size="lg" />
                <h2 style={{ fontSize: 24 }}>{seat === me ? `${p.name} (you)` : p.name}</h2>
                {p.bankrupt ? <span className="tag orange">Bankrupt</span> : <Cash value={p.cash} className={p.cash < 0 ? 'neg' : undefined} />}
            </div>
            {!p.bankrupt && (
                <div className="kv">
                    <span>Net worth</span>
                    <b>{rs(netWorth(state, seat))}</b>
                </div>
            )}

            <span className="small">Properties ({owned.length})</span>
            {owned.length || p.jailCards || p.melaCards ? (
                <MiniCards>
                    {p.melaCards > 0 && <MelaCardChip count={p.melaCards} />}
                    {p.jailCards > 0 && <JailCardChip count={p.jailCards} />}
                    {owned.map((i) => (
                        <MiniCard key={i} state={state} space={i} onClick={() => onSpace(i)} />
                    ))}
                </MiniCards>
            ) : (
                <p className="small">Nothing yet.</p>
            )}

            {canMela && (
                <GButton tone="red" onClick={onMela}>
                    <PartyPopper className="lu" />
                    Hold a mela
                </GButton>
            )}

            {splits.length > 0 && (
                <>
                    <span className="small">Split sets</span>
                    <div className="list">
                        {splits.map((sp) => {
                            const major = state.players[sp.major];
                            const minor = state.players[sp.minor];
                            const partner = sp.major === me ? sp.minor : sp.minor === me ? sp.major : null;
                            return (
                                <div key={sp.id} className="li mdeal">
                                    <Avatar name={major.name} color={major.color} size="sm" />
                                    <Handshake className="lu" style={{ color: BUSINESS_SETS[sp.set].color }} />
                                    <Avatar name={minor.name} color={minor.color} size="sm" />
                                    <span>
                                        <b>{BUSINESS_SETS[sp.set].name} set</b>
                                        <br />
                                        {major.name} {100 - sp.minorPct}% · {minor.name} {sp.minorPct}%
                                    </span>
                                    {partner !== null && partner === seat && (
                                        <GButton size="sm" tone="red" disabled={!canDeal} onClick={() => onOffer({ kind: 'unsplit', with: seat, split: sp.id })}>
                                            End
                                        </GButton>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </>
            )}

            {loans.length > 0 && (
                <>
                    <span className="small">Loans</span>
                    <div className="list">
                        {loans.map((l) => (
                            <div key={l.id} className="li">
                                <span>
                                    {state.players[l.borrower].name} owes {state.players[l.lender].name} {rs(l.due)}
                                    {l.perLap > 0 && ` + ${rs(l.perLap)} each lap`} ·{' '}
                                    {l.dueNow ? 'due now' : `${l.lapsLeft} lap${l.lapsLeft === 1 ? '' : 's'} left`}
                                </span>
                                {l.borrower === me && (
                                    <GButton
                                        size="sm"
                                        tone="gold"
                                        disabled={!canRepay || state.players[me].cash < l.due}
                                        onClick={() => send({ type: 'repayLoan', id: l.id })}
                                    >
                                        Repay
                                    </GButton>
                                )}
                            </div>
                        ))}
                    </div>
                </>
            )}

            {seat !== me && !p.bankrupt && (
                <>
                    <div className="opts">
                        <GButton tone="blue" className="opt" disabled={!canDeal || (!!jailed && !cardsToTrade)} onClick={() => onOffer({ kind: 'trade', with: seat })}>
                            <ArrowLeftRight className="lu" />
                            Trade
                        </GButton>
                        <GButton tone="gold" className="opt" disabled={!canDeal || !!jailed} onClick={() => onOffer({ kind: 'loan', with: seat })}>
                            <HandCoins className="lu" />
                            Cash loan
                        </GButton>
                    </div>
                    <GButton disabled={!canDeal || !canSplit || !!jailed} onClick={() => onOffer({ kind: 'split', with: seat })}>
                        <Handshake className="lu" />
                        Split a set with {p.name}
                    </GButton>
                    {bailFor !== null && (
                        <GButton tone="orange" disabled={!canDeal} onClick={() => onOffer({ kind: 'bail', with: seat, prisoner: bailFor })}>
                            <KeyRound className="lu" />
                            {bailFor === me ? `Ask ${p.name} for bail` : `Bail ${p.name} out of Jail`}
                        </GButton>
                    )}
                    {jailed && <p className="small center">{jailed.seat === me ? 'You are' : `${jailed.name} is`} in Jail: only bail and cards (Jail free, Mela) can be dealt.</p>}
                    {!canDeal && <p className="small center">You can make offers on your own turn.</p>}
                </>
            )}
            <GButton tone="red" size="sm" onClick={onClose}>
                Close
            </GButton>
        </Pop>
    );
}
