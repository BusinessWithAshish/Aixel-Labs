'use client';

import { useDisplayCurrency } from '@/contexts/DisplayCurrency';
import { usePage } from '@/contexts/PageStore';
import { costPerMinute, formatMoney } from '@/helpers/voice-call-cost';
import { formatDuration, formatGap } from '@/helpers/voice-call-format';
import { rateTone, replyTone, TONE_TEXT, type OutcomeTone } from '@/helpers/voice-call-outcomes';
import { cn } from '@/lib/utils';
import type { UseVoiceAnalyticsPageReturn } from '../_hooks/use-voice-analytics-page';

const percent = (part: number, whole: number) => `${Math.round((part / whole) * 100)}%`;

/** The headline numbers for the period, one tile each; the ones that can go well or badly in their tone's colour. */
export function AnalyticsStats() {
    const { analytics } = usePage<UseVoiceAnalyticsPageReturn>();
    const currency = useDisplayCurrency();
    if (!analytics) return null;
    const { calls, answered, answeredSec, judged, successful, bookings, cost, replies } = analytics;
    const perMinute = costPerMinute(cost.totalUsd, cost.durationSec);

    const tiles: { label: string; value: string; note: string; tone?: OutcomeTone }[] = [
        {
            label: 'Answered',
            value: calls ? percent(answered, calls) : '—',
            note: `${answered} of ${calls} calls`,
            tone: calls ? rateTone(answered / calls) : undefined,
        },
        {
            label: 'Average call',
            value: answered ? formatDuration(answeredSec / answered) : '—',
            note: `${formatDuration(answeredSec)} talking in all`,
        },
        {
            label: 'Successful',
            value: judged ? percent(successful, judged) : '—',
            note: judged ? `${successful} of ${judged} judged calls` : 'Turn on “Call successful” in an agent’s settings',
            tone: judged ? rateTone(successful / judged) : undefined,
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
            tone: replies.averageMs === null ? undefined : replyTone(replies.averageMs),
        },
    ];

    return (
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6" data-testid="analytics-stats">
            {tiles.map((tile) => (
                <div key={tile.label} className="bg-card flex flex-col gap-0.5 rounded-md border p-3">
                    <dt className="text-muted-foreground text-xs">{tile.label}</dt>
                    <dd className={cn('text-xl font-semibold tabular-nums', tile.tone && TONE_TEXT[tile.tone])}>
                        {tile.value}
                    </dd>
                    <dd className="text-muted-foreground text-xs">{tile.note}</dd>
                </div>
            ))}
        </dl>
    );
}
