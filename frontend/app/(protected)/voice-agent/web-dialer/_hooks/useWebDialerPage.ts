import { useEffect, useRef, useState } from 'react';
import { listWebPhoneNumbers, startWebPhoneCall, type WebPhoneNumber } from '@/app/actions/voice-web-phone-actions';
import { numberProviderInfo } from '@/helpers/voice-number-providers';
import { describeCallEnd, describeMicError, NEEDS_COUNTRY_CODE, toE164 } from '@/helpers/voice-web-phone';
import { placeBrowserCall, type BrowserCall, type BrowserCallEnd } from '../_utils/browser-call';

/** idle → starting (microphone, sign-in) → ringing → active → idle. */
export type WebPhonePhase = 'idle' | 'starting' | 'ringing' | 'active';

export type UseWebDialerPageReturn = {
    /** null while loading. */
    numbers: WebPhoneNumber[] | null;
    numberId: string;
    setNumberId: (id: string) => void;
    dialed: string;
    setDialed: (value: string) => void;
    /** Keys pressed during the call (sent as tones). */
    tones: string;
    phase: WebPhonePhase;
    /** Seconds since the other side answered. */
    seconds: number;
    muted: boolean;
    error: string | null;
    pressKey: (key: string) => void;
    backspace: () => void;
    call: () => Promise<void>;
    hangup: () => void;
    toggleMute: () => void;
};

export function useWebDialerPage(): UseWebDialerPageReturn {
    const [numbers, setNumbers] = useState<WebPhoneNumber[] | null>(null);
    const [numberId, setNumberId] = useState('');
    const [dialed, setDialed] = useState('');
    const [tones, setTones] = useState('');
    const [phase, setPhase] = useState<WebPhonePhase>('idle');
    const [answeredAt, setAnsweredAt] = useState<number | null>(null);
    const [now, setNow] = useState(() => Date.now());
    const [muted, setMuted] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const callRef = useRef<BrowserCall | null>(null);
    /** The owner hung up (or left the page): no "why it ended" message, and a call still starting is dropped. */
    const hungUpRef = useRef(false);

    useEffect(() => {
        void listWebPhoneNumbers().then((res) => {
            if (!res.success) {
                setError(res.error ?? 'Could not load your numbers');
                setNumbers([]);
                return;
            }
            const list = res.data ?? [];
            setNumbers(list);
            setNumberId(list.find((n) => !n.problem)?.id ?? '');
        });
        return () => {
            hungUpRef.current = true;
            callRef.current?.hangup();
        };
    }, []);

    useEffect(() => {
        if (answeredAt === null) return;
        const timer = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(timer);
    }, [answeredAt]);

    const number = numbers?.find((n) => n.id === numberId) ?? null;

    function ended(end: BrowserCallEnd) {
        callRef.current = null;
        setPhase('idle');
        setAnsweredAt(null);
        setMuted(false);
        if (!hungUpRef.current && number) {
            setError(end.error ?? describeCallEnd({ providerLabel: numberProviderInfo(number.provider).label, ...end }));
        }
    }

    async function call() {
        const to = toE164(dialed);
        if (!number || phase !== 'idle') return;
        if (!to) {
            setError(NEEDS_COUNTRY_CODE);
            return;
        }
        setError(null);
        setTones('');
        hungUpRef.current = false;
        setPhase('starting');
        try {
            // Asked first, so the browser's microphone prompt shows before anything is set up.
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            stream.getTracks().forEach((track) => track.stop());
        } catch (micError) {
            setPhase('idle');
            setError(describeMicError(micError));
            return;
        }
        try {
            const res = await startWebPhoneCall(number.id, to);
            if (!res.success || !res.data) throw new Error(res.error ?? 'Could not start the call');
            if (hungUpRef.current) {
                setPhase('idle');
                return;
            }
            const placed = await placeBrowserCall(res.data, to, {
                onRinging: () => setPhase((p) => (p === 'active' ? p : 'ringing')),
                onAnswered: () => {
                    setPhase('active');
                    setAnsweredAt(Date.now());
                    setNow(Date.now());
                },
                onEnded: ended,
            });
            callRef.current = placed;
            if (hungUpRef.current) placed.hangup();
        } catch (callError) {
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

    function pressKey(key: string) {
        if (phase === 'idle') {
            setDialed((prev) => prev + key);
            return;
        }
        callRef.current?.sendDigit(key);
        setTones((prev) => prev + key);
    }

    return {
        numbers,
        numberId,
        setNumberId,
        dialed,
        setDialed: (value) => setDialed(value.replace(/[^\d+\-() ]/g, '')),
        tones,
        phase,
        seconds: answeredAt === null ? 0 : Math.floor((now - answeredAt) / 1000),
        muted,
        error,
        pressKey,
        backspace: () => setDialed((prev) => prev.slice(0, -1)),
        call,
        hangup,
        toggleMute,
    };
}
