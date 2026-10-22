'use client';

import { History } from 'lucide-react';
import type { CallSuccessFilter } from '@/app/actions/voice-call-actions';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { EmptyState } from '@/components/common/EmptyState';
import { AgentFilter } from '@/components/common/voice-agent/AgentFilter';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { usePage } from '@/contexts/PageStore';
import { cn } from '@/lib/utils';
import type { UseCallLogsPageReturn } from '../_hooks/use-call-logs-page';
import { CallCard } from './CallCard';
import { CallCostSummary } from './CallCost';
import { CurrencySelect } from '@/components/common/voice-agent/CurrencySelect';

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
        includeDeleted,
        setIncludeDeleted,
        limit,
        loadError,
        filtering,
        setAgentFilter,
    } = usePage<UseCallLogsPageReturn>();
    const outcomeLabel = OUTCOME_OPTIONS.find((o) => o.value === successFilter)?.label.toLowerCase();

    return (
        <>
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-end">
                <AgentFilter
                    id="call-logs-agent-filter"
                    agents={agents}
                    agentId={agentFilter}
                    includeDeleted={includeDeleted}
                    disabled={filtering}
                    onAgentChange={setAgentFilter}
                    onIncludeDeletedChange={setIncludeDeleted}
                />
                <div className="flex w-full flex-col gap-1.5 sm:w-44">
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
                <CurrencySelect className="w-full sm:w-28" />
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
                <section className={cn('flex flex-col gap-2 transition-opacity', filtering && 'opacity-60')}>
                    <p className="text-muted-foreground text-sm">
                        {calls.length === limit
                            ? `Latest ${limit} calls`
                            : `${calls.length} ${calls.length === 1 ? 'call' : 'calls'}`}
                        {agentFilterName ? ` with ${agentFilterName}` : ''}
                        {outcomeLabel ? `, ${outcomeLabel}` : ''}. Open one for its transcript and recording.
                    </p>
                    <ul className="flex flex-col gap-2">
                        {calls.map((call) => (
                            <li key={call._id}>
                                <CallCard call={call} />
                            </li>
                        ))}
                    </ul>
                </section>
            ) : null}
        </>
    );
}
