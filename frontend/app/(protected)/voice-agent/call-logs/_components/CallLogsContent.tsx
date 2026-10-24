'use client';

import { useEffect, useState } from 'react';
import { History, Search } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/common/EmptyState';
import { FilterSelect, FilterToolbar } from '@/components/common/FilterToolbar';
import { AgentFilter } from '@/components/common/voice-agent/AgentFilter';
import { CurrencySelect } from '@/components/common/voice-agent/CurrencySelect';
import { usePage } from '@/contexts/PageStore';
import { CALL_RANGES, type VoiceCallRange } from '@/helpers/voice-call-ranges';
import { cn } from '@/lib/utils';
import type { UseCallLogsPageReturn } from '../_hooks/use-call-logs-page';
import { KIND_OPTIONS, SUCCESS_OPTIONS, type CallLogFilters } from '../_utils/call-log-filters';
import { CallCard } from './CallCard';
import { CallCostSummary } from './CallCost';

const ALL = 'all';

/** Searches on Enter; follows the URL when the filters are cleared. */
function CallSearch() {
    const { filters, setFilter, filtering } = usePage<UseCallLogsPageReturn>();
    const [text, setText] = useState(filters.q);
    useEffect(() => setText(filters.q), [filters.q]);

    return (
        <form
            role="search"
            className="relative col-span-2 sm:w-56"
            onSubmit={(event) => {
                event.preventDefault();
                setFilter('q', text.trim());
            }}
        >
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
            <Input
                type="search"
                value={text}
                disabled={filtering}
                onChange={(event) => setText(event.target.value)}
                placeholder="Search calls"
                aria-label="Search calls"
                className="h-8 pl-8"
            />
        </form>
    );
}

/** A filter that may be unset: "All …" plus its options. */
function OptionalFilter<V extends string>({
    label,
    allLabel,
    options,
    value,
    onChange,
    disabled,
}: {
    label: string;
    allLabel: string;
    options: { value: V; label: string }[];
    value: V | null;
    onChange: (value: V | null) => void;
    disabled: boolean;
}) {
    return (
        <FilterSelect
            label={label}
            value={value ?? ALL}
            options={[{ value: ALL, label: allLabel }, ...options]}
            disabled={disabled}
            onChange={(next) => onChange(next === ALL ? null : (next as V))}
        />
    );
}

export function CallLogsContent() {
    const { calls, agents, filters, filtersSet, setFilter, clearFilters, agentFilterName, limit, loadError, filtering } =
        usePage<UseCallLogsPageReturn>();
    const set =
        <K extends keyof CallLogFilters>(key: K) =>
        (value: CallLogFilters[K]) =>
            setFilter(key, value);

    return (
        <>
            <FilterToolbar label="Filter calls" onClear={filtersSet ? clearFilters : null}>
                <CallSearch />
                <AgentFilter
                    id="call-logs-agent-filter"
                    agents={agents}
                    agentId={filters.agent}
                    includeDeleted={filters.deleted}
                    disabled={filtering}
                    onAgentChange={set('agent')}
                    onIncludeDeletedChange={set('deleted')}
                />
                <OptionalFilter
                    label="Type"
                    allLabel="All types"
                    options={KIND_OPTIONS}
                    value={filters.kind}
                    onChange={set('kind')}
                    disabled={filtering}
                />
                <OptionalFilter
                    label="Outcome"
                    allLabel="All outcomes"
                    options={SUCCESS_OPTIONS}
                    value={filters.success}
                    onChange={set('success')}
                    disabled={filtering}
                />
                <FilterSelect
                    label="Period"
                    value={filters.range}
                    options={CALL_RANGES}
                    disabled={filtering}
                    onChange={(value) => setFilter('range', value as VoiceCallRange)}
                />
                <CurrencySelect />
            </FilterToolbar>

            <CallCostSummary />

            {loadError ? (
                <Alert variant="destructive">
                    <AlertDescription>{loadError}</AlertDescription>
                </Alert>
            ) : null}

            {calls.length === 0 && !loadError ? (
                <EmptyState
                    icon={<History />}
                    title={filtersSet ? 'No matching calls' : 'No calls yet'}
                    description={
                        filters.success
                            ? 'Calls are judged when “Call successful” is on in the agent’s Call settings.'
                            : filtersSet
                              ? 'No call matches these filters.'
                              : 'Calls show up here when they end: playground sessions, test calls and calls to your numbers.'
                    }
                >
                    {filtersSet ? (
                        <Button variant="outline" size="sm" onClick={clearFilters}>
                            Clear filters
                        </Button>
                    ) : null}
                </EmptyState>
            ) : null}

            {calls.length > 0 ? (
                <section className={cn('flex flex-col gap-2 transition-opacity', filtering && 'opacity-60')}>
                    <p className="text-muted-foreground text-xs">
                        {calls.length === limit
                            ? `Latest ${limit} calls`
                            : `${calls.length} ${calls.length === 1 ? 'call' : 'calls'}`}
                        {agentFilterName ? ` with ${agentFilterName}` : ''}. Open one for its transcript and recording.
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
