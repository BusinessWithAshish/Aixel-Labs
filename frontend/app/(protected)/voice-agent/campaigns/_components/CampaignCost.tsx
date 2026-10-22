'use client';

import { Wallet } from 'lucide-react';
import type { VoiceCampaignListItem } from '@/app/actions/voice-campaign-actions';
import { useDisplayCurrency } from '@/contexts/DisplayCurrency';
import { formatMoney } from '@/helpers/voice-call-cost';
import { cn } from '@/lib/utils';

/** "₹412.50 spent · ₹82.50 a booking", in the owner's currency. */
export function CampaignCost({
    campaign,
    className,
}: {
    campaign: Pick<VoiceCampaignListItem, 'costUsd' | 'stats'>;
    className?: string;
}) {
    const currency = useDisplayCurrency();
    const { costUsd, stats } = campaign;
    const per = stats.booked
        ? { n: stats.booked, label: 'a booking' }
        : stats.answered
          ? { n: stats.answered, label: 'an answered call' }
          : null;
    return (
        <span className={cn('inline-flex min-w-0 items-center gap-1.5 text-sm', className)} data-testid="campaign-cost">
            <Wallet className="text-muted-foreground size-4 shrink-0" aria-hidden />
            <span className="truncate">
                <span className="font-medium tabular-nums">{formatMoney(costUsd, currency)}</span> spent
                {per && costUsd > 0 ? (
                    <span className="text-muted-foreground">
                        {' · '}
                        <span className="tabular-nums">{formatMoney(costUsd / per.n, currency)}</span> {per.label}
                    </span>
                ) : null}
            </span>
        </span>
    );
}
