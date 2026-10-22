'use client';

import Link from 'next/link';
import { Bot, Braces, Clock, Phone, RotateCcw, Trash2, Wallet, X, type LucideIcon } from 'lucide-react';
import { VoiceCampaignStatus } from '@aixellabs/backend/db/types';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { ConfirmDialog } from '@/components/wrappers/ConfirmDialog';
import { usePage } from '@/contexts/PageStore';
import { formatPhone } from '@/helpers/voice-campaign-contacts';
import { voiceAgentUrl } from '@/helpers/voice-routes';
import type { UseCampaignDetailPageReturn } from '../_hooks/use-campaign-detail-page';
import { CampaignActionButton } from '../../_components/CampaignActionButton';
import { CampaignCost } from '../../_components/CampaignCost';
import { CampaignProgress } from '../../_components/CampaignProgress';
import { CampaignStatusBadge } from '../../_components/CampaignStatusBadge';
import { campaignStateText, retryLabel, windowLabel } from '../../_utils/campaign-format';
import { CampaignContacts } from './CampaignContacts';

function Actions() {
    const { campaign, busy, runAction, setConfirm } = usePage<UseCampaignDetailPageReturn>();
    const live = campaign.status === VoiceCampaignStatus.RUNNING || campaign.status === VoiceCampaignStatus.PAUSED;

    return (
        <div className="flex flex-wrap gap-2">
            <CampaignActionButton status={campaign.status} busy={busy} onAction={(action) => void runAction(action)} />
            {live ? (
                <Button variant="ghost" onClick={() => setConfirm('cancel')} disabled={busy !== null}>
                    <X className="size-4" />
                    Cancel campaign
                </Button>
            ) : (
                <Button variant="ghost" onClick={() => setConfirm('delete')} disabled={busy !== null}>
                    <Trash2 className="size-4" />
                    Delete
                </Button>
            )}
        </div>
    );
}

function Fact({ icon: Icon, label, children }: { icon: LucideIcon; label: string; children: React.ReactNode }) {
    return (
        <div className="flex min-w-0 gap-2.5">
            <Icon className="text-muted-foreground mt-0.5 size-4 shrink-0" aria-hidden />
            <div className="flex min-w-0 flex-col">
                <dt className="text-muted-foreground text-xs">{label}</dt>
                <dd className="text-sm break-words">{children}</dd>
            </div>
        </div>
    );
}

function Settings() {
    const { campaign } = usePage<UseCampaignDetailPageReturn>();
    return (
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
            <Fact icon={Bot} label="Agent">
                <Link href={voiceAgentUrl(campaign.agentId)} className="text-primary underline-offset-4 hover:underline">
                    {campaign.agentName ?? 'Deleted agent'}
                </Link>
            </Fact>
            <Fact icon={Phone} label="Calls from">
                <span className="tabular-nums">
                    {campaign.phoneNumber ? formatPhone(campaign.phoneNumber) : 'Removed number'}
                </span>
            </Fact>
            <Fact icon={Clock} label="Calling hours">
                {windowLabel(campaign.window)}, {campaign.maxConcurrent} at a time
            </Fact>
            <Fact icon={RotateCcw} label="If nobody answers">
                {retryLabel(campaign.retry)}
            </Fact>
            <Fact icon={Braces} label="Columns the agent gets">
                {campaign.variableKeys.length ? (
                    <span className="font-mono text-xs">{campaign.variableKeys.map((k) => `{{${k}}}`).join(' ')}</span>
                ) : (
                    'Name and phone only'
                )}
            </Fact>
            <Fact icon={Wallet} label="Cost so far">
                <CampaignCost campaign={campaign} className="[&>svg]:hidden" />
            </Fact>
        </dl>
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
                            <p
                                className="text-muted-foreground text-sm"
                                data-testid="campaign-state"
                                suppressHydrationWarning
                            >
                                {campaignStateText(campaign)}
                            </p>
                        </div>
                        <Actions />
                    </div>
                    {campaign.lastError && campaign.status === VoiceCampaignStatus.PAUSED ? (
                        <Alert variant="destructive" data-testid="campaign-error">
                            <AlertTitle>The engine paused this campaign</AlertTitle>
                            <AlertDescription>{campaign.lastError}</AlertDescription>
                        </Alert>
                    ) : null}
                    <CampaignProgress stats={campaign.stats} detailed />
                    <Separator />
                    <Settings />
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
