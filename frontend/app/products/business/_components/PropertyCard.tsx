'use client';

import type { ReactNode } from 'react';
import { Gavel, Hammer, Handshake, Hotel, House, IndianRupee, KeyRound, Landmark as BankIcon, Receipt } from 'lucide-react';
import {
    BUSINESS_BOARD,
    BUSINESS_RULES,
    BUSINESS_SETS,
    BUSINESS_UTILITY_MULTIPLIER,
} from '@aixellabs/backend/business/constants';
import {
    canBuild,
    canMortgage,
    canRedeem,
    canSellHouse,
    countKind,
    housesOnBoard,
    houseCost,
    houseResale,
    isBuyable,
    mortgageValue,
    splitAt,
    splitShares,
    utilityMultiplier,
    railRent,
    redeemCost,
    rentLadder,
    rentLevel,
    setSpaces,
} from '@aixellabs/backend/business/compute';
import type { BusinessPublicState } from '@aixellabs/backend/business/types';
import { cn } from '@/lib/utils';
import type { BusinessSend } from '../_hooks/use-business-room';
import { cssVars, SPACE_ICONS } from '../_lib/art';
import { fmt, rs } from '../_lib/client';
import { Cash, GButton } from './bits';

const DESCRIPTIONS: Record<string, string> = {
    launch: `Collect your salary every time you pass or land here: ${rs(BUSINESS_RULES.SALARY_STEP)} for your first lap, ${rs(BUSINESS_RULES.SALARY_STEP * 2)} for the second, and ${rs(BUSINESS_RULES.SALARY_STEP)} more with every lap after that.`,
    chance: 'Draw a Chance card. Four pay you and six cost you, each a share of your cash or property; two move you.',
    jail: `Just visiting, unless you were sent here. Roll doubles to leave free. Leave without doubles and ${BUSINESS_RULES.JAIL_PCT}% of your cash is shared among the other players, unless a player visiting Jail bails you out.`,
    break: 'Your choice: rest and skip your next turn, keep playing, or send another player to Jail.',
    gojail: 'Go straight to Jail. No salary on the way.',
};

function Row({ icons, label, amount, current }: { icons: ReactNode; label: string; amount: ReactNode; current: boolean }) {
    return (
        <div className={cn('rr', current && 'cur')}>
            <span className="ri">{icons}</span>
            <span>{label}</span>
            <b>{amount}</b>
        </div>
    );
}

const Rupees = ({ value }: { value: number }) => (
    <>
        <IndianRupee className="lu" />
        {fmt(value)}
    </>
);

type PropertyCardProps = {
    space: number;
    state: BusinessPublicState;
    me: number;
    send: BusinessSend;
    /** 'buy' adds the Buy / Auction buttons for the player who just landed here. */
    mode?: 'view' | 'buy';
};

export function PropertyCard({ space, state, me, send, mode = 'view' }: PropertyCardProps) {
    const tile = BUSINESS_BOARD[space];
    const set = tile.set ? BUSINESS_SETS[tile.set] : null;
    const prop = state.props[space];
    const owner = prop ? state.players[prop.owner] : null;
    const Icon = tile.icon ? SPACE_ICONS[tile.icon] : null;
    const live = !!prop && !prop.mortgaged;
    const myTurn = state.turn === me;
    const manage = myTurn && (state.phase === 'roll' || state.phase === 'end');
    const raise = manage || (myTurn && state.phase === 'debt');
    const split = splitAt(state, space);
    // In a split set the partner with two cities manages the houses on all three.
    const mine = prop?.owner === me || split?.major === me;
    const houseShare = split ? splitShares(split, houseCost(space)) : null;

    let sections: ReactNode = null;
    if (tile.kind === 'city' && tile.set) {
        const ladder = rentLadder(space);
        const level = live ? rentLevel(state, space) : -1;
        sections = (
            <>
                <div className="sect">
                    <div className="sect-h">
                        <span>Rent</span>
                        <span>No houses</span>
                    </div>
                    <Row icons={<Receipt className="lu" />} label="This city alone" amount={<Rupees value={ladder[0]} />} current={level === 0} />
                    <Row
                        icons={setSpaces(tile.set).map((i) => (
                            <i key={i} style={{ background: set?.color }} />
                        ))}
                        label="Whole colour set"
                        amount={<Rupees value={ladder[1]} />}
                        current={level === 1}
                    />
                </div>
                <div className="sect">
                    <div className="sect-h">
                        <span>Rent with houses</span>
                        <span>{rs(houseCost(space))} each</span>
                    </div>
                    {[1, 2, 3, 4].map((n) => (
                        <Row
                            key={n}
                            icons={Array.from({ length: n }, (_, k) => (
                                <House key={k} className="lu hs" />
                            ))}
                            label={n === 1 ? '1 house' : `${n} houses`}
                            amount={<Rupees value={ladder[n + 1]} />}
                            current={level === n + 1}
                        />
                    ))}
                    <Row icons={<Hotel className="lu ht" />} label="Hotel" amount={<Rupees value={ladder[6]} />} current={level === 6} />
                </div>
            </>
        );
    } else if (tile.kind === 'rail') {
        const owned = live && owner ? countKind(state, owner.seat, 'rail') : 0;
        sections = (
            <div className="sect">
                <div className="sect-h">
                    <span>Rent</span>
                    <span>By railways owned</span>
                </div>
                {[1, 2, 3, 4].map((n) => (
                    <Row
                        key={n}
                        icons={Icon ? Array.from({ length: n }, (_, k) => <Icon key={k} className="lu" />) : null}
                        label={`${n} owned`}
                        amount={<Rupees value={railRent(state, n)} />}
                        current={owned === n}
                    />
                ))}
                <p className="small center">
                    Includes +{rs(BUSINESS_RULES.RAIL_RENT_PER_HOUSE)} for each of the {housesOnBoard(state)} houses on the board (a hotel counts as 5).
                </p>
            </div>
        );
    } else if (tile.kind === 'utility') {
        const owned = live && owner ? countKind(state, owner.seat, 'utility') : 0;
        sections = (
            <div className="sect">
                <div className="sect-h">
                    <span>Rent</span>
                    <span>From the dice roll</span>
                </div>
                <Row icons={Icon ? <Icon className="lu" /> : null} label="One utility" amount={`${utilityMultiplier(state, 1)} × dice`} current={owned === 1} />
                <Row icons={Icon ? <Icon className="lu" /> : null} label="Both utilities" amount={`${utilityMultiplier(state, 2)} × dice`} current={owned === 2} />
                <p className="small center">
                    Starts at {BUSINESS_UTILITY_MULTIPLIER.ONE} and {BUSINESS_UTILITY_MULTIPLIER.BOTH}; each of the {housesOnBoard(state)} houses on the board adds 1 (a hotel counts as 5).
                </p>
            </div>
        );
    }

    const pc = set?.color ?? '#241A3D';

    return (
        <div className="prop" style={cssVars({ '--pc': pc, '--pt': set?.text ?? '#FFFFFF' })}>
            <div className="prop-hd plain">
                <span className="prop-set">
                    {set && <i />}
                    {set ? `${set.name} set` : tile.kind === 'gojail' ? 'Corner' : tile.kind}
                </span>
                <h3>{tile.name}</h3>
                {tile.price !== undefined && (
                    <span className="ptag">
                        <IndianRupee className="lu" />
                        {tile.price}
                    </span>
                )}
            </div>
            <div className="prop-bd">
                {isBuyable(space) ? (
                    <>
                        {sections}
                        <div className="chips3">
                            <div className="chip3">
                                Owner
                                <b>
                                    {owner ? (
                                        <>
                                            <House className="lu" fill={owner.color} />
                                            {owner.name}
                                        </>
                                    ) : (
                                        'For sale'
                                    )}
                                </b>
                            </div>
                            <div className="chip3">
                                Mortgage
                                <b>
                                    <BankIcon className="lu" />
                                    {rs(mortgageValue(space))}
                                </b>
                            </div>
                            <div className="chip3">
                                Redeem
                                <b>
                                    <KeyRound className="lu" />
                                    {rs(redeemCost(space))}
                                </b>
                            </div>
                        </div>
                        {prop?.mortgaged && (
                            <div className="pstat bank">
                                <BankIcon className="lu" />
                                <span>Mortgaged to the bank. It earns no rent.</span>
                            </div>
                        )}
                        {split && (
                            <div className="pstat pl">
                                <Handshake className="lu" />
                                <span>
                                    Split set: {state.players[split.major].name} {100 - split.minorPct}% · {state.players[split.minor].name} {split.minorPct}%. Rent from
                                    all three cities is shared, and the two of them pay none here.
                                </span>
                            </div>
                        )}
                    </>
                ) : (
                    <p className="pdesc">{tile.kind === 'levy' ? `Pay ${tile.pct}% of the cash you hold to the bank (at least ${rs(BUSINESS_RULES.PCT_MIN)}).` : DESCRIPTIONS[tile.kind]}</p>
                )}

                {mode === 'buy' && (
                    <>
                        <div className="kv">
                            <span>Your cash after buying</span>
                            <Cash value={state.players[me].cash - (tile.price ?? 0)} />
                        </div>
                        <div className="btns">
                            <GButton tone="green" size="big" onClick={() => send({ type: 'buy' })}>
                                Buy {rs(tile.price ?? 0)}
                            </GButton>
                            <GButton tone="orange" size="big" onClick={() => send({ type: 'auction' })}>
                                <Gavel className="lu" />
                                Auction
                            </GButton>
                        </div>
                    </>
                )}

                {mode === 'view' && mine && raise && (
                    <div className="btns">
                        {manage && canBuild(state, me, space) === null && (
                            <GButton tone="green" onClick={() => send({ type: 'build', space })}>
                                <Hammer className="lu" />
                                {prop.houses === BUSINESS_RULES.MAX_HOUSES - 1 ? 'Hotel' : 'House'} {rs(houseShare ? houseShare.major : houseCost(space))}
                                {houseShare && ` + ${rs(houseShare.minor)} from ${state.players[split!.minor].name}`}
                            </GButton>
                        )}
                        {canSellHouse(state, me, space) === null && (
                            <GButton tone="orange" onClick={() => send({ type: 'sellHouse', space })}>
                                Sell house +{rs(split ? splitShares(split, houseResale(space)).major : houseResale(space))}
                            </GButton>
                        )}
                        {canMortgage(state, me, space) === null && (
                            <GButton tone="blue" onClick={() => send({ type: 'mortgage', space })}>
                                <BankIcon className="lu" />
                                Mortgage +{rs(mortgageValue(space))}
                            </GButton>
                        )}
                        {manage && prop.mortgaged && (
                            <GButton tone="gold" disabled={canRedeem(state, me, space) !== null} onClick={() => send({ type: 'redeem', space })}>
                                <KeyRound className="lu" />
                                Redeem {rs(redeemCost(space))}
                            </GButton>
                        )}
                    </div>
                )}
                {mode === 'view' && mine && !raise && <p className="small center">Build, mortgage and redeem on your own turn.</p>}
            </div>
        </div>
    );
}
