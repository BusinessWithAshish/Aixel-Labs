'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, Copy, Crown, Hourglass, LogOut, Share2, Swords, TimerOff, User, Users, WifiOff, X } from 'lucide-react';
import {
    BUSINESS_MATCH_MINUTES,
    BUSINESS_MISS_LIMITS,
    BUSINESS_RULES,
} from '@aixellabs/backend/business/constants';
import type { BusinessRoomConfig, BusinessRoomView } from '@aixellabs/backend/business/types';
import { sfx } from '../_lib/sound';
import { notify } from '../_lib/toast';
import { AudioToggles, Avatar, Choices, GButton, minutesLabel, missLabel, Ribbon, Stepper, Tips } from './bits';

type LobbyProps = {
    room: BusinessRoomView;
    homeHref: string;
    onStart: () => void;
    onConfigure: (patch: Partial<BusinessRoomConfig>) => void;
    onKick: (seat: number) => void;
    onTeam: (seat: number, team: number) => void;
    /** Host only: ends the room for everyone. */
    onClose: () => void;
};

/** Team play is always two sides. */
const SIDES = [
    { team: 0, name: 'Team Alpha' },
    { team: 1, name: 'Team Beta' },
] as const;

const CONFIRM_MS = 3000;

export function Lobby({ room, homeHref, onStart, onConfigure, onKick, onTeam, onClose }: LobbyProps) {
    const router = useRouter();
    const host = room.you === room.hostSeat;
    const teamPlay = room.config.teams;
    const open = room.config.seats - room.seats.length;
    /** Why the match cannot start yet, as the Start button's label; null when it can. */
    const blocked =
        room.seats.length < BUSINESS_RULES.MIN_SEATS
            ? 'Waiting for players'
            : !teamPlay
              ? null
              : room.seats.some((s) => s.team < 0)
                ? 'Put every player in a team'
                : SIDES.some(({ team }) => !room.seats.some((s) => s.team === team))
                  ? 'Both teams need a player'
                  : null;
    const place = (seat: number, team: number) => {
        sfx('click');
        onTeam(seat, team);
    };
    /** A player's name, with a crown for the host and an offline mark when away. */
    const who = (seat: BusinessRoomView['seats'][number], i: number, short = false) => (
        <span className="who">
            {i === room.hostSeat && <Crown className="lu host" aria-label="Host" />}
            <span>{i === room.you && !short ? `${seat.name} (you)` : seat.name}</span>
            {!seat.connected && <WifiOff className="lu off" aria-label="Away" />}
        </span>
    );
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
    const { seats, minutes, missLimit } = room.config;

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
                await navigator.share({ title: 'Big Business', text: `Join my Big Business room: ${room.code}`, url: link });
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
                            min={Math.max(BUSINESS_RULES.MIN_SEATS, room.seats.length)}
                            max={BUSINESS_RULES.MAX_SEATS}
                            onChange={(value) => onConfigure({ seats: value })}
                        />
                    </div>
                    <div className="row">
                        <span>Match length</span>
                        <span className="small">{minutes === 0 ? 'Last player standing wins' : 'Richest wins at the bell'}</span>
                    </div>
                    <Choices
                        options={BUSINESS_MATCH_MINUTES}
                        value={minutes as (typeof BUSINESS_MATCH_MINUTES)[number]}
                        label={minutesLabel}
                        onPick={(value) => onConfigure({ minutes: value })}
                    />
                    <div className="row">
                        <span>Out after missing</span>
                        <span className="small">Turns in a row</span>
                    </div>
                    <Choices
                        options={BUSINESS_MISS_LIMITS}
                        value={missLimit as (typeof BUSINESS_MISS_LIMITS)[number]}
                        label={missLabel}
                        onPick={(value) => onConfigure({ missLimit: value })}
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
                        <Hourglass className="lu" />
                        <dt>Match length</dt>
                        <dd>{minutes === 0 ? 'No limit' : minutesLabel(minutes)}</dd>
                    </div>
                    <div>
                        <TimerOff className="lu" />
                        <dt>Out after missing</dt>
                        <dd>{missLimit} turns in a row</dd>
                    </div>
                </dl>
            )}

            {/* Two ways to play. The host picks; everyone sees which one is on. */}
            <div className="seg two modes">
                <GButton size="sm" tone="gold" className={teamPlay ? undefined : 'off'} disabled={!host && !teamPlay} onClick={() => host && onConfigure({ teams: true })}>
                    <Swords className="lu" />
                    Team vs Team
                </GButton>
                <GButton size="sm" tone="gold" className={teamPlay ? 'off' : undefined} disabled={!host && teamPlay} onClick={() => host && onConfigure({ teams: false })}>
                    <User className="lu" />
                    Solo
                </GButton>
            </div>

            {teamPlay ? (
                /* Team Alpha on the left, Team Beta on the right, and everyone not placed yet in the middle. */
                <div className="sides">
                    {SIDES.map(({ team, name }) => (
                        <div key={team} className={`sidecol s${team}`}>
                            <h4>{name}</h4>
                            {room.seats.map((seat, i) =>
                                seat.team === team ? (
                                    <div key={i} className={`chip${i === room.you ? ' me' : ''}`}>
                                        {host && team === 1 && (
                                            <button type="button" className="mv" aria-label={`Take ${seat.name} out of Team Beta`} onClick={() => place(i, -1)}>
                                                <ChevronLeft className="lu" />
                                            </button>
                                        )}
                                        {who(seat, i, true)}
                                        {host && team === 0 && (
                                            <button type="button" className="mv" aria-label={`Take ${seat.name} out of Team Alpha`} onClick={() => place(i, -1)}>
                                                <ChevronRight className="lu" />
                                            </button>
                                        )}
                                    </div>
                                ) : null,
                            )}
                            {!room.seats.some((seat) => seat.team === team) && <p className="none">Nobody yet</p>}
                        </div>
                    ))}
                    <div className="sidecol pool">
                        <h4>Players</h4>
                        {room.seats.map((seat, i) =>
                            seat.team < 0 ? (
                                <div key={i} className={`chip${i === room.you ? ' me' : ''}`}>
                                    {host && (
                                        <button type="button" className="mv a" aria-label={`Put ${seat.name} in Team Alpha`} onClick={() => place(i, 0)}>
                                            <ChevronLeft className="lu" />
                                        </button>
                                    )}
                                    {who(seat, i, true)}
                                    {host && (
                                        <button type="button" className="mv b" aria-label={`Put ${seat.name} in Team Beta`} onClick={() => place(i, 1)}>
                                            <ChevronRight className="lu" />
                                        </button>
                                    )}
                                </div>
                            ) : null,
                        )}
                        {open > 0 && (
                            <p className="none">
                                {open} open seat{open === 1 ? '' : 's'}
                            </p>
                        )}
                    </div>
                </div>
            ) : (
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
                            <div key={i} className={`slot${i === room.you ? ' me' : ''}`}>
                                <Avatar name={seat.name} color={seat.color} />
                                {who(seat, i)}
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
            )}

            {host ? (
                <GButton tone="green" size="big" disabled={!!blocked} onClick={onStart}>
                    {blocked ?? (teamPlay ? 'Start Alpha vs Beta' : 'Start game')}
                </GButton>
            ) : (
                <p className="waiting">Waiting for the host to start…</p>
            )}
            <Tips />
        </main>
    );
}
