'use client';

import Link from 'next/link';
import { Bot, Clock, Phone } from 'lucide-react';
import type { VoiceCampaignListItem } from '@/app/actions/voice-campaign-actions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { usePage } from '@/contexts/PageStore';
import { formatPhone } from '@/helpers/voice-campaign-contacts';
import { campaignUrl } from '@/helpers/voice-routes';
import type { UseCampaignsPageReturn } from '../_hooks/use-campaigns-page';
import { campaignStateText, windowLabel } from '../_utils/campaign-format';
import { CampaignActionButton } from './CampaignActionButton';
import { CampaignCost } from './CampaignCost';
import { CampaignProgress } from './CampaignProgress';
import { CampaignStatusBadge } from './CampaignStatusBadge';

export function CampaignCard({ campaign }: { campaign: VoiceCampaignListItem }) {
    const { busy, runAction } = usePage<UseCampaignsPageReturn>();
    const url = campaignUrl(campaign.id);

    return (
        <Card className="h-full gap-4" data-testid="campaign-card">
            <CardHeader className="flex flex-row items-start justify-between gap-3">
                <div className="flex min-w-0 flex-col gap-1">
                    <CardTitle className="truncate">
                        <Link href={url} className="underline-offset-4 hover:underline">
                            {campaign.name}
                        </Link>
                    </CardTitle>
                    <p className="text-muted-foreground text-sm" data-testid="campaign-state" suppressHydrationWarning>
                        {campaignStateText(campaign)}
                    </p>
                </div>
                <CampaignStatusBadge status={campaign.status} />
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
                <CampaignProgress stats={campaign.stats} />
                <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                    <span className="inline-flex min-w-0 items-center gap-1">
                        <Bot className="size-3.5 shrink-0" aria-hidden />
                        <span className="truncate">{campaign.agentName ?? 'Deleted agent'}</span>
                    </span>
                    <span className="inline-flex items-center gap-1 tabular-nums">
                        <Phone className="size-3.5 shrink-0" aria-hidden />
                        {campaign.phoneNumber ? formatPhone(campaign.phoneNumber) : 'Removed number'}
                    </span>
                    <span className="inline-flex min-w-0 items-center gap-1">
                        <Clock className="size-3.5 shrink-0" aria-hidden />
                        <span className="truncate">{windowLabel(campaign.window)}</span>
                    </span>
                </div>
            </CardContent>
            <CardFooter className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t">
                <CampaignCost campaign={campaign} />
                <div className="flex gap-2">
                    <CampaignActionButton
                        size="sm"
                        status={campaign.status}
                        busy={busy?.id === campaign.id ? busy.action : null}
                        onAction={(action) => void runAction(campaign.id, action)}
                    />
                    <Button asChild size="sm" variant="ghost">
                        <Link href={url} aria-label={`Open ${campaign.name}`}>
                            Open
                        </Link>
                    </Button>
                </div>
            </CardFooter>
        </Card>
    );
}
