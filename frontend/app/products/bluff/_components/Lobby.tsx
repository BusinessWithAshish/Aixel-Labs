'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Copy, Crown, Flag, Layers, LogOut, Share2, Timer, TimerOff, Users, WifiOff, X } from 'lucide-react';
import { BLUFF_MISS_LIMITS, BLUFF_RULES, BLUFF_TURN_SECONDS } from '@aixellabs/backend/bluff/constants';
import { bluffDecksFor } from '@aixellabs/backend/bluff/compute';
import type { BluffRoomConfig, BluffRoomView } from '@aixellabs/backend/bluff/types';
import { cn } from '@/lib/utils';
import { AudioToggles, Avatar, Choices, GButton, missLabel, Ribbon, Stepper } from '../../business/_components/bits';
import { sfx } from '../../business/_lib/sound';
import { notify } from '../../business/_lib/toast';
import { BluffTips, END_MODES, endLabel, secondsLabel } from './bits';

type LobbyProps = {
    room: BluffRoomView;
    homeHref: string;
    onStart: () => void;
    onConfigure: (patch: Partial<BluffRoomConfig>) => void;
    onKick: (seat: number) => void;
    /** Host: move a player to another place in the turn order. */
    onMove: (seat: number, to: number) => void;
    /** Host only: ends the room for everyone. */
    onClose: () => void;
};

const CONFIRM_MS = 3000;
/** Turn order, as shown on each player's card. */
const ORDINALS = ['1st', '2nd', '3rd', '4th', '5th', '6th'];

export function Lobby({ room, homeHref, onStart, onConfigure, onKick, onMove, onClose }: LobbyProps) {
    const router = useRouter();
    const host = room.you === room.hostSeat;
    const blocked = room.seats.length < BLUFF_RULES.MIN_SEATS ? 'Waiting for players' : null;
    const [leaving, setLeaving] = useState(false);
    useEffect(() => {
        if (!leaving) return;
        const timer = window.setTimeout(() => setLeaving(false), CONFIRM_MS);
        return () => window.clearTimeout(timer);
    }, [leaving]);
    /** Removing a player takes two taps: the first turns the button into "Remove?". */
    const [confirm, setConfirm] = useState<number | null>(null);
    useEffect(() => {
        if (confirm === null) return;
        const timer = window.setTimeout(() => setConfirm(null), CONFIRM_MS);
        return () => window.clearTimeout(timer);
    }, [confirm]);
    const link = typeof window === 'undefined' ? '' : window.location.href;
    const { seats, turnSeconds, missLimit, endMode } = room.config;
    const decks = bluffDecksFor(room.seats.length);
    /** Host: a player's card being dragged to a new place in the turn order, and the place it is over. */
    const [drag, setDrag] = useState<{ from: number; over: number } | null>(null);
    const seatUnder = (x: number, y: number) => {
        const slot = document.elementFromPoint(x, y)?.closest('[data-seat]');
        return slot ? Number(slot.getAttribute('data-seat')) : null;
    };

    const copy = async (text: string, what: string) => {
        try {
            await navigator.clipboard.writeText(text);
            notify(`${what} copied`, 'good');
        } catch {
            notify(text);
        }
    };
    const share = async () => {
        if (navigator.share) {
            try {
                await navigator.share({ title: 'Bluff', text: `Join my Bluff room: ${room.code}`, url: link });
                return;
            } catch {
                /* dismissed: fall through to copy */
            }
        }
        void copy(link, 'Invite link');
    };

    return (
        <main className="screen form">
            <div className="hud">
                {host ? (
                    // The host leaving ends the room, so it takes a second tap.
                    <button
                        type="button"
                        className={leaving ? 'ib bad' : 'ib'}
                        aria-label="Close the room and go to the main menu"
                        onClick={() => {
                            if (!leaving) {
                                setLeaving(true);
                                return notify('Leaving closes the room for everyone. Tap again to close it.', 'error');
                            }
                            onClose();
                            router.push(homeHref);
                        }}
                    >
                        <LogOut className="lu" />
                    </button>
                ) : (
                    <Link href={homeHref} className="ib" aria-label="Back to the main menu">
                        <LogOut className="lu" />
                    </Link>
                )}
                <span className="sp" />
                <Ribbon>Private room</Ribbon>
                <span className="sp" />
                <AudioToggles />
            </div>
            <div className="ticket">
                <span className="small">Room code</span>
                <span className="code">{room.code}</span>
            </div>
            <div className="btns">
                <GButton tone="blue" onClick={() => copy(link, 'Invite link')}>
                    <Copy className="lu" />
                    Copy link
                </GButton>
                <GButton onClick={share}>
                    <Share2 className="lu" />
                    Share
                </GButton>
            </div>

            {host ? (
                <>
                    <div className="row">
                        <span>Seats</span>
                        <Stepper
                            value={seats}
                            min={Math.max(BLUFF_RULES.MIN_SEATS, room.seats.length)}
                            max={BLUFF_RULES.MAX_SEATS}
                            onChange={(value) => onConfigure({ seats: value })}
                        />
                    </div>
                    <div className="row">
                        <span>Turn time</span>
                        <span className="small">Then the turn is missed</span>
                    </div>
                    <Choices
                        options={BLUFF_TURN_SECONDS}
                        value={turnSeconds as (typeof BLUFF_TURN_SECONDS)[number]}
                        label={secondsLabel}
                        onPick={(value) => onConfigure({ turnSeconds: value })}
                    />
                    <div className="row">
                        <span>Out after missing</span>
                        <span className="small">Turns in a row</span>
                    </div>
                    <Choices
                        options={BLUFF_MISS_LIMITS}
                        value={missLimit as (typeof BLUFF_MISS_LIMITS)[number]}
                        label={missLabel}
                        onPick={(value) => onConfigure({ missLimit: value })}
                    />
                    <div className="row">
                        <span>Match ends</span>
                        <span className="small">
                            {endMode === 'last' ? 'When one player is left with cards' : 'When the first player is out'}
                        </span>
                    </div>
                    <Choices
                        options={END_MODES}
                        value={endMode === 'first' ? 1 : 0}
                        label={endLabel}
                        onPick={(value) => onConfigure({ endMode: value === 1 ? 'first' : 'last' })}
                    />
                </>
            ) : (
                /* Guests only read the host's settings, so these are plain facts, not controls. */
                <dl className="facts">
                    <div>
                        <Users className="lu" />
                        <dt>Seats</dt>
                        <dd>{seats}</dd>
                    </div>
                    <div>
                        <Timer className="lu" />
                        <dt>Turn time</dt>
                        <dd>{turnSeconds} seconds</dd>
                    </div>
                    <div>
                        <TimerOff className="lu" />
                        <dt>Out after missing</dt>
                        <dd>{missLimit} turns in a row</dd>
                    </div>
                    <div>
                        <Flag className="lu" />
                        <dt>Match ends</dt>
                        <dd>{endLabel(endMode === 'first' ? 1 : 0)}</dd>
                    </div>
                    <div>
                        <Layers className="lu" />
                        <dt>Cards</dt>
                        <dd>{decks === 1 ? 'One deck (52)' : 'Two decks (104)'}</dd>
                    </div>
                </dl>
            )}

            <div className="slots">
                {Array.from({ length: seats }, (_, i) => {
                    const seat = room.seats[i];
                    if (!seat)
                        return (
                            <div key={i} className="slot empty">
                                <span className="av">+</span>
                                Seat {i + 1}
                            </div>
                        );
                    return (
                        <div
                            key={i}
                            data-seat={i}
                            className={cn(
                                'slot',
                                i === room.you && 'me',
                                host && 'movable',
                                drag?.from === i && 'dragging',
                                drag && drag.over === i && drag.from !== i && 'over',
                            )}
                            {...(host
                                ? {
                                      // Drag a player's card onto another to change who plays when. Buttons on the card keep working.
                                      onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => {
                                          if ((e.target as HTMLElement).closest('button')) return;
                                          e.currentTarget.setPointerCapture(e.pointerId);
                                          setDrag({ from: i, over: i });
                                      },
                                      onPointerMove: (e: React.PointerEvent) =>
                                          drag &&
                                          setDrag({ from: drag.from, over: seatUnder(e.clientX, e.clientY) ?? drag.over }),
                                      onPointerUp: () => {
                                          if (drag && drag.over !== drag.from) onMove(drag.from, drag.over);
                                          setDrag(null);
                                      },
                                      onPointerCancel: () => setDrag(null),
                                  }
                                : {})}
                        >
                            <span className="ord">{ORDINALS[i]}</span>
                            <Avatar name={seat.name} color={seat.color} />
                            <span className="who">
                                {i === room.hostSeat && <Crown className="lu host" aria-label="Host" />}
                                <span>{i === room.you ? `${seat.name} (you)` : seat.name}</span>
                                {!seat.connected && <WifiOff className="lu off" aria-label="Away" />}
                            </span>
                            {host && i !== room.hostSeat && (
                                <button
                                    type="button"
                                    className={confirm === i ? 'kick sure' : 'kick'}
                                    aria-label={`Remove ${seat.name}`}
                                    onClick={() => {
                                        sfx('click');
                                        if (confirm !== i) return setConfirm(i);
                                        setConfirm(null);
                                        onKick(i);
                                        notify(`${seat.name} was removed`, 'info');
                                    }}
                                >
                                    {confirm === i ? `Tap to remove ${seat.name}` : <X className="lu" />}
                                </button>
                            )}
                        </div>
                    );
                })}
            </div>

            <p className="small center">
                {host ? 'Players take turns in this order. Drag a card to change it.' : 'Players take turns in this order.'}{' '}
                {decks === 1 ? 'One deck.' : 'Two decks.'}
            </p>
            {host ? (
                <GButton tone="green" size="big" disabled={!!blocked} onClick={onStart}>
                    {blocked ?? 'Start game'}
                </GButton>
            ) : (
                <p className="waiting">Waiting for the host to start…</p>
            )}
            <BluffTips />
        </main>
    );
}
