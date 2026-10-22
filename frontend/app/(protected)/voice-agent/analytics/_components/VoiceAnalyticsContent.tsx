'use client';

import { ChartColumn } from 'lucide-react';
import type { VoiceAnalyticsRange } from '@/app/actions/voice-analytics-actions';
import { EmptyState } from '@/components/common/EmptyState';
import { CurrencySelect } from '@/components/common/voice-agent/CurrencySelect';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useDisplayCurrency } from '@/contexts/DisplayCurrency';
import { usePage } from '@/contexts/PageStore';
import { formatMoney } from '@/helpers/voice-call-cost';
import { endedByLabel } from '@/helpers/voice-call-outcomes';
import { formatGap, SENTIMENT_LABELS } from '@/helpers/voice-call-format';
import { cn } from '@/lib/utils';
import type { UseVoiceAnalyticsPageReturn } from '../_hooks/use-voice-analytics-page';
import { ANALYTICS_RANGES } from '../_utils/analytics-ranges';
import { AnalyticsStats } from './AnalyticsStats';
import { BreakdownChart } from './BreakdownChart';
import { CallsOverTimeChart } from './CallsOverTimeChart';
import { CampaignResultsChart } from './CampaignResultsChart';

const ALL_AGENTS = 'all';
const SENTIMENT_COLORS = {
    positive: 'var(--color-green-500)',
    neutral: 'var(--color-amber-400)',
    negative: 'var(--color-red-500)',
};

export function VoiceAnalyticsContent() {
    const { analytics, agents, agentFilter, range, rangeLabel, loadError, filtering, setAgentFilter, setRange } =
        usePage<UseVoiceAnalyticsPageReturn>();
    const currency = useDisplayCurrency();
    const money = (usd: number) => formatMoney(usd, currency);

    return (
        <>
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:justify-end">
                <div className="flex flex-col gap-1.5 sm:w-44">
                    <Label htmlFor="analytics-range">Period</Label>
                    <Select
                        value={range}
                        disabled={filtering}
                        onValueChange={(value) => setRange(value as VoiceAnalyticsRange)}
                    >
                        <SelectTrigger id="analytics-range" className="w-full">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {ANALYTICS_RANGES.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                    {option.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <div className="flex flex-col gap-1.5 sm:w-60">
                    <Label htmlFor="analytics-agent">Agent</Label>
                    <Select
                        value={agentFilter ?? ALL_AGENTS}
                        disabled={filtering}
                        onValueChange={(value) => setAgentFilter(value === ALL_AGENTS ? null : value)}
                    >
                        <SelectTrigger id="analytics-agent" className="w-full">
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
                <CurrencySelect className="sm:w-28" />
            </div>

            {loadError ? (
                <Alert variant="destructive">
                    <AlertDescription>{loadError}</AlertDescription>
                </Alert>
            ) : null}

            {analytics?.calls === 0 ? (
                <EmptyState
                    icon={<ChartColumn />}
                    title="No calls in this period"
                    description={`Nothing to count for ${rangeLabel.toLowerCase()}${agentFilter ? ' with this agent' : ''}. Pick a longer period, or make a test call from an agent.`}
                />
            ) : null}

            {analytics && analytics.calls > 0 ? (
                <div className={cn('grid gap-4 transition-opacity md:grid-cols-2', filtering && 'opacity-60')}>
                    <div className="md:col-span-2">
                        <AnalyticsStats />
                    </div>
                    <div className="md:col-span-2">
                        <CallsOverTimeChart analytics={analytics} />
                    </div>
                    <BreakdownChart
                        title="How calls ended"
                        description="What ended each call."
                        rows={analytics.endedBy.map((row) => ({ label: endedByLabel(row.reason), value: row.calls }))}
                        empty="No calls."
                    />
                    <BreakdownChart
                        title="Caller mood"
                        description="How callers felt, as the call analysis read it."
                        rows={analytics.sentiment.map((row) => ({
                            label: SENTIMENT_LABELS[row.sentiment],
                            value: row.calls,
                            color: SENTIMENT_COLORS[row.sentiment],
                        }))}
                        empty="Turn on “Sentiment” in an agent’s call analysis to see how callers felt."
                    />
                    <BreakdownChart
                        title="Cost per agent"
                        description={`Over ${analytics.cost.calls} priced calls${analytics.cost.estimated ? '; the phone part is partly an estimate' : ''}.`}
                        rows={analytics.costByAgent.map((row) => ({
                            label: row.agentName ?? 'Deleted agent',
                            value: row.totalUsd,
                        }))}
                        format={money}
                        empty="No priced calls in this period. Calls are priced since 21 Oct 2026."
                    />
                    <BreakdownChart
                        title="Gemini and phone"
                        description="Where the money went. Gemini is free on a free-tier key."
                        rows={[
                            { label: 'Gemini', value: analytics.cost.geminiUsd, color: 'var(--chart-3)' },
                            { label: 'Phone provider', value: analytics.cost.providerUsd, color: 'var(--chart-1)' },
                        ]}
                        format={money}
                        empty="Nothing spent in this period."
                    />
                    <BreakdownChart
                        title="Answer speed"
                        description={`How long callers waited for an answer after they stopped talking, over ${analytics.replies.count} replies.`}
                        rows={analytics.replies.buckets.map((bucket, i, all) => ({
                            label:
                                bucket.upToMs === null
                                    ? `Over ${formatGap(all[i - 1].upToMs)}`
                                    : `Under ${formatGap(bucket.upToMs)}`,
                            value: bucket.replies,
                        }))}
                        empty="No replies timed in this period."
                    />
                    <CampaignResultsChart campaigns={analytics.campaigns} />
                </div>
            ) : null}
        </>
    );
}
