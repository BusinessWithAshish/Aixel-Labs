'use client';

import Link from 'next/link';
import { PhoneIncoming, PhoneOff, PhoneOutgoing, Trash2 } from 'lucide-react';
import { VOICE_AGENT_SUB_MODULES, VoiceAgentCallType } from '@aixellabs/backend/db/types';
import type { VoiceAgentOption } from '@/app/actions/voice-agent-actions';
import type { VoiceNumberListItem } from '@/app/actions/voice-number-actions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioCards, type RadioCardOption } from '@/components/wrappers/RadioCards';
import { SubModuleUrls } from '@/config/app-config';
import { usePage } from '@/contexts/PageStore';
import { numberProviderInfo } from '@/helpers/voice-number-providers';
import { GEMINI_KEY_URL } from '@/helpers/voice-routes';
import { numberBadge, numberJob, type NumberJob, type UsePhoneNumbersPageReturn } from '../_hooks/use-phone-numbers-page';

const AGENTS_URL = SubModuleUrls[VOICE_AGENT_SUB_MODULES.AGENTS];

type AgentSelectProps = {
    id: string;
    ariaLabel: string;
    value: string;
    /** Name stored with the number, for an agent no longer in the list (deleted, or the other call type). */
    valueName: string | null;
    agents: VoiceAgentOption[];
    disabled: boolean;
    onChange: (agentId: string) => void;
};

function AgentSelect({ id, ariaLabel, value, valueName, agents, disabled, onChange }: AgentSelectProps) {
    const listed = agents.some((a) => a.id === value);
    return (
        <Select value={value} disabled={disabled} onValueChange={onChange}>
            <SelectTrigger id={id} className="w-full" aria-label={ariaLabel}>
                <SelectValue placeholder="Choose an agent" />
            </SelectTrigger>
            <SelectContent>
                {!listed ? <SelectItem value={value}>{valueName ?? 'Deleted agent'}</SelectItem> : null}
                {agents.map((agent) => (
                    <SelectItem key={agent.id} value={agent.id}>
                        {agent.name}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}

const hintLink = 'text-primary underline-offset-4 hover:underline';

/** Why "Answer calls" or "Make calls" cannot be picked yet: no agent made for it, or no Gemini key. */
function JobHints({
    missingInbound,
    missingOutbound,
    needsKey,
}: {
    missingInbound: boolean;
    missingOutbound: boolean;
    needsKey: boolean;
}) {
    if (needsKey) {
        return (
            <p className="text-muted-foreground text-xs" data-testid="gemini-key-hint">
                Add your Gemini API key before the AI can answer or make calls.{' '}
                <Link className={hintLink} href={GEMINI_KEY_URL}>
                    Add key
                </Link>
            </p>
        );
    }
    if (!missingInbound && !missingOutbound) return null;
    const kind = missingInbound && missingOutbound ? null : missingInbound ? 'inbound' : 'outbound';
    return (
        <p className="text-muted-foreground text-xs">
            {kind === null
                ? 'You have no agents yet. '
                : kind === 'inbound'
                  ? 'To answer calls, you need an agent that answers calls. '
                  : 'To make calls, you need an agent that makes calls. '}
            <Link className={hintLink} href={AGENTS_URL}>
                Create one
            </Link>
            .
        </p>
    );
}

export function PhoneNumberRow({ number }: { number: VoiceNumberListItem }) {
    const {
        inboundAgents,
        outboundAgents,
        saving,
        chooseJob,
        changeNumberAgent,
        setTestCallNumber,
        setRemoveTarget,
        hasGeminiKey,
    } = usePage<UsePhoneNumbersPageReturn>();
    const id = number._id ?? number.phoneNumber;
    const job = numberJob(number);
    const badge = numberBadge(number);
    const busy = saving === number._id;
    const providerLabel = numberProviderInfo(number.provider).label;
    const canAnswer = !!number.inboundAgentId || (hasGeminiKey && inboundAgents.length > 0);
    const canCall = !!number.outboundAgentId || (hasGeminiKey && outboundAgents.length > 0);

    const jobs: RadioCardOption<NumberJob>[] = [
        {
            value: VoiceAgentCallType.INBOUND,
            title: 'Answer calls',
            media: <PhoneIncoming className="size-4" />,
            disabled: !canAnswer,
        },
        {
            value: VoiceAgentCallType.OUTBOUND,
            title: 'Make calls',
            media: <PhoneOutgoing className="size-4" />,
            disabled: !canCall,
        },
        { value: 'NONE', title: 'Not used yet', media: <PhoneOff className="size-4" /> },
    ];

    let explain: string;
    if (busy) explain = `Updating ${number.phoneNumber} in ${providerLabel}…`;
    else if (job === VoiceAgentCallType.INBOUND)
        explain = 'When someone calls this number, this agent picks up and talks to them.';
    else if (job === VoiceAgentCallType.OUTBOUND)
        explain =
            'This agent makes the calls you start from this number. People who call this number reach you the way they always have.';
    else if (job === 'NONE') explain = 'The AI does nothing with this number. Calls to it ring the way they always have.';
    else
        explain = `This number was set up to do two jobs: ${number.inboundAgentName ?? 'an agent'} answers its calls and ${number.outboundAgentName ?? 'an agent'} makes calls from it. A number now does one job: pick the one it should keep.`;

    return (
        <li
            data-testid="voice-number-row"
            aria-label={number.phoneNumber}
            className="grid gap-4 px-4 py-4 sm:px-5 lg:grid-cols-[minmax(10rem,0.6fr)_minmax(22rem,2fr)_auto] lg:gap-6"
        >
            <div className="flex min-w-0 flex-col items-start gap-1.5">
                <p className="text-base font-semibold tabular-nums">{number.phoneNumber}</p>
                <p className="text-muted-foreground text-xs" data-testid="number-provider">
                    {providerLabel}
                </p>
                <Badge variant={badge.variant} data-testid="number-job">
                    {badge.label}
                </Badge>
            </div>

            <div className="flex min-w-0 flex-col gap-2">
                <p className="text-sm font-medium" id={`job-${id}`}>
                    What this number does
                </p>
                <RadioCards
                    aria-labelledby={`job-${id}`}
                    value={job}
                    onValueChange={(next) => chooseJob(number, next)}
                    options={jobs}
                    disabled={busy}
                    className="sm:grid-cols-3"
                    classNames={{ card: 'p-2.5!' }}
                />
                {job === VoiceAgentCallType.INBOUND || job === VoiceAgentCallType.OUTBOUND ? (
                    <div className="flex flex-col gap-1.5">
                        <Label htmlFor={`agent-${id}`} className="text-sm font-medium">
                            {job === VoiceAgentCallType.INBOUND ? 'Agent that answers' : 'Agent that makes the calls'}
                        </Label>
                        <AgentSelect
                            id={`agent-${id}`}
                            ariaLabel={`${job === VoiceAgentCallType.INBOUND ? 'Agent that answers' : 'Agent that makes the calls'} for ${number.phoneNumber}`}
                            value={
                                (job === VoiceAgentCallType.INBOUND ? number.inboundAgentId : number.outboundAgentId) ?? ''
                            }
                            valueName={
                                job === VoiceAgentCallType.INBOUND ? number.inboundAgentName : number.outboundAgentName
                            }
                            agents={job === VoiceAgentCallType.INBOUND ? inboundAgents : outboundAgents}
                            disabled={busy}
                            onChange={(agentId) => changeNumberAgent(number, job, agentId)}
                        />
                    </div>
                ) : null}
                <p
                    className={
                        job === null && !busy
                            ? 'text-xs text-amber-600 dark:text-amber-400'
                            : 'text-muted-foreground text-xs'
                    }
                    role={busy ? 'status' : undefined}
                >
                    {explain}
                </p>
                <JobHints
                    needsKey={!hasGeminiKey && (!canAnswer || !canCall)}
                    missingInbound={!canAnswer && inboundAgents.length === 0}
                    missingOutbound={!canCall && outboundAgents.length === 0}
                />
            </div>

            <div className="flex items-center justify-between gap-2 border-t pt-3 lg:flex-col lg:items-end lg:justify-start lg:border-t-0 lg:pt-0">
                <Button type="button" variant="outline" size="sm" onClick={() => setTestCallNumber(number)}>
                    <PhoneOutgoing className="size-3.5" aria-hidden />
                    Test call
                </Button>
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => setRemoveTarget(number)}
                >
                    <Trash2 className="size-3.5" aria-hidden />
                    Remove
                </Button>
            </div>
        </li>
    );
}
