'use client';

import Link from 'next/link';
import { Megaphone, Plus } from 'lucide-react';
import { VoiceCampaignStatus } from '@aixellabs/backend/db/types';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/common/EmptyState';
import { useDisplayCurrency } from '@/contexts/DisplayCurrency';
import { usePage } from '@/contexts/PageStore';
import { formatMoney } from '@/helpers/voice-call-cost';
import type { UseCampaignsPageReturn } from '../_hooks/use-campaigns-page';
import { NEW_CAMPAIGN_URL } from '@/helpers/voice-routes';
import { CampaignCard } from './CampaignCard';

function NewCampaignButton() {
    return (
        <Button asChild>
            <Link href={NEW_CAMPAIGN_URL}>
                <Plus className="size-4" />
                New campaign
            </Link>
        </Button>
    );
}

export function CampaignsContent() {
    const { campaigns, loadError } = usePage<UseCampaignsPageReturn>();
    const currency = useDisplayCurrency();
    const running = campaigns.filter((c) => c.status === VoiceCampaignStatus.RUNNING).length;
    const spent = campaigns.reduce((sum, c) => sum + c.costUsd, 0);

    return (
        <>
            {loadError ? (
                <Alert variant="destructive">
                    <AlertDescription>{loadError}</AlertDescription>
                </Alert>
            ) : null}

            {campaigns.length === 0 && !loadError ? (
                <EmptyState
                    icon={<Megaphone />}
                    title="No campaigns yet"
                    description="Upload a list of contacts and an outbound agent calls them from one of your numbers, inside the hours you choose. Calls nobody answers are tried again later."
                    data-testid="campaigns-empty"
                >
                    <NewCampaignButton />
                </EmptyState>
            ) : null}

            {campaigns.length > 0 ? (
                <>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="text-muted-foreground max-w-prose text-sm">
                            {campaigns.length} {campaigns.length === 1 ? 'campaign' : 'campaigns'}
                            {running ? `, ${running} running` : ''} · {formatMoney(spent, currency)} spent in all. Numbers on
                            the do-not-call list are always skipped.
                        </p>
                        <NewCampaignButton />
                    </div>
                    <div className="grid gap-3 lg:grid-cols-2" aria-label="Your campaigns">
                        {campaigns.map((campaign) => (
                            <CampaignCard key={campaign.id} campaign={campaign} />
                        ))}
                    </div>
                </>
            ) : null}
        </>
    );
}
