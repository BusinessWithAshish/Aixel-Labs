'use client';

import { useDisplayCurrency } from '@/contexts/DisplayCurrency';
import { usePage } from '@/contexts/PageStore';
import { costPerMinute, formatMoney } from '@/helpers/voice-call-cost';
import { formatDuration, formatGap } from '@/helpers/voice-call-format';
import type { UseVoiceAnalyticsPageReturn } from '../_hooks/use-voice-analytics-page';

const percent = (part: number, whole: number) => `${Math.round((part / whole) * 100)}%`;

/** The headline numbers for the period, one tile each. */
export function AnalyticsStats() {
    const { analytics } = usePage<UseVoiceAnalyticsPageReturn>();
    const currency = useDisplayCurrency();
    if (!analytics) return null;
    const { calls, answered, answeredSec, judged, successful, bookings, cost, replies } = analytics;
    const perMinute = costPerMinute(cost.totalUsd, cost.durationSec);

    const tiles: { label: string; value: string; note: string }[] = [
        { label: 'Calls', value: String(calls), note: `${answered} answered (${calls ? percent(answered, calls) : '0%'})` },
        {
            label: 'Average call',
            value: answered ? formatDuration(answeredSec / answered) : '—',
            note: `${formatDuration(answeredSec)} talking in all`,
        },
        {
            label: 'Successful',
            value: judged ? percent(successful, judged) : '—',
            note: judged ? `${successful} of ${judged} judged calls` : 'Turn on “Call successful” in an agent’s settings',
        },
        {
            label: 'Bookings made',
            value: String(bookings.booked + bookings.cancelled),
            note: `${bookings.booked} still on, ${bookings.cancelled} cancelled`,
        },
        {
            label: 'Cost',
            value: `${formatMoney(cost.totalUsd, currency)}${cost.estimated ? ' est.' : ''}`,
            note: perMinute === null ? 'No priced calls yet' : `${formatMoney(perMinute, currency)} a minute`,
        },
        {
            label: 'Answer speed',
            value: formatGap(replies.averageMs),
            note: 'Average wait after the caller stops talking',
        },
    ];

    return (
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6" data-testid="analytics-stats">
            {tiles.map((tile) => (
                <div key={tile.label} className="bg-card flex flex-col gap-0.5 rounded-md border p-3">
                    <dt className="text-muted-foreground text-xs">{tile.label}</dt>
                    <dd className="text-xl font-semibold tabular-nums">{tile.value}</dd>
                    <dd className="text-muted-foreground text-xs">{tile.note}</dd>
                </div>
            ))}
        </dl>
    );
}
