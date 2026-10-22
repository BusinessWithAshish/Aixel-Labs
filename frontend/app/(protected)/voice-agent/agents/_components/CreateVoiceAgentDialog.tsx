'use client';

import { Controller, FormProvider } from 'react-hook-form';
import { Loader2 } from 'lucide-react';
import { VOICE_AGENT_LIMITS } from '@aixellabs/backend/db/types';
import { StringControlledField } from '@/components/common/zod-form-builder/ZodControlledFields';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, FieldLabel } from '@/components/ui/field';
import { usePage } from '@/contexts/PageStore';
import type { UseVoiceAgentsPageReturn } from '../_hooks/use-voice-agents-page';
import { VoiceAgentCallTypeSelect } from './VoiceAgentCallTypeSelect';
import { VoicePicker } from '@/components/common/voice-agent/VoicePicker';

/** Inbound or outbound, a name and a voice; the prompt comes next, on the agent's page. */
export function CreateVoiceAgentDialog() {
    const { createOpen, onCreateOpenChange, createForm, creating, createAgent } = usePage<UseVoiceAgentsPageReturn>();

    return (
        <Dialog open={createOpen} onOpenChange={onCreateOpenChange}>
            <DialogContent className="sm:max-w-xl">
                <FormProvider {...createForm}>
                    <form onSubmit={createAgent} className="grid gap-4">
                        <DialogHeader>
                            <DialogTitle>New voice agent</DialogTitle>
                            <DialogDescription>
                                Next you pick a template for its prompt, or write your own.
                            </DialogDescription>
                        </DialogHeader>
                        <Controller
                            control={createForm.control}
                            name="callType"
                            render={({ field }) => (
                                <Field>
                                    <FieldLabel htmlFor="new-agent-call-type">Call type</FieldLabel>
                                    <VoiceAgentCallTypeSelect
                                        id="new-agent-call-type"
                                        value={field.value}
                                        onChange={field.onChange}
                                        disabled={creating}
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
                        <Field>
                            <FieldLabel htmlFor="new-agent-voice">Voice</FieldLabel>
                            <VoicePicker id="new-agent-voice" disabled={creating} />
                        </Field>
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
