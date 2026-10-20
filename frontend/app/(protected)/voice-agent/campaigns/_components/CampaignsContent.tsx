'use client';

import Link from 'next/link';
import { Megaphone, Plus } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { usePage } from '@/contexts/PageStore';
import type { UseCampaignsPageReturn } from '../_hooks/use-campaigns-page';
import { NEW_CAMPAIGN_URL } from '../_utils/campaign-routes';
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

    return (
        <div className="flex flex-col gap-4 p-1">
            {loadError ? (
                <Alert variant="destructive">
                    <AlertDescription>{loadError}</AlertDescription>
                </Alert>
            ) : null}

            {campaigns.length === 0 && !loadError ? (
                <Empty className="border" data-testid="campaigns-empty">
                    <EmptyHeader>
                        <EmptyMedia variant="icon">
                            <Megaphone />
                        </EmptyMedia>
                        <EmptyTitle>No campaigns yet</EmptyTitle>
                        <EmptyDescription>
                            Upload a list of contacts and an outbound agent calls them from one of your numbers, inside the
                            hours you choose. Calls nobody answers are tried again later.
                        </EmptyDescription>
                    </EmptyHeader>
                    <EmptyContent>
                        <NewCampaignButton />
                    </EmptyContent>
                </Empty>
            ) : null}

            {campaigns.length > 0 ? (
                <>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="text-muted-foreground max-w-prose text-sm">
                            {campaigns.length} {campaigns.length === 1 ? 'campaign' : 'campaigns'}. Numbers on the do-not-call
                            list are always skipped.
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
        </div>
    );
}
