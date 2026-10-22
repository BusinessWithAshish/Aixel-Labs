'use client';

import { Controller, FormProvider } from 'react-hook-form';
import { Loader2 } from 'lucide-react';
import { VOICE_AGENT_LIMITS, VoiceAgentCallType } from '@aixellabs/backend/db/types';
import { StringControlledField } from '@/components/common/zod-form-builder/ZodControlledFields';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, FieldLabel } from '@/components/ui/field';
import { usePage } from '@/contexts/PageStore';
import type { UseVoiceAgentsPageReturn } from '../_hooks/use-voice-agents-page';
import { VoiceAgentCallTypePicker } from './VoiceAgentCallTypePicker';
import { VoiceSelect } from './VoiceSelect';

const STARTS_FROM: Record<VoiceAgentCallType, string> = {
    [VoiceAgentCallType.INBOUND]:
        'Next you give it a prompt: start from the receptionist template or write your own. Its call notes start as a form for your hours and services.',
    [VoiceAgentCallType.OUTBOUND]: 'Next you give it a prompt: start from the tested cold-call template or write your own.',
};

/** Inbound or outbound, a name and a voice; the prompt comes next, on the agent's page. */
export function CreateVoiceAgentDialog() {
    const { createOpen, onCreateOpenChange, createForm, creating, createAgent } = usePage<UseVoiceAgentsPageReturn>();
    const callType = createForm.watch('callType');

    return (
        <Dialog open={createOpen} onOpenChange={onCreateOpenChange}>
            <DialogContent className="sm:max-w-xl">
                <FormProvider {...createForm}>
                    <form onSubmit={createAgent} className="grid gap-4">
                        <DialogHeader>
                            <DialogTitle>New voice agent</DialogTitle>
                            <DialogDescription>{STARTS_FROM[callType]}</DialogDescription>
                        </DialogHeader>
                        <Controller
                            control={createForm.control}
                            name="callType"
                            render={({ field }) => (
                                <Field>
                                    <FieldLabel id="new-agent-call-type-label">What will it do?</FieldLabel>
                                    <VoiceAgentCallTypePicker
                                        value={field.value}
                                        onChange={field.onChange}
                                        disabled={creating}
                                        labelledBy="new-agent-call-type-label"
                                    />
                                </Field>
                            )}
                        />
                        <StringControlledField
                            name="name"
                            id="new-agent-name"
                            label="Name"
                            placeholder="Front desk"
                            description="Shown in your agent list and call logs. What callers hear comes from the prompt."
                            classNames={{ description: 'text-xs' }}
                            inputProps={{ maxLength: VOICE_AGENT_LIMITS.nameMax, autoFocus: true }}
                        />
                        <Controller
                            control={createForm.control}
                            name="voice"
                            render={({ field }) => (
                                <Field>
                                    <FieldLabel htmlFor="new-agent-voice">Voice</FieldLabel>
                                    <VoiceSelect
                                        id="new-agent-voice"
                                        value={field.value}
                                        onChange={field.onChange}
                                        disabled={creating}
                                    />
                                </Field>
                            )}
                        />
                        <DialogFooter>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => onCreateOpenChange(false)}
                                disabled={creating}
                            >
                                Cancel
                            </Button>
                            <Button type="submit" disabled={creating || !createForm.formState.isValid}>
                                {creating ? <Loader2 className="size-4 animate-spin" /> : null}
                                Create agent
                            </Button>
                        </DialogFooter>
                    </form>
                </FormProvider>
            </DialogContent>
        </Dialog>
    );
}
