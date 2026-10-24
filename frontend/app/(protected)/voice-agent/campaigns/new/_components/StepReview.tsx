'use client';

import { Bot, Clock, Play, RotateCcw, Users, Wallet } from 'lucide-react';
import { VoiceAgentCallType } from '@aixellabs/backend/db/types';
import { SettingsSection } from '@/components/common/SettingsSection';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { useDisplayCurrency } from '@/contexts/DisplayCurrency';
import { usePage } from '@/contexts/PageStore';
import { estimateAgentCost, formatMoney } from '@/helpers/voice-call-cost';
import { formatPhone } from '@/helpers/voice-campaign-contacts';
import { numberProviderInfo } from '@/helpers/voice-number-providers';
import { nextWindowLabel, retryLabel, windowLabel } from '../../_utils/campaign-format';
import type { UseNewCampaignPageReturn } from '../_hooks/use-new-campaign-page';

const SAMPLE_NAMES = 3;

function CostEstimate() {
    const { agent, numbers, numberId, check, geminiFreeTier } = usePage<UseNewCampaignPageReturn>();
    const currency = useDisplayCurrency();
    const number = numbers.find((n) => n.id === numberId);
    if (!number || !check) return null;
    const estimate = estimateAgentCost({
        promptChars: agent?.promptChars ?? 0,
        freeTier: geminiFreeTier,
        callType: VoiceAgentCallType.OUTBOUND,
        providers: [number.provider],
    });
    const contacts = check.contacts.length;
    const low = contacts * estimate.usdPerMinute;
    const high = contacts * estimate.typicalCallMinutes * estimate.usdPerMinute;
    const provider = numberProviderInfo(number.provider).label;

    return (
        <SettingsSection titleId="review-cost" icon={Wallet} title="Estimated cost">
            <p className="text-sm" data-testid="campaign-cost-estimate">
                If everyone picks up and talks for 1 to {estimate.typicalCallMinutes} minutes:{' '}
                <span className="font-medium tabular-nums">
                    {formatMoney(low, currency)} – {formatMoney(high, currency)}
                </span>
                , at about {formatMoney(estimate.usdPerMinute, currency)} a minute.
            </p>
            <p className="text-muted-foreground text-xs">
                Calls nobody picks up cost little, so most campaigns land near the low end.
                {geminiFreeTier ? ' Its Gemini key is on the free tier, so the Gemini parts cost nothing.' : ''}
                {estimate.providers[0]?.usdPerMinute === null
                    ? ` ${provider} publishes no rate, so its own charge is not included.`
                    : ''}{' '}
                The campaign page shows what was really spent as calls end.
            </p>
        </SettingsSection>
    );
}

export function StepReview() {
    const { name, agent, numbers, numberId, check, variables, callWindow, maxConcurrent, retry, uploaded, submitError } =
        usePage<UseNewCampaignPageReturn>();
    const number = numbers.find((n) => n.id === numberId);
    const contacts = check?.contacts ?? [];
    const skipped = (check?.invalid.length ?? 0) + (check?.duplicates.length ?? 0);
    const names = contacts.flatMap((c) => (c.name ? [c.name] : [])).slice(0, SAMPLE_NAMES);
    const next = nextWindowLabel(callWindow);

    return (
        <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-5 divide-y [&>*:not(:last-child)]:pb-5" data-testid="campaign-review">
                <SettingsSection
                    titleId="review-who"
                    icon={Users}
                    title={`${contacts.length.toLocaleString()} contacts to call`}
                >
                    <p className="text-sm">
                        {names.length ? (
                            <>
                                {names.join(', ')}
                                {contacts.length > names.length
                                    ? ` and ${(contacts.length - names.length).toLocaleString()} more`
                                    : ''}
                                .
                            </>
                        ) : (
                            'No names in the file: the agent will not greet people by name.'
                        )}
                        {skipped ? (
                            <span className="text-muted-foreground">
                                {' '}
                                {skipped.toLocaleString()} {skipped === 1 ? 'row is' : 'rows are'} skipped (no usable number,
                                or a repeat).
                            </span>
                        ) : null}
                    </p>
                    {variables.length ? (
                        <p className="text-muted-foreground text-sm">
                            Each call also gets{' '}
                            {variables.map((v, i) => (
                                <span key={v.key}>
                                    {i ? ', ' : ''}
                                    <code className="bg-muted rounded px-1 font-mono text-xs">{`{{${v.key}}}`}</code>
                                </span>
                            ))}
                            .
                        </p>
                    ) : null}
                </SettingsSection>

                <SettingsSection
                    titleId="review-agent"
                    icon={Bot}
                    title={`${name.trim()}, by ${agent?.name ?? 'the agent'}`}
                >
                    <p className="text-sm">
                        Calls go out from{' '}
                        <span className="font-medium tabular-nums">{number ? formatPhone(number.phoneNumber) : ''}</span>
                        {number ? ` (${numberProviderInfo(number.provider).label})` : ''}.
                    </p>
                </SettingsSection>

                <SettingsSection titleId="review-when" icon={Clock} title="When">
                    <p className="text-sm">
                        {windowLabel(callWindow)}, {maxConcurrent} {maxConcurrent === 1 ? 'call' : 'calls'} at a time.
                    </p>
                </SettingsSection>

                <SettingsSection titleId="review-retries" icon={RotateCcw} title="If nobody answers">
                    <p className="text-sm">{retryLabel(retry)}.</p>
                </SettingsSection>

                <CostEstimate />

                <SettingsSection titleId="review-start" icon={Play} title="When you press Create and start">
                    <ol className="text-muted-foreground list-decimal space-y-1 pl-5 text-sm" suppressHydrationWarning>
                        <li>The contacts are saved to the campaign.</li>
                        <li>
                            {next
                                ? `It is outside the calling hours now, so the first calls go out ${next}.`
                                : `Calls start within a minute, ${maxConcurrent} at a time.`}
                        </li>
                        <li>
                            Anyone on the do-not-call list (people who asked not to be called before) is skipped, never
                            dialled.
                        </li>
                        <li>
                            You can pause or cancel it any time; answers, bookings and cost update live on the campaign’s
                            page.
                        </li>
                    </ol>
                    <p className="text-muted-foreground text-xs">Save as draft keeps it all without calling anyone.</p>
                </SettingsSection>
            </div>
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
