'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { House, Users } from 'lucide-react';
import { BLUFF_LOBBY_COLOR, BLUFF_RULES } from '@aixellabs/backend/bluff/constants';
import { AudioToggles, Avatar, GButton, Ribbon } from '../../business/_components/bits';
import { clampName, loadProfile, saveProfile } from '../../business/_lib/client';
import { sfx } from '../../business/_lib/sound';
import { GameToasts } from '../../business/_lib/toast';
import { useBluffRoom } from '../_hooks/use-bluff-room';
import { gameBasePath } from '../_lib/client';
import { BluffLogo, BluffTips } from './bits';
import { Lobby } from './Lobby';
import { Table } from './Table';

const COUNT_FROM = 3;
/** How long the Join button stays off after a tap while the room has not answered. */
const JOIN_RETRY_MS = 4000;

/** One room URL: join form, lobby, then the table, depending on what the server says. */
export function BluffRoom({ code }: { code: string }) {
    const { room, status, invite, online, rtt, clockOffset, send, join, start, configure, kick, move, pause, close, end } =
        useBluffRoom(code);
    const homeHref = gameBasePath(usePathname()) || '/';
    const [name, setName] = useState('');
    const [joining, setJoining] = useState(false);
    useEffect(() => {
        if (!joining) return;
        // If the room never answers (a dropped connection), the button comes back.
        const timer = window.setTimeout(() => setJoining(false), JOIN_RETRY_MS);
        return () => window.clearTimeout(timer);
    }, [joining]);
    const wasStarted = useRef<boolean | null>(null);
    /** 3, 2, 1, then 0 for "Go!", then null. */
    const [count, setCount] = useState<number | null>(null);

    useEffect(() => {
        const profile = loadProfile();
        if (profile) setName(profile.name);
    }, []);

    useEffect(() => {
        if (!room) return;
        // The host pressed Start: everyone gets a 3, 2, 1 before the table.
        if (wasStarted.current === false && room.started) setCount(COUNT_FROM);
        wasStarted.current = room.started;
    }, [room]);

    useEffect(() => {
        if (count === null) return;
        sfx(count > 0 ? 'tick' : 'start');
        const timer = window.setTimeout(() => setCount(count > 0 ? count - 1 : null), count > 0 ? 800 : 900);
        return () => window.clearTimeout(timer);
    }, [count]);

    const menuLink = (
        <Link href={homeHref} className="gbtn blue">
            <House className="lu" />
            Main menu
        </Link>
    );
    const notice = (title: string, text: string) => (
        <main className="screen form">
            <Ribbon red>{title}</Ribbon>
            <p className="center" style={{ fontWeight: 800 }}>
                {text}
            </p>
            {menuLink}
        </main>
    );

    let body: React.ReactNode;
    if (status === 'missing')
        body = notice('No such room', `Room ${code} does not exist. It may have ended, or the code has a typo.`);
    else if (status === 'kicked') body = notice('Removed from the room', `The host removed you from room ${code}.`);
    else if (status === 'closed') body = notice('Room closed', `The host left, so room ${code} is closed.`);
    else if (status === 'need-join') {
        const closed = invite?.started
            ? 'This match has already started.'
            : invite && invite.seatsTaken >= invite.seats
              ? 'This room is full.'
              : null;
        body = (
            <main className="screen form">
                <div className="hud">
                    <span className="sp" />
                    <AudioToggles />
                </div>
                <BluffLogo />
                {/* Whose room this is, before anything else. */}
                <div className="invite">
                    {invite ? (
                        <>
                            <Avatar name={invite.host} color={BLUFF_LOBBY_COLOR} size="lg" />
                            <span className="small">You are invited by</span>
                            <b>{invite.host}</b>
                            <span className="tag dim">
                                <Users className="lu" />
                                {invite.seatsTaken} of {invite.seats} seats taken
                            </span>
                        </>
                    ) : (
                        <span className="small">Finding room {code}…</span>
                    )}
                </div>
                {closed ? (
                    <p className="center" style={{ fontWeight: 800 }}>
                        {closed}
                    </p>
                ) : (
                    <>
                        <label className="field">
                            Your name
                            <input
                                type="text"
                                value={name}
                                placeholder="Type your name"
                                onChange={(e) => setName(clampName(e.target.value, BLUFF_RULES.NAME_MAX))}
                            />
                        </label>
                        <GButton
                            tone="green"
                            size="big"
                            disabled={!name.trim() || !online || joining}
                            onClick={() => {
                                // One tap, one seat: the button stays off until the room answers.
                                setJoining(true);
                                saveProfile({ name: name.trim() });
                                join(name.trim());
                            }}
                        >
                            Join {invite ? `${invite.host}'s room` : 'room'}
                        </GButton>
                    </>
                )}
                {menuLink}
                <BluffTips />
            </main>
        );
    } else if (status === 'connecting' || !room) {
        body = (
            <main className="screen form">
                <p className="center" style={{ fontWeight: 800 }}>
                    Connecting to room {code}…
                </p>
            </main>
        );
    } else if (!room.started || !room.state) {
        body = (
            <Lobby
                room={room}
                homeHref={homeHref}
                onStart={start}
                onConfigure={configure}
                onKick={kick}
                onMove={move}
                onClose={close}
            />
        );
    } else {
        body = (
            <Table
                room={room}
                send={send}
                clockOffset={clockOffset}
                online={online}
                rtt={rtt}
                homeHref={homeHref}
                onPause={pause}
                onClose={close}
                onEnd={end}
                curtain={count !== null || wasStarted.current === false}
            />
        );
    }

    return (
        <>
            <GameToasts />
            {body}
            {count !== null && (
                <div className="countdown" role="status" aria-live="assertive">
                    <b key={count}>{count > 0 ? count : 'Go!'}</b>
                    <span>The cards are dealt. Get ready.</span>
                </div>
            )}
        </>
    );
}
