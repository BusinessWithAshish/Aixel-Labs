'use client';

import type { VoiceCallCost } from '@aixellabs/backend/db/types';
import { StatStrip } from '@/components/common/StatStrip';
import { useDisplayCurrency } from '@/contexts/DisplayCurrency';
import { usePage } from '@/contexts/PageStore';
import { costPartLabel, costParts, costPerMinute, formatMoney, isCostEstimated } from '@/helpers/voice-call-cost';
import { numberProviderInfo } from '@/helpers/voice-number-providers';
import type { UseCallLogsPageReturn } from '../_hooks/use-call-logs-page';
import { formatDuration } from '@/helpers/voice-call-format';

const ESTIMATE_NOTE = 'The phone part is worked out from the minutes until the provider reports its own charge.';

/** "₹4.27", "₹4.27 est." while the phone part is an estimate; "—" for calls from before costs were kept. */
export function CallCostAmount({ cost }: { cost: VoiceCallCost | null | undefined }) {
    const currency = useDisplayCurrency();
    if (!cost) return <span className="text-muted-foreground">—</span>;
    const estimated = isCostEstimated(cost);
    return (
        <span className="tabular-nums" title={estimated ? ESTIMATE_NOTE : undefined} data-testid="call-cost">
            {formatMoney(cost.totalUsd, currency)}
            {estimated ? <span className="text-muted-foreground text-xs"> est.</span> : null}
        </span>
    );
}

/** "₹2.70/min" under a call's cost; nothing for a call nobody heard. */
export function CallCostPerMinute({
    cost,
    durationSec,
    className,
}: {
    cost: VoiceCallCost | null | undefined;
    durationSec: number;
    className?: string;
}) {
    const currency = useDisplayCurrency();
    const perMinute = cost ? costPerMinute(cost.totalUsd, durationSec) : null;
    if (perMinute === null) return null;
    return (
        <span className={className ?? 'tabular-nums'} data-testid="call-cost-per-minute">
            {formatMoney(perMinute, currency)}/min
        </span>
    );
}

/** Where a call's money went, part by part as the call kept it (Gemini free on a free-tier key), with dollars as kept. */
export function CallCostBreakdown({ cost, isPhone }: { cost: VoiceCallCost; isPhone: boolean }) {
    const currency = useDisplayCurrency();
    const money = (usd: number) => formatMoney(usd, currency);
    const parts = costParts(cost).flatMap(({ part, usd }) => {
        if (part !== 'providerUsd') {
            // Gemini and the analysis both run on the owner's Gemini key.
            if (!cost.geminiFreeTier || usd > 0) return [`${costPartLabel(part)} ${money(usd)}`];
            return [part === 'geminiUsd' ? 'Gemini free (free-tier key)' : `${costPartLabel(part)} free`];
        }
        if (cost.provider) {
            return [`${numberProviderInfo(cost.provider).label} ${money(usd)}${cost.providerExact ? '' : ' (estimate)'}`];
        }
        return isPhone ? ['phone charge not included (not known yet)'] : [];
    });
    if (currency.code !== 'USD') parts.push(`${formatMoney(cost.totalUsd)} in all`);
    return (
        <span className="font-normal" data-testid="call-cost-breakdown">
            {parts.join(' · ')}
        </span>
    );
}

/** Above the list: the listed calls added up, with the cost of those that have one. */
export function CallCostSummary() {
    const { calls, summary, agentFilterName } = usePage<UseCallLogsPageReturn>();
    const currency = useDisplayCurrency();
    if (calls.length === 0) return null;
    const money = (usd: number) => formatMoney(usd, currency);
    const perMinute = costPerMinute(summary.totalUsd, summary.pricedSec);
    const costLabel =
        summary.priced === calls.length
            ? agentFilterName
                ? `${agentFilterName}’s calls cost`
                : 'These calls cost'
            : `Cost of ${summary.priced} priced ${summary.priced === 1 ? 'call' : 'calls'}`;

    return (
        <StatStrip
            aria-label="Call costs"
            data-testid="call-cost-summary"
            stats={[
                { label: 'Calls', value: `${calls.length} · ${formatDuration(summary.durationSec)} talking` },
                { label: costLabel, value: `${money(summary.totalUsd)}${summary.estimated ? ' est.' : ''}` },
                { label: 'Average per minute', value: perMinute === null ? '—' : money(perMinute) },
                {
                    label: Object.keys(summary.parts).map(costPartLabel).join(' · ') || 'Parts',
                    value: Object.values(summary.parts).map(money).join(' · ') || '—',
                },
            ]}
        />
    );
}
