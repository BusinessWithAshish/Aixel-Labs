'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { Info } from 'lucide-react';
import { VOICE_AGENT_FEATURE_LIMITS, VOICE_AGENT_SUB_MODULES, VoiceProvider } from '@aixellabs/backend/db/types';
import type { VoiceAgentOption } from '@/app/actions/voice-agent-actions';
import { placeTestCall, type VoiceNumberListItem } from '@/app/actions/voice-number-actions';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SubModuleUrls } from '@/config/app-config';
import { usePage } from '@/contexts/PageStore';
import { numberProviderInfo } from '@/helpers/voice-number-providers';
import type { UsePhoneNumbersPageReturn } from '../_hooks/use-phone-numbers-page';
import { GeminiKeyNotice } from '@/components/common/voice-agent/GeminiKeyNotice';

/** What to know before placing a call through each provider. */
const PROVIDER_NOTE: Record<VoiceProvider, string> = {
    [VoiceProvider.TELNYX]:
        'Telnyx trial accounts can only call numbers you have verified in the Telnyx portal (Numbers, Verified numbers). Upgrade the Telnyx account to call anyone else.',
    [VoiceProvider.TWILIO]:
        'Twilio trial accounts can only call numbers you have verified (Phone Numbers, Verified Caller IDs), and the person hears a trial message and must press a key before the agent speaks. The agent joins once the call is answered.',
    [VoiceProvider.VOICELINK]:
        'VoiceLink dials the number and connects it to the agent once it is answered. The call is billed to your VoiceLink balance.',
};

/** The number's outbound agent when it is still an outbound agent, else the first one. */
function defaultAgentId(number: VoiceNumberListItem | null, agents: VoiceAgentOption[]): string | null {
    if (number?.outboundAgentId && agents.some((a) => a.id === number.outboundAgentId)) return number.outboundAgentId;
    return agents[0]?.id ?? null;
}

export function TestCallDialog() {
    const { testCallNumber, setTestCallNumber, outboundAgents, geminiKey } = usePage<UsePhoneNumbersPageReturn>();
    const [to, setTo] = useState('');
    // null = not touched yet, so the dialog follows the number it opened for.
    const [pickedAgentId, setPickedAgentId] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    // This call's values for the agent's {{variables}}, by name; empty ones fall back to its defaults.
    const [variables, setVariables] = useState<Record<string, string>>({});
    const [error, setError] = useState<string | null>(null);
    const [placed, setPlaced] = useState(false);

    const agentId = pickedAgentId ?? defaultAgentId(testCallNumber, outboundAgents);
    const agent = outboundAgents.find((a) => a.id === agentId);
    const agentName = agent?.name ?? 'The agent';
    const isVoiceLink = testCallNumber?.provider === VoiceProvider.VOICELINK;
    const provider = testCallNumber?.provider ?? VoiceProvider.TELNYX;
    const callExample = numberProviderInfo(testCallNumber?.provider ?? VoiceProvider.TELNYX).callExample;
    // VoiceLink only dials from a number whose outgoing calls go to the AI: the outbound agent sets that up.
    const needsOutboundAgent = isVoiceLink && !testCallNumber?.outboundAgentId;
    const canCall = geminiKey.set && outboundAgents.length > 0 && !needsOutboundAgent;

    const onOpenChange = (open: boolean) => {
        if (open) return;
        setTestCallNumber(null);
        setTo('');
        setPickedAgentId(null);
        setVariables({});
        setError(null);
        setPlaced(false);
    };

    const submit = async (event: FormEvent) => {
        event.preventDefault();
        if (!testCallNumber?._id || !agentId) return;
        setBusy(true);
        setError(null);
        const used = Object.fromEntries((agent?.variables ?? []).map((v) => [v.name, variables[v.name] ?? '']));
        const res = await placeTestCall(testCallNumber._id, to, agentId, used);
        setBusy(false);
        if (!res.success) {
            setError(res.error ?? 'Could not start the call');
            return;
        }
        setPlaced(true);
    };

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
                        Calling {to} now. The call shows up in{' '}
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
                    <form id="test-call-form" onSubmit={submit} className="flex flex-col gap-4">
                        <div className="flex flex-col gap-2">
                            <Label htmlFor="test-call-agent">Agent</Label>
                            <Select value={agentId ?? undefined} onValueChange={setPickedAgentId}>
                                <SelectTrigger id="test-call-agent" className="w-full" aria-label="Agent that calls">
                                    <SelectValue placeholder="Choose an agent" />
                                </SelectTrigger>
                                <SelectContent>
                                    {outboundAgents.map((agent) => (
                                        <SelectItem key={agent.id} value={agent.id}>
                                            {agent.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="flex flex-col gap-2">
                            <Label htmlFor="test-call-to">Number to call</Label>
                            <Input
                                id="test-call-to"
                                type="tel"
                                inputMode="tel"
                                autoComplete="off"
                                placeholder={callExample}
                                value={to}
                                onChange={(event) => setTo(event.target.value)}
                            />
                            <p className="text-muted-foreground text-xs">
                                International format, starting with + and the country code.
                            </p>
                        </div>
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
                                            value={variables[variable.name] ?? ''}
                                            placeholder={variable.value || 'Empty'}
                                            maxLength={VOICE_AGENT_FEATURE_LIMITS.maxVariableLength}
                                            onChange={(event) =>
                                                setVariables((v) => ({ ...v, [variable.name]: event.target.value }))
                                            }
                                        />
                                    </div>
                                ))}
                                <p className="text-muted-foreground text-xs">
                                    Leave one empty to use the agent&rsquo;s default (shown greyed out).
                                </p>
                            </fieldset>
                        ) : null}
                    </form>
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
                        <Button type="submit" form="test-call-form" disabled={busy || !to.trim() || !agentId}>
                            {busy ? 'Starting call…' : 'Call now'}
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
