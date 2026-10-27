'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { MessageCircleMore, PhoneIncoming, PhoneOff, PhoneOutgoing, Trash2 } from 'lucide-react';
import { VoiceAgentCallType, VoiceProvider } from '@aixellabs/backend/db/types';
import type { VoiceNumberListItem } from '@/app/actions/voice-number-actions';
import { NumberProviderLogo } from '@/components/common/voice-agent/NumberProviderLogo';
import { Button } from '@/components/ui/button';
import { useDisplayCurrency } from '@/contexts/DisplayCurrency';
import { usePage } from '@/contexts/PageStore';
import { estimateAgentCost, formatMoney, RATE_COUNTRY_NAME, rateCountry } from '@/helpers/voice-call-cost';
import { numberProviderInfo } from '@/helpers/voice-number-providers';
import { GEMINI_KEY_URL, voiceAgentUrl, WHATSAPP_NUMBERS_URL, WHATSAPP_URL } from '@/helpers/voice-routes';
import { GEMINI_ALWAYS } from '@/helpers/voice-stack';
import { cn } from '@/lib/utils';
import type { UsePhoneNumbersPageReturn } from '../_hooks/use-phone-numbers-page';

const LINK = 'font-medium underline-offset-4 hover:underline';

/** One agent use of the number, as the agent editor set it. */
type NumberUse = { callType: VoiceAgentCallType; agentId: string; name: string };

/** "Answers calls with Front desk" / "Places calls with Outreach" (a WhatsApp number: "Answers chats and calls with"), linking to the agent while it exists. */
function UseLine({ use, exists, whatsapp }: { use: NumberUse; exists: boolean; whatsapp: boolean }) {
    const inbound = use.callType === VoiceAgentCallType.INBOUND;
    const Icon = whatsapp ? MessageCircleMore : inbound ? PhoneIncoming : PhoneOutgoing;
    return (
        <p className="flex items-center gap-1.5 text-sm">
            <Icon className="text-muted-foreground size-3.5 shrink-0" aria-hidden />
            {whatsapp ? 'Answers chats and calls with' : inbound ? 'Answers calls with' : 'Places calls with'}{' '}
            {exists ? (
                <Link className={cn(LINK, 'text-primary')} href={voiceAgentUrl(use.agentId)}>
                    {use.name}
                </Link>
            ) : (
                <span className="font-medium">{use.name}</span>
            )}
        </p>
    );
}

/** The same number connected the other way: a phone line also on WhatsApp, and the one click to share its agent. */
function TwinLine({ number }: { number: VoiceNumberListItem }) {
    const { twinOf, shareTwin, sharing } = usePage<UsePhoneNumbersPageReturn>();
    const twin = twinOf(number);
    if (!twin) return null;
    if (number.provider !== VoiceProvider.WHATSAPP) {
        return (
            <p className="flex items-center gap-1.5 text-xs" data-testid="number-twin">
                <NumberProviderLogo provider={VoiceProvider.WHATSAPP} className="size-3.5" />
                <span>
                    Also on WhatsApp{twin.inboundAgentName ? `, answered by ${twin.inboundAgentName}` : ''}.{' '}
                    <Link className={cn(LINK, 'text-primary')} href={WHATSAPP_NUMBERS_URL}>
                        See it
                    </Link>
                </span>
            </p>
        );
    }
    const phoneAgent = twin.inboundAgentId && twin.inboundAgentId !== number.inboundAgentId ? twin.inboundAgentName : null;
    return (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs" data-testid="number-twin">
            <span className="flex items-center gap-1.5">
                <NumberProviderLogo provider={twin.provider} className="size-3.5" />
                Also your {numberProviderInfo(twin.provider).label} phone line
                {twin.inboundAgentName ? `, answered by ${twin.inboundAgentName}` : ''}.
            </span>
            {phoneAgent ? (
                <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    disabled={sharing === number._id}
                    onClick={() => void shareTwin(number)}
                >
                    Use {phoneAgent} here too (one memory)
                </Button>
            ) : null}
        </div>
    );
}

export function PhoneNumberRow({ number }: { number: VoiceNumberListItem }) {
    const { agents, hasGeminiKey, geminiKey, setTestCallNumber, setRemoveTarget } = usePage<UsePhoneNumbersPageReturn>();
    const currency = useDisplayCurrency();
    const providerLabel = numberProviderInfo(number.provider).label;
    const whatsapp = number.provider === VoiceProvider.WHATSAPP;

    const uses: NumberUse[] = [];
    if (number.inboundAgentId) {
        uses.push({
            callType: VoiceAgentCallType.INBOUND,
            agentId: number.inboundAgentId,
            name: number.inboundAgentName ?? 'a deleted agent',
        });
    }
    if (number.outboundAgentId) {
        uses.push({
            callType: VoiceAgentCallType.OUTBOUND,
            agentId: number.outboundAgentId,
            name: number.outboundAgentName ?? 'a deleted agent',
        });
    }
    const agentOf = (use: NumberUse) => agents.find((a) => a.id === use.agentId);
    // Set before the agent decided the job: its type no longer matches what the number does.
    const mismatched = uses.find((use) => {
        const agent = agentOf(use);
        return agent && agent.callType !== use.callType;
    });

    let status: { attention: boolean; text: ReactNode } | null = null;
    if (uses.length === 0) {
        // Not linked: the line above says it all.
    } else if (mismatched) {
        status = {
            attention: true,
            text: `${mismatched.name} is now an agent that ${mismatched.callType === VoiceAgentCallType.INBOUND ? 'makes' : 'answers'} calls. Link the number again from it.`,
        };
    } else if (!uses.every(agentOf)) {
        status = { attention: true, text: 'Its agent was deleted.' };
    } else if (!hasGeminiKey) {
        status = {
            attention: true,
            text: (
                <span data-testid="gemini-key-hint">
                    Add a Gemini API key so the AI can take calls: {GEMINI_ALWAYS}.{' '}
                    <Link className={cn(LINK, 'underline')} href={GEMINI_KEY_URL}>
                        Add key
                    </Link>
                </span>
            ),
        };
    } else if (whatsapp) {
        const calling = number.whatsappCalling;
        status = {
            attention: !!calling && !calling.on,
            text: calling?.on
                ? 'Chats and WhatsApp calls are on. Meta charges nothing for messages and calls people start.'
                : calling
                  ? `Chats are on. Calls are off: ${calling.problem ?? 'Meta did not turn calling on'}`
                  : 'Chats are on.',
        };
    } else {
        // Its own country: a minute in to it, or out to numbers like it (a VoiceLink plan's rate is not published).
        const country = rateCountry(number.phoneNumber);
        const estimate = estimateAgentCost({
            promptChars: agentOf(uses[0])?.promptChars ?? 0,
            freeTier: geminiKey.tier === 'free',
            callType: uses[0].callType,
            providers: [number.provider],
            phone: number.phoneNumber,
        });
        status = {
            attention: false,
            text: (
                <span data-testid="number-cost-estimate">
                    About {formatMoney(estimate.usdPerMinute, currency)} a minute
                    {uses[0].callType === VoiceAgentCallType.OUTBOUND && country ? ` to ${RATE_COUNTRY_NAME[country]}` : ''}
                    {estimate.providers[0].usdPerMinute === null ? ` plus ${providerLabel}’s own charge` : ''}
                </span>
            ),
        };
    }

    return (
        <li
            data-testid="voice-number-row"
            aria-label={number.phoneNumber}
            className="grid gap-3 px-4 py-4 sm:grid-cols-[minmax(9rem,13rem)_1fr_auto] sm:items-center sm:gap-6 sm:px-5"
        >
            <div className="flex min-w-0 items-center gap-3">
                <NumberProviderLogo provider={number.provider} />
                <div className="min-w-0">
                    <p className="font-semibold tabular-nums">{number.phoneNumber}</p>
                    <p className="text-muted-foreground text-xs" data-testid="number-provider">
                        {providerLabel}
                    </p>
                </div>
            </div>

            <div className="grid min-w-0 gap-1" data-testid="number-use">
                {uses.length === 0 ? (
                    <p className="text-muted-foreground flex items-center gap-1.5 text-sm">
                        <PhoneOff className="size-3.5 shrink-0" aria-hidden />
                        Not linked to an agent
                    </p>
                ) : (
                    uses.map((use) => <UseLine key={use.callType} use={use} exists={!!agentOf(use)} whatsapp={whatsapp} />)
                )}
                <TwinLine number={number} />
                {status ? (
                    <p
                        className={cn(
                            'text-xs',
                            status.attention ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground',
                        )}
                    >
                        {status.text}
                    </p>
                ) : null}
            </div>

            <div className="flex items-center gap-2 sm:justify-end">
                {whatsapp ? (
                    <Button asChild variant="outline" size="sm">
                        <Link href={WHATSAPP_URL}>
                            <MessageCircleMore className="size-3.5" aria-hidden />
                            Open inbox
                        </Link>
                    </Button>
                ) : (
                    <Button type="button" variant="outline" size="sm" onClick={() => setTestCallNumber(number)}>
                        <PhoneOutgoing className="size-3.5" aria-hidden />
                        Test call
                    </Button>
                )}
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground hover:text-destructive size-8"
                    aria-label={`Remove ${number.phoneNumber}`}
                    onClick={() => setRemoveTarget(number)}
                >
                    <Trash2 className="size-4" aria-hidden />
                </Button>
            </div>
        </li>
    );
}
