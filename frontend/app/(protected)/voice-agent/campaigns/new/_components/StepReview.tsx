'use client';

import { ShieldBan } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { usePage } from '@/contexts/PageStore';
import { minutesLabel } from '@/helpers/voice-time';
import { RETRY_OUTCOMES, windowLabel } from '../../_utils/campaign-format';
import type { UseNewCampaignPageReturn } from '../_hooks/use-new-campaign-page';

function Row({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="flex flex-col gap-0.5 py-2 sm:flex-row sm:gap-4">
            <dt className="text-muted-foreground w-36 shrink-0 text-sm">{label}</dt>
            <dd className="min-w-0 text-sm break-words">{children}</dd>
        </div>
    );
}

export function StepReview() {
    const { name, agents, agentId, numbers, numberId, check, variables, callWindow, maxConcurrent, retry, uploaded, submitError } =
        usePage<UseNewCampaignPageReturn>();
    const agent = agents.find((a) => a.id === agentId);
    const number = numbers.find((n) => n.id === numberId);
    const retryOn = RETRY_OUTCOMES.filter((o) => retry.on.includes(o.value))
        .map((o) => o.label.toLowerCase())
        .join(', ');

    return (
        <div className="flex flex-col gap-4">
            <dl className="divide-y" data-testid="campaign-review">
                <Row label="Name">{name.trim()}</Row>
                <Row label="Agent">{agent?.name}</Row>
                <Row label="Calls from">
                    <span className="tabular-nums">{number?.phoneNumber}</span>
                </Row>
                <Row label="Contacts">
                    {check?.contacts.length.toLocaleString()}
                    {variables.length ? (
                        <span className="text-muted-foreground"> · variables {variables.map((v) => v.key).join(', ')}</span>
                    ) : null}
                </Row>
                <Row label="Calling hours">{windowLabel(callWindow)}</Row>
                <Row label="Calls at once">{maxConcurrent}</Row>
                <Row label="Retries">
                    {retry.maxRetries === 0
                        ? 'None: each contact is called once'
                        : `Up to ${retry.maxRetries} more ${retry.maxRetries === 1 ? 'call' : 'calls'} on ${retryOn}, ${minutesLabel(retry.delayMinutes)} apart`}
                </Row>
            </dl>
            <p className="text-muted-foreground flex items-start gap-2 text-sm">
                <ShieldBan className="mt-0.5 size-4 shrink-0" aria-hidden />
                Anyone on the do-not-call list (people who asked not to be called on an earlier call) is skipped and marked
                in the contact list. They are never dialled.
            </p>
            {uploaded ? (
                <div className="flex flex-col gap-1.5" aria-live="polite">
                    <span className="text-muted-foreground text-xs tabular-nums">
                        Saving contacts {uploaded.sent.toLocaleString()} / {uploaded.total.toLocaleString()}
                    </span>
                    <Progress value={uploaded.total ? (uploaded.sent / uploaded.total) * 100 : 0} />
                </div>
            ) : null}
            {submitError ? (
                <Alert variant="destructive">
                    <AlertDescription>{submitError}</AlertDescription>
                </Alert>
            ) : null}
        </div>
    );
}
