'use client';

import type { VoiceCallCost } from '@aixellabs/backend/db/types';
import { useDisplayCurrency } from '@/contexts/DisplayCurrency';
import { usePage } from '@/contexts/PageStore';
import { costPerMinute, formatMoney, isCostEstimated } from '@/helpers/voice-call-cost';
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

/** Where a call's money went: Gemini (free on a free-tier key) and the phone provider, with dollars as kept. */
export function CallCostBreakdown({ cost, isPhone }: { cost: VoiceCallCost; isPhone: boolean }) {
    const currency = useDisplayCurrency();
    const money = (usd: number) => formatMoney(usd, currency);
    const parts = [cost.geminiFreeTier ? 'Gemini free (free-tier key)' : `Gemini ${money(cost.geminiUsd)}`];
    if (cost.provider) {
        parts.push(
            `${numberProviderInfo(cost.provider).label} ${money(cost.providerUsd)}${cost.providerExact ? '' : ' (estimate)'}`,
        );
    } else if (isPhone) {
        parts.push('phone charge not included (not known yet)');
    }
    if (currency.code !== 'USD') parts.push(`${formatMoney(cost.totalUsd)} in all`);
    return (
        <span className="font-normal" data-testid="call-cost-breakdown">
            {parts.join(' · ')}
        </span>
    );
}

/** Above the list: what the shown agent's calls (or every agent's) have cost so far. */
export function CallCostSummary() {
    const { costTotal, agentFilterName } = usePage<UseCallLogsPageReturn>();
    const currency = useDisplayCurrency();
    if (costTotal.calls === 0) return null;
    const money = (usd: number) => formatMoney(usd, currency);
    const perMinute = costPerMinute(costTotal.totalUsd, costTotal.durationSec);

    return (
        <dl
            className="grid grid-cols-2 gap-3 rounded-md border p-3 text-sm sm:grid-cols-4"
            aria-label="Call costs"
            data-testid="call-cost-summary"
        >
            {[
                [agentFilterName ? `${agentFilterName}’s calls cost` : 'Your calls cost', money(costTotal.totalUsd)],
                ['Average per minute', perMinute === null ? '—' : money(perMinute)],
                ['Calls', `${costTotal.calls} · ${formatDuration(costTotal.durationSec)} talking`],
                [
                    'Gemini · phone',
                    `${money(costTotal.geminiUsd)} · ${money(costTotal.providerUsd)}${costTotal.estimated ? ' est.' : ''}`,
                ],
            ].map(([label, value]) => (
                <div key={label} className="flex flex-col gap-0.5">
                    <dt className="text-muted-foreground text-xs">{label}</dt>
                    <dd className="text-base font-semibold tabular-nums">{value}</dd>
                </div>
            ))}
        </dl>
    );
}
