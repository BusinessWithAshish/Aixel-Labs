'use client';

import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Info } from 'lucide-react';
import {
    VOICE_AGENT_FEATURE_LIMITS,
    VOICE_AGENT_SUB_MODULES,
    VoiceAgentCallType,
    VoiceProvider,
    type VoiceGeminiKeyView,
} from '@aixellabs/backend/db/types';
import type { VoiceAgentOption } from '@/app/actions/voice-agent-actions';
import { placeTestCall, type VoiceNumberListItem } from '@/app/actions/voice-number-actions';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { SelectControlledField, StringControlledField } from '@/components/common/zod-form-builder/ZodControlledFields';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SubModuleUrls } from '@/config/app-config';
import { numberProviderInfo, placesCalls } from '@/helpers/voice-number-providers';
import { GeminiKeyNotice } from '@/components/common/voice-agent/GeminiKeyNotice';
import { PhoneNumberControlledField } from '@/components/common/voice-agent/PhoneNumberSelect';
import { useDisplayCurrency } from '@/contexts/DisplayCurrency';
import { estimateAgentCost, formatMoney, RATE_COUNTRY_NAME, rateCountry } from '@/helpers/voice-call-cost';

/** What to know before calling through each provider. */
const PROVIDER_NOTE: Record<VoiceProvider, string> = {
    [VoiceProvider.TELNYX]:
        'On a Telnyx trial account, calls only go to numbers you have verified in Telnyx (Numbers, Verified numbers).',
    [VoiceProvider.TWILIO]:
        'On a Twilio trial account, calls only go to numbers you have verified in Twilio (Phone Numbers, Verified Caller IDs), and you hear a short Twilio message and press a key before the agent speaks.',
    [VoiceProvider.VOICELINK]: 'The call is charged to your VoiceLink balance, like any other call.',
    [VoiceProvider.WHATSAPP]: 'A WhatsApp number only answers calls for now: call it from WhatsApp on your phone to test it.',
};

const AGENT_JOB: Record<VoiceAgentCallType, string> = {
    [VoiceAgentCallType.INBOUND]: 'answers calls',
    [VoiceAgentCallType.OUTBOUND]: 'makes calls',
};

const testCallSchema = z.object({
    numberId: z.string().min(1, 'Choose the number it calls from'),
    agentId: z.string().min(1, 'Choose the agent that calls'),
    to: z.string().trim().min(1, 'Enter your phone number'),
    /** This call's values for the agent's {{variables}}; empty ones fall back to its defaults. */
    variables: z.record(z.string()),
});

/** VoiceLink only dials from a number set to make calls (its outgoing calls go to the AI). WhatsApp only answers. */
export function canPlaceCalls(number: VoiceNumberListItem): boolean {
    if (!placesCalls(number.provider)) return false;
    return number.provider !== VoiceProvider.VOICELINK || !!number.outboundAgentId;
}

type TestCallDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Numbers it may call from. A single one is named, not offered. */
    numbers: VoiceNumberListItem[];
    /** Agents that may make the call, of either kind. A single one is named, not offered. */
    agents: VoiceAgentOption[];
    geminiKey: VoiceGeminiKeyView;
    /** Picked when the dialog opens (else the first that fits). */
    numberId?: string | null;
    agentId?: string | null;
};

/**
 * The agent rings the owner's phone from one of their numbers. An agent that answers calls talks as if
 * the owner had called in, so its booking tool and call log work exactly as on a real call.
 */
export function TestCallDialog({ open, onOpenChange, numbers, agents, geminiKey, numberId, agentId }: TestCallDialogProps) {
    const form = useForm({
        resolver: zodResolver(testCallSchema),
        defaultValues: { numberId: '', agentId: '', to: '', variables: {} },
    });
    const [error, setError] = useState<string | null>(null);
    const [placed, setPlaced] = useState<string | null>(null);
    const busy = form.formState.isSubmitting;
    const callable = numbers.filter(canPlaceCalls);

    // A fresh form each time it opens.
    useEffect(() => {
        if (!open) return;
        const fromNumber = callable.find((n) => n._id === numberId) ?? callable[0];
        const ownAgent = fromNumber?.outboundAgentId ?? fromNumber?.inboundAgentId;
        const agent = agents.find((a) => a.id === agentId) ?? agents.find((a) => a.id === ownAgent) ?? agents[0] ?? null;
        form.reset({ numberId: fromNumber?._id ?? '', agentId: agent?.id ?? '', to: '', variables: {} });
        setError(null);
        setPlaced(null);
        // eslint-disable-next-line react-hooks/exhaustive-deps -- reset on open only, not on every list identity change
    }, [open]);

    const number = numbers.find((n) => n._id === form.watch('numberId')) ?? (numbers.length === 1 ? numbers[0] : null);
    const agent = agents.find((a) => a.id === form.watch('agentId')) ?? null;
    const agentName = agent?.name ?? 'The agent';
    const currency = useDisplayCurrency();
    const to = form.watch('to');
    // The engine dials out for every test call, priced by where it goes (the number's own country until
    // one is typed). VoiceLink publishes no rate, nor Telnyx for India: only Gemini is counted there.
    const costLine = (() => {
        if (!agent || !number) return null;
        const phone = to.trim().startsWith('+') ? to : number.phoneNumber;
        const country = rateCountry(phone);
        const estimate = estimateAgentCost({
            promptChars: agent.promptChars,
            freeTier: geminiKey.tier === 'free',
            callType: VoiceAgentCallType.OUTBOUND,
            providers: [number.provider],
            phone,
        });
        const where = country ? ` to ${RATE_COUNTRY_NAME[country]}` : '';
        const without =
            estimate.providers[0].usdPerMinute === null
                ? `, without ${numberProviderInfo(number.provider).label}’s charge`
                : '';
        return `It should cost about ${formatMoney(estimate.usdPerMinute, currency)} a minute${where} (an estimate${without}).`;
    })();
    const from = number ? <span className="font-medium tabular-nums">{number.phoneNumber}</span> : 'your number';
    // Calling the number itself is the real test of an agent that answers it.
    const answeredBy = number?.inboundAgentId ? (number.inboundAgentName ?? 'the AI') : null;

    let blocked: ReactNode = null;
    if (!geminiKey.set) {
        blocked = <GeminiKeyNotice view={geminiKey} action="place calls" />;
    } else if (agents.length === 0) {
        blocked = (
            <p className="text-sm">
                You have no agents yet.{' '}
                <Link
                    className="text-primary underline-offset-4 hover:underline"
                    href={SubModuleUrls[VOICE_AGENT_SUB_MODULES.AGENTS]}
                >
                    Create one
                </Link>
                , then come back to try it.
            </p>
        );
    } else if (callable.length === 0) {
        blocked = (
            <p className="text-sm">
                {numbers.length === 0 ? (
                    <>
                        The agent calls you from one of your phone numbers, and you have none yet.{' '}
                        <Link
                            className="text-primary underline-offset-4 hover:underline"
                            href={SubModuleUrls[VOICE_AGENT_SUB_MODULES.PHONE_NUMBERS]}
                        >
                            Connect a number
                        </Link>
                        .
                    </>
                ) : (
                    <>
                        VoiceLink only places AI calls from a number an agent makes calls from.
                        {answeredBy && numbers.length === 1
                            ? ` To try ${answeredBy}, call ${numbers[0].phoneNumber} from your phone: it answers.`
                            : ' Link an agent that makes calls to one of your numbers first, from the agent’s page.'}
                    </>
                )}
            </p>
        );
    }

    const submit = form.handleSubmit(async ({ numberId, agentId, to, variables }) => {
        setError(null);
        const used = Object.fromEntries((agent?.variables ?? []).map((v) => [v.name, variables[v.name] ?? '']));
        const res = await placeTestCall(numberId, to, agentId, used);
        if (!res.success) {
            setError(res.error ?? 'Could not start the call');
            return;
        }
        setPlaced(to);
    });

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Test call</DialogTitle>
                    <DialogDescription>
                        {agent?.callType === VoiceAgentCallType.INBOUND ? (
                            <>
                                {agentName} rings your phone from {from} and talks to you as if you had called the business.
                                Ask what a customer would ask, or book an appointment: bookings and the call log are saved
                                just like on a real call.
                            </>
                        ) : (
                            <>
                                {agentName} rings the number you enter from {from}, just like the calls it makes for real.
                            </>
                        )}
                    </DialogDescription>
                </DialogHeader>

                {number && !blocked ? (
                    <Alert>
                        <Info className="size-4" />
                        <AlertDescription>
                            {PROVIDER_NOTE[number.provider]}
                            {answeredBy
                                ? ` You can also call ${number.phoneNumber} from any phone: ${answeredBy} answers.`
                                : ''}
                            {costLine ? (
                                <span className="mt-1 block" data-testid="test-call-cost">
                                    {costLine}
                                </span>
                            ) : null}
                        </AlertDescription>
                    </Alert>
                ) : null}

                {placed ? (
                    <p className="text-sm" role="status">
                        Calling {placed} now. Pick up to talk to {agentName}. The call shows up in{' '}
                        <Link
                            className="text-primary underline-offset-4 hover:underline"
                            href={SubModuleUrls[VOICE_AGENT_SUB_MODULES.CALL_LOGS]}
                        >
                            Call logs
                        </Link>{' '}
                        when it ends.
                    </p>
                ) : (
                    (blocked ?? (
                        <FormProvider {...form}>
                            <form id="test-call-form" onSubmit={submit} className="flex flex-col gap-4" noValidate>
                                {callable.length > 1 ? (
                                    <PhoneNumberControlledField
                                        name="numberId"
                                        id="test-call-number"
                                        label="Calls from"
                                        numbers={callable.map((n) => ({ ...n, id: n._id ?? '' }))}
                                    />
                                ) : null}
                                {agents.length > 1 ? (
                                    <SelectControlledField
                                        name="agentId"
                                        id="test-call-agent"
                                        label="Agent that calls"
                                        placeholder="Choose an agent"
                                        options={agents.map((a) => ({
                                            value: a.id,
                                            label: `${a.name} (${AGENT_JOB[a.callType]})`,
                                        }))}
                                    />
                                ) : null}
                                <StringControlledField
                                    name="to"
                                    id="test-call-to"
                                    label="Your phone number"
                                    type="tel"
                                    placeholder={numberProviderInfo(number?.provider ?? VoiceProvider.TELNYX).callExample}
                                    description="The agent calls this number. Start with + and the country code."
                                    classNames={{ description: 'text-xs' }}
                                    inputProps={{ inputMode: 'tel', autoComplete: 'tel' }}
                                />
                                {agent && agent.variables.length > 0 ? (
                                    <fieldset className="flex flex-col gap-2" data-testid="test-call-variables">
                                        <legend className="mb-2 text-sm font-medium">Variables for this call</legend>
                                        {agent.variables.map((variable) => (
                                            <div
                                                key={variable.name}
                                                className="grid gap-1 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)] sm:items-center sm:gap-3"
                                            >
                                                <Label
                                                    htmlFor={`test-call-var-${variable.name}`}
                                                    className="font-mono text-[13px] font-normal break-all"
                                                >
                                                    {`{{${variable.name}}}`}
                                                </Label>
                                                <Input
                                                    id={`test-call-var-${variable.name}`}
                                                    placeholder={variable.value || 'Empty'}
                                                    maxLength={VOICE_AGENT_FEATURE_LIMITS.maxVariableLength}
                                                    {...form.register(`variables.${variable.name}`)}
                                                />
                                            </div>
                                        ))}
                                        <p className="text-muted-foreground text-xs">
                                            Leave one empty to use the agent&rsquo;s default (shown greyed out).
                                        </p>
                                    </fieldset>
                                ) : null}
                            </form>
                        </FormProvider>
                    ))
                )}

                {error ? (
                    <p className="text-destructive text-sm" role="alert">
                        {error}
                    </p>
                ) : null}

                <DialogFooter>
                    {placed ? (
                        <Button type="button" onClick={() => onOpenChange(false)}>
                            Done
                        </Button>
                    ) : blocked ? null : (
                        <Button type="submit" form="test-call-form" disabled={busy}>
                            {busy ? 'Starting call…' : 'Call me now'}
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
