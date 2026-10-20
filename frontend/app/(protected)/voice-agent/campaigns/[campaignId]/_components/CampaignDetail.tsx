'use client';

import Link from 'next/link';
import { Bot, Clock, Loader2, Pause, Phone, Play, RotateCcw, Trash2, X } from 'lucide-react';
import { VoiceCampaignStatus } from '@aixellabs/backend/db/types';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/wrappers/ConfirmDialog';
import { usePage } from '@/contexts/PageStore';
import { voiceAgentUrl } from '@/helpers/voice-routes';
import type { UseCampaignDetailPageReturn } from '../_hooks/use-campaign-detail-page';
import { CampaignProgress } from '../../_components/CampaignProgress';
import { CampaignStatusBadge } from '../../_components/CampaignStatusBadge';
import { formatShortDateTime, minutesLabel } from '@/helpers/voice-time';
import { isWindowOpen, RETRY_OUTCOMES, windowLabel } from '../../_utils/campaign-format';
import { CampaignContacts } from './CampaignContacts';

function Actions() {
    const { campaign, busy, runAction, setConfirm } = usePage<UseCampaignDetailPageReturn>();
    const spin = (action: string) => (busy === action ? <Loader2 className="size-4 animate-spin" /> : null);
    const disabled = busy !== null;

    return (
        <div className="flex flex-wrap gap-2">
            {campaign.status === VoiceCampaignStatus.DRAFT ? (
                <Button onClick={() => void runAction('start')} disabled={disabled}>
                    {spin('start') ?? <Play className="size-4" />}
                    Start
                </Button>
            ) : null}
            {campaign.status === VoiceCampaignStatus.RUNNING ? (
                <Button variant="outline" onClick={() => void runAction('pause')} disabled={disabled}>
                    {spin('pause') ?? <Pause className="size-4" />}
                    Pause
                </Button>
            ) : null}
            {campaign.status === VoiceCampaignStatus.PAUSED ? (
                <Button onClick={() => void runAction('resume')} disabled={disabled}>
                    {spin('resume') ?? <RotateCcw className="size-4" />}
                    Resume
                </Button>
            ) : null}
            {campaign.status === VoiceCampaignStatus.RUNNING || campaign.status === VoiceCampaignStatus.PAUSED ? (
                <Button variant="ghost" onClick={() => setConfirm('cancel')} disabled={disabled}>
                    <X className="size-4" />
                    Cancel campaign
                </Button>
            ) : null}
            {campaign.status !== VoiceCampaignStatus.RUNNING && campaign.status !== VoiceCampaignStatus.PAUSED ? (
                <Button variant="ghost" onClick={() => setConfirm('delete')} disabled={disabled}>
                    <Trash2 className="size-4" />
                    Delete
                </Button>
            ) : null}
        </div>
    );
}

/** What the campaign is doing right now, in one line. */
function StateLine() {
    const { campaign } = usePage<UseCampaignDetailPageReturn>();
    const open = isWindowOpen(campaign.window);
    let text: string;
    switch (campaign.status) {
        case VoiceCampaignStatus.DRAFT:
            text = 'Draft: nobody is called until you start it.';
            break;
        case VoiceCampaignStatus.RUNNING:
            text = open
                ? 'Calling now, inside its hours.'
                : 'Outside its calling hours now: calls start again when they open.';
            break;
        case VoiceCampaignStatus.PAUSED:
            text = 'Paused: no new calls until you resume.';
            break;
        case VoiceCampaignStatus.COMPLETED:
            text = campaign.completedAt ? `Finished ${formatShortDateTime(campaign.completedAt)}.` : 'Finished.';
            break;
        default:
            text = 'Cancelled: contacts not called yet were dropped.';
    }
    return (
        <p className="text-muted-foreground text-sm" data-testid="campaign-state" suppressHydrationWarning>
            {text}
        </p>
    );
}

function Settings() {
    const { campaign } = usePage<UseCampaignDetailPageReturn>();
    const retryOn = RETRY_OUTCOMES.filter((o) => campaign.retry.on.includes(o.value))
        .map((o) => o.label.toLowerCase())
        .join(', ');
    return (
        <div className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
            <Link
                href={voiceAgentUrl(campaign.agentId)}
                className="hover:text-foreground inline-flex min-w-0 items-center gap-1 underline-offset-4 hover:underline"
            >
                <Bot className="size-3.5 shrink-0" aria-hidden />
                <span className="truncate">{campaign.agentName ?? 'Deleted agent'}</span>
            </Link>
            <span className="inline-flex items-center gap-1 tabular-nums">
                <Phone className="size-3.5 shrink-0" aria-hidden />
                {campaign.phoneNumber ?? 'Removed number'}
            </span>
            <span className="inline-flex min-w-0 items-center gap-1">
                <Clock className="size-3.5 shrink-0" aria-hidden />
                <span className="break-words">{windowLabel(campaign.window)}</span>
            </span>
            <span>
                {campaign.maxConcurrent} at once ·{' '}
                {campaign.retry.maxRetries === 0 || !retryOn
                    ? 'no retries'
                    : `${campaign.retry.maxRetries} ${campaign.retry.maxRetries === 1 ? 'retry' : 'retries'} on ${retryOn}, ${minutesLabel(campaign.retry.delayMinutes)} apart`}
            </span>
        </div>
    );
}

export function CampaignDetail() {
    const { campaign, confirm, setConfirm, busy, runAction, remove } = usePage<UseCampaignDetailPageReturn>();

    return (
        <>
            <Card className="gap-4">
                <CardContent className="flex flex-col gap-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="flex min-w-0 flex-col gap-1.5">
                            <div className="flex min-w-0 flex-wrap items-center gap-2">
                                <h2 className="truncate text-lg font-semibold" data-testid="campaign-name">
                                    {campaign.name}
                                </h2>
                                <CampaignStatusBadge status={campaign.status} />
                            </div>
                            <StateLine />
                        </div>
                        <Actions />
                    </div>
                    <Settings />
                    {campaign.lastError && campaign.status === VoiceCampaignStatus.PAUSED ? (
                        <Alert variant="destructive" data-testid="campaign-error">
                            <AlertTitle>The engine paused this campaign</AlertTitle>
                            <AlertDescription>{campaign.lastError}</AlertDescription>
                        </Alert>
                    ) : null}
                    <CampaignProgress stats={campaign.stats} detailed />
                </CardContent>
            </Card>

            <CampaignContacts />

            <ConfirmDialog
                open={confirm === 'cancel'}
                onOpenChange={(open) => !open && !busy && setConfirm(null)}
                title="Cancel this campaign?"
                description={campaign.name}
                alertMessage="Nobody else is called. Calls already in progress finish. This cannot be undone."
                onConfirm={() => void runAction('cancel')}
                isLoading={busy === 'cancel'}
                confirmText="Cancel campaign"
                cancelText="Keep it"
            />
            <ConfirmDialog
                open={confirm === 'delete'}
                onOpenChange={(open) => !open && !busy && setConfirm(null)}
                title="Delete this campaign?"
                description={campaign.name}
                alertMessage="The campaign and its contact list are deleted. Its calls stay in Call logs."
                onConfirm={() => void remove()}
                isLoading={busy === 'delete'}
                confirmText="Delete"
                cancelText="Keep it"
            />
        </>
    );
}
