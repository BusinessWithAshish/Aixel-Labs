'use client';

import type { FormEvent } from 'react';
import { format } from 'date-fns';
import { Controller, FormProvider } from 'react-hook-form';
import { Loader2, Save, Trash2 } from 'lucide-react';
import { VOICE_AGENT_LIMITS, VoiceAgentCallType } from '@aixellabs/backend/db/types';
import { StringControlledField } from '@/components/common/zod-form-builder/ZodControlledFields';
import { ConfirmDialog } from '@/components/wrappers/ConfirmDialog';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { usePage } from '@/contexts/PageStore';
import { VOICE_AGENT_CALL_TYPES, VOICE_AGENT_PROMPT_TEMPLATES } from '@/helpers/voice-agent-defaults';
import { VoiceAgentCallTypeBadge } from '../../_components/VoiceAgentCallTypeBadge';
import { VoiceAgentCallTypeSelect } from '../../_components/VoiceAgentCallTypeSelect';
import type { UseVoiceAgentEditorPageReturn } from '../_hooks/use-voice-agent-editor-page';
import type { PromptTool } from '../_utils/prompt-tools';
import { AgentNumbersField, slotHolder } from './AgentNumbersField';
import { CallBlockers } from '@/components/common/voice-agent/CallBlockers';
import { AgentTestButton } from './AgentTestButton';
import { AgentTestCallButton } from './AgentTestCallButton';
import { PromptField } from './PromptField';
import { PromptTemplates } from './PromptTemplates';
import { CallSettingsCard } from './settings/CallSettingsCard';
import { AgentStackSection } from './stack/AgentStackSection';
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

/** The agent itself (name, agent type, stack, numbers, prompt), with its tools and call settings in cards underneath. */
export function VoiceAgentEditor() {
    const {
        saved,
        usage,
        agentForm,
        form,
        applyTemplate,
        alternate,
        switchPrompt,
        promptTools,
        promptVariables,
        agentDirty,
        canSaveAgent,
        saving,
        saveAgent,
        numbers,
        ownedNumbers,
        typeChangeOpen,
        setTypeChangeOpen,
        deleteOpen,
        setDeleteOpen,
        deleting,
        confirmDelete,
        phoneBlockers,
    } = usePage<UseVoiceAgentEditorPageReturn>();

    const onNumbers = usage.inbound.length + usage.outbound.length > 0;
    const newType = VOICE_AGENT_CALL_TYPES[form.callType].label.toLowerCase();
    // Its numbers whose slot for the new type is another agent's: switching them takes it over.
    const takenSlots = ownedNumbers.flatMap((n) => {
        const holder = numbers.some((x) => x.id === n._id) ? slotHolder(n, form.callType) : null;
        return holder && holder.id !== saved._id ? [{ phoneNumber: n.phoneNumber, holder: holder.name }] : [];
    });

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
                                <AgentTestCallButton />
                                <AgentTestButton />
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="text-destructive hover:text-destructive"
                                    onClick={() => setDeleteOpen(true)}
                                    aria-label="Delete agent"
                                >
                                    <Trash2 className="size-4" />
                                    Delete
                                </Button>
                                <Button type="submit" size="sm" disabled={!canSaveAgent}>
                                    {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                                    Save
                                </Button>
                            </CardAction>
                        </CardHeader>

                        <CardContent className="grid gap-5">
                            <CallBlockers blockers={phoneBlockers} />
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
                                    name="callType"
                                    render={({ field }) => (
                                        <Field>
                                            <FieldLabel htmlFor="agent-call-type">Agent type</FieldLabel>
                                            <VoiceAgentCallTypeSelect
                                                id="agent-call-type"
                                                value={field.value}
                                                onChange={field.onChange}
                                            />
                                            <FieldDescription className="text-xs" data-testid="call-type-note">
                                                Changing it does not rewrite the prompt.
                                            </FieldDescription>
                                        </Field>
                                    )}
                                />
                            </div>

                            <AgentStackSection />

                            <AgentNumbersField />

                            <Controller
                                control={agentForm.control}
                                name="prompt"
                                render={({ field, fieldState }) => {
                                    const empty = !field.value.trim();
                                    const template = VOICE_AGENT_PROMPT_TEMPLATES.find(
                                        (t) => t.prompt.trim() === field.value.trim(),
                                    );
                                    return (
                                        <Field>
                                            <div className="flex flex-wrap items-end justify-between gap-x-2 gap-y-1">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <FieldLabel htmlFor="agent-prompt">Prompt</FieldLabel>
                                                    {empty ? null : (
                                                        <Badge variant="outline" data-testid="prompt-source">
                                                            {template ? `Template: ${template.title}` : 'Custom prompt'}
                                                        </Badge>
                                                    )}
                                                </div>
                                                {empty ? null : (
                                                    <PromptTemplates
                                                        callType={form.callType}
                                                        empty={false}
                                                        onUse={applyTemplate}
                                                    />
                                                )}
                                            </div>
                                            <FieldDescription id="agent-prompt-help" className="text-xs">
                                                Who the agent is, how it talks, and the facts it answers from. Booking hours
                                                come from Tools.
                                            </FieldDescription>
                                            {empty ? (
                                                <PromptTemplates callType={form.callType} empty onUse={applyTemplate} />
                                            ) : null}
                                            {alternate ? (
                                                <p className="text-muted-foreground text-xs" data-testid="prompt-alternate">
                                                    Showing {alternate.currentLabel}.{' '}
                                                    <Button
                                                        type="button"
                                                        variant="link"
                                                        size="sm"
                                                        className="h-auto p-0 text-xs"
                                                        onClick={switchPrompt}
                                                    >
                                                        Switch to {alternate.label}
                                                    </Button>
                                                </p>
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
                                                placeholder="Or write your own: who the agent is, what it is for, how it should talk on the phone, and the facts it answers from."
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

                            <VariableDefaults />
                        </CardContent>
                    </form>
                </FormProvider>

                <Dialog open={typeChangeOpen} onOpenChange={setTypeChangeOpen}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Make it an {newType} agent?</DialogTitle>
                            <DialogDescription>
                                It is on {numbers.map((n) => n.phoneNumber).join(', ')}. Should{' '}
                                {numbers.length === 1 ? 'that number' : 'those numbers'}{' '}
                                {form.callType === VoiceAgentCallType.INBOUND
                                    ? 'answer calls with it instead of placing them'
                                    : 'place calls with it instead of answering them'}
                                , or let it go?
                                {takenSlots.map((t) => (
                                    <span key={t.phoneNumber} className="mt-2 block">
                                        {t.phoneNumber} already{' '}
                                        {form.callType === VoiceAgentCallType.INBOUND ? 'answers with' : 'calls out with'}{' '}
                                        {t.holder}: switching it takes that over.
                                    </span>
                                ))}
                            </DialogDescription>
                        </DialogHeader>
                        <DialogFooter>
                            <Button variant="outline" disabled={saving} onClick={() => setTypeChangeOpen(false)}>
                                Cancel
                            </Button>
                            <Button variant="outline" disabled={saving} onClick={() => void saveAgent('unlink')}>
                                Unlink
                            </Button>
                            <Button disabled={saving} onClick={() => void saveAgent('switch')}>
                                Switch {numbers.length === 1 ? 'it' : 'them'}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                <ConfirmDialog
                    open={deleteOpen}
                    onOpenChange={setDeleteOpen}
                    title={`Delete ${saved.name}?`}
                    alertMessage={
                        onNumbers
                            ? 'The agent is removed and its numbers are let go: they stop answering or calling with it until you pick another agent. Past call logs stay.'
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
