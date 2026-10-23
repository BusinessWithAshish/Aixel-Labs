'use client';

import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { VoiceAgentCallType } from '@aixellabs/backend/db/types';
import type { VoiceNumberListItem } from '@/app/actions/voice-number-actions';
import { PhoneNumberSelect } from '@/components/common/voice-agent/PhoneNumberSelect';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { usePage } from '@/contexts/PageStore';
import { VOICE_PHONE_NUMBERS_URL } from '@/helpers/voice-routes';
import { linkedNumbers, type UseVoiceAgentEditorPageReturn } from '../_hooks/use-voice-agent-editor-page';

/** What a number does now, in a few words ("Answers with Front desk"), or null when it does nothing. */
function numberJob(number: VoiceNumberListItem): string | null {
    if (number.inboundAgentName) return `Answers with ${number.inboundAgentName}`;
    if (number.outboundAgentName) return `Calls with ${number.outboundAgentName}`;
    return null;
}

/**
 * The number this agent works on, one of the owner's (loaded with the page, refreshed after a change): an
 * inbound agent's number answers calls with it, an outbound agent's places calls with it. A pick links it at
 * once and lets any other go; a number does one job, so picking one takes it off another.
 */
export function AgentNumbersField() {
    const { saved, form, usage, ownedNumbers, numbers, linking, linkNumbers } = usePage<UseVoiceAgentEditorPageReturn>();
    const inbound = saved.callType === VoiceAgentCallType.INBOUND;
    const stray = linkedNumbers(usage, inbound ? VoiceAgentCallType.OUTBOUND : VoiceAgentCallType.INBOUND);
    const typePending = form.callType !== saved.callType;

    // shortcut: the UI keeps one number per agent; one linked before then shows the first and a pick keeps only it.
    const pick = async (id: string | null) => {
        if (id && !(await linkNumbers([id], true))) return;
        await linkNumbers(
            numbers.map((n) => n.id).filter((n) => n !== id),
            false,
        );
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
                            detail: mine ? null : numberJob(n),
                        };
                    })}
                    value={numbers[0]?.id ?? null}
                    onChange={(id) => void pick(id)}
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
