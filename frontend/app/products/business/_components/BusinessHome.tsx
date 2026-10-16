'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
    BUSINESS_MATCH_MINUTES,
    BUSINESS_MISS_LIMITS,
    BUSINESS_RULES,
} from '@aixellabs/backend/business/constants';
import { cn } from '@/lib/utils';
import {
    clampName,
    createRoomRequest,
    forgetLastRoom,
    gameBasePath,
    loadLastRoom,
    loadProfile,
    loadSeenUpdate,
    peekRoomRequest,
    saveProfile,
    saveSeat,
    saveSeenUpdate,
} from '../_lib/client';
import type { BusinessRoomSummary } from '@aixellabs/backend/business/types';
import { BUSINESS_UPDATES, LATEST_UPDATE, type BusinessUpdate } from '../_lib/whats-new';
import { GameToasts, notify } from '../_lib/toast';
import { AudioToggles, Choices, GButton, Logo, minutesLabel, missLabel, Stepper, Tips } from './bits';
import { useBusinessServerWsUrl } from './BusinessConfig';
import { InstallApp } from './InstallApp';
import { PendingLink, Spinner } from './Loading';
import { WhatsNew } from './WhatsNew';

/** First screen: your name, then either host a room or join one. Fits one phone screen. */
export function BusinessHome() {
    const router = useRouter();
    const base = gameBasePath(usePathname());
    const serverUrl = useBusinessServerWsUrl();
    const [mode, setMode] = useState<'create' | 'join'>('create');
    const [name, setName] = useState('');
    const [seats, setSeats] = useState(4);
    const [minutes, setMinutes] = useState<number>(45);
    const [missLimit, setMissLimit] = useState<number>(BUSINESS_RULES.DEFAULT_MISS_LIMIT);
    const [code, setCode] = useState('');
    const [busy, setBusy] = useState(false);

    /** News to show: what a returning player has not seen yet, or everything when they ask for it. */
    const [news, setNews] = useState<readonly BusinessUpdate[] | null>(null);
    /** A room this browser still holds a seat in, while its match is still on. */
    const [lastRoom, setLastRoom] = useState<BusinessRoomSummary | null>(null);

    useEffect(() => {
        const profile = loadProfile();
        if (profile) setName(profile.name);
        // A returning player is told what changed since their last visit. A first-time player has
        // nothing to compare with: the game as it stands is simply the game.
        const seen = loadSeenUpdate();
        if (profile && (seen ?? 0) < LATEST_UPDATE) setNews(BUSINESS_UPDATES.filter((update) => update.id > (seen ?? 0)));
        else saveSeenUpdate(LATEST_UPDATE);
    }, []);

    useEffect(() => {
        const code = loadLastRoom();
        if (!code) return;
        // Offer the way back only while the room is really there and its match has not ended.
        peekRoomRequest(serverUrl, code).then((summary) => (summary.over ? forgetLastRoom() : setLastRoom(summary)), forgetLastRoom);
    }, [serverUrl]);

    const ready = name.trim().length > 0;

    const create = async () => {
        setBusy(true);
        try {
            saveProfile({ name: name.trim() });
            const res = await createRoomRequest(serverUrl, { t: 'create', name: name.trim(), seats, minutes, missLimit });
            saveSeat(res.code, { token: res.token, seat: res.seat });
            router.push(`${base}/${res.code}`);
        } catch (err) {
            notify(err instanceof Error ? err.message : 'Could not create the room.', 'error');
            setBusy(false);
        }
    };



    return (
        <main className="screen form">
            <GameToasts />
            <div className="hud">
                <span className="sp" />
                <AudioToggles />
            </div>
            <Logo />
            {lastRoom && (
                <div className="banner info">
                    <span>
                        {lastRoom.started ? `Your match in ${lastRoom.host}'s room is still on.` : `You have a seat in ${lastRoom.host}'s room.`} Room {lastRoom.code}.
                    </span>
                    <PendingLink href={`${base}/${lastRoom.code}`} className="sm gold">
                        {lastRoom.started ? 'Rejoin' : 'Back to it'}
                    </PendingLink>
                </div>
            )}
            <label className="field">
                Your name
                <input type="text" value={name} placeholder="Type your name" onChange={(e) => setName(clampName(e.target.value, BUSINESS_RULES.NAME_MAX))} />
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
                        <Stepper value={seats} min={BUSINESS_RULES.MIN_SEATS} max={BUSINESS_RULES.MAX_SEATS} onChange={setSeats} />
                    </div>
                    <div className="row">
                        <span>Match length</span>
                    </div>
                    <Choices options={BUSINESS_MATCH_MINUTES} value={minutes as (typeof BUSINESS_MATCH_MINUTES)[number]} label={minutesLabel} onPick={setMinutes} />
                    <div className="row">
                        <span>Out after missing</span>
                    </div>
                    <Choices options={BUSINESS_MISS_LIMITS} value={missLimit as (typeof BUSINESS_MISS_LIMITS)[number]} label={missLabel} onPick={setMissLimit} />
                    <GButton tone="green" size="big" disabled={!ready || busy || mode !== 'create'} onClick={create}>
                        {busy && <Spinner className="sm" />}
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
                    {ready && code.length === 6 && mode === 'join' ? (
                        <PendingLink href={`${base}/${code}`} className="big green" onClick={() => saveProfile({ name: name.trim() })}>
                            Join
                        </PendingLink>
                    ) : (
                        <GButton tone="green" size="big" disabled>
                            Join
                        </GButton>
                    )}
                </section>
            </div>
            <InstallApp />
            <button type="button" className="newslink" onClick={() => setNews(BUSINESS_UPDATES)}>
                What&apos;s new
            </button>
            <Tips />
            {news && (
                <WhatsNew
                    updates={news}
                    onClose={() => {
                        saveSeenUpdate(LATEST_UPDATE);
                        setNews(null);
                    }}
                />
            )}
        </main>
    );
}
