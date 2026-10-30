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
import { numberKind, type NumberKind } from '@/helpers/voice-agent-channels';
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

/** Scrolls to the prompt and puts the cursor in it. */
function openPrompt() {
    const prompt = document.getElementById('agent-prompt');
    prompt?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    prompt?.focus({ preventScroll: true });
}

/** A pick that takes the slot from another agent, waiting for the owner to confirm it. */
type Takeover = { id: string; phoneNumber: string; holder: string; holderKeepsOne: boolean };

/**
 * Where the agent works: the numbers it is on, one of the owner's of each kind (loaded with the page, refreshed after
 * a change). A number does one job, for one agent: a pick puts this agent on it at once (asking first when another
 * agent has it) and lets its previous number of that kind go. An agent that answers can also answer a WhatsApp number;
 * the same agent on a number's phone line and its WhatsApp keeps one memory of each person.
 */
export function AgentNumbersField() {
    const { saved, whatsapp } = usePage<UseVoiceAgentEditorPageReturn>();
    const onWhatsApp = whatsapp && saved.callType === VoiceAgentCallType.INBOUND;
    return (
        <fieldset className="grid gap-3" aria-labelledby="agent-places-title">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 id="agent-places-title" className="text-sm font-medium">
                    Where it works
                </h3>
                <Link href={VOICE_PHONE_NUMBERS_URL} className="text-primary text-xs underline-offset-4 hover:underline">
                    All your numbers
                </Link>
            </div>
            <div className={onWhatsApp ? 'grid gap-4 md:grid-cols-2' : 'grid gap-4'}>
                <NumberPicker kind="phone" />
                {onWhatsApp ? <NumberPicker kind="whatsapp" /> : null}
            </div>
        </fieldset>
    );
}

/** The agent's number of one kind: a phone line, or a WhatsApp number. */
function NumberPicker({ kind }: { kind: NumberKind }) {
    const page = usePage<UseVoiceAgentEditorPageReturn>();
    const { agentId, saved, form, usage, linking, linkNumbers } = page;
    const ownedNumbers = page.ownedNumbers.filter((n) => numberKind(n.provider) === kind);
    const numbers = page.numbers.filter((n) => numberKind(n.provider) === kind);
    const inbound = saved.callType === VoiceAgentCallType.INBOUND;
    const stray = linkedNumbers(usage, inbound ? VoiceAgentCallType.OUTBOUND : VoiceAgentCallType.INBOUND).filter(
        (n) => numberKind(n.provider) === kind,
    );
    const typePending = form.callType !== saved.callType;
    const whatsapp = kind === 'whatsapp';
    const [takeover, setTakeover] = useState<Takeover | null>(null);

    // The server refuses a number for an agent with no saved prompt (it would answer with nothing): say so first.
    const noPrompt = !saved.prompt.trim();
    const current = numbers[0]?.id ?? null;
    // A pick shows at once and until the refresh brings the saved number (`from` is what was there before it).
    const [pending, setPending] = useState<{ id: string | null; from: string | null } | null>(null);
    const waiting = pending !== null && pending.from === current;
    const shown = waiting ? pending.id : current;

    // shortcut: the UI keeps one number per agent; one linked before then shows the first and a pick keeps only it.
    const link = async (id: string | null) => {
        setTakeover(null);
        setPending({ id, from: current });
        const ok =
            (!id || (await linkNumbers([id], true))) &&
            (await linkNumbers(
                numbers.map((n) => n.id).filter((n) => n !== id),
                false,
            ));
        // The toast says what failed; the picker goes back to what is saved.
        if (!ok) setPending(null);
    };

    const hint = typePending
        ? 'Save the agent first.'
        : numbers.length > 0
          ? whatsapp
              ? 'Chats, voice notes and calls to this WhatsApp number are answered by this agent.'
              : inbound
                ? 'Calls to this number are answered by this agent.'
                : 'This agent calls from this number.'
          : whatsapp
            ? 'No WhatsApp number yet: pick the one it answers.'
            : inbound
              ? 'No number yet: pick the one it answers.'
              : 'No number yet: pick the one it calls from.';

    const pick = (id: string | null) => {
        if (id === shown) return;
        const number = ownedNumbers.find((n) => n._id === id);
        const holder = number ? slotHolder(number, saved.callType) : null;
        if (!number || !holder || holder.id === agentId) return void link(id);
        const holderKeepsOne = ownedNumbers.some(
            (n) => n._id !== number._id && slotHolder(n, saved.callType)?.id === holder.id,
        );
        setTakeover({ id: number._id, phoneNumber: number.phoneNumber, holder: holder.name, holderKeepsOne });
    };

    return (
        <Field data-testid={whatsapp ? 'agent-whatsapp-numbers' : 'agent-numbers'}>
            <FieldLabel htmlFor={`agent-numbers-${kind}`}>
                {whatsapp ? 'WhatsApp number' : 'Phone number'}
                {linking || waiting ? <Loader2 className="text-muted-foreground size-3.5 animate-spin" /> : null}
            </FieldLabel>
            {ownedNumbers.length > 0 ? (
                <PhoneNumberSelect
                    id={`agent-numbers-${kind}`}
                    data-testid={whatsapp ? 'agent-whatsapp-numbers-select' : 'agent-numbers-select'}
                    numbers={ownedNumbers.map((n) => {
                        const mine = numbers.some((x) => x.id === n._id);
                        return {
                            id: n._id,
                            phoneNumber: n.phoneNumber,
                            provider: n.provider,
                            detail: mine ? null : numberJobs(n, agentId),
                        };
                    })}
                    value={shown}
                    onChange={pick}
                    placeholder={
                        whatsapp
                            ? 'Pick the WhatsApp number it answers'
                            : inbound
                              ? 'Pick the number it answers'
                              : 'Pick the number it calls from'
                    }
                    noneLabel="No number"
                    disabled={typePending || noPrompt || linking}
                />
            ) : (
                <p className="text-muted-foreground text-sm" data-testid="agent-numbers-empty">
                    {whatsapp ? 'No WhatsApp numbers yet.' : 'No numbers yet.'}{' '}
                    <Link href={VOICE_PHONE_NUMBERS_URL} className="text-primary underline-offset-4 hover:underline">
                        Connect one on Numbers
                    </Link>
                </p>
            )}
            <FieldDescription className="text-xs">
                {noPrompt && ownedNumbers.length > 0 ? (
                    <span className="text-amber-700 dark:text-amber-400" data-testid="agent-numbers-no-prompt">
                        {form.prompt.trim() ? 'Save the prompt first' : 'Write a prompt or pick a template first'}, so the
                        number doesn&apos;t answer with an empty agent.{' '}
                        <Button type="button" variant="link" size="sm" className="h-auto p-0 text-xs" onClick={openPrompt}>
                            Go to the prompt
                        </Button>
                    </span>
                ) : (
                    hint
                )}
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
