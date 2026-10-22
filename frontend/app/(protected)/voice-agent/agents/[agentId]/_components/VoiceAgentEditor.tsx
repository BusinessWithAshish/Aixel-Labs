'use client';

import type { FormEvent } from 'react';
import { format } from 'date-fns';
import { Controller, FormProvider } from 'react-hook-form';
import { Loader2, Save, Trash2 } from 'lucide-react';
import { VOICE_AGENT_LIMITS, VoiceAgentCallType } from '@aixellabs/backend/db/types';
import { StringControlledField } from '@/components/common/zod-form-builder/ZodControlledFields';
import { ConfirmDialog } from '@/components/wrappers/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Textarea } from '@/components/ui/textarea';
import { usePage } from '@/contexts/PageStore';
import { GeminiKeyLine } from '../../_components/GeminiKeyLine';
import { VoiceAgentCallTypeBadge } from '../../_components/VoiceAgentCallTypeBadge';
import { VoiceAgentCallTypePicker } from '../../_components/VoiceAgentCallTypePicker';
import { VoiceSelect } from '../../_components/VoiceSelect';
import type { UseVoiceAgentEditorPageReturn } from '../_hooks/use-voice-agent-editor-page';
import type { PromptTool } from '../_utils/prompt-tools';
import { PromptField } from './PromptField';
import { PromptTemplateList, PromptTemplateMenu } from './PromptTemplates';
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

/** The agent's settings, with its tools and call settings in cards underneath. */
export function VoiceAgentEditor() {
    const {
        saved,
        usage,
        agentForm,
        geminiKey,
        form,
        applyTemplate,
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
                            <CardDescription className="grid gap-1">
                                {agentDirty ? (
                                    <span className="text-amber-600 dark:text-amber-400">Unsaved changes</span>
                                ) : (
                                    <span suppressHydrationWarning>
                                        Saved {format(new Date(saved.updatedAt), 'd MMM yyyy, HH:mm')}
                                    </span>
                                )}
                                <GeminiKeyLine view={geminiKey} link />
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
                                            value={field.value}
                                            onChange={field.onChange}
                                            labelledBy="agent-call-type-label"
                                        />
                                        <FieldDescription className="text-xs" data-testid="call-type-note">
                                            Changing it does not rewrite the prompt or call notes: edit them, or start from a
                                            template below.
                                        </FieldDescription>
                                    </Field>
                                )}
                            />

                            <Controller
                                control={agentForm.control}
                                name="prompt"
                                render={({ field, fieldState }) => {
                                    const empty = !field.value.trim();
                                    return (
                                        <Field>
                                            <div className="flex flex-wrap items-end justify-between gap-x-2 gap-y-1">
                                                <FieldLabel htmlFor="agent-prompt">Prompt</FieldLabel>
                                                {empty ? null : (
                                                    <PromptTemplateMenu callType={form.callType} onPick={applyTemplate} />
                                                )}
                                            </div>
                                            <FieldDescription id="agent-prompt-help" className="text-xs">
                                                <strong className="text-foreground font-medium">
                                                    How the agent behaves
                                                </strong>
                                                , the same on every call: who it is, how it talks, what it may and may not
                                                do. The facts it works from go in the call notes below.
                                            </FieldDescription>
                                            {empty ? (
                                                <PromptTemplateList callType={form.callType} onPick={applyTemplate} />
                                            ) : null}
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
                                                placeholder="Or write your own: who the agent is, what it is for, and how it should talk on the phone."
                                                className="h-80 lg:h-[26rem]"
                                            />
                                            {empty ? (
                                                <p
                                                    className="text-xs text-amber-700 dark:text-amber-400"
                                                    data-testid="prompt-empty"
                                                >
                                                    No prompt yet. The agent cannot be saved or talked to until it has one.
                                                </p>
                                            ) : (
                                                <p className="text-muted-foreground text-xs">
                                                    {field.value.length.toLocaleString('en-US')} characters
                                                </p>
                                            )}
                                        </Field>
                                    );
                                }}
                            />

                            <Field>
                                <FieldLabel htmlFor="agent-call-notes">Call notes</FieldLabel>
                                <FieldDescription className="text-xs">
                                    <strong className="text-foreground font-medium">The facts it works from</strong>
                                    {form.callType === VoiceAgentCallType.INBOUND
                                        ? ': your hours, services, prices, whether you take bookings. It answers callers only from these.'
                                        : ': about the business being called. On phone calls, details of the person being called are added too.'}{' '}
                                    Added at the end of the prompt on every call, under &ldquo;This call&rdquo;. When a fact
                                    changes, change it here, not in the prompt.
                                </FieldDescription>
                                <Textarea
                                    id="agent-call-notes"
                                    maxLength={VOICE_AGENT_LIMITS.callNotesMax}
                                    className="min-h-20"
                                    {...agentForm.register('callNotes')}
                                />
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
