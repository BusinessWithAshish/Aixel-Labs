'use client';

import Link from 'next/link';
import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { ArrowDown, AudioLines, Loader2, Mic, Phone, PhoneOff, Timer } from 'lucide-react';
import type { VoiceGeminiKeyView } from '@aixellabs/backend/db/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { usePage } from '@/contexts/PageStore';
import { cn } from '@/lib/utils';
import { ToolCallRow } from '../../../call-logs/_components/ToolCallRow';
import { GeminiKeyNotice } from '../../_components/GeminiKeyNotice';
import { GEMINI_KEY_URL } from '@/helpers/voice-routes';
import type { UseVoiceAgentEditorPageReturn } from '../_hooks/use-voice-agent-editor-page';
import {
    median,
    PLAYGROUND_LOCAL_HANGUP,
    useVoicePlayground,
    type PlaygroundStatus,
    type PlaygroundTimelineItem,
} from '../_hooks/use-voice-playground';

const STATUS_BADGE: Record<PlaygroundStatus, { label: string; variant: 'secondary' | 'green' | 'yellow' | 'red' }> = {
    idle: { label: 'Ready', variant: 'secondary' },
    connecting: { label: 'Connecting', variant: 'yellow' },
    live: { label: 'Live', variant: 'green' },
    ended: { label: 'Ended', variant: 'secondary' },
    error: { label: 'Failed', variant: 'red' },
};

const ENDED_REASONS: Record<string, string> = {
    [PLAYGROUND_LOCAL_HANGUP]: 'You ended the call.',
    caller_hung_up: 'You hung up.',
    goodbye: 'She said goodbye and hung up.',
    dnc: 'She ended it on a stop request.',
    abuse: 'She ended it after abuse.',
    connection_closed: 'The connection closed.',
    gemini_key_error: 'Google refused your Gemini API key, so the call ended.',
};

function describeEndedReason(reason: string): string {
    return ENDED_REASONS[reason] ?? `Call ended: ${reason.replace(/_/g, ' ')}.`;
}

function formatMs(ms: number | null | undefined): string {
    return ms == null ? '—' : `${ms.toLocaleString('en-US')} ms`;
}

type VoicePlaygroundProps = {
    /** The owner's Gemini API key: calls run on it, so there is no call without one. */
    geminiKey: VoiceGeminiKeyView;
    className?: string;
};

export function VoicePlayground({ geminiKey, className }: VoicePlaygroundProps) {
    const { agentId, saved, isDirty, isValid, saving, save } = usePage<UseVoiceAgentEditorPageReturn>();
    const { status, error, keyError, endedReason, timeline, gaps, level, agentSpeaking, start, end } = useVoicePlayground({
        agentId,
        beforeStart: save,
    });

    const busy = status === 'connecting' || status === 'live';
    const badge = STATUS_BADGE[status];

    return (
        <Card className={cn('h-auto min-w-0 gap-4', className)} data-testid="voice-playground">
            <CardHeader>
                <CardTitle>Playground</CardTitle>
                <CardDescription className="font-normal">
                    Talk to {saved.name} through your microphone, the way a business owner would hear the call. Calls use the
                    saved version of the agent.
                </CardDescription>
                <CardAction>
                    <Badge variant={badge.variant} data-testid="playground-status">
                        {badge.label}
                    </Badge>
                </CardAction>
            </CardHeader>

            <CardContent className="grid gap-4">
                <GeminiKeyNotice view={geminiKey} action="talk to your agents" />
                {isDirty && !busy ? (
                    <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
                        You have unsaved changes. Starting a call saves them first.
                    </p>
                ) : null}

                <div className="flex flex-wrap items-center gap-3">
                    {busy ? (
                        <Button variant="destructive" onClick={end}>
                            <PhoneOff className="size-4" />
                            End call
                        </Button>
                    ) : (
                        <Button onClick={() => void start()} disabled={!geminiKey.set || saving || (isDirty && !isValid)}>
                            <Phone className="size-4" />
                            {isDirty ? 'Save and start call' : 'Start call'}
                        </Button>
                    )}
                    {status === 'connecting' ? (
                        <span className="text-muted-foreground flex items-center gap-1.5 text-sm">
                            <Loader2 className="size-4 animate-spin" />
                            Connecting…
                        </span>
                    ) : null}
                    {status === 'live' ? (
                        <span
                            className={cn(
                                'flex items-center gap-1.5 text-sm transition-opacity',
                                agentSpeaking ? 'text-primary opacity-100' : 'text-muted-foreground opacity-60',
                            )}
                            data-testid="agent-speaking"
                            data-speaking={agentSpeaking}
                        >
                            <AudioLines className={cn('size-4', agentSpeaking && 'animate-pulse')} />
                            {agentSpeaking ? `${saved.name} is speaking` : 'Listening'}
                        </span>
                    ) : null}
                </div>

                <div className="flex items-center gap-2" aria-label="Microphone level">
                    <Mic className="text-muted-foreground size-4 shrink-0" />
                    <div className="bg-muted h-2 flex-1 overflow-hidden rounded-full">
                        <div
                            className="h-full rounded-full bg-emerald-500 transition-[width] duration-75 ease-linear"
                            style={{ width: `${Math.min(100, level * 400)}%` }}
                        />
                    </div>
                </div>

                <dl className="grid grid-cols-3 gap-2 rounded-lg border p-3 text-center">
                    <div>
                        <dt className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">Replies</dt>
                        <dd className="text-lg font-semibold tabular-nums" data-testid="playground-replies">
                            {gaps.length}
                        </dd>
                    </div>
                    <div>
                        <dt className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">Median gap</dt>
                        <dd className="text-lg font-semibold tabular-nums">{formatMs(median(gaps))}</dd>
                    </div>
                    <div>
                        <dt className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">Last gap</dt>
                        <dd className="text-lg font-semibold tabular-nums" data-testid="playground-last-gap">
                            {formatMs(gaps[gaps.length - 1])}
                        </dd>
                    </div>
                </dl>

                <Transcript agentName={saved.name} items={timeline} live={status === 'live'} />

                {status === 'ended' && endedReason ? (
                    <p className="text-muted-foreground text-sm" data-testid="playground-ended">
                        {describeEndedReason(endedReason)}
                    </p>
                ) : null}
                {status === 'error' && error ? (
                    <p className="text-destructive text-sm" role="alert">
                        {error}
                        {keyError ? (
                            <>
                                {' '}
                                <Link className="font-medium underline underline-offset-4" href={GEMINI_KEY_URL}>
                                    Check your key
                                </Link>
                            </>
                        ) : null}
                    </p>
                ) : null}
            </CardContent>
        </Card>
    );
}

type TranscriptProps = {
    agentName: string;
    items: PlaygroundTimelineItem[];
    live: boolean;
};

/** How close to the bottom (px) still counts as "following the conversation". */
const STICK_THRESHOLD_PX = 48;

function Transcript({ agentName, items, live }: TranscriptProps) {
    const scrollRef = useRef<HTMLDivElement>(null);
    /** Follow new lines unless the user scrolled up to read; scrolling back down resumes. */
    const stickRef = useRef(true);
    const [unseen, setUnseen] = useState(false);

    const scrollToEnd = useCallback(() => {
        const el = scrollRef.current;
        if (!el) return;
        el.scrollTop = el.scrollHeight;
        stickRef.current = true;
        setUnseen(false);
    }, []);

    useLayoutEffect(() => {
        if (items.length === 0) {
            stickRef.current = true;
            setUnseen(false);
            return;
        }
        if (stickRef.current) scrollToEnd();
        else setUnseen(true);
    }, [items, scrollToEnd]);

    const onScroll = () => {
        const el = scrollRef.current;
        if (!el) return;
        const atEnd = el.scrollHeight - el.scrollTop - el.clientHeight <= STICK_THRESHOLD_PX;
        stickRef.current = atEnd;
        if (atEnd) setUnseen(false);
    };

    return (
        <div className="relative min-w-0">
            <div
                ref={scrollRef}
                onScroll={onScroll}
                className="bg-muted/40 h-80 overflow-x-hidden overflow-y-auto overscroll-contain rounded-lg border p-3 lg:h-[clamp(12rem,calc(100dvh-32rem),22rem)]"
                aria-label="Transcript"
                aria-live="polite"
                data-testid="playground-transcript"
            >
                {items.length === 0 ? (
                    <p className="text-muted-foreground flex h-full items-center justify-center px-6 text-center text-sm">
                        {live
                            ? `${agentName} speaks first. Answer like the business owner would.`
                            : 'The transcript shows up here.'}
                    </p>
                ) : (
                    <ol className="flex flex-col gap-2">
                        {items.map((item) => {
                            if (item.kind === 'gap') {
                                return (
                                    <li
                                        key={item.id}
                                        className="text-muted-foreground flex items-center justify-center gap-1 text-[11px] tabular-nums"
                                        data-testid="transcript-gap"
                                    >
                                        <Timer className="size-3" />
                                        replied after {formatMs(item.gapMs)}
                                    </li>
                                );
                            }
                            if (item.kind === 'tool') {
                                return (
                                    <li key={item.id} className="min-w-0" data-testid="transcript-tool">
                                        <ToolCallRow run={item.run} className="bg-background/70" />
                                    </li>
                                );
                            }
                            return (
                                <li
                                    key={item.id}
                                    className={cn(
                                        'flex flex-col gap-0.5',
                                        item.role === 'caller' ? 'items-end' : 'items-start',
                                    )}
                                    data-testid={`transcript-${item.role}`}
                                >
                                    <span className="text-muted-foreground px-1 text-[11px]">
                                        {item.role === 'agent' ? agentName : 'You'}
                                    </span>
                                    <span
                                        className={cn(
                                            'max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-snug break-words',
                                            item.role === 'agent'
                                                ? 'bg-background rounded-tl-sm border'
                                                : 'bg-primary text-primary-foreground rounded-tr-sm',
                                        )}
                                    >
                                        {item.text}
                                    </span>
                                </li>
                            );
                        })}
                    </ol>
                )}
            </div>
            {unseen ? (
                <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="absolute bottom-3 left-1/2 h-7 -translate-x-1/2 rounded-full px-3 text-xs shadow"
                    onClick={scrollToEnd}
                    data-testid="transcript-jump-latest"
                >
                    <ArrowDown className="size-3.5" />
                    Latest
                </Button>
            ) : null}
        </div>
    );
}
