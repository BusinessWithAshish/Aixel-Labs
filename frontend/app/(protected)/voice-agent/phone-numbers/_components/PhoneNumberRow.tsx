'use client';

import Link from 'next/link';
import { PhoneOutgoing, Trash2 } from 'lucide-react';
import { VOICE_AGENT_SUB_MODULES } from '@aixellabs/backend/db/types';
import type { VoiceAgentOption } from '@/app/actions/voice-agent-actions';
import type { VoiceNumberListItem } from '@/app/actions/voice-number-actions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { SubModuleUrls } from '@/config/app-config';
import { usePage } from '@/contexts/PageStore';
import { numberProviderInfo } from '@/helpers/voice-number-providers';
import { numberBadges, type UsePhoneNumbersPageReturn } from '../_hooks/use-phone-numbers-page';
import { GEMINI_KEY_URL } from '@/helpers/voice-routes';

const NO_AGENT = 'none';
const AGENTS_URL = SubModuleUrls[VOICE_AGENT_SUB_MODULES.AGENTS];

type AgentSelectProps = {
    id: string;
    ariaLabel: string;
    value: string | null;
    /** Name stored with the number, for an agent no longer in the list (deleted, or the other call type). */
    valueName: string | null;
    agents: VoiceAgentOption[];
    noneLabel?: string;
    disabled: boolean;
    onChange: (agentId: string | null) => void;
};

function AgentSelect({ id, ariaLabel, value, valueName, agents, noneLabel, disabled, onChange }: AgentSelectProps) {
    const listed = value ? agents.some((a) => a.id === value) : true;
    return (
        <Select
            value={value ?? NO_AGENT}
            disabled={disabled}
            onValueChange={(next) => onChange(next === NO_AGENT ? null : next)}
        >
            <SelectTrigger id={id} className="w-full" aria-label={ariaLabel}>
                <SelectValue placeholder="Choose an agent" />
            </SelectTrigger>
            <SelectContent>
                {noneLabel ? <SelectItem value={NO_AGENT}>{noneLabel}</SelectItem> : null}
                {!listed && value ? <SelectItem value={value}>{valueName ?? 'Deleted agent'}</SelectItem> : null}
                {agents.map((agent) => (
                    <SelectItem key={agent.id} value={agent.id}>
                        {agent.name}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}

function CreateAgentHint({ kind }: { kind: 'inbound' | 'outbound' }) {
    return (
        <p className="text-muted-foreground text-xs">
            You have no {kind} agents yet.{' '}
            <Link className="text-primary underline-offset-4 hover:underline" href={AGENTS_URL}>
                Create one
            </Link>
            .
        </p>
    );
}

/** Answering and placing calls run on the owner's Gemini key: shown where they cannot be turned on without it. */
function GeminiKeyHint() {
    return (
        <p className="text-muted-foreground text-xs" data-testid="gemini-key-hint">
            Add your Gemini API key first.{' '}
            <Link className="text-primary underline-offset-4 hover:underline" href={GEMINI_KEY_URL}>
                Add key
            </Link>
        </p>
    );
}

export function PhoneNumberRow({ number }: { number: VoiceNumberListItem }) {
    const {
        inboundAgents,
        outboundAgents,
        saving,
        toggleAiAnswering,
        changeInboundAgent,
        changeOutboundAgent,
        setTestCallNumber,
        setRemoveTarget,
        hasGeminiKey,
    } = usePage<UsePhoneNumbersPageReturn>();
    const id = number._id ?? number.phoneNumber;
    const aiAnswers = !!number.inboundAgentId;
    const savingInbound = saving?.numberId === number._id && saving?.part === 'inbound';
    const savingOutbound = saving?.numberId === number._id && saving?.part === 'outbound';
    const switchId = `ai-answers-${id}`;
    const providerLabel = numberProviderInfo(number.provider).label;

    return (
        <li
            data-testid="voice-number-row"
            aria-label={number.phoneNumber}
            className="grid gap-4 px-4 py-4 sm:px-5 lg:grid-cols-[minmax(11rem,0.8fr)_minmax(15rem,1.2fr)_minmax(13rem,1fr)_auto] lg:gap-6"
        >
            <div className="flex min-w-0 flex-col gap-1.5">
                <p className="text-base font-semibold tabular-nums">{number.phoneNumber}</p>
                <p className="text-muted-foreground text-xs" data-testid="number-provider">
                    {providerLabel}
                </p>
                <div className="flex flex-wrap gap-1.5">
                    {numberBadges(number).map((badge) => (
                        <Badge key={badge.label} variant={badge.variant}>
                            {badge.label}
                        </Badge>
                    ))}
                </div>
            </div>

            <div className="flex min-w-0 flex-col gap-2">
                <div className="flex items-center justify-between gap-3 lg:justify-start">
                    <Label htmlFor={switchId} className="text-sm font-medium">
                        AI answers incoming calls
                    </Label>
                    <Switch
                        id={switchId}
                        checked={aiAnswers}
                        disabled={savingInbound || (!aiAnswers && (inboundAgents.length === 0 || !hasGeminiKey))}
                        onCheckedChange={(on) => toggleAiAnswering(number, on)}
                    />
                </div>
                {aiAnswers ? (
                    <AgentSelect
                        id={`inbound-agent-${id}`}
                        ariaLabel={`Inbound agent for ${number.phoneNumber}`}
                        value={number.inboundAgentId ?? null}
                        valueName={number.inboundAgentName}
                        agents={inboundAgents}
                        disabled={savingInbound}
                        onChange={(agentId) => agentId && changeInboundAgent(number, agentId)}
                    />
                ) : null}
                {savingInbound ? (
                    <p className="text-muted-foreground text-xs" role="status">
                        Updating the number in {providerLabel}…
                    </p>
                ) : (
                    <p className="text-muted-foreground text-xs">
                        Off: calls ring wherever they did before. On: the AI answers every call to this number.
                    </p>
                )}
                {!aiAnswers && inboundAgents.length === 0 ? <CreateAgentHint kind="inbound" /> : null}
                {!aiAnswers && inboundAgents.length > 0 && !hasGeminiKey ? <GeminiKeyHint /> : null}
            </div>

            <div className="flex min-w-0 flex-col gap-2">
                <Label htmlFor={`outbound-agent-${id}`} className="text-sm font-medium">
                    Places calls as
                </Label>
                {outboundAgents.length === 0 && !number.outboundAgentId ? (
                    <CreateAgentHint kind="outbound" />
                ) : (
                    <AgentSelect
                        id={`outbound-agent-${id}`}
                        ariaLabel={`Outbound agent for ${number.phoneNumber}`}
                        value={number.outboundAgentId ?? null}
                        valueName={number.outboundAgentName}
                        agents={outboundAgents}
                        noneLabel="No outbound agent"
                        disabled={savingOutbound || (!hasGeminiKey && !number.outboundAgentId)}
                        onChange={(agentId) => changeOutboundAgent(number, agentId)}
                    />
                )}
                {outboundAgents.length > 0 && !hasGeminiKey && !number.outboundAgentId ? <GeminiKeyHint /> : null}
                <p className="text-muted-foreground text-xs" role={savingOutbound ? 'status' : undefined}>
                    {savingOutbound
                        ? 'Saving…'
                        : 'Used when a call does not name another agent. Does not change where calls ring.'}
                </p>
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
