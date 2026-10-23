'use client';

import { useEffect, useRef, useState } from 'react';
import { getWebPhoneSession, type WebPhoneNumber } from '@/app/actions/voice-web-phone-actions';
import { numberProviderInfo } from '@/helpers/voice-number-providers';
import { describeCallEnd, describeMicError, NEEDS_COUNTRY_CODE, toE164 } from '@/helpers/voice-web-phone';
import type { WebPhoneSession } from '@/server/voice-agent/web-phone';
import { placeBrowserCall, preloadBrowserPhone, type BrowserCall, type BrowserCallEnd } from '../_utils/browser-call';
import { webCallUsdPerMinute } from '../_utils/web-dialer';

export type WebDialerPageData = {
    numbers: WebPhoneNumber[];
    loadError: string | null;
};

/** idle → mic (the browser asks) → starting (sign-in) → ringing → active → idle. */
export type WebPhonePhase = 'idle' | 'mic' | 'starting' | 'ringing' | 'active';

/** The phone's bottom tabs. */
export type WebDialerTab = 'keypad' | 'recents';

/** The last call, shown once it ends. */
export type FinishedCall = { to: string; seconds: number; usd: number | null };

/** Kept in this browser only. */
const LAST_NUMBER_KEY = 'web-dialer-number';
const RECENTS_KEY = 'web-dialer-recent';
const RECENTS_SHOWN = 5;
/** A signed-in session is reused this long (Twilio tokens last an hour, Telnyx's a day). */
const SESSION_REUSE_MS = 30 * 60 * 1000;

function readStored(key: string): string | null {
    try {
        return window.localStorage.getItem(key);
    } catch {
        return null;
    }
}

function store(key: string, value: string) {
    try {
        window.localStorage.setItem(key, value);
    } catch {
        // private window or storage blocked: nothing is remembered
    }
}

/** Keeps what a dialled number can hold, so a pasted "Call +1 (415) 555-0123!" becomes "+1 (415) 555-0123". */
const cleanDialed = (value: string) => value.replace(/[^\d+\-() ]/g, '').trimStart();

export function useWebDialerPage(data: WebDialerPageData) {
    const { numbers, loadError } = data;
    const usable = numbers.filter((n) => !n.problem);
    const [numberId, setNumberIdState] = useState(usable[0]?.id ?? '');
    const [dialed, setDialedState] = useState('');
    const [tab, setTab] = useState<WebDialerTab>('keypad');
    const [recents, setRecents] = useState<string[]>([]);
    const [tones, setTones] = useState('');
    const [keypadOpen, setKeypadOpen] = useState(false);
    const [phase, setPhase] = useState<WebPhonePhase>('idle');
    const [answeredAt, setAnsweredAt] = useState<number | null>(null);
    const [now, setNow] = useState(() => Date.now());
    const [muted, setMuted] = useState(false);
    const [micBlocked, setMicBlocked] = useState(false);
    const [finished, setFinished] = useState<FinishedCall | null>(null);
    const [error, setError] = useState<string | null>(loadError);
    const callRef = useRef<BrowserCall | null>(null);
    /** The owner hung up (or left the page): no "why it ended" message, and a call still starting is dropped. */
    const hungUpRef = useRef(false);
    /** The browser's sign-in for a number, asked for as soon as a number is being dialled so Call starts at once. */
    const sessionRef = useRef<{ numberId: string; at: number; session: Promise<WebPhoneSession> } | null>(null);
    /** The page-wide key handler, swapped each render so it sees the current state. */
    const keyRef = useRef<(e: KeyboardEvent) => void>(() => {});

    const number = numbers.find((n) => n.id === numberId) ?? null;
    const to = toE164(dialed);
    const usdPerMinute = number ? webCallUsdPerMinute(number.provider, to) : null;

    useEffect(() => {
        const last = readStored(LAST_NUMBER_KEY);
        if (last && usable.some((n) => n.id === last)) setNumberIdState(last);
        try {
            const saved = JSON.parse(readStored(RECENTS_KEY) ?? '[]') as unknown;
            if (Array.isArray(saved)) setRecents(saved.filter((n): n is string => typeof n === 'string' && !!toE164(n)));
        } catch {
            // nothing usable saved
        }
        // Tell the owner up front when the browser already blocks the microphone.
        let status: PermissionStatus | null = null;
        const onChange = () => setMicBlocked(status?.state === 'denied');
        navigator.permissions
            ?.query({ name: 'microphone' as PermissionName })
            .then((s) => {
                status = s;
                onChange();
                s.addEventListener('change', onChange);
            })
            .catch(() => {});
        const onKey = (e: KeyboardEvent) => keyRef.current(e);
        window.addEventListener('keydown', onKey);
        return () => {
            window.removeEventListener('keydown', onKey);
            status?.removeEventListener('change', onChange);
            hungUpRef.current = true;
            callRef.current?.hangup();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on mount
    }, []);

    useEffect(() => {
        if (answeredAt === null) return;
        const timer = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(timer);
    }, [answeredAt]);

    function session(id: string): Promise<WebPhoneSession> {
        const cached = sessionRef.current;
        if (cached?.numberId === id && Date.now() - cached.at < SESSION_REUSE_MS) return cached.session;
        const fresh = getWebPhoneSession(id).then((res) => {
            if (!res.success || !res.data) throw new Error(res.error ?? 'Could not start the call');
            return res.data;
        });
        sessionRef.current = { numberId: id, at: Date.now(), session: fresh };
        // A failed sign-in is asked for again on Call, which shows why.
        fresh.catch(() => {
            if (sessionRef.current?.session === fresh) sessionRef.current = null;
        });
        return fresh;
    }

    // Warm up as soon as a number is being dialled: the sign-in and the provider's phone code.
    const dialing = dialed.length > 0;
    useEffect(() => {
        if (!dialing || !number || number.problem) return;
        preloadBrowserPhone(number.provider);
        session(number.id).catch(() => {});
    }, [dialing, number]);

    function ended(end: BrowserCallEnd, seconds: number) {
        callRef.current = null;
        setPhase('idle');
        setAnsweredAt(null);
        setMuted(false);
        setKeypadOpen(false);
        // A call that failed may have failed on its sign-in: the next one signs in again.
        if (end.error || !end.answered) sessionRef.current = null;
        if (!number || !to) return;
        setFinished({
            to,
            seconds,
            usd: end.answered && usdPerMinute !== null ? Math.ceil(seconds / 60) * usdPerMinute : null,
        });
        if (!hungUpRef.current) {
            setError(end.error ?? describeCallEnd({ providerLabel: numberProviderInfo(number.provider).label, ...end }));
        }
    }

    async function call() {
        if (!number || phase !== 'idle') return;
        if (!to) {
            setError(NEEDS_COUNTRY_CODE);
            return;
        }
        setError(null);
        setFinished(null);
        setTones('');
        hungUpRef.current = false;
        const nextRecents = [to, ...recents.filter((n) => n !== to)].slice(0, RECENTS_SHOWN);
        setRecents(nextRecents);
        store(RECENTS_KEY, JSON.stringify(nextRecents));
        setPhase('mic');
        try {
            // Asked first, so the browser's microphone prompt shows before anything is set up.
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            stream.getTracks().forEach((track) => track.stop());
            setMicBlocked(false);
        } catch (micError) {
            setPhase('idle');
            setError(describeMicError(micError));
            return;
        }
        setPhase('starting');
        try {
            const signedIn = await session(number.id);
            if (hungUpRef.current) {
                setPhase('idle');
                return;
            }
            let answered: number | null = null;
            const placed = await placeBrowserCall(signedIn, to, {
                onRinging: () => setPhase((p) => (p === 'active' ? p : 'ringing')),
                onAnswered: () => {
                    answered = Date.now();
                    setPhase('active');
                    setAnsweredAt(answered);
                    setNow(answered);
                },
                onEnded: (end) => ended(end, answered === null ? 0 : Math.round((Date.now() - answered) / 1000)),
            });
            callRef.current = placed;
            if (hungUpRef.current) placed.hangup();
        } catch (callError) {
            sessionRef.current = null;
            setPhase('idle');
            if (!hungUpRef.current) setError(callError instanceof Error ? callError.message : 'Could not start the call');
        }
    }

    /** While the call is still starting, `call` drops it as soon as it can (the phase stays until then). */
    function hangup() {
        hungUpRef.current = true;
        callRef.current?.hangup();
    }

    function toggleMute() {
        callRef.current?.setMuted(!muted);
        setMuted(!muted);
    }

    /** Every edit of the number clears what the last call left on screen. */
    function editDialed(edit: (prev: string) => string) {
        setDialedState((prev) => cleanDialed(edit(prev)));
        setFinished(null);
        setError(null);
    }

    function pressKey(key: string) {
        if (phase === 'idle') {
            editDialed((prev) => prev + key);
            return;
        }
        callRef.current?.sendDigit(key);
        setTones((prev) => prev + key);
    }

    const backspace = () => editDialed((prev) => prev.trimEnd().slice(0, -1));

    // Typing works anywhere on the page, not only in the number box (which handles its own keys).
    keyRef.current = (e) => {
        const target = e.target instanceof Element ? e.target : null;
        if (e.metaKey || e.ctrlKey || e.altKey || target?.closest('input, textarea, [role="listbox"]')) return;
        if (/^[\d*#]$/.test(e.key) || (e.key === '+' && phase === 'idle')) {
            pressKey(e.key);
            setTab('keypad');
        } else if (e.key === 'Backspace' && phase === 'idle') backspace();
        else if (e.key === 'Enter' && phase === 'idle' && !target?.closest('button, a')) void call();
        else return;
        e.preventDefault();
    };

    function setNumberId(id: string) {
        setNumberIdState(id);
        store(LAST_NUMBER_KEY, id);
    }

    return {
        numbers,
        number,
        setNumberId,
        dialed,
        setDialed: (value: string) => editDialed(() => value),
        /** The dialled number in E.164, or null until it has a country code. */
        to,
        /** The chosen number's list rate a minute to `to`, or null when its provider publishes none. */
        usdPerMinute,
        recents,
        /** Puts a recent number on the keypad, ready to call. */
        redial: (value: string) => {
            editDialed(() => value);
            setTab('keypad');
        },
        tab,
        setTab,
        tones,
        keypadOpen,
        toggleKeypad: () => setKeypadOpen((open) => !open),
        phase,
        /** Seconds since the other side answered. */
        seconds: answeredAt === null ? 0 : Math.floor((now - answeredAt) / 1000),
        muted,
        micBlocked,
        finished,
        error,
        pressKey,
        backspace,
        call,
        hangup,
        toggleMute,
    };
}

export type UseWebDialerPageReturn = ReturnType<typeof useWebDialerPage>;
