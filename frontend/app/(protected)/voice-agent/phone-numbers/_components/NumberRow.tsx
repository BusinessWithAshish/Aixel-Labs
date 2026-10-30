'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { ExternalLink, Loader2, MessageCircleMore, PhoneOutgoing, Plus, Trash2 } from 'lucide-react';
import { VoiceAgentCallType, VoiceProvider } from '@aixellabs/backend/db/types';
import type { VoiceNumberListItem } from '@/app/actions/voice-number-actions';
import { NumberProviderLogo } from '@/components/common/voice-agent/NumberProviderLogo';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useDisplayCurrency } from '@/contexts/DisplayCurrency';
import { usePage } from '@/contexts/PageStore';
import { estimateAgentCost, formatMoney, RATE_COUNTRY_NAME, rateCountry } from '@/helpers/voice-call-cost';
import { numberProviderInfo } from '@/helpers/voice-number-providers';
import { GEMINI_KEY_URL, voiceAgentUrl, WHATSAPP_URL } from '@/helpers/voice-routes';
import { GEMINI_ALWAYS } from '@/helpers/voice-stack';
import { cn } from '@/lib/utils';
import type { NumberLine, UsePhoneNumbersPageReturn } from '../_hooks/use-phone-numbers-page';

const LINK = 'font-medium underline-offset-4 hover:underline';
/** The "No agent" option's value: Radix Select items cannot have an empty one. */
const NONE = 'none';

/** A number's slot: an agent that answers its calls (or, on WhatsApp, its chats and calls), or one that places calls. */
type SlotKind = VoiceAgentCallType;

const SLOT_LABEL: Record<SlotKind, string> = {
    [VoiceAgentCallType.INBOUND]: 'Answers calls',
    [VoiceAgentCallType.OUTBOUND]: 'Places calls',
};

/** The agent in one slot of the number, if any. */
function holderOf(number: VoiceNumberListItem, slot: SlotKind) {
    const inbound = slot === VoiceAgentCallType.INBOUND;
    const id = inbound ? number.inboundAgentId : number.outboundAgentId;
    return id ? { id, name: (inbound ? number.inboundAgentName : number.outboundAgentName) ?? 'a deleted agent' } : null;
}

/** The accessible name of a slot's picker, the same in the page and in its tests. */
export function slotPickerLabel(phoneNumber: string, slot: SlotKind, whatsapp: boolean): string {
    return whatsapp ? `Agent for ${phoneNumber} on WhatsApp` : `${SLOT_LABEL[slot]} on ${phoneNumber}`;
}

/** One slot's agent picker: the agents of its type, or none. A pick saves at once. */
function AgentSlotSelect({ number, slot }: { number: VoiceNumberListItem; slot: SlotKind }) {
    const { agents, assigning, assignAgent } = usePage<UsePhoneNumbersPageReturn>();
    const whatsapp = number.provider === VoiceProvider.WHATSAPP;
    const holder = holderOf(number, slot);
    const options = agents.filter((a) => a.callType === slot);
    const busy = assigning === number._id;
    // Set before the agent decided its job, or since deleted: shown, but not offered.
    const stray = holder && !options.some((a) => a.id === holder.id) ? holder : null;

    return (
        <div className="grid min-w-0 grid-cols-1 gap-1">
            <span className="text-muted-foreground text-xs">{whatsapp ? 'Answers chats and calls' : SLOT_LABEL[slot]}</span>
            <div className="flex items-center gap-1">
                <Select
                    value={holder?.id ?? NONE}
                    onValueChange={(value) =>
                        value !== (holder?.id ?? NONE) &&
                        void assignAgent(number, value === NONE ? null : value, holder?.id ?? null)
                    }
                    disabled={busy}
                >
                    <SelectTrigger
                        aria-label={slotPickerLabel(number.phoneNumber, slot, whatsapp)}
                        className="h-9 min-w-0 flex-1"
                        data-testid="number-agent-select"
                    >
                        {busy ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
                        {/* A long agent name ends in "…" instead of running into the next picker. */}
                        <SelectValue className="!block min-w-0 truncate" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value={NONE}>No agent</SelectItem>
                        {stray ? (
                            <SelectItem value={stray.id} disabled>
                                {stray.name}
                            </SelectItem>
                        ) : null}
                        {options.length > 0 ? <SelectSeparator /> : null}
                        {options.map((a) => (
                            <SelectItem key={a.id} value={a.id}>
                                {a.name}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                {holder && agents.some((a) => a.id === holder.id) ? (
                    <Button
                        asChild
                        variant="ghost"
                        size="icon"
                        className="size-9 shrink-0"
                        aria-label={`Open ${holder.name}`}
                    >
                        <Link href={voiceAgentUrl(holder.id)}>
                            <ExternalLink className="size-4" aria-hidden />
                        </Link>
                    </Button>
                ) : null}
            </div>
        </div>
    );
}

/** What the number's agents do now, or what stops them, in one line. */
function slotStatus(
    number: VoiceNumberListItem,
    page: UsePhoneNumbersPageReturn,
    currency: ReturnType<typeof useDisplayCurrency>,
): { attention: boolean; text: ReactNode } {
    const whatsapp = number.provider === VoiceProvider.WHATSAPP;
    const uses = [VoiceAgentCallType.INBOUND, VoiceAgentCallType.OUTBOUND].flatMap((slot) => {
        const holder = holderOf(number, slot);
        return holder ? [{ slot, ...holder, agent: page.agents.find((a) => a.id === holder.id) }] : [];
    });
    if (uses.length === 0) {
        return {
            attention: false,
            text: whatsapp ? 'Nobody answers its chats and calls yet.' : 'Its calls ring the way they always have.',
        };
    }
    const mismatched = uses.find((use) => use.agent && use.agent.callType !== use.slot);
    if (mismatched) {
        return {
            attention: true,
            text: `${mismatched.name} is now an agent that ${mismatched.slot === VoiceAgentCallType.INBOUND ? 'makes' : 'answers'} calls. Pick an agent again.`,
        };
    }
    if (!uses.every((use) => use.agent)) return { attention: true, text: 'Its agent was deleted.' };
    if (!page.hasGeminiKey) {
        return {
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
    }
    if (whatsapp) {
        const calling = number.whatsappCalling;
        return {
            attention: !!calling && !calling.on,
            text: calling?.on
                ? 'Chats and WhatsApp calls are on. Meta charges nothing for messages and calls people start.'
                : calling
                  ? `Chats are on. Calls are off: ${calling.problem ?? 'Meta did not turn calling on'}`
                  : 'Chats are on.',
        };
    }
    // Its own country: a minute in to it, or out to numbers like it (a VoiceLink plan's rate is not published).
    const country = rateCountry(number.phoneNumber);
    const estimate = estimateAgentCost({
        promptChars: uses[0].agent?.promptChars ?? 0,
        freeTier: page.geminiKey.tier === 'free',
        callType: uses[0].slot,
        providers: [number.provider],
        phone: number.phoneNumber,
    });
    return {
        attention: false,
        text: (
            <span data-testid="number-cost-estimate">
                About {formatMoney(estimate.usdPerMinute, currency)} a minute
                {uses[0].slot === VoiceAgentCallType.OUTBOUND && country ? ` to ${RATE_COUNTRY_NAME[country]}` : ''}
                {estimate.providers[0].usdPerMinute === null
                    ? ` plus ${numberProviderInfo(number.provider).label}’s own charge`
                    : ''}
            </span>
        ),
    };
}

/** One way the number is connected (its phone line, or WhatsApp): the agents that work it, what that costs, its actions. */
function Slot({ number }: { number: VoiceNumberListItem }) {
    const page = usePage<UsePhoneNumbersPageReturn>();
    const currency = useDisplayCurrency();
    const whatsapp = number.provider === VoiceProvider.WHATSAPP;
    const status = slotStatus(number, page, currency);
    return (
        <div
            className="grid min-w-0 grid-cols-1 content-start gap-3 rounded-lg border p-3"
            data-testid={whatsapp ? 'number-whatsapp-slot' : 'number-phone-slot'}
        >
            <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="flex items-center gap-1.5 text-sm font-medium">
                    <NumberProviderLogo provider={number.provider} className="size-4" />
                    <span data-testid="number-provider">
                        {whatsapp ? 'WhatsApp' : numberProviderInfo(number.provider).label}
                    </span>
                </p>
                <div className="flex items-center gap-1">
                    {whatsapp ? (
                        <Button asChild variant="ghost" size="sm" className="h-8">
                            <Link href={WHATSAPP_URL}>
                                <MessageCircleMore className="size-3.5" aria-hidden />
                                Open inbox
                            </Link>
                        </Button>
                    ) : (
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8"
                            onClick={() => page.setTestCallNumber(number)}
                        >
                            <PhoneOutgoing className="size-3.5" aria-hidden />
                            Test call
                        </Button>
                    )}
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-destructive size-8"
                        aria-label={whatsapp ? `Remove ${number.phoneNumber} from WhatsApp` : `Remove ${number.phoneNumber}`}
                        onClick={() => page.setRemoveTarget(number)}
                    >
                        <Trash2 className="size-4" aria-hidden />
                    </Button>
                </div>
            </div>
            <div className={cn('grid grid-cols-1 gap-3', !whatsapp && 'sm:grid-cols-2')}>
                <AgentSlotSelect number={number} slot={VoiceAgentCallType.INBOUND} />
                {whatsapp ? null : <AgentSlotSelect number={number} slot={VoiceAgentCallType.OUTBOUND} />}
            </div>
            <p
                className={cn('text-xs', status.attention ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground')}
                data-testid="number-status"
            >
                {status.text}
            </p>
        </div>
    );
}

/** One number: its phone line and its WhatsApp side by side, each with the agents that work it. */
export function NumberRow({ line }: { line: NumberLine }) {
    const { whatsapp: canUseWhatsApp, openConnect } = usePage<UsePhoneNumbersPageReturn>();
    const phoneAgent = line.phone?.inboundAgentId;
    const shared = !!phoneAgent && phoneAgent === line.whatsapp?.inboundAgentId;

    return (
        <li data-testid="voice-number-row" aria-label={line.phoneNumber} className="grid min-w-0 grid-cols-1 gap-3 px-4 py-4 sm:px-5">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <p className="font-semibold tabular-nums">{line.phoneNumber}</p>
                {shared ? (
                    <p className="text-muted-foreground text-xs" data-testid="number-shared-agent">
                        {line.phone?.inboundAgentName} answers its calls and its WhatsApp, with one memory of each person.
                    </p>
                ) : null}
            </div>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
                {line.phone ? <Slot number={line.phone} /> : null}
                {line.whatsapp ? <Slot number={line.whatsapp} /> : null}
                {line.phone && !line.whatsapp && canUseWhatsApp ? (
                    <button
                        type="button"
                        onClick={() => openConnect(VoiceProvider.WHATSAPP)}
                        className="text-muted-foreground hover:bg-muted/50 flex min-h-20 items-center justify-center gap-2 rounded-lg border border-dashed p-3 text-sm"
                    >
                        <Plus className="size-4" aria-hidden />
                        Also on WhatsApp? Connect it
                    </button>
                ) : null}
            </div>
        </li>
    );
}
