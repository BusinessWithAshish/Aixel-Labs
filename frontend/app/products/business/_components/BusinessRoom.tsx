'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { House, Users } from 'lucide-react';
import { BUSINESS_LOBBY_COLOR } from '@aixellabs/backend/business/constants';
import { useBusinessRoom } from '../_hooks/use-business-room';
import { gameBasePath, loadProfile, saveProfile } from '../_lib/client';
import { sfx } from '../_lib/sound';
import { GameToasts } from '../_lib/toast';
import { AudioToggles, Avatar, GButton, Logo, Ribbon, Tips } from './bits';
import { Lobby } from './Lobby';
import { Table } from './Table';

const COUNT_FROM = 3;

/** One room URL: join form, lobby, then the table, depending on what the server says. */
export function BusinessRoom({ code }: { code: string }) {
    const { room, status, invite, online, rtt, clockOffset, send, join, start, configure, kick, setTeam, pause, close } = useBusinessRoom(code);
    const homeHref = gameBasePath(usePathname()) || '/';
    const [name, setName] = useState('');
    const wasStarted = useRef<boolean | null>(null);
    /** 3, 2, 1, then 0 for "Go!", then null. */
    const [count, setCount] = useState<number | null>(null);

    useEffect(() => {
        const profile = loadProfile();
        if (profile) setName(profile.name);
    }, []);

    // A fanfare for everyone in the lobby when the host starts the match.
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

    let body: React.ReactNode;
    if (status === 'missing') {
        body = (
            <main className="screen form">
                <Ribbon red>No such room</Ribbon>
                <p className="center" style={{ fontWeight: 800 }}>
                    Room {code} does not exist. It may have ended, or the code has a typo.
                </p>
                {menuLink}
            </main>
        );
    } else if (status === 'kicked') {
        body = (
            <main className="screen form">
                <Ribbon red>Removed from the room</Ribbon>
                <p className="center" style={{ fontWeight: 800 }}>
                    The host removed you from room {code}.
                </p>
                {menuLink}
            </main>
        );
    } else if (status === 'closed') {
        body = (
            <main className="screen form">
                <Ribbon red>Room closed</Ribbon>
                <p className="center" style={{ fontWeight: 800 }}>
                    The host left, so room {code} is closed.
                </p>
                {menuLink}
            </main>
        );
    } else if (status === 'need-join') {
        const closed = invite?.started ? 'This match has already started.' : invite && invite.seatsTaken >= invite.seats ? 'This room is full.' : null;
        body = (
            <main className="screen form">
                <div className="hud">
                    <span className="sp" />
                    <AudioToggles />
                </div>
                <Logo />
                {/* Whose room this is, before anything else. */}
                <div className="invite">
                    {invite ? (
                        <>
                            <Avatar name={invite.host} color={BUSINESS_LOBBY_COLOR} size="lg" />
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
                            <input type="text" value={name} maxLength={14} placeholder="Type your name" onChange={(e) => setName(e.target.value)} />
                        </label>
                        <GButton
                            tone="green"
                            size="big"
                            disabled={!name.trim() || !online}
                            onClick={() => {
                                saveProfile({ name: name.trim() });
                                join(name.trim());
                            }}
                        >
                            Join {invite ? `${invite.host}'s room` : 'room'}
                        </GButton>
                    </>
                )}
                {menuLink}
                <Tips />
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
        body = <Lobby room={room} homeHref={homeHref} onStart={start} onConfigure={configure} onKick={kick} onTeam={setTeam} onClose={close} />;
    } else {
        body = <Table room={room} send={send} clockOffset={clockOffset} online={online} rtt={rtt} homeHref={homeHref} onPause={pause} onClose={close} />;
    }

    return (
        <>
            <GameToasts />
            {body}
            {count !== null && (
                <div className="countdown" role="status" aria-live="assertive">
                    <b key={count}>{count > 0 ? count : 'Go!'}</b>
                    <span>Colours are dealt. Get ready.</span>
                </div>
            )}
        </>
    );
}
