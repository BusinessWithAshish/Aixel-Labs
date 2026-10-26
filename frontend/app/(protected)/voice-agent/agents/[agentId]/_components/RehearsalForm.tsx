'use client';

import { useState } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Info } from 'lucide-react';
import { VOICE_AGENT_FEATURE_LIMITS, VoiceProvider } from '@aixellabs/backend/db/types';
import { startRehearsal, type SoftphoneView } from '@/app/actions/voice-softphone-actions';
import { PhoneNumberControlledField } from '@/components/common/voice-agent/PhoneNumberSelect';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatPhone } from '@/helpers/voice-campaign-contacts';
import { agentSipAddress } from '@/helpers/voice-call-format';
import { CopyRow } from '@/components/common/voice-agent/CopyRow';

const rehearsalSchema = z.object({
    numberId: z.string().min(1, 'Choose a number'),
    /** This call's values for the agent's {{variables}}; empty ones fall back to its defaults. */
    variables: z.record(z.string()),
});

type RehearsalFormProps = {
    view: SoftphoneView;
    agentId: string;
    agentName: string;
    /** Numbers the agent "calls from" in the rehearsal. */
    numbers: { id: string; phoneNumber: string }[];
    via: 'browser' | 'softphone';
    /** Browser: dial the address now (useBrowserTestCall.callAgent). */
    onDial?: (numberId: string, address: string) => void;
    /** The real call was refused (a trial account): say why the rehearsal is the way here. */
    refused: boolean;
};

/**
 * "Rehearse it by calling in": the owner dials the agent and it runs the call as if it had called them (outbound
 * opening, these variables, tools, call log). The call comes IN, so it works on a Telnyx trial account.
 */
export function RehearsalForm({ view, agentId, agentName, numbers, via, onDial, refused }: RehearsalFormProps) {
    const form = useForm({
        resolver: zodResolver(rehearsalSchema),
        values: { numberId: numbers[0]?.id ?? '', variables: {} },
    });
    const [address, setAddress] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    if (numbers.length === 0) return null;
    const from = numbers.find((n) => n.id === form.watch('numberId')) ?? numbers[0];

    const submit = form.handleSubmit(async ({ numberId, variables }) => {
        setError(null);
        const res = await startRehearsal(agentId, numberId, variables);
        if (!res.success || !res.data) return setError(res.error ?? 'Could not start the rehearsal');
        const sip = agentSipAddress(res.data.user, res.data.host, via, via === 'softphone');
        if (onDial) onDial(numberId, sip);
        else setAddress(sip);
    });

    return (
        <FormProvider {...form}>
            <form onSubmit={submit} className="flex flex-col gap-3 border-t pt-4" noValidate data-testid="rehearsal">
                <h3 className="text-sm font-medium">Or rehearse it by calling in</h3>
                {refused ? (
                    <Alert variant="warning">
                        <Info className="size-4" />
                        <AlertDescription>
                            Your Telnyx account cannot place this call yet. Rehearse it by calling in instead: it works on a
                            trial account.
                        </AlertDescription>
                    </Alert>
                ) : null}
                <p className="text-sm">
                    You call {agentName}, and {agentName} runs the call as if it had called you from{' '}
                    <strong className="tabular-nums">{formatPhone(from.phoneNumber)}</strong>: its outbound opening, the
                    values below, tools and the call log. Works on a Telnyx trial account.
                </p>
                {numbers.length > 1 ? (
                    <PhoneNumberControlledField
                        name="numberId"
                        id={`rehearsal-number-${via}`}
                        label="Calls you from"
                        numbers={numbers.map((n) => ({ ...n, provider: VoiceProvider.TELNYX }))}
                    />
                ) : null}
                {view.variables.length > 0 ? (
                    <fieldset className="flex flex-col gap-2">
                        <legend className="mb-2 text-sm font-medium">Variables for this call</legend>
                        {view.variables.map((variable) => (
                            <div
                                key={variable.name}
                                className="grid gap-1 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)] sm:items-center sm:gap-3"
                            >
                                <Label
                                    htmlFor={`rehearsal-${via}-${variable.name}`}
                                    className="font-mono text-[13px] font-normal break-all"
                                >
                                    {`{{${variable.name}}}`}
                                </Label>
                                <Input
                                    id={`rehearsal-${via}-${variable.name}`}
                                    placeholder={variable.value || 'Empty'}
                                    maxLength={VOICE_AGENT_FEATURE_LIMITS.maxVariableLength}
                                    {...form.register(`variables.${variable.name}`)}
                                />
                            </div>
                        ))}
                    </fieldset>
                ) : null}
                {address ? (
                    <>
                        <CopyRow label="Dial this in Linphone" value={address} testId="rehearsal-address" />
                        <p className="text-sm">
                            <strong>It works once, for 10 minutes.</strong> Make a new one for the next rehearsal.
                        </p>
                    </>
                ) : null}
                {error ? (
                    <p className="text-destructive text-sm" role="alert">
                        {error}
                    </p>
                ) : null}
                <Button type="submit" variant="outline" className="self-start" disabled={form.formState.isSubmitting}>
                    {via === 'browser'
                        ? `Rehearse: call ${agentName} here`
                        : address
                          ? 'Make a new address'
                          : 'Get the address to dial'}
                </Button>
            </form>
        </FormProvider>
    );
}
