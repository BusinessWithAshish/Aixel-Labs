import Link from 'next/link';
import { Bot, Clock, Phone } from 'lucide-react';
import type { VoiceCampaignListItem } from '@/app/actions/voice-campaign-actions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { campaignUrl } from '../_utils/campaign-routes';
import { windowLabel } from '../_utils/campaign-format';
import { CampaignProgress } from './CampaignProgress';
import { CampaignStatusBadge } from './CampaignStatusBadge';

export function CampaignCard({ campaign }: { campaign: VoiceCampaignListItem }) {
    return (
        <Link
            href={campaignUrl(campaign.id)}
            className="focus-visible:ring-ring rounded-xl focus-visible:ring-2 focus-visible:outline-none"
            aria-label={`Open ${campaign.name}`}
        >
            <Card className="h-full gap-4 transition-shadow hover:shadow-md" data-testid="campaign-card">
                <CardHeader className="flex flex-row items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-col gap-1.5">
                        <CardTitle className="truncate">{campaign.name}</CardTitle>
                        <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                            <span className="inline-flex min-w-0 items-center gap-1">
                                <Bot className="size-3.5 shrink-0" aria-hidden />
                                <span className="truncate">{campaign.agentName ?? 'Deleted agent'}</span>
                            </span>
                            <span className="inline-flex items-center gap-1 tabular-nums">
                                <Phone className="size-3.5 shrink-0" aria-hidden />
                                {campaign.phoneNumber ?? 'Removed number'}
                            </span>
                            <span className="inline-flex min-w-0 items-center gap-1">
                                <Clock className="size-3.5 shrink-0" aria-hidden />
                                <span className="truncate">{windowLabel(campaign.window)}</span>
                            </span>
                        </div>
                    </div>
                    <CampaignStatusBadge status={campaign.status} />
                </CardHeader>
                <CardContent>
                    <CampaignProgress stats={campaign.stats} />
                </CardContent>
            </Card>
        </Link>
    );
}
