'use client';

import { Fragment } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, CalendarCheck, History } from 'lucide-react';
import { VOICE_AGENT_SUB_MODULES } from '@aixellabs/backend/db/types';
import type { CallSuccessFilter, VoiceCallListItem } from '@/app/actions/voice-call-actions';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { SubModuleUrls } from '@/config/app-config';
import { usePage } from '@/contexts/PageStore';
import { cn } from '@/lib/utils';
import type { UseCallLogsPageReturn } from '../_hooks/use-call-logs-page';
import { formatShortDateTime } from '@/helpers/voice-time';
import {
    callTypeLabel,
    callTypeVariant,
    endedByLabel,
    formatDuration,
    formatGap,
    formatParty,
    median,
} from '../_utils/call-format';
import { callBookedSomething } from '../_utils/tool-calls';
import { CallOutcomeBadges } from './CallOutcomeBadges';

const ALL_AGENTS = 'all';
const ALL_OUTCOMES = 'all';
const OUTCOME_OPTIONS: { value: CallSuccessFilter; label: string }[] = [
    { value: 'yes', label: 'Successful' },
    { value: 'no', label: 'Not successful' },
];
const CALL_LOGS_URL = SubModuleUrls[VOICE_AGENT_SUB_MODULES.CALL_LOGS];

function callHref(call: VoiceCallListItem): string {
    return `${CALL_LOGS_URL}/${call._id}`;
}

function Parties({ call }: { call: VoiceCallListItem }) {
    if (!call.from && !call.to) return <span className="text-muted-foreground">Browser</span>;
    return (
        <span className="inline-flex items-center gap-1 tabular-nums">
            {formatParty(call.from, 'Unknown')}
            <ArrowRight className="text-muted-foreground size-3 shrink-0" aria-label="to" />
            {formatParty(call.to, 'Unknown')}
        </span>
    );
}

function CallType({ call }: { call: VoiceCallListItem }) {
    return (
        <span className="inline-flex flex-wrap items-center gap-1">
            <Badge variant={callTypeVariant(call.channel, call.direction)}>
                {callTypeLabel(call.channel, call.direction)}
            </Badge>
            {callBookedSomething(call.toolCalls) ? (
                <Badge variant="outline" className="gap-1 text-teal-700 dark:text-teal-300" data-testid="call-booked">
                    <CalendarCheck aria-hidden />
                    Booked
                </Badge>
            ) : null}
            <CallOutcomeBadges analysis={call.analysis} />
        </span>
    );
}

/** The analysis' summary, one line on a desktop row, two on a phone card. */
function CallSummaryLine({ call, className }: { call: VoiceCallListItem; className?: string }) {
    const summary = call.analysis?.summary;
    if (!summary) return null;
    return (
        <p className={cn('text-muted-foreground text-xs', className)} data-testid="call-summary" title={summary}>
            {summary}
        </p>
    );
}

export function CallLogsContent() {
    const router = useRouter();
    const {
        calls,
        agents,
        agentFilter,
        agentFilterName,
        successFilter,
        setSuccessFilter,
        limit,
        loadError,
        filtering,
        setAgentFilter,
    } = usePage<UseCallLogsPageReturn>();
    const outcomeLabel = OUTCOME_OPTIONS.find((o) => o.value === successFilter)?.label.toLowerCase();

    return (
        <div className="flex flex-col gap-4 p-1">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <p className="text-muted-foreground text-sm">
                    {calls.length === limit
                        ? `Latest ${limit} calls`
                        : `${calls.length} ${calls.length === 1 ? 'call' : 'calls'}`}
                    {agentFilterName ? ` with ${agentFilterName}` : ''}
                    {outcomeLabel ? `, ${outcomeLabel}` : ''}. Open a call for its transcript and recording.
                </p>
                <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
                    <div className="flex w-full flex-col gap-1.5 sm:w-48">
                        <Label htmlFor="call-logs-outcome-filter">Outcome</Label>
                        <Select
                            value={successFilter ?? ALL_OUTCOMES}
                            disabled={filtering}
                            onValueChange={(value) =>
                                setSuccessFilter(value === ALL_OUTCOMES ? null : (value as CallSuccessFilter))
                            }
                        >
                            <SelectTrigger id="call-logs-outcome-filter" className="w-full">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value={ALL_OUTCOMES}>All calls</SelectItem>
                                {OUTCOME_OPTIONS.map((option) => (
                                    <SelectItem key={option.value} value={option.value}>
                                        {option.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="flex w-full flex-col gap-1.5 sm:w-60">
                        <Label htmlFor="call-logs-agent-filter">Agent</Label>
                        <Select
                            value={agentFilter ?? ALL_AGENTS}
                            disabled={filtering}
                            onValueChange={(value) => setAgentFilter(value === ALL_AGENTS ? null : value)}
                        >
                            <SelectTrigger id="call-logs-agent-filter" className="w-full">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value={ALL_AGENTS}>All agents</SelectItem>
                                {agentFilter && !agents.some((a) => a.id === agentFilter) ? (
                                    <SelectItem value={agentFilter}>Deleted agent</SelectItem>
                                ) : null}
                                {agents.map((agent) => (
                                    <SelectItem key={agent.id} value={agent.id}>
                                        {agent.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            </div>

            {loadError ? (
                <Alert variant="destructive">
                    <AlertDescription>{loadError}</AlertDescription>
                </Alert>
            ) : null}

            {calls.length === 0 && !loadError ? (
                <Empty className="border">
                    <EmptyHeader>
                        <EmptyMedia variant="icon">
                            <History />
                        </EmptyMedia>
                        <EmptyTitle>{successFilter ? 'No matching calls' : 'No calls yet'}</EmptyTitle>
                        <EmptyDescription>
                            {successFilter
                                ? 'No analysed calls match this outcome. Calls are judged when “Call successful” is on in the agent’s Call settings.'
                                : agentFilter
                                  ? 'This agent has no calls yet.'
                                  : 'Calls show up here when they end: playground sessions, test calls and calls to your numbers.'}
                        </EmptyDescription>
                    </EmptyHeader>
                </Empty>
            ) : null}

            {calls.length > 0 ? (
                <div className={cn('transition-opacity', filtering && 'opacity-60')}>
                    {/* Desktop and tablet: one row per call. */}
                    <div className="hidden rounded-md border md:block">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>When</TableHead>
                                    <TableHead>Agent</TableHead>
                                    <TableHead>Type</TableHead>
                                    <TableHead>From → To</TableHead>
                                    <TableHead className="text-right">Duration</TableHead>
                                    <TableHead>Ended by</TableHead>
                                    <TableHead className="text-right">Median gap</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {calls.map((call) => (
                                    <Fragment key={call._id}>
                                        <TableRow
                                            data-testid="call-row"
                                            className={cn('cursor-pointer', call.analysis?.summary && 'border-b-0')}
                                            onClick={() => router.push(callHref(call))}
                                        >
                                            <TableCell>
                                                <Link
                                                    href={callHref(call)}
                                                    className="font-medium underline-offset-4 hover:underline"
                                                    onClick={(event) => event.stopPropagation()}
                                                >
                                                    <time dateTime={call.startedAt} suppressHydrationWarning>
                                                        {formatShortDateTime(call.startedAt)}
                                                    </time>
                                                </Link>
                                            </TableCell>
                                            <TableCell>{call.agentName ?? 'Deleted agent'}</TableCell>
                                            <TableCell>
                                                <CallType call={call} />
                                            </TableCell>
                                            <TableCell>
                                                <Parties call={call} />
                                            </TableCell>
                                            <TableCell className="text-right tabular-nums">
                                                {formatDuration(call.durationSec)}
                                            </TableCell>
                                            <TableCell>{endedByLabel(call.endedBy)}</TableCell>
                                            <TableCell className="text-right tabular-nums">
                                                {formatGap(median(call.gapsMs))}
                                            </TableCell>
                                        </TableRow>
                                        {call.analysis?.summary ? (
                                            <TableRow className="cursor-pointer" onClick={() => router.push(callHref(call))}>
                                                <TableCell colSpan={7} className="max-w-0 pt-0 whitespace-normal">
                                                    <CallSummaryLine call={call} className="truncate" />
                                                </TableCell>
                                            </TableRow>
                                        ) : null}
                                    </Fragment>
                                ))}
                            </TableBody>
                        </Table>
                    </div>

                    {/* Phone: stacked cards, no sideways scrolling. */}
                    <ul className="flex flex-col gap-2 md:hidden">
                        {calls.map((call) => (
                            <li key={call._id}>
                                <Link
                                    href={callHref(call)}
                                    data-testid="call-card"
                                    className="hover:bg-muted/50 flex flex-col gap-2 rounded-md border p-3 text-sm"
                                >
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="font-medium">{call.agentName ?? 'Deleted agent'}</span>
                                        <CallType call={call} />
                                    </div>
                                    <Parties call={call} />
                                    <CallSummaryLine call={call} className="line-clamp-2" />
                                    <div className="text-muted-foreground flex flex-wrap gap-x-3 gap-y-1 text-xs">
                                        <time dateTime={call.startedAt} suppressHydrationWarning>
                                            {formatShortDateTime(call.startedAt)}
                                        </time>
                                        <span className="tabular-nums">{formatDuration(call.durationSec)}</span>
                                        <span>{endedByLabel(call.endedBy)}</span>
                                        <span className="tabular-nums">gap {formatGap(median(call.gapsMs))}</span>
                                    </div>
                                </Link>
                            </li>
                        ))}
                    </ul>
                </div>
            ) : null}
        </div>
    );
}
