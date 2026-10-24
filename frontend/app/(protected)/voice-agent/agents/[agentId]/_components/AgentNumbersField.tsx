'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { VoiceAgentCallType } from '@aixellabs/backend/db/types';
import type { VoiceNumberListItem } from '@/app/actions/voice-number-actions';
import { PhoneNumberSelect } from '@/components/common/voice-agent/PhoneNumberSelect';
import { ConfirmDialog } from '@/components/wrappers/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { usePage } from '@/contexts/PageStore';
import { VOICE_PHONE_NUMBERS_URL } from '@/helpers/voice-routes';
import { linkedNumbers, type UseVoiceAgentEditorPageReturn } from '../_hooks/use-voice-agent-editor-page';

/** The agent in the number's slot for this type (inbound: answers it, outbound: calls from it), if any. */
export function slotHolder(number: VoiceNumberListItem, callType: VoiceAgentCallType) {
    const inbound = callType === VoiceAgentCallType.INBOUND;
    const id = inbound ? number.inboundAgentId : number.outboundAgentId;
    return id ? { id, name: (inbound ? number.inboundAgentName : number.outboundAgentName) ?? 'a deleted agent' } : null;
}

/** What the number does for other agents ("Answers with Maya · Calls out with Sales bot"), or null. */
function numberJobs(number: VoiceNumberListItem, agentId: string): string | null {
    const jobs = [
        number.inboundAgentId && number.inboundAgentId !== agentId ? `Answers with ${number.inboundAgentName}` : null,
        number.outboundAgentId && number.outboundAgentId !== agentId ? `Calls out with ${number.outboundAgentName}` : null,
    ].filter(Boolean);
    return jobs.length ? jobs.join(' · ') : null;
}

/** A pick that takes the slot from another agent, waiting for the owner to confirm it. */
type Takeover = { id: string; phoneNumber: string; holder: string; holderKeepsOne: boolean };

/**
 * The number this agent works on, one of the owner's (loaded with the page, refreshed after a change). A
 * number answers calls with one inbound agent and places calls for one outbound agent: a pick fills this
 * agent's slot on it at once (asking first when another agent has that slot) and lets its previous number go.
 */
export function AgentNumbersField() {
    const { agentId, saved, form, usage, ownedNumbers, numbers, linking, linkNumbers } =
        usePage<UseVoiceAgentEditorPageReturn>();
    const inbound = saved.callType === VoiceAgentCallType.INBOUND;
    const stray = linkedNumbers(usage, inbound ? VoiceAgentCallType.OUTBOUND : VoiceAgentCallType.INBOUND);
    const typePending = form.callType !== saved.callType;
    const [takeover, setTakeover] = useState<Takeover | null>(null);

    // shortcut: the UI keeps one number per agent; one linked before then shows the first and a pick keeps only it.
    const link = async (id: string | null) => {
        setTakeover(null);
        if (id && !(await linkNumbers([id], true))) return;
        await linkNumbers(
            numbers.map((n) => n.id).filter((n) => n !== id),
            false,
        );
    };

    const pick = (id: string | null) => {
        if (id === (numbers[0]?.id ?? null)) return;
        const number = ownedNumbers.find((n) => n._id === id);
        const holder = number ? slotHolder(number, saved.callType) : null;
        if (!number || !holder || holder.id === agentId) return void link(id);
        const holderKeepsOne = ownedNumbers.some(
            (n) => n._id !== number._id && slotHolder(n, saved.callType)?.id === holder.id,
        );
        setTakeover({ id: number._id, phoneNumber: number.phoneNumber, holder: holder.name, holderKeepsOne });
    };

    return (
        <Field data-testid="agent-numbers">
            <FieldLabel htmlFor="agent-numbers">
                Phone number
                {linking ? <Loader2 className="text-muted-foreground size-3.5 animate-spin" /> : null}
            </FieldLabel>
            {ownedNumbers.length > 0 ? (
                <PhoneNumberSelect
                    id="agent-numbers"
                    data-testid="agent-numbers-select"
                    numbers={ownedNumbers.map((n) => {
                        const mine = numbers.some((x) => x.id === n._id);
                        return {
                            id: n._id,
                            phoneNumber: n.phoneNumber,
                            provider: n.provider,
                            detail: mine ? null : numberJobs(n, agentId),
                        };
                    })}
                    value={numbers[0]?.id ?? null}
                    onChange={pick}
                    placeholder={inbound ? 'Pick the number it answers' : 'Pick the number it calls from'}
                    noneLabel="No number"
                    disabled={typePending || linking}
                />
            ) : (
                <p className="text-muted-foreground text-sm" data-testid="agent-numbers-empty">
                    No numbers yet.{' '}
                    <Link href={VOICE_PHONE_NUMBERS_URL} className="text-primary underline-offset-4 hover:underline">
                        Connect one on Phone numbers
                    </Link>
                </p>
            )}
            <FieldDescription className="text-xs">
                {typePending
                    ? 'Save the new agent type first.'
                    : numbers.length > 0
                      ? inbound
                          ? 'Calls to this number are answered by this agent.'
                          : 'This agent calls from this number.'
                      : inbound
                        ? 'No number yet: pick the one it answers.'
                        : 'No number yet: pick the one it calls from.'}
            </FieldDescription>
            <ConfirmDialog
                open={!!takeover}
                onOpenChange={(open) => !open && setTakeover(null)}
                title={`Use ${takeover?.phoneNumber} for ${saved.name}?`}
                alertMessage={
                    takeover
                        ? `${takeover.phoneNumber} already ${inbound ? 'answers with' : 'calls out with'} ${takeover.holder}. ` +
                          (takeover.holderKeepsOne
                              ? `${takeover.holder} keeps its other number.`
                              : `${takeover.holder} will have no number to ${inbound ? 'answer' : 'call from'}.`)
                        : ''
                }
                confirmText="Use it"
                onConfirm={() => void link(takeover?.id ?? null)}
                isLoading={linking}
            />
            {stray.length > 0 ? (
                <p className="text-xs text-amber-700 dark:text-amber-400" data-testid="agent-numbers-stray">
                    {stray.map((n) => n.phoneNumber).join(', ')} still {inbound ? 'calls' : 'answers'} with it from before it
                    was {inbound ? 'inbound' : 'outbound'}.{' '}
                    <Button
                        type="button"
                        variant="link"
                        size="sm"
                        className="h-auto p-0 text-xs"
                        disabled={linking}
                        onClick={() =>
                            void linkNumbers(
                                stray.map((n) => n.id),
                                false,
                            )
                        }
                    >
                        Unlink
                    </Button>
                </p>
            ) : null}
        </Field>
    );
}
