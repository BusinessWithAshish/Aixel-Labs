'use client';

import Link from 'next/link';
import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { ArrowDown, AudioLines, Info, Loader2, Mic, Phone, PhoneOff, Timer } from 'lucide-react';
import { VoiceKeyStatus } from '@aixellabs/backend/db/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { usePage } from '@/contexts/PageStore';
import { cn } from '@/lib/utils';
import { ToolCallRow } from '@/components/common/voice-agent/ToolCallRow';
import { GeminiKeyNotice } from '@/components/common/voice-agent/GeminiKeyNotice';
import { VOICE_AGENT_NO_PROMPT_MESSAGE } from '@/helpers/voice-agent-defaults';
import { GEMINI_KEY_URL } from '@/helpers/voice-routes';
import { GeminiKeyLine } from '../../_components/GeminiKeyLine';
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

/** 642 -> "0.6 s": how long she took to start answering. */
function formatSeconds(ms: number | null | undefined): string {
    return ms == null ? '—' : `${(ms / 1000).toFixed(1)} s`;
}

/** How a usual answer time feels on the phone. */
function speedWord(ms: number): string {
    if (ms <= 1000) return 'feels natural';
    if (ms <= 2000) return 'a little slow';
    return 'slow';
}

/** Calls run on the owner's Gemini key (no call without one) and the agent's saved prompt (none without one). */
export function VoicePlayground({ className }: { className?: string }) {
    const { agentId, geminiKey, saved, form, isDirty, isValid, saving, save } = usePage<UseVoiceAgentEditorPageReturn>();
    const noPrompt = !form.prompt.trim();
    const { status, error, keyError, endedReason, timeline, gaps, level, agentSpeaking, start, end } = useVoicePlayground({
        agentId,
        beforeStart: save,
    });

    const busy = status === 'connecting' || status === 'live';
    const badge = STATUS_BADGE[status];
    const usualGap = median(gaps);

    return (
        <Card className={cn('h-auto min-w-0 gap-4', className)} data-testid="voice-playground">
            <CardHeader>
                <CardTitle>Playground</CardTitle>
                <CardDescription className="grid gap-1 font-normal">
                    <span>
                        Talk to {saved.name} through your microphone, as if you were on the phone together. It uses the saved
                        version of the agent.
                    </span>
                    {geminiKey.set && geminiKey.status === VoiceKeyStatus.OK ? (
                        <GeminiKeyLine view={geminiKey} link />
                    ) : null}
                </CardDescription>
                <CardAction>
                    <Badge variant={badge.variant} data-testid="playground-status">
                        {badge.label}
                    </Badge>
                </CardAction>
            </CardHeader>

            <CardContent className="grid gap-4">
                <GeminiKeyNotice view={geminiKey} action="talk to your agents" />
                {noPrompt && !busy ? (
                    <p
                        className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200"
                        data-testid="playground-no-prompt"
                    >
                        {VOICE_AGENT_NO_PROMPT_MESSAGE}
                    </p>
                ) : null}
                {isDirty && !busy && !noPrompt ? (
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
                        <Button
                            onClick={() => void start()}
                            disabled={!geminiKey.set || noPrompt || saving || (isDirty && !isValid)}
                        >
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
                    <Mic className="text-muted-foreground size-4 shrink-0" aria-hidden />
                    <span className="text-muted-foreground text-xs">Your mic</span>
                    <div className="bg-muted h-2 flex-1 overflow-hidden rounded-full">
                        <div
                            className="h-full rounded-full bg-emerald-500 transition-[width] duration-75 ease-linear"
                            style={{ width: `${Math.min(100, level * 400)}%` }}
                        />
                    </div>
                </div>

                <div className="grid gap-0.5 rounded-lg border px-3 py-2 text-sm" data-testid="playground-speed">
                    <p className="flex items-center gap-1.5 font-medium">
                        <Timer className="text-muted-foreground size-4" aria-hidden />
                        How fast {saved.name} answers
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <button
                                    type="button"
                                    className="text-muted-foreground hover:text-foreground"
                                    aria-label="What this means"
                                >
                                    <Info className="size-3.5" />
                                </button>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-64">
                                The time from when you stop talking to when {saved.name} starts answering. Up to about a
                                second feels natural on the phone.
                            </TooltipContent>
                        </Tooltip>
                    </p>
                    {gaps.length === 0 || usualGap === null ? (
                        <p className="text-muted-foreground text-xs">Shows up once {saved.name} has answered you.</p>
                    ) : (
                        <p className="text-muted-foreground text-xs">
                            Usually <strong className="text-foreground tabular-nums">{formatSeconds(usualGap)}</strong> (
                            {speedWord(usualGap)}) · last answer{' '}
                            <strong className="text-foreground tabular-nums" data-testid="playground-last-gap">
                                {formatSeconds(gaps[gaps.length - 1])}
                            </strong>{' '}
                            · <span data-testid="playground-replies">{gaps.length}</span>{' '}
                            {gaps.length === 1 ? 'answer' : 'answers'} so far
                        </p>
                    )}
                </div>

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
                            : `Press Start call and ${agentName} says hello. What you both say shows up here.`}
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
                                        answered in {formatSeconds(item.gapMs)}
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
