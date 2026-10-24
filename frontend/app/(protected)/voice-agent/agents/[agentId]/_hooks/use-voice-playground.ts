'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { GEMINI_ALWAYS } from '@/helpers/voice-stack';
import { z } from 'zod';
import { getPlaygroundSocketUrl } from '@/app/actions/voice-agent-actions';
import { PlaygroundMic, PlaygroundSpeaker } from '../_utils/playground-audio';

export type PlaygroundStatus = 'idle' | 'connecting' | 'live' | 'ended' | 'error';

export type PlaygroundRole = 'agent' | 'caller';

/** A tool the agent ran mid-call, as the engine reports it when the tool finishes. */
export type PlaygroundToolRun = { name: string; arguments: Record<string, unknown>; result: string; ok: boolean };

export type PlaygroundTimelineItem =
    | { id: number; kind: 'message'; role: PlaygroundRole; text: string }
    | { id: number; kind: 'gap'; gapMs: number }
    | { id: number; kind: 'tool'; run: PlaygroundToolRun };

/** Text frames the engine sends on the playground socket. Binary frames are her audio. */
const playgroundEventSchema = z.discriminatedUnion('type', [
    z.object({ type: z.literal('clear') }),
    z.object({ type: z.literal('transcript'), role: z.enum(['agent', 'caller']), text: z.string() }),
    z.object({ type: z.literal('turn'), gapMs: z.number() }),
    z.object({ type: z.literal('ended'), reason: z.string() }),
    // The call could not run on the owner's Gemini key: none saved, or Google refused it.
    z.object({ type: z.literal('error'), code: z.string(), message: z.string().nullish() }),
    z.object({
        type: z.literal('tool'),
        name: z.string(),
        arguments: z.record(z.string(), z.unknown()).nullish(),
        result: z.unknown().optional(),
        ok: z.boolean().nullish(),
    }),
]);

function resultText(result: unknown): string {
    if (result == null) return '';
    if (typeof result === 'string') return result;
    try {
        return JSON.stringify(result);
    } catch {
        return String(result);
    }
}

/** The user pressed End call. */
export const PLAYGROUND_LOCAL_HANGUP = 'you_hung_up';

const LEVEL_REPAINT_MS = 80;

function parseEvent(raw: string): z.infer<typeof playgroundEventSchema> | null {
    try {
        const parsed = playgroundEventSchema.safeParse(JSON.parse(raw));
        return parsed.success ? parsed.data : null;
    } catch {
        return null;
    }
}

/** Streaming transcripts arrive in pieces; join them without doubling or losing spaces. */
function joinTranscript(previous: string, next: string): string {
    if (!previous) return next.trimStart();
    if (/\s$/.test(previous) || /^[\s,.!?;:'’)]/.test(next)) return previous + next;
    return `${previous} ${next}`;
}

/** The engine's `error` event in plain words. */
function describeEngineError(code: string, message: string | null | undefined): string {
    if (code === 'gemini_key_missing')
        return `Add a Gemini API key in Settings: ${GEMINI_ALWAYS}.`;
    if (code === 'gemini_key_invalid') return `Google refused your Gemini API key${message ? `: ${message}` : '.'}`;
    return message || 'The voice engine could not start the call.';
}

/** A close the engine sent without an `ended` event first: a refusal or a failure, in plain words. */
function describeEngineClose(code: number, reason: string): string {
    const detail = reason ? ` (${reason})` : '';
    switch (code) {
        case 1008:
            return `The voice engine refused the call${detail}. Try again.`;
        case 1013:
            return `The voice engine is busy with other calls${detail}. Try again in a minute.`;
        case 1011:
            return `The voice engine hit a server error${detail}. Try again shortly.`;
        default:
            return `The call dropped${detail || ` (code ${code})`}.`;
    }
}

export function median(values: number[]): number | null {
    if (values.length === 0) return null;
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
}

type UseVoicePlaygroundOptions = {
    agentId: string;
    /** Runs before anything else on Start (e.g. save unsaved edits). Return false to cancel. */
    beforeStart?: () => Promise<boolean>;
};

/**
 * A browser call to the voice engine: mic up as 16 kHz PCM, her voice down as 24 kHz PCM, plus
 * transcript / turn-gap / clear / tool / ended events. Everything is torn down on end and on unmount.
 */
export function useVoicePlayground({ agentId, beforeStart }: UseVoicePlaygroundOptions) {
    const [status, setStatus] = useState<PlaygroundStatus>('idle');
    const [error, setError] = useState<string | null>(null);
    /** The error is about the owner's Gemini key (the page links to it). */
    const [keyError, setKeyError] = useState(false);
    const [endedReason, setEndedReason] = useState<string | null>(null);
    const [timeline, setTimeline] = useState<PlaygroundTimelineItem[]>([]);
    const [gaps, setGaps] = useState<number[]>([]);
    const [level, setLevel] = useState(0);
    const [agentSpeaking, setAgentSpeaking] = useState(false);

    const wsRef = useRef<WebSocket | null>(null);
    const micRef = useRef<PlaygroundMic | null>(null);
    const speakerRef = useRef<PlaygroundSpeaker | null>(null);
    const levelRef = useRef(0);
    const levelTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const nextIdRef = useRef(0);
    /** Bumped on every start/teardown so callbacks from an older call do nothing. */
    const callRef = useRef(0);

    const teardown = useCallback(() => {
        callRef.current += 1;
        const ws = wsRef.current;
        wsRef.current = null;
        if (ws) {
            ws.onopen = null;
            ws.onmessage = null;
            ws.onerror = null;
            ws.onclose = null;
            if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) ws.close(1000);
        }
        micRef.current?.close();
        micRef.current = null;
        speakerRef.current?.close();
        speakerRef.current = null;
        if (levelTimerRef.current) clearInterval(levelTimerRef.current);
        levelTimerRef.current = null;
        levelRef.current = 0;
        setLevel(0);
        setAgentSpeaking(false);
    }, []);

    useEffect(() => teardown, [teardown]);

    const finish = useCallback(
        (reason: string) => {
            teardown();
            setEndedReason(reason);
            setStatus('ended');
        },
        [teardown],
    );

    const fail = useCallback(
        (message: string) => {
            teardown();
            setError(message);
            setStatus('error');
        },
        [teardown],
    );

    const append = useCallback((role: PlaygroundRole, text: string) => {
        if (!text) return;
        setTimeline((items) => {
            const last = items[items.length - 1];
            if (last?.kind === 'message' && last.role === role) {
                return [...items.slice(0, -1), { ...last, text: joinTranscript(last.text, text) }];
            }
            return [...items, { id: nextIdRef.current++, kind: 'message', role, text: text.trim() }];
        });
    }, []);

    const onEngineText = useCallback(
        (raw: string) => {
            const event = parseEvent(raw);
            if (!event) return;
            switch (event.type) {
                case 'clear':
                    speakerRef.current?.clear();
                    break;
                case 'transcript':
                    append(event.role, event.text);
                    break;
                case 'turn': {
                    const gapMs = Math.round(event.gapMs);
                    setGaps((g) => [...g, gapMs]);
                    setTimeline((items) => [...items, { id: nextIdRef.current++, kind: 'gap', gapMs }]);
                    break;
                }
                case 'tool': {
                    const run: PlaygroundToolRun = {
                        name: event.name,
                        arguments: event.arguments ?? {},
                        result: resultText(event.result),
                        ok: event.ok ?? false,
                    };
                    setTimeline((items) => [...items, { id: nextIdRef.current++, kind: 'tool', run }]);
                    break;
                }
                case 'ended':
                    finish(event.reason);
                    break;
                case 'error':
                    setKeyError(event.code.startsWith('gemini_key'));
                    fail(describeEngineError(event.code, event.message));
                    break;
            }
        },
        [append, fail, finish],
    );

    const start = useCallback(async () => {
        if (status === 'connecting' || status === 'live') return;
        teardown();
        const call = callRef.current;
        const stale = () => call !== callRef.current;

        setStatus('connecting');
        setError(null);
        setKeyError(false);
        setEndedReason(null);
        setTimeline([]);
        setGaps([]);

        if (beforeStart && !(await beforeStart())) {
            if (!stale()) setStatus('idle');
            return;
        }
        if (stale()) return;

        const mic = new PlaygroundMic();
        micRef.current = mic;
        try {
            await mic.open();
        } catch (e) {
            mic.close();
            if (stale()) return;
            const denied = e instanceof DOMException && e.name === 'NotAllowedError';
            fail(
                denied
                    ? 'Microphone access was blocked. Allow it in the browser and try again.'
                    : 'No microphone available.',
            );
            return;
        }
        // Ended while the permission prompt was open: `teardown` ran before the stream existed.
        if (stale()) {
            mic.close();
            return;
        }

        const speaker = new PlaygroundSpeaker((playing) => {
            if (!stale()) setAgentSpeaking(playing);
        });
        speaker.open();
        speakerRef.current = speaker;

        // The token lives 120 s: mint it only now, right before connecting.
        const response = await getPlaygroundSocketUrl(agentId);
        if (stale()) return;
        if (!response.success || !response.data) {
            fail(response.error ?? 'Could not start the call.');
            return;
        }

        let ws: WebSocket;
        try {
            ws = new WebSocket(response.data.url);
        } catch {
            fail('Could not reach the voice engine.');
            return;
        }
        ws.binaryType = 'arraybuffer';
        wsRef.current = ws;
        let opened = false;

        ws.onopen = () => {
            if (stale()) return;
            opened = true;
            setStatus('live');
            mic.connect(({ pcm, rms }) => {
                if (ws.readyState === WebSocket.OPEN) ws.send(pcm);
                levelRef.current = rms;
            });
            levelTimerRef.current = setInterval(() => setLevel(levelRef.current), LEVEL_REPAINT_MS);
        };
        ws.onmessage = (event: MessageEvent<ArrayBuffer | string>) => {
            if (stale()) return;
            if (typeof event.data === 'string') onEngineText(event.data);
            else speakerRef.current?.play(event.data);
        };
        ws.onerror = () => {
            // `onclose` always follows with the details.
        };
        ws.onclose = (event) => {
            if (stale()) return;
            if (!opened) fail('Could not reach the voice engine.');
            else if (event.code === 1000 || event.code === 1001) finish('connection_closed');
            // The engine accepts first and refuses with a close (1008 token / agent, 1013 busy, 1011 database).
            else fail(describeEngineClose(event.code, event.reason));
        };
    }, [agentId, beforeStart, fail, finish, onEngineText, status, teardown]);

    const end = useCallback(() => finish(PLAYGROUND_LOCAL_HANGUP), [finish]);

    return {
        status,
        error,
        keyError,
        endedReason,
        timeline,
        gaps,
        level,
        agentSpeaking,
        start,
        end,
    };
}

export type UseVoicePlaygroundReturn = ReturnType<typeof useVoicePlayground>;
