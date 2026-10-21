'use client';

import { VoiceProvider, type VoiceCallCost } from '@aixellabs/backend/db/types';
import { usePage } from '@/contexts/PageStore';
import { costPerMinute, formatInr, formatUsd, isCostEstimated } from '@/helpers/voice-call-cost';
import type { UseCallLogsPageReturn } from '../_hooks/use-call-logs-page';
import { formatDuration } from '../_utils/call-format';

const PROVIDER_NAMES: Record<VoiceProvider, string> = {
    [VoiceProvider.TELNYX]: 'Telnyx',
    [VoiceProvider.TWILIO]: 'Twilio',
    [VoiceProvider.VOICELINK]: 'VoiceLink',
};

const ESTIMATE_NOTE = 'The phone part is worked out from the minutes until the provider reports its own charge.';

/** "$0.024", "$0.024 est." while the phone part is an estimate; "—" for calls from before costs were kept. */
export function CallCostAmount({ cost }: { cost: VoiceCallCost | null | undefined }) {
    if (!cost) return <span className="text-muted-foreground">—</span>;
    const estimated = isCostEstimated(cost);
    return (
        <span className="tabular-nums" title={estimated ? ESTIMATE_NOTE : undefined} data-testid="call-cost">
            {formatUsd(cost.totalUsd)}
            {estimated ? <span className="text-muted-foreground text-xs"> est.</span> : null}
        </span>
    );
}

/** "$0.031 a minute", or "—" when nobody was heard. */
export function formatCostPerMinute(cost: VoiceCallCost | null | undefined, durationSec: number): string {
    const perMinute = cost ? costPerMinute(cost.totalUsd, durationSec) : null;
    return perMinute === null ? '—' : `${formatUsd(perMinute)} a minute`;
}

/** Where a call's money went: Gemini (free on a free-tier key) and the phone provider. */
export function CallCostBreakdown({ cost, isPhone }: { cost: VoiceCallCost; isPhone: boolean }) {
    const parts = [cost.geminiFreeTier ? 'Gemini free (free-tier key)' : `Gemini ${formatUsd(cost.geminiUsd)}`];
    if (cost.provider) {
        const estimate = cost.providerExact ? '' : ' (estimate)';
        parts.push(`${PROVIDER_NAMES[cost.provider]} ${formatUsd(cost.providerUsd)}${estimate}`);
    } else if (isPhone) {
        parts.push('phone charge not included (no published rate)');
    }
    parts.push(`about ${formatInr(cost.totalUsd)} in all`);
    return (
        <span className="font-normal" data-testid="call-cost-breakdown">
            {parts.join(' · ')}
        </span>
    );
}

/** Above the list: what the shown agent's calls (or every agent's) have cost so far. */
export function CallCostSummary() {
    const { costTotal, agentFilterName } = usePage<UseCallLogsPageReturn>();
    if (costTotal.calls === 0) return null;
    const perMinute = costPerMinute(costTotal.totalUsd, costTotal.durationSec);

    return (
        <dl
            className="grid grid-cols-2 gap-3 rounded-md border p-3 text-sm sm:grid-cols-4"
            aria-label="Call costs"
            data-testid="call-cost-summary"
        >
            {[
                [
                    agentFilterName ? `${agentFilterName}’s calls cost` : 'Your calls cost',
                    `${formatUsd(costTotal.totalUsd)} (about ${formatInr(costTotal.totalUsd)})`,
                ],
                ['Average per minute', perMinute === null ? '—' : formatUsd(perMinute)],
                ['Calls', `${costTotal.calls} · ${formatDuration(costTotal.durationSec)} talking`],
                [
                    'Gemini · phone',
                    `${formatUsd(costTotal.geminiUsd)} · ${formatUsd(costTotal.providerUsd)}${costTotal.estimated ? ' est.' : ''}`,
                ],
            ].map(([label, value]) => (
                <div key={label} className="flex flex-col gap-0.5">
                    <dt className="text-muted-foreground text-xs">{label}</dt>
                    <dd className="font-medium tabular-nums">{value}</dd>
                </div>
            ))}
        </dl>
    );
}
