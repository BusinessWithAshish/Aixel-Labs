'use client';

import { Controller, FormProvider } from 'react-hook-form';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { VOICE_AGENT_LIMITS, VoiceAgentCallType } from '@aixellabs/backend/db/types';
import { StringControlledField } from '@/components/common/zod-form-builder/ZodControlledFields';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, FieldLabel } from '@/components/ui/field';
import { usePage } from '@/contexts/PageStore';
import type { UseVoiceAgentsPageReturn } from '../_hooks/use-voice-agents-page';
import { VoiceAgentCallTypeBadge } from './VoiceAgentCallTypeBadge';
import { VoiceAgentCallTypePicker } from './VoiceAgentCallTypePicker';
import { VoiceSelect } from './VoiceSelect';

const STARTS_FROM: Record<VoiceAgentCallType, string> = {
    [VoiceAgentCallType.INBOUND]:
        'It starts with a receptionist prompt and a call-notes template for your business’s hours and services. You can change all of it next.',
    [VoiceAgentCallType.OUTBOUND]:
        'It starts with the call-tested cold-call prompt. You can change the prompt, voice and notes next.',
};

/** Two steps: inbound or outbound, then name and voice. */
export function CreateVoiceAgentDialog() {
    const { createOpen, onCreateOpenChange, newCallType, setNewCallType, createForm, creating, createAgent } =
        usePage<UseVoiceAgentsPageReturn>();

    return (
        <Dialog open={createOpen} onOpenChange={onCreateOpenChange}>
            <DialogContent className="sm:max-w-xl">
                {newCallType === null ? (
                    <div className="grid gap-4">
                        <DialogHeader>
                            <DialogTitle>New voice agent</DialogTitle>
                            <DialogDescription id="new-agent-call-type-label">
                                What will this agent do? You can change it later.
                            </DialogDescription>
                        </DialogHeader>
                        <VoiceAgentCallTypePicker
                            value={newCallType}
                            onChange={setNewCallType}
                            labelledBy="new-agent-call-type-label"
                        />
                    </div>
                ) : (
                    <FormProvider {...createForm}>
                        <form onSubmit={createAgent} className="grid gap-4">
                            <DialogHeader>
                                <DialogTitle>New voice agent</DialogTitle>
                                <DialogDescription>{STARTS_FROM[newCallType]}</DialogDescription>
                            </DialogHeader>
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <VoiceAgentCallTypeBadge callType={newCallType} />
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-7"
                                    onClick={() => setNewCallType(null)}
                                    disabled={creating}
                                >
                                    <ArrowLeft className="size-3.5" />
                                    Change type
                                </Button>
                            </div>
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
                )}
            </DialogContent>
        </Dialog>
    );
}
