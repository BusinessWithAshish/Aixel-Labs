'use client';

import Link from 'next/link';
import { VOICE_AGENT_SUB_MODULES } from '@aixellabs/backend/db/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { SubModuleUrls } from '@/config/app-config';
import { useDisplayCurrency } from '@/contexts/DisplayCurrency';
import { usePage } from '@/contexts/PageStore';
import { costPerMinute, formatMoney } from '@/helpers/voice-call-cost';
import { numberProviderInfo } from '@/helpers/voice-number-providers';
import { cn } from '@/lib/utils';
import type { UseVoiceAgentEditorPageReturn } from '../_hooks/use-voice-agent-editor-page';

const CALL_LOGS_URL = SubModuleUrls[VOICE_AGENT_SUB_MODULES.CALL_LOGS];

/** "1,234". */
const count = (n: number) => n.toLocaleString('en-US');

/**
 * What a minute with this agent should cost the owner, as a bill before any call, on exactly its stack:
 * one voice model's talk time and prompt, or the three steps (the text model's share grown with the
 * prompt), then each tool that is on, and the phone. Below it, once calls exist, what they really cost.
 */
export function VoiceAgentCostEstimate() {
    const { agentId, costEstimate: estimate, costTotals } = usePage<UseVoiceAgentEditorPageReturn>();
    const currency = useDisplayCurrency();
    const money = (usd: number) => formatMoney(usd, currency);
    const real = costTotals ? costPerMinute(costTotals.totalUsd, costTotals.durationSec) : null;

    const lines: { label: string; detail: string; usd: number | null }[] = [
        ...estimate.stack.map(({ label, detail, usdPerMinute }) => ({ label, detail, usd: usdPerMinute })),
        ...estimate.tools.map(({ tool, tokens, usesPerCall, usdPerMinute }) => ({
            label: tool.kind === 'booking' ? 'Booking' : tool.name,
            detail: `${count(tokens)} tokens a turn, ~${usesPerCall} ${usesPerCall === 1 ? 'use' : 'uses'} a call`,
            usd: usdPerMinute,
        })),
        ...(estimate.providers.length === 0
            ? [{ label: 'Phone', detail: 'not on a number yet', usd: 0 }]
            : estimate.providers.map(({ provider, usdPerMinute }) => ({
                  label: numberProviderInfo(provider).label,
                  detail: usdPerMinute === null ? 'your plan’s rate, in Call logs' : 'list rate',
                  usd: usdPerMinute,
              }))),
    ];

    return (
        <Card className="border-primary/20 bg-primary/5 h-auto min-w-0 gap-3" data-testid="agent-cost-estimate">
            <CardHeader>
                <CardTitle>Cost per minute</CardTitle>
                <CardDescription>An estimate from list prices.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm">
                <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1.5" data-testid="agent-cost-parts">
                    {lines.map(({ label, detail, usd }) => (
                        <div key={label} className="contents">
                            <dt className="min-w-0 truncate">
                                {label} <span className="text-muted-foreground text-xs">· {detail}</span>
                            </dt>
                            <dd className={cn('text-right tabular-nums', usd === null && 'text-muted-foreground')}>
                                {usd === null ? '—' : money(usd)}
                            </dd>
                        </div>
                    ))}
                    <dt className="bg-primary/10 text-primary mt-1 rounded-l-md py-1.5 pl-2 font-medium">A minute</dt>
                    <dd
                        className="bg-primary/10 text-primary mt-1 rounded-r-md py-1.5 pr-2 text-right text-base font-semibold tabular-nums"
                        data-testid="agent-cost-per-minute"
                    >
                        {money(estimate.usdPerMinute)}
                    </dd>
                    <dt className="text-muted-foreground">A {estimate.typicalCallMinutes}-minute call</dt>
                    <dd className="text-right tabular-nums">{money(estimate.usdPerMinute * estimate.typicalCallMinutes)}</dd>
                </dl>
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
