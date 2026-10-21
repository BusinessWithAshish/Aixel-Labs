'use client';

import type { FormEvent, ReactNode } from 'react';
import { format } from 'date-fns';
import { Controller, FormProvider } from 'react-hook-form';
import { Loader2, RotateCcw, Save, Trash2 } from 'lucide-react';
import { VOICE_AGENT_LIMITS, VoiceAgentCallType } from '@aixellabs/backend/db/types';
import { StringControlledField } from '@/components/common/zod-form-builder/ZodControlledFields';
import { ConfirmDialog } from '@/components/wrappers/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Textarea } from '@/components/ui/textarea';
import { usePage } from '@/contexts/PageStore';
import { VOICE_AGENT_CALL_TYPES } from '@/helpers/voice-agent-defaults';
import { VoiceAgentCallTypeBadge } from '../../_components/VoiceAgentCallTypeBadge';
import { VoiceAgentCallTypePicker } from '../../_components/VoiceAgentCallTypePicker';
import { VoiceSelect } from '../../_components/VoiceSelect';
import type { UseVoiceAgentEditorPageReturn } from '../_hooks/use-voice-agent-editor-page';
import type { PromptTool } from '../_utils/prompt-tools';
import { PromptField } from './PromptField';
import { CallSettingsCard } from './settings/CallSettingsCard';
import { VOICE_AGENT_TOOLS_ID, VoiceAgentToolsCard } from './tools/VoiceAgentToolsCard';
import { VariableDefaults } from './VariableDefaults';

/** Scrolls to the Tools card: the booking switch (focused) or the custom tools. */
function openTools(kind?: PromptTool['kind']) {
    const target =
        (kind === 'custom' && document.getElementById('custom-tools-title')) ||
        document.getElementById(VOICE_AGENT_TOOLS_ID);
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (kind === 'booking') document.getElementById('booking-enabled')?.focus({ preventScroll: true });
}

/** Scrolls to the default values of the prompt's variables. */
function openVariables() {
    const target = document.getElementById('agent-variables');
    target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target?.querySelector<HTMLInputElement>('input[value=""]')?.focus({ preventScroll: true });
}

/** "Use the inbound default prompt", shown beside a label once the text differs from the default. */
function UseDefaultButton({ show, onClick, children }: { show: boolean; onClick: () => void; children: ReactNode }) {
    if (!show) return null;
    return (
        <Button type="button" variant="ghost" size="sm" className="h-7" onClick={onClick}>
            <RotateCcw className="size-3.5" />
            {children}
        </Button>
    );
}

/** The agent's settings, with its tools and call settings in cards underneath. */
export function VoiceAgentEditor() {
    const {
        saved,
        usage,
        agentForm,
        form,
        defaults,
        resetPrompt,
        resetCallNotes,
        promptTools,
        promptVariables,
        agentDirty,
        canSaveAgent,
        saving,
        saveAgent,
        deleteOpen,
        setDeleteOpen,
        deleting,
        confirmDelete,
    } = usePage<UseVoiceAgentEditorPageReturn>();

    const typeLabel = VOICE_AGENT_CALL_TYPES[form.callType].label.toLowerCase();
    const onNumbers = usage.inbound.length + usage.outbound.length > 0;

    const onSubmit = (event: FormEvent) => {
        event.preventDefault();
        if (canSaveAgent) void saveAgent();
    };

    return (
        <div className="grid min-w-0 gap-4">
            <Card className="h-auto min-w-0">
                <FormProvider {...agentForm}>
                    <form onSubmit={onSubmit} className="contents">
                        <CardHeader>
                            <CardTitle className="flex flex-wrap items-center gap-2">
                                Agent
                                <VoiceAgentCallTypeBadge callType={form.callType} />
                            </CardTitle>
                            <CardDescription>
                                {agentDirty ? (
                                    <span className="text-amber-600 dark:text-amber-400">Unsaved changes</span>
                                ) : (
                                    <span suppressHydrationWarning>
                                        Saved {format(new Date(saved.updatedAt), 'd MMM yyyy, HH:mm')}
                                    </span>
                                )}
                            </CardDescription>
                            <CardAction className="flex flex-wrap justify-end gap-2">
                                {agentDirty ? (
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() => agentForm.reset()}
                                        disabled={saving}
                                    >
                                        Discard
                                    </Button>
                                ) : null}
                                <Button type="submit" size="sm" disabled={!canSaveAgent}>
                                    {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                                    Save
                                </Button>
                            </CardAction>
                        </CardHeader>

                        <CardContent className="grid gap-5">
                            <div className="grid gap-4 sm:grid-cols-2">
                                <StringControlledField
                                    name="name"
                                    id="agent-name"
                                    label="Name"
                                    placeholder="Front desk"
                                    inputProps={{ maxLength: VOICE_AGENT_LIMITS.nameMax }}
                                />
                                <Controller
                                    control={agentForm.control}
                                    name="voice"
                                    render={({ field }) => (
                                        <Field>
                                            <FieldLabel htmlFor="agent-voice">Voice</FieldLabel>
                                            <VoiceSelect id="agent-voice" value={field.value} onChange={field.onChange} />
                                        </Field>
                                    )}
                                />
                            </div>

                            <Controller
                                control={agentForm.control}
                                name="callType"
                                render={({ field }) => (
                                    <Field>
                                        <FieldLabel id="agent-call-type-label">Call type</FieldLabel>
                                        <VoiceAgentCallTypePicker
                                            size="sm"
                                            value={field.value}
                                            onChange={field.onChange}
                                            labelledBy="agent-call-type-label"
                                        />
                                        <FieldDescription className="text-xs" data-testid="call-type-note">
                                            Changing the type does not rewrite the prompt or call notes. Edit them yourself,
                                            or use the {typeLabel} defaults below.
                                        </FieldDescription>
                                    </Field>
                                )}
                            />

                            <Controller
                                control={agentForm.control}
                                name="prompt"
                                render={({ field, fieldState }) => (
                                    <Field>
                                        <div className="flex flex-wrap items-end justify-between gap-x-2 gap-y-1">
                                            <FieldLabel htmlFor="agent-prompt">Prompt</FieldLabel>
                                            <UseDefaultButton show={field.value !== defaults.prompt} onClick={resetPrompt}>
                                                Use the {typeLabel} default prompt
                                            </UseDefaultButton>
                                        </div>
                                        <PromptField
                                            id="agent-prompt"
                                            value={field.value}
                                            onChange={field.onChange}
                                            tools={promptTools}
                                            onOpenTools={openTools}
                                            variables={promptVariables}
                                            onOpenVariables={openVariables}
                                            invalid={fieldState.invalid}
                                            describedBy="agent-prompt-help"
                                            className="h-80 lg:h-[26rem]"
                                        />
                                        <FieldDescription id="agent-prompt-help" className="text-xs">
                                            Everything the agent knows and how it talks. Type / to add a tool, {'{{'} to add
                                            a variable. {field.value.length.toLocaleString('en-US')} characters.
                                        </FieldDescription>
                                    </Field>
                                )}
                            />

                            <Field>
                                <div className="flex flex-wrap items-end justify-between gap-x-2 gap-y-1">
                                    <FieldLabel htmlFor="agent-call-notes">Call notes</FieldLabel>
                                    <UseDefaultButton show={form.callNotes !== defaults.callNotes} onClick={resetCallNotes}>
                                        Use the {typeLabel} default notes
                                    </UseDefaultButton>
                                </div>
                                <Textarea
                                    id="agent-call-notes"
                                    maxLength={VOICE_AGENT_LIMITS.callNotesMax}
                                    className="min-h-20"
                                    {...agentForm.register('callNotes')}
                                />
                                <FieldDescription className="text-xs">
                                    {form.callType === VoiceAgentCallType.INBOUND
                                        ? 'Facts about your business (hours, services, prices, whether it takes bookings). The agent answers callers only from these.'
                                        : 'Facts about the business being called.'}{' '}
                                    Added under &ldquo;This call&rdquo; at the end of the prompt. Playground calls use these
                                    as written.
                                </FieldDescription>
                            </Field>

                            <VariableDefaults />
                        </CardContent>

                        <CardFooter className="justify-end">
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="text-destructive hover:text-destructive"
                                onClick={() => setDeleteOpen(true)}
                            >
                                <Trash2 className="size-4" />
                                Delete agent
                            </Button>
                        </CardFooter>
                    </form>
                </FormProvider>

                <ConfirmDialog
                    open={deleteOpen}
                    onOpenChange={setDeleteOpen}
                    title={`Delete ${saved.name}?`}
                    alertMessage={
                        onNumbers
                            ? "The agent is removed and taken off every phone number that places calls with it, until you pick another one. If it answers a number's calls, turn AI answering off on that number first. Past call logs stay."
                            : 'The agent is removed. Past call logs stay.'
                    }
                    confirmText="Delete agent"
                    onConfirm={() => void confirmDelete()}
                    isLoading={deleting}
                />
            </Card>
            <VoiceAgentToolsCard />
            <CallSettingsCard />
        </div>
    );
}
