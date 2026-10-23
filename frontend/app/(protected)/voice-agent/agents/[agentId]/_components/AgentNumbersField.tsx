'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CheckIcon, ChevronsUpDownIcon, Loader2 } from 'lucide-react';
import { VoiceAgentCallType } from '@aixellabs/backend/db/types';
import type { VoiceNumberListItem } from '@/app/actions/voice-number-actions';
import { NumberProviderLogo } from '@/components/common/voice-agent/NumberProviderLogo';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { usePage } from '@/contexts/PageStore';
import { VOICE_PHONE_NUMBERS_URL } from '@/helpers/voice-routes';
import { cn } from '@/lib/utils';
import { linkedNumbers, type UseVoiceAgentEditorPageReturn } from '../_hooks/use-voice-agent-editor-page';

/** What a number does now, in a few words ("answers with Front desk"), or null when it does nothing. */
function numberJob(number: VoiceNumberListItem): string | null {
    if (number.inboundAgentName) return `answers with ${number.inboundAgentName}`;
    if (number.outboundAgentName) return `calls with ${number.outboundAgentName}`;
    return null;
}

/**
 * The numbers this agent works on, picked from the owner's numbers (loaded with the page, refreshed after
 * each change) in a dropdown: an inbound agent's numbers answer calls with it, an outbound agent's place
 * calls with it. Each pick links or unlinks at once; a number does one job, so picking one takes it off another.
 */
export function AgentNumbersField() {
    const { saved, form, usage, ownedNumbers, numbers, linking, linkNumbers } = usePage<UseVoiceAgentEditorPageReturn>();
    const inbound = saved.callType === VoiceAgentCallType.INBOUND;
    const stray = linkedNumbers(usage, inbound ? VoiceAgentCallType.OUTBOUND : VoiceAgentCallType.INBOUND);
    const typePending = form.callType !== saved.callType;

    const [open, setOpen] = useState(false);

    return (
        <Field data-testid="agent-numbers">
            <FieldLabel htmlFor="agent-numbers">Phone numbers</FieldLabel>
            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                    <Button
                        id="agent-numbers"
                        type="button"
                        variant="outline"
                        role="combobox"
                        aria-expanded={open}
                        disabled={typePending}
                        className="h-auto min-h-9 w-full justify-between font-normal"
                        data-testid="agent-numbers-trigger"
                    >
                        {numbers.length > 0 ? (
                            <span className="flex flex-wrap gap-x-3 gap-y-1" data-testid="agent-numbers-list">
                                {numbers.map((n) => (
                                    <span key={n.id} className="flex items-center gap-1.5 tabular-nums">
                                        <NumberProviderLogo provider={n.provider} className="size-4" />
                                        {n.phoneNumber}
                                    </span>
                                ))}
                            </span>
                        ) : (
                            <span className="text-muted-foreground">
                                {inbound ? 'Pick the numbers it answers' : 'Pick the numbers it calls from'}
                            </span>
                        )}
                        {linking ? (
                            <Loader2 className="size-4 shrink-0 animate-spin" />
                        ) : (
                            <ChevronsUpDownIcon className="size-4 shrink-0 opacity-50" />
                        )}
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-(--radix-popover-trigger-width) min-w-72 p-0" align="start">
                    <Command>
                        {ownedNumbers.length > 5 ? <CommandInput placeholder="Search numbers" /> : null}
                        <CommandList className="max-h-72" data-testid="agent-numbers-options">
                            <CommandEmpty>
                                {ownedNumbers.length ? (
                                    'No number found.'
                                ) : (
                                    <>
                                        No numbers yet.{' '}
                                        <Link href={VOICE_PHONE_NUMBERS_URL} className="underline underline-offset-4">
                                            Connect one on Phone numbers
                                        </Link>
                                    </>
                                )}
                            </CommandEmpty>
                            {ownedNumbers.map((n) => {
                                const mine = numbers.some((x) => x.id === n._id);
                                const job = mine ? null : numberJob(n);
                                return (
                                    <CommandItem
                                        key={n._id}
                                        value={n.phoneNumber}
                                        disabled={linking}
                                        data-linked={mine}
                                        onSelect={() => void linkNumbers([n._id], !mine)}
                                    >
                                        <CheckIcon className={cn('size-4', mine ? 'opacity-100' : 'opacity-0')} />
                                        <NumberProviderLogo provider={n.provider} className="size-4" />
                                        <span className="grid min-w-0">
                                            <span className="tabular-nums">{n.phoneNumber}</span>
                                            {job ? (
                                                <span className="text-muted-foreground truncate text-xs">now {job}</span>
                                            ) : null}
                                        </span>
                                    </CommandItem>
                                );
                            })}
                        </CommandList>
                    </Command>
                </PopoverContent>
            </Popover>
            <FieldDescription className="text-xs">
                {typePending
                    ? 'Save the new agent type first.'
                    : numbers.length > 0
                      ? inbound
                          ? 'Calls to these numbers are answered by this agent.'
                          : 'This agent calls from these numbers.'
                      : inbound
                        ? 'No number yet: pick the ones it answers.'
                        : 'No number yet: pick the ones it calls from.'}
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
