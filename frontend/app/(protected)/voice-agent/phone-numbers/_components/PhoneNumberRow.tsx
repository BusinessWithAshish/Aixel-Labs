'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { BookOpen, EllipsisVertical, PhoneIncoming, PhoneOff, PhoneOutgoing, Trash2, TriangleAlert } from 'lucide-react';
import { VoiceAgentCallType } from '@aixellabs/backend/db/types';
import type { VoiceNumberListItem } from '@/app/actions/voice-number-actions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItems, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useDisplayCurrency } from '@/contexts/DisplayCurrency';
import { usePage } from '@/contexts/PageStore';
import { estimateAgentCost, formatMoney } from '@/helpers/voice-call-cost';
import { numberProviderInfo } from '@/helpers/voice-number-providers';
import { GEMINI_KEY_URL } from '@/helpers/voice-routes';
import { cn } from '@/lib/utils';
import type { UsePhoneNumbersPageReturn } from '../_hooks/use-phone-numbers-page';
import { setupGuideFor } from '../_utils/setup-guides';
import { jobAgentId, numberBadge, numberJob } from '../_utils/number-job';

const JOB_ICON = {
    [VoiceAgentCallType.INBOUND]: PhoneIncoming,
    [VoiceAgentCallType.OUTBOUND]: PhoneOutgoing,
    NONE: PhoneOff,
};

/** How the number is doing: ready, needs attention (and why), or not in use. */
type NumberStatus = { tone: 'ok' | 'attention' | 'idle'; text: ReactNode };

const TONE_CLASS: Record<NumberStatus['tone'], string> = {
    ok: 'text-muted-foreground',
    attention: 'text-amber-700 dark:text-amber-400',
    idle: 'text-muted-foreground',
};

export function PhoneNumberRow({ number }: { number: VoiceNumberListItem }) {
    const { agents, hasGeminiKey, geminiKey, openJobDialog, setTestCallNumber, setRemoveTarget, openSetupGuide } =
        usePage<UsePhoneNumbersPageReturn>();
    const currency = useDisplayCurrency();
    const job = numberJob(number);
    const badge = numberBadge(job);
    const JobIcon = job ? JOB_ICON[job] : TriangleAlert;
    const providerLabel = numberProviderInfo(number.provider).label;
    const agent = agents.find((a) => a.id === jobAgentId(number, job));

    let status: NumberStatus;
    if (job === null) {
        status = {
            tone: 'attention',
            text: `${number.inboundAgentName ?? 'An agent'} answers its calls and ${number.outboundAgentName ?? 'an agent'} makes calls from it. A number now does one job: pick the one it keeps.`,
        };
    } else if (job === 'NONE') {
        status = { tone: 'idle', text: 'Calls ring the way they always have.' };
    } else if (!agent) {
        status = { tone: 'attention', text: 'Its agent was deleted. Pick another one.' };
    } else if (!hasGeminiKey) {
        status = {
            tone: 'attention',
            text: (
                <span data-testid="gemini-key-hint">
                    Add your Gemini API key so the AI can take calls.{' '}
                    <Link className="font-medium underline underline-offset-4" href={GEMINI_KEY_URL}>
                        Add key
                    </Link>
                </span>
            ),
        };
    } else {
        // Roughly what a minute costs with this agent (a VoiceLink plan's rate is not published).
        const estimate = estimateAgentCost({
            promptChars: agent.promptChars,
            freeTier: geminiKey.tier === 'free',
            callType: job,
            providers: [number.provider],
        });
        status = {
            tone: 'ok',
            text: (
                <>
                    Ready ·{' '}
                    <span data-testid="number-cost-estimate">
                        about {formatMoney(estimate.usdPerMinute, currency)} a minute
                        {estimate.providers[0].usdPerMinute === null ? ` plus ${providerLabel}’s own charge` : ''}
                    </span>
                </>
            ),
        };
    }

    const guide = setupGuideFor(number.provider);

    return (
        <li
            data-testid="voice-number-row"
            aria-label={number.phoneNumber}
            className="grid gap-3 px-4 py-4 sm:grid-cols-[minmax(9rem,13rem)_1fr_auto] sm:items-center sm:gap-6 sm:px-5"
        >
            <div className="min-w-0">
                <p className="font-semibold tabular-nums">{number.phoneNumber}</p>
                <p className="text-muted-foreground text-xs" data-testid="number-provider">
                    {providerLabel}
                </p>
            </div>

            <div className="grid min-w-0 gap-1.5">
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                    <Badge variant={badge.variant} data-testid="number-job">
                        <JobIcon aria-hidden />
                        {badge.label}
                    </Badge>
                    {job !== null && job !== 'NONE' ? (
                        <span>
                            with <span className="font-medium">{agent?.name ?? 'a deleted agent'}</span>
                        </span>
                    ) : null}
                </p>
                <p className={cn('flex items-baseline gap-1.5 text-xs', TONE_CLASS[status.tone])}>
                    <span
                        aria-hidden
                        className={cn(
                            'size-1.5 shrink-0 translate-y-[-1px] rounded-full',
                            status.tone === 'ok'
                                ? 'bg-green-500'
                                : status.tone === 'attention'
                                  ? 'bg-amber-500'
                                  : 'bg-muted-foreground/50',
                        )}
                    />
                    <span>{status.text}</span>
                </p>
            </div>

            <div className="flex items-center gap-2 sm:justify-end">
                <Button
                    type="button"
                    variant={status.tone === 'attention' ? 'default' : 'outline'}
                    size="sm"
                    aria-label={`Change what ${number.phoneNumber} does`}
                    onClick={() => openJobDialog(number)}
                >
                    Change
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => setTestCallNumber(number)}>
                    <PhoneOutgoing className="size-3.5" aria-hidden />
                    Test call
                </Button>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-8"
                            aria-label={`More for ${number.phoneNumber}`}
                        >
                            <EllipsisVertical className="size-4" aria-hidden />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuItems
                            options={[
                                {
                                    label: `${providerLabel} setup guide`,
                                    icon: BookOpen,
                                    hidden: !guide,
                                    onSelect: () => openSetupGuide(number.provider),
                                },
                                {
                                    label: 'Remove',
                                    icon: Trash2,
                                    variant: 'destructive',
                                    onSelect: () => setRemoveTarget(number),
                                },
                            ]}
                        />
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        </li>
    );
}
