'use client';

import type { FormEvent } from 'react';
import { format } from 'date-fns';
import { Loader2, RotateCcw, Save, Trash2 } from 'lucide-react';
import { ConfirmDialog } from '@/components/wrappers/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { usePage } from '@/contexts/PageStore';
import { VoiceAgentCallType } from '@aixellabs/backend/db/types';
import { VOICE_AGENT_CALL_TYPES } from '@/helpers/voice-agent-defaults';
import { VoiceAgentCallTypeBadge } from '../../_components/VoiceAgentCallTypeBadge';
import { VoiceAgentCallTypePicker } from '../../_components/VoiceAgentCallTypePicker';
import { VoiceSelect } from '../../_components/VoiceSelect';
import type { UseVoiceAgentEditorPageReturn } from '../_hooks/use-voice-agent-editor-page';
import type { PromptTool } from '../_utils/prompt-tools';
import { PromptField } from './PromptField';
import { CallSettingsCard } from './settings/CallSettingsCard';
import { VoiceAgentToolsCard } from './tools/VoiceAgentToolsCard';
import { VariableDefaults } from './VariableDefaults';

/** Scrolls to the Tools card: the booking switch (focused) or the custom tools. */
function openTools(kind?: PromptTool['kind']) {
    const target =
        (kind === 'custom' && document.getElementById('custom-tools-title')) || document.getElementById('agent-tools');
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
        form,
        defaults,
        setName,
        setCallType,
        setVoice,
        setPrompt,
        setCallNotes,
        resetPrompt,
        resetCallNotes,
        discardAgentChanges,
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
                                    onClick={discardAgentChanges}
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
                            <div className="grid gap-2">
                                <Label htmlFor="agent-name">Name</Label>
                                <Input
                                    id="agent-name"
                                    value={form.name}
                                    maxLength={80}
                                    onChange={(e) => setName(e.target.value)}
                                    aria-invalid={!form.name.trim()}
                                />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="agent-voice">Voice</Label>
                                <VoiceSelect id="agent-voice" value={form.voice} onChange={setVoice} />
                            </div>
                        </div>

                        <div className="grid gap-2">
                            <Label id="agent-call-type-label">Call type</Label>
                            <VoiceAgentCallTypePicker
                                size="sm"
                                value={form.callType}
                                onChange={setCallType}
                                labelledBy="agent-call-type-label"
                            />
                            <p className="text-muted-foreground text-xs" data-testid="call-type-note">
                                Changing the type does not rewrite the prompt or call notes. Edit them yourself, or use the{' '}
                                {typeLabel} defaults below.
                            </p>
                        </div>

                        <div className="grid gap-2">
                            <div className="flex flex-wrap items-end justify-between gap-x-2 gap-y-1">
                                <Label htmlFor="agent-prompt">Prompt</Label>
                                {form.prompt !== defaults.prompt ? (
                                    <Button type="button" variant="ghost" size="sm" className="h-7" onClick={resetPrompt}>
                                        <RotateCcw className="size-3.5" />
                                        Use the {typeLabel} default prompt
                                    </Button>
                                ) : null}
                            </div>
                            <PromptField
                                id="agent-prompt"
                                value={form.prompt}
                                onChange={setPrompt}
                                tools={promptTools}
                                onOpenTools={openTools}
                                variables={promptVariables}
                                onOpenVariables={openVariables}
                                invalid={!form.prompt.trim()}
                                describedBy="agent-prompt-help"
                                className="h-80 lg:h-[26rem]"
                            />
                            <p id="agent-prompt-help" className="text-muted-foreground text-xs">
                                Everything the agent knows and how it talks. Type / to add a tool, {'{{'} to add a variable.{' '}
                                {form.prompt.length.toLocaleString('en-US')} characters.
                            </p>
                        </div>

                        <div className="grid gap-2">
                            <div className="flex flex-wrap items-end justify-between gap-x-2 gap-y-1">
                                <Label htmlFor="agent-call-notes">Call notes</Label>
                                {form.callNotes !== defaults.callNotes ? (
                                    <Button type="button" variant="ghost" size="sm" className="h-7" onClick={resetCallNotes}>
                                        <RotateCcw className="size-3.5" />
                                        Use the {typeLabel} default notes
                                    </Button>
                                ) : null}
                            </div>
                            <Textarea
                                id="agent-call-notes"
                                value={form.callNotes}
                                maxLength={4000}
                                onChange={(e) => setCallNotes(e.target.value)}
                                className="min-h-20"
                            />
                            <p className="text-muted-foreground text-xs">
                                {form.callType === VoiceAgentCallType.INBOUND
                                    ? 'Facts about your business (hours, services, prices, whether it takes bookings). The agent answers callers only from these.'
                                    : 'Facts about the business being called.'}{' '}
                                Added under &ldquo;This call&rdquo; at the end of the prompt. Playground calls use these as
                                written.
                            </p>
                        </div>

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
            <div id="agent-tools" className="min-w-0 scroll-mt-4">
                <VoiceAgentToolsCard />
            </div>
            <CallSettingsCard />
        </div>
    );
}
