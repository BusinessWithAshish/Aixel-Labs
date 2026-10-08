'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
    BLUFF_DEFAULT_MISS_LIMIT,
    BLUFF_DEFAULT_TURN_SECONDS,
    BLUFF_MISS_LIMITS,
    BLUFF_RULES,
    BLUFF_TURN_SECONDS,
} from '@aixellabs/backend/bluff/constants';
import { cn } from '@/lib/utils';
import { AudioToggles, Choices, GButton, missLabel, Stepper } from '../../business/_components/bits';
import { useBusinessServerWsUrl } from '../../business/_components/BusinessConfig';
import { clampName, loadProfile, saveProfile } from '../../business/_lib/client';
import { GameToasts, notify } from '../../business/_lib/toast';
import { createRoomRequest, forgetLastRoom, gameBasePath, loadLastRoom, peekRoomRequest, saveSeat } from '../_lib/client';
import { InstallApp } from '../../business/_components/InstallApp';
import { BluffLogo, BluffTips, secondsLabel } from './bits';

/** First screen: your name, then either host a room or join one. Fits one phone screen. */
export function BluffHome() {
    const router = useRouter();
    const base = gameBasePath(usePathname());
    const serverUrl = useBusinessServerWsUrl();
    const [mode, setMode] = useState<'create' | 'join'>('create');
    const [name, setName] = useState('');
    const [seats, setSeats] = useState(4);
    const [turnSeconds, setTurnSeconds] = useState<number>(BLUFF_DEFAULT_TURN_SECONDS);
    const [missLimit, setMissLimit] = useState<number>(BLUFF_DEFAULT_MISS_LIMIT);
    const [code, setCode] = useState('');
    const [busy, setBusy] = useState(false);
    /** A room this browser still holds a seat in, if that room is still open. */
    const [lastRoom, setLastRoom] = useState<string | null>(null);

    useEffect(() => {
        const profile = loadProfile();
        if (profile) setName(profile.name);
    }, []);

    useEffect(() => {
        const last = loadLastRoom();
        if (!last) return;
        // Offer the way back only while the room is really there.
        peekRoomRequest(serverUrl, last).then(() => setLastRoom(last), forgetLastRoom);
    }, [serverUrl]);

    const ready = name.trim().length > 0;

    const create = async () => {
        setBusy(true);
        try {
            saveProfile({ name: name.trim() });
            const res = await createRoomRequest(serverUrl, {
                t: 'create',
                name: name.trim(),
                seats,
                turnSeconds,
                missLimit,
            });
            saveSeat(res.code, { token: res.token, seat: res.seat });
            router.push(`${base}/${res.code}`);
        } catch (err) {
            notify(err instanceof Error ? err.message : 'Could not create the room.', 'error');
            setBusy(false);
        }
    };

    const join = () => {
        saveProfile({ name: name.trim() });
        router.push(`${base}/${code.trim().toUpperCase()}`);
    };

    return (
        <main className="screen form">
            <GameToasts />
            <div className="hud">
                <span className="sp" />
                <AudioToggles />
            </div>
            <BluffLogo />
            {lastRoom && (
                <div className="banner info">
                    <span>You still have a seat in room {lastRoom}.</span>
                    <GButton size="sm" tone="gold" onClick={() => router.push(`${base}/${lastRoom}`)}>
                        Back to it
                    </GButton>
                </div>
            )}
            <label className="field">
                Your name
                <input
                    type="text"
                    value={name}
                    placeholder="Type your name"
                    onChange={(e) => setName(clampName(e.target.value, BLUFF_RULES.NAME_MAX))}
                />
            </label>

            <div className="seg two">
                <GButton tone="gold" className={mode === 'create' ? undefined : 'off'} onClick={() => setMode('create')}>
                    Create room
                </GButton>
                <GButton tone="gold" className={mode === 'join' ? undefined : 'off'} onClick={() => setMode('join')}>
                    Join room
                </GButton>
            </div>

            {/* Both panels share one grid cell, so switching tabs never changes the height. */}
            <div className="swap">
                <section className={cn('panel', mode !== 'create' && 'hid')} aria-hidden={mode !== 'create'}>
                    <div className="row">
                        <span>Seats</span>
                        <Stepper value={seats} min={BLUFF_RULES.MIN_SEATS} max={BLUFF_RULES.MAX_SEATS} onChange={setSeats} />
                    </div>
                    <div className="row">
                        <span>Turn time</span>
                    </div>
                    <Choices
                        options={BLUFF_TURN_SECONDS}
                        value={turnSeconds as (typeof BLUFF_TURN_SECONDS)[number]}
                        label={secondsLabel}
                        onPick={setTurnSeconds}
                    />
                    <div className="row">
                        <span>Out after missing</span>
                    </div>
                    <Choices
                        options={BLUFF_MISS_LIMITS}
                        value={missLimit as (typeof BLUFF_MISS_LIMITS)[number]}
                        label={missLabel}
                        onPick={setMissLimit}
                    />
                    <GButton tone="green" size="big" disabled={!ready || busy || mode !== 'create'} onClick={create}>
                        {busy ? 'Creating…' : 'Create'}
                    </GButton>
                </section>
                <section className={cn('panel', mode !== 'join' && 'hid')} aria-hidden={mode !== 'join'}>
                    <label className="field">
                        Room code from your host
                        <input
                            type="text"
                            className="code"
                            value={code}
                            maxLength={6}
                            placeholder="ABC123"
                            autoCapitalize="characters"
                            tabIndex={mode === 'join' ? 0 : -1}
                            onChange={(e) => setCode(e.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase())}
                        />
                    </label>
                    <p className="small">Ask your host for the 6-character code, or open the invite link they sent.</p>
                    <span style={{ flex: 1 }} />
                    <GButton
                        tone="green"
                        size="big"
                        disabled={!ready || code.length !== 6 || mode !== 'join'}
                        onClick={join}
                    >
                        Join
                    </GButton>
                </section>
            </div>
            <InstallApp />
            <BluffTips />
        </main>
    );
}
