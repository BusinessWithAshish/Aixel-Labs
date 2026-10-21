'use client';

import Link from 'next/link';
import { VOICE_AGENT_SUB_MODULES } from '@aixellabs/backend/db/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { SubModuleUrls } from '@/config/app-config';
import { useDisplayCurrency } from '@/contexts/DisplayCurrency';
import { usePage } from '@/contexts/PageStore';
import { costPerMinute, formatMoney } from '@/helpers/voice-call-cost';
import { numberProviderInfo } from '@/helpers/voice-number-providers';
import type { UseVoiceAgentEditorPageReturn } from '../_hooks/use-voice-agent-editor-page';

const CALL_LOGS_URL = SubModuleUrls[VOICE_AGENT_SUB_MODULES.CALL_LOGS];

/**
 * Roughly what a minute with this agent costs the owner, before any call: Gemini on their key (more
 * for a longer prompt, nothing on a free-tier key) plus the phone provider of each number it is on.
 * Beside it, once calls exist, what they really cost.
 */
export function VoiceAgentCostEstimate() {
    const { agentId, costEstimate: estimate, costTotals } = usePage<UseVoiceAgentEditorPageReturn>();
    const currency = useDisplayCurrency();
    const money = (usd: number) => formatMoney(usd, currency);
    const real = costTotals ? costPerMinute(costTotals.totalUsd, costTotals.durationSec) : null;

    const lines = [
        estimate.geminiUsdPerMinute === 0
            ? 'Gemini: free (your key is on Google’s free tier)'
            : `Gemini: ${money(estimate.geminiUsdPerMinute)} (a prompt of about ${estimate.promptTokens.toLocaleString('en-US')} tokens, read again every turn)`,
        ...estimate.providers.map(({ provider, usdPerMinute }) =>
            usdPerMinute === null
                ? `${numberProviderInfo(provider).label}: your plan’s rate, not included here (each call’s charge shows in Call logs)`
                : `${numberProviderInfo(provider).label}: ${money(usdPerMinute)}`,
        ),
    ];
    if (estimate.providers.length === 0) lines.push('Phone: not on a number yet, so only Gemini (as in the playground)');

    return (
        <Card className="h-auto min-w-0 gap-3" data-testid="agent-cost-estimate">
            <CardHeader>
                <CardTitle>Cost per minute</CardTitle>
                <CardDescription>An estimate from list prices, before any call.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm">
                <p>
                    <span className="text-lg font-semibold tabular-nums" data-testid="agent-cost-per-minute">
                        About {money(estimate.usdPerMinute)}
                    </span>{' '}
                    a minute, so a {estimate.typicalCallMinutes}-minute call is about{' '}
                    <span className="tabular-nums">{money(estimate.usdPerMinute * estimate.typicalCallMinutes)}</span>.
                </p>
                <ul className="text-muted-foreground grid gap-0.5 text-xs" data-testid="agent-cost-parts">
                    {lines.map((line) => (
                        <li key={line}>{line}</li>
                    ))}
                </ul>
                <p className="text-muted-foreground text-xs" data-testid="agent-cost-real">
                    {costTotals && real !== null ? (
                        <>
                            Real so far: <span className="text-foreground font-medium">{money(real)}</span> a minute over{' '}
                            <Link
                                className="text-primary underline-offset-4 hover:underline"
                                href={`${CALL_LOGS_URL}?agent=${agentId}`}
                            >
                                {costTotals.calls} {costTotals.calls === 1 ? 'call' : 'calls'}
                            </Link>
                            {costTotals.estimated ? ' (phone part partly estimated)' : ''}.
                        </>
                    ) : (
                        'No calls yet to compare with.'
                    )}
                </p>
            </CardContent>
        </Card>
    );
}
