'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
    BUSINESS_MATCH_MINUTES,
    BUSINESS_MISS_LIMITS,
    BUSINESS_RULES,
} from '@aixellabs/backend/business/constants';
import { cn } from '@/lib/utils';
import { createRoomRequest, gameBasePath, loadProfile, saveProfile, saveSeat } from '../_lib/client';
import { GameToasts, notify } from '../_lib/toast';
import { AudioToggles, Choices, GButton, Logo, minutesLabel, missLabel, Stepper, Tips } from './bits';
import { useBusinessServerWsUrl } from './BusinessConfig';

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

    useEffect(() => {
        const profile = loadProfile();
        if (profile) setName(profile.name);
    }, []);

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
            <Logo />
            <label className="field">
                Your name
                <input type="text" value={name} maxLength={14} placeholder="Type your name" onChange={(e) => setName(e.target.value)} />
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
                    <GButton tone="green" size="big" disabled={!ready || code.length !== 6 || mode !== 'join'} onClick={join}>
                        Join
                    </GButton>
                </section>
            </div>
            <Tips />
        </main>
    );
}
