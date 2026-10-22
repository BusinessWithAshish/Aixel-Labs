'use client';

import { History } from 'lucide-react';
import type { CallSuccessFilter } from '@/app/actions/voice-call-actions';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { EmptyState } from '@/components/common/EmptyState';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { usePage } from '@/contexts/PageStore';
import { cn } from '@/lib/utils';
import type { UseCallLogsPageReturn } from '../_hooks/use-call-logs-page';
import { CallCard } from './CallCard';
import { CallCostSummary } from './CallCost';
import { CurrencySelect } from '@/components/common/voice-agent/CurrencySelect';

const ALL_AGENTS = 'all';
const ALL_OUTCOMES = 'all';
const OUTCOME_OPTIONS: { value: CallSuccessFilter; label: string }[] = [
    { value: 'yes', label: 'Successful' },
    { value: 'no', label: 'Not successful' },
];

export function CallLogsContent() {
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
        <>
            <div className="flex flex-wrap items-end justify-between gap-3">
                <p className="text-muted-foreground text-sm">
                    {calls.length === limit
                        ? `Latest ${limit} calls`
                        : `${calls.length} ${calls.length === 1 ? 'call' : 'calls'}`}
                    {agentFilterName ? ` with ${agentFilterName}` : ''}
                    {outcomeLabel ? `, ${outcomeLabel}` : ''}. Open a call for its transcript and recording.
                </p>
                <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
                    <CurrencySelect className="w-full sm:w-28" />
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

            <CallCostSummary />

            {loadError ? (
                <Alert variant="destructive">
                    <AlertDescription>{loadError}</AlertDescription>
                </Alert>
            ) : null}

            {calls.length === 0 && !loadError ? (
                <EmptyState
                    icon={<History />}
                    title={successFilter ? 'No matching calls' : 'No calls yet'}
                    description={
                        successFilter
                            ? 'No analysed calls match this outcome. Calls are judged when “Call successful” is on in the agent’s Call settings.'
                            : agentFilter
                              ? 'This agent has no calls yet.'
                              : 'Calls show up here when they end: playground sessions, test calls and calls to your numbers.'
                    }
                />
            ) : null}

            {calls.length > 0 ? (
                <ul className={cn('flex flex-col gap-2 transition-opacity', filtering && 'opacity-60')}>
                    {calls.map((call) => (
                        <li key={call._id}>
                            <CallCard call={call} />
                        </li>
                    ))}
                </ul>
            ) : null}
        </>
    );
}
