'use client';

import { useEffect, useRef, useState } from 'react';
import { placeTestCall } from '@/app/actions/voice-number-actions';
import { getBrowserTestSession } from '@/app/actions/voice-softphone-actions';
import {
    placeBrowserCall,
    waitForBrowserCall,
    type BrowserCall,
    type BrowserCallEnd,
    type BrowserCallEvents,
    type IncomingBrowserCall,
} from '@/helpers/voice-browser-call';
import { describeCallEnd, describeMicError } from '@/helpers/voice-web-phone';

/** idle → mic (the browser asks) → starting (sign-in) → waiting (for the agent's call) / ringing → active → idle. */
export type BrowserTestPhase = 'idle' | 'mic' | 'starting' | 'waiting' | 'ringing' | 'active';

/** What placeTestCall takes as `to` to ring this browser (BROWSER_TARGET on the server). */
const BROWSER_TARGET = 'browser';
/** The agent's call should ring within seconds of Telnyx taking it. */
const WAIT_FOR_AGENT_MS = 45_000;

/** A test call between this browser and an agent, either way, over WebRTC (port 443: no network blocks it). */
export function useBrowserTestCall(agentId: string) {
    const [phase, setPhase] = useState<BrowserTestPhase>('idle');
    const [incoming, setIncoming] = useState<IncomingBrowserCall | null>(null);
    const [answeredAt, setAnsweredAt] = useState<number | null>(null);
    const [now, setNow] = useState(() => Date.now());
    const [muted, setMuted] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const callRef = useRef<BrowserCall | null>(null);
    /** The owner hung up (or closed the panel): no "why it ended", and a call still starting is dropped. */
    const hungUpRef = useRef(false);
    const phaseRef = useRef(phase);
    phaseRef.current = phase;

    useEffect(() => {
        if (answeredAt === null) return;
        const timer = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(timer);
    }, [answeredAt]);

    useEffect(
        () => () => {
            hungUpRef.current = true;
            callRef.current?.hangup();
        },
        [],
    );

    const events: BrowserCallEvents = {
        onRinging: () => setPhase((p) => (p === 'active' ? p : 'ringing')),
        onAnswered: () => {
            setIncoming(null);
            setPhase('active');
            setAnsweredAt(Date.now());
            setNow(Date.now());
        },
        onEnded: (end: BrowserCallEnd) => {
            callRef.current = null;
            setPhase('idle');
            setIncoming(null);
            setAnsweredAt(null);
            setMuted(false);
            if (!hungUpRef.current) setError(end.error ?? describeCallEnd({ providerLabel: 'Telnyx', ...end }));
        },
    };

    /** The microphone, then the browser's sign-in on `numberId`; false (and why) when either fails. */
    async function start(numberId: string) {
        setError(null);
        hungUpRef.current = false;
        setPhase('mic');
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            stream.getTracks().forEach((track) => track.stop());
        } catch (micError) {
            setPhase('idle');
            setError(describeMicError(micError));
            return null;
        }
        setPhase('starting');
        const res = await getBrowserTestSession(numberId);
        if (!res.success || !res.data || hungUpRef.current) {
            setPhase('idle');
            if (!hungUpRef.current) setError(res.error ?? 'Could not sign this browser in');
            return null;
        }
        return res.data;
    }

    function failed(reason: unknown) {
        callRef.current?.hangup();
        callRef.current = null;
        setPhase('idle');
        if (!hungUpRef.current) setError(reason instanceof Error ? reason.message : String(reason));
    }

    /** Inbound agent: this browser dials its SIP address, like a customer calling the number. */
    async function callAgent(numberId: string, address: string) {
        const session = await start(numberId);
        if (!session) return;
        try {
            callRef.current = await placeBrowserCall(session, address, events);
            if (hungUpRef.current) callRef.current.hangup();
        } catch (reason) {
            failed(reason);
        }
    }

    /** Outbound agent: this browser signs in and waits, then the agent calls it from `numberId`. */
    async function callMe(numberId: string) {
        const session = await start(numberId);
        if (!session) return;
        try {
            callRef.current = await waitForBrowserCall(session, { ...events, onIncoming: setIncoming });
            if (hungUpRef.current) return callRef.current.hangup();
            setPhase('waiting');
            const res = await placeTestCall(numberId, BROWSER_TARGET, agentId, {});
            if (!res.success) return failed(res.error ?? 'Could not start the call');
            setTimeout(() => {
                if (phaseRef.current === 'waiting') failed('The call did not reach this browser. Try again in a moment.');
            }, WAIT_FOR_AGENT_MS);
        } catch (reason) {
            failed(reason);
        }
    }

    return {
        phase,
        incoming,
        seconds: answeredAt === null ? 0 : Math.floor((now - answeredAt) / 1000),
        muted,
        error,
        callAgent,
        callMe,
        hangup: () => {
            hungUpRef.current = true;
            callRef.current?.hangup();
        },
        toggleMute: () => {
            callRef.current?.setMuted(!muted);
            setMuted(!muted);
        },
    };
}

export type UseBrowserTestCallReturn = ReturnType<typeof useBrowserTestCall>;
