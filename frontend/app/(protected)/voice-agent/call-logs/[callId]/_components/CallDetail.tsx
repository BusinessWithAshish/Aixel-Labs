'use client';

import Link from 'next/link';
import { Fragment, type ReactNode } from 'react';
import { Flag, Timer } from 'lucide-react';
import { VoiceCallEndReason } from '@aixellabs/backend/db/types';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { usePage } from '@/contexts/PageStore';
import { cn } from '@/lib/utils';
import type { UseCallDetailPageReturn } from '../_hooks/use-call-detail-page';
import {
    callTypeLabel,
    callTypeVariant,
    endedByLabel,
    formatDuration,
    formatGap,
    formatParty,
} from '../../_utils/call-format';
import { ToolCallRow } from '../../_components/ToolCallRow';
import { GEMINI_KEY_URL } from '@/helpers/voice-routes';
import { CallAnalysisCard, CallerMemoryCard, CallVariablesCard } from './CallInsights';
import { RecordingPlayer } from './RecordingPlayer';

function SummaryRow({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div className="flex flex-col gap-0.5">
            <dt className="text-muted-foreground text-xs">{label}</dt>
            <dd className="text-sm font-medium break-words">{children}</dd>
        </div>
    );
}

function CallSummary() {
    const { call, gapStats } = usePage<UseCallDetailPageReturn>();
    const isPhone = !!(call.from || call.to);

    return (
        <Card>
            <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-base">Summary</CardTitle>
                    <Badge variant={callTypeVariant(call.channel, call.direction)}>
                        {callTypeLabel(call.channel, call.direction)}
                    </Badge>
                </div>
                <CardDescription>
                    <time dateTime={call.startedAt} suppressHydrationWarning>
                        {new Date(call.startedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                    </time>
                </CardDescription>
            </CardHeader>
            <CardContent>
                <dl className="grid grid-cols-2 gap-3">
                    <SummaryRow label="Agent">{call.agentName ?? 'Deleted agent'}</SummaryRow>
                    <SummaryRow label="Voice">{call.voice}</SummaryRow>
                    {isPhone ? (
                        <>
                            <SummaryRow label="From">
                                <span className="tabular-nums">{formatParty(call.from, 'Unknown')}</span>
                            </SummaryRow>
                            <SummaryRow label="To">
                                <span className="tabular-nums">{formatParty(call.to, 'Unknown')}</span>
                            </SummaryRow>
                        </>
                    ) : null}
                    <SummaryRow label="Duration">
                        <span className="tabular-nums">{formatDuration(call.durationSec)}</span>
                    </SummaryRow>
                    <SummaryRow label="Ended by">
                        {endedByLabel(call.endedBy)}
                        {call.endedBy === VoiceCallEndReason.GEMINI_KEY_ERROR ? (
                            <>
                                {' · '}
                                <Link className="text-primary underline-offset-4 hover:underline" href={GEMINI_KEY_URL}>
                                    Check your key
                                </Link>
                            </>
                        ) : null}
                    </SummaryRow>
                    <SummaryRow label="Median gap">
                        <span className="tabular-nums">{formatGap(gapStats.median)}</span>
                    </SummaryRow>
                    <SummaryRow label="Longest gap">
                        <span className="tabular-nums">{formatGap(gapStats.max)}</span>
                    </SummaryRow>
                    {call.voicemailMessage ? (
                        <div className="col-span-2" data-testid="call-voicemail-message">
                            <SummaryRow label="Voicemail message left">
                                <span className="font-normal">“{call.voicemailMessage}”</span>
                            </SummaryRow>
                        </div>
                    ) : null}
                </dl>
            </CardContent>
        </Card>
    );
}

function CallFlags() {
    const { call } = usePage<UseCallDetailPageReturn>();
    if (call.flags.length === 0) return null;

    return (
        <Card>
            <CardHeader className="pb-2">
                <CardTitle className="text-base">Flags</CardTitle>
                <CardDescription>Things the agent noticed during the call.</CardDescription>
            </CardHeader>
            <CardContent>
                <ul className="flex flex-col gap-3" aria-label="Flags">
                    {call.flags.map((flag, index) => (
                        <li key={`${flag.flag}-${index}`} className="flex flex-col gap-1">
                            <Badge variant="orange" className="gap-1">
                                <Flag aria-hidden />
                                {flag.flag.replace(/_/g, ' ')}
                            </Badge>
                            {flag.quote ? (
                                <blockquote className="text-muted-foreground border-l-2 pl-3 text-sm italic">
                                    “{flag.quote}”
                                </blockquote>
                            ) : null}
                        </li>
                    ))}
                </ul>
            </CardContent>
        </Card>
    );
}

function ToolRuns({ at }: { at: number }) {
    const { toolsByTurn } = usePage<UseCallDetailPageReturn>();
    const runs = toolsByTurn.get(at);
    if (!runs?.length) return null;
    return (
        <li className="flex flex-col gap-1.5" aria-label="Tools used">
            {runs.map((run, index) => (
                <ToolCallRow key={`${run.name}-${index}`} run={run} />
            ))}
        </li>
    );
}

function Transcript() {
    const { call, turns, turnGaps, toolsByTurn } = usePage<UseCallDetailPageReturn>();
    const toolCount = call.toolCalls?.length ?? 0;

    return (
        <Card>
            <CardHeader className="pb-2">
                <CardTitle className="text-base">Transcript</CardTitle>
                <CardDescription>
                    {turns.length} {turns.length === 1 ? 'turn' : 'turns'}
                    {toolCount ? `, ${toolCount} ${toolCount === 1 ? 'tool' : 'tools'} used` : ''}. The time above an agent
                    reply is how long the caller waited for it.
                </CardDescription>
            </CardHeader>
            <CardContent>
                {turns.length === 0 && toolsByTurn.size === 0 ? (
                    <p className="text-muted-foreground text-sm">Nobody spoke on this call.</p>
                ) : (
                    <ol className="flex flex-col gap-3" aria-label="Transcript">
                        <ToolRuns at={-1} />
                        {turns.map((turn, index) => {
                            const isAgent = turn.role === 'agent';
                            const gap = turnGaps[index];
                            return (
                                <Fragment key={index}>
                                    <li
                                        data-testid="transcript-turn"
                                        data-role={turn.role}
                                        className={cn('flex flex-col gap-1', isAgent ? 'items-start' : 'items-end')}
                                    >
                                        <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
                                            {isAgent ? 'Agent' : 'Caller'}
                                            {gap !== null ? (
                                                <span
                                                    className={cn(
                                                        'inline-flex items-center gap-0.5 tabular-nums',
                                                        gap >= 1500 && 'text-orange-600 dark:text-orange-400',
                                                    )}
                                                    data-testid="turn-gap"
                                                >
                                                    <Timer className="size-3" aria-hidden />
                                                    {formatGap(gap)}
                                                </span>
                                            ) : null}
                                        </span>
                                        <p
                                            className={cn(
                                                'max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap break-words sm:max-w-[75%]',
                                                isAgent ? 'bg-primary/10 rounded-tl-sm' : 'bg-muted rounded-tr-sm',
                                            )}
                                        >
                                            {turn.text}
                                        </p>
                                    </li>
                                    <ToolRuns at={index} />
                                </Fragment>
                            );
                        })}
                    </ol>
                )}
            </CardContent>
        </Card>
    );
}

export function CallDetail() {
    return (
        // Phone: summary, analysis, recording, transcript, then memory, variables and flags.
        // Desktop: transcript left, the rest stacked right.
        <div className="grid gap-4 p-1 lg:grid-cols-[minmax(0,1fr)_22rem] lg:grid-rows-[auto_1fr]">
            <div className="grid min-w-0 gap-4 lg:col-start-2 lg:row-start-1">
                <CallSummary />
                <CallAnalysisCard />
                <RecordingPlayer />
            </div>
            <div className="min-w-0 lg:col-start-1 lg:row-span-2 lg:row-start-1">
                <Transcript />
            </div>
            <div className="grid min-w-0 gap-4 lg:col-start-2 lg:row-start-2 lg:self-start">
                <CallerMemoryCard />
                <CallVariablesCard />
                <CallFlags />
            </div>
        </div>
    );
}
