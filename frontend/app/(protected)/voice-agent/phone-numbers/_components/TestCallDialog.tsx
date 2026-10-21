'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Info } from 'lucide-react';
import { VOICE_AGENT_FEATURE_LIMITS, VOICE_AGENT_SUB_MODULES, VoiceProvider } from '@aixellabs/backend/db/types';
import type { VoiceAgentOption } from '@/app/actions/voice-agent-actions';
import { placeTestCall, type VoiceNumberListItem } from '@/app/actions/voice-number-actions';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { SelectControlledField, StringControlledField } from '@/components/common/zod-form-builder/ZodControlledFields';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SubModuleUrls } from '@/config/app-config';
import { usePage } from '@/contexts/PageStore';
import { numberProviderInfo } from '@/helpers/voice-number-providers';
import { GeminiKeyNotice } from '@/components/common/voice-agent/GeminiKeyNotice';
import type { UsePhoneNumbersPageReturn } from '../_hooks/use-phone-numbers-page';

/** What to know before placing a call through each provider. */
const PROVIDER_NOTE: Record<VoiceProvider, string> = {
    [VoiceProvider.TELNYX]:
        'Telnyx trial accounts can only call numbers you have verified in the Telnyx portal (Numbers, Verified numbers). Upgrade the Telnyx account to call anyone else.',
    [VoiceProvider.TWILIO]:
        'Twilio trial accounts can only call numbers you have verified (Phone Numbers, Verified Caller IDs), and the person hears a trial message and must press a key before the agent speaks. The agent joins once the call is answered.',
    [VoiceProvider.VOICELINK]:
        'VoiceLink dials the number and connects it to the agent once it is answered. The call is billed to your VoiceLink balance.',
};

const testCallSchema = z.object({
    agentId: z.string().min(1, 'Choose the agent that calls'),
    to: z.string().trim().min(1, 'Enter the number to call'),
    /** This call's values for the agent's {{variables}}; empty ones fall back to its defaults. */
    variables: z.record(z.string()),
});

/** The number's outbound agent when it is still an outbound agent, else the first one. */
function defaultAgentId(number: VoiceNumberListItem | null, agents: VoiceAgentOption[]): string | null {
    if (number?.outboundAgentId && agents.some((a) => a.id === number.outboundAgentId)) return number.outboundAgentId;
    return agents[0]?.id ?? null;
}

export function TestCallDialog() {
    const { testCallNumber, setTestCallNumber, outboundAgents, geminiKey } = usePage<UsePhoneNumbersPageReturn>();
    const form = useForm({ resolver: zodResolver(testCallSchema), defaultValues: { agentId: '', to: '', variables: {} } });
    const [error, setError] = useState<string | null>(null);
    const [placed, setPlaced] = useState<string | null>(null);
    const busy = form.formState.isSubmitting;
    const agentId = form.watch('agentId');
    const agent = outboundAgents.find((a) => a.id === agentId);

    // A fresh form for each number, with the agent that number calls with.
    useEffect(() => {
        if (!testCallNumber) return;
        form.reset({ agentId: defaultAgentId(testCallNumber, outboundAgents) ?? '', to: '', variables: {} });
        setError(null);
        setPlaced(null);
    }, [testCallNumber, outboundAgents, form]);
    const agentName = agent?.name ?? 'The agent';
    const isVoiceLink = testCallNumber?.provider === VoiceProvider.VOICELINK;
    const provider = testCallNumber?.provider ?? VoiceProvider.TELNYX;
    const callExample = numberProviderInfo(testCallNumber?.provider ?? VoiceProvider.TELNYX).callExample;
    // VoiceLink only dials from a number whose outgoing calls go to the AI: the outbound agent sets that up.
    const needsOutboundAgent = isVoiceLink && !testCallNumber?.outboundAgentId;
    const canCall = geminiKey.set && outboundAgents.length > 0 && !needsOutboundAgent;

    const onOpenChange = (open: boolean) => {
        if (!open) setTestCallNumber(null);
    };

    const submit = form.handleSubmit(async ({ agentId, to, variables }) => {
        if (!testCallNumber?._id) return;
        setError(null);
        const used = Object.fromEntries((agent?.variables ?? []).map((v) => [v.name, variables[v.name] ?? '']));
        const res = await placeTestCall(testCallNumber._id, to, agentId, used);
        if (!res.success) {
            setError(res.error ?? 'Could not start the call');
            return;
        }
        setPlaced(to);
    });

    return (
        <Dialog open={testCallNumber !== null} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Test call</DialogTitle>
                    <DialogDescription>
                        {agentName} calls the number you enter from{' '}
                        <span className="font-medium tabular-nums">{testCallNumber?.phoneNumber}</span>.
                    </DialogDescription>
                </DialogHeader>

                <Alert>
                    <Info className="size-4" />
                    <AlertDescription>{PROVIDER_NOTE[provider]}</AlertDescription>
                </Alert>

                {placed ? (
                    <p className="text-sm" role="status">
                        Calling {placed} now. The call shows up in{' '}
                        <Link
                            className="text-primary underline-offset-4 hover:underline"
                            href={SubModuleUrls[VOICE_AGENT_SUB_MODULES.CALL_LOGS]}
                        >
                            Call logs
                        </Link>{' '}
                        when it ends.
                    </p>
                ) : !geminiKey.set ? (
                    <GeminiKeyNotice view={geminiKey} action="place calls" />
                ) : needsOutboundAgent ? (
                    <p className="text-sm">
                        Pick an agent under &ldquo;Places calls as&rdquo; for this number first. VoiceLink only dials from a
                        number whose outgoing calls go to the AI.
                    </p>
                ) : outboundAgents.length === 0 ? (
                    <p className="text-sm">
                        Test calls are placed by an outbound agent, and you have none yet.{' '}
                        <Link
                            className="text-primary underline-offset-4 hover:underline"
                            href={SubModuleUrls[VOICE_AGENT_SUB_MODULES.AGENTS]}
                        >
                            Create one
                        </Link>
                        .
                    </p>
                ) : (
                    <FormProvider {...form}>
                        <form id="test-call-form" onSubmit={submit} className="flex flex-col gap-4" noValidate>
                            <SelectControlledField
                                name="agentId"
                                id="test-call-agent"
                                label="Agent that calls"
                                placeholder="Choose an agent"
                                options={outboundAgents.map((a) => ({ value: a.id, label: a.name }))}
                            />
                            <StringControlledField
                                name="to"
                                id="test-call-to"
                                label="Number to call"
                                type="tel"
                                placeholder={callExample}
                                description="International format, starting with + and the country code."
                                classNames={{ description: 'text-xs' }}
                                inputProps={{ inputMode: 'tel', autoComplete: 'off' }}
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
                    ) : !canCall ? null : (
                        <Button type="submit" form="test-call-form" disabled={busy}>
                            {busy ? 'Starting call…' : 'Call now'}
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
