'use client';

import { ArrowLeftRight, HandCoins, Handshake } from 'lucide-react';
import { canMortgage, netWorth, ownedBy } from '@aixellabs/backend/business/compute';
import type { BusinessPublicState } from '@aixellabs/backend/business/types';
import type { BusinessSend } from '../_hooks/use-business-room';
import { rs } from '../_lib/client';
import { Avatar, Cash, GButton, Pop } from './bits';
import { BUSINESS_BOARD } from '@aixellabs/backend/business/constants';
import { MiniCard, MiniCards } from './MiniCard';
import type { OfferDraft } from './OfferComposer';

type PlayerPanelProps = {
    state: BusinessPublicState;
    me: number;
    seat: number;
    send: BusinessSend;
    onClose: () => void;
    onSpace: (space: number) => void;
    onOffer: (draft: OfferDraft) => void;
};

/** Opens when a player plate is tapped: what they own and owe, plus deals you can start with them. */
export function PlayerPanel({ state, me, seat, send, onClose, onSpace, onOffer }: PlayerPanelProps) {
    const p = state.players[seat];
    const owned = ownedBy(state, seat);
    const myTurn = state.turn === me;
    const canDeal = myTurn && ['roll', 'end', 'debt'].includes(state.phase) && !state.players[me].bankrupt;
    const canRepay = myTurn && (state.phase === 'roll' || state.phase === 'end');
    const loans = state.loans.filter((l) => l.lender === seat || l.borrower === seat);
    /** Properties this player has mortgaged to someone, or holds a mortgage on. */
    const deals = Object.keys(state.props)
        .map(Number)
        .filter((i) => state.props[i].lend && (state.props[i].owner === seat || state.props[i].lend!.to === seat));
    const iCanMortgage = ownedBy(state, me).some((i) => canMortgage(state, me, i) === null);

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
            {owned.length ? (
                <MiniCards>
                    {owned.map((i) => (
                        <MiniCard key={i} state={state} space={i} onClick={() => onSpace(i)} />
                    ))}
                </MiniCards>
            ) : (
                <p className="small">Nothing yet.</p>
            )}

            {deals.length > 0 && (
                <>
                    <span className="small">Mortgaged to a player</span>
                    <div className="list">
                        {deals.map((i) => {
                            const prop = state.props[i];
                            const lend = prop.lend!;
                            const owner = state.players[prop.owner];
                            const lender = state.players[lend.to];
                            return (
                                <button key={i} type="button" className="li mdeal" onClick={() => onSpace(i)}>
                                    <Avatar name={owner.name} color={owner.color} size="sm" />
                                    <Handshake className="lu" style={{ color: lender.color }} />
                                    <Avatar name={lender.name} color={lender.color} size="sm" />
                                    <span>
                                        <b>{BUSINESS_BOARD[i].name}</b>
                                        <br />
                                        {lender.name} gets {lend.share}% of rent · {lend.lapsLeft} lap{lend.lapsLeft === 1 ? '' : 's'} left
                                    </span>
                                </button>
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
                        <GButton tone="blue" className="opt" disabled={!canDeal} onClick={() => onOffer({ kind: 'trade', with: seat })}>
                            <ArrowLeftRight className="lu" />
                            Trade
                        </GButton>
                        <GButton tone="gold" className="opt" disabled={!canDeal} onClick={() => onOffer({ kind: 'loan', with: seat })}>
                            <HandCoins className="lu" />
                            Cash loan
                        </GButton>
                    </div>
                    <GButton disabled={!canDeal || !iCanMortgage} onClick={() => onOffer({ kind: 'mortgage', with: seat })}>
                        <Handshake className="lu" />
                        Mortgage a property to {p.name}
                    </GButton>
                    {!canDeal && <p className="small center">You can make offers on your own turn.</p>}
                </>
            )}
            <GButton tone="red" size="sm" onClick={onClose}>
                Close
            </GButton>
        </Pop>
    );
}
