'use client';

import { Loader2, Save, Voicemail } from 'lucide-react';
import { VoiceAgentCallType, VoiceVoicemailAction } from '@aixellabs/backend/db/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { usePage } from '@/contexts/PageStore';
import { SUGGESTED_VOICEMAIL_MESSAGE, VOICE_AGENT_FEATURE_LIMITS } from '@/helpers/voice-agent-features';
import { cn } from '@/lib/utils';
import type { UseVoiceAgentEditorPageReturn } from '../../_hooks/use-voice-agent-editor-page';
import { AnalysisSettings } from './AnalysisSettings';
import { CallerMemorySettings } from './CallerMemorySettings';

const VOICEMAIL_CHOICES = [
    { value: VoiceVoicemailAction.HANG_UP, label: 'Hang up', hint: 'End the call as soon as a recording answers.' },
    { value: VoiceVoicemailAction.MESSAGE, label: 'Leave a message', hint: 'Wait for the beep, then say your message.' },
] as const;

/** On a voicemail: hang up, or leave the owner's message after the beep (outbound calls only). */
function VoicemailSettings() {
    const { form, settingsDraft, setSettings, savingSettings } = usePage<UseVoiceAgentEditorPageReturn>();
    const inbound = form.callType === VoiceAgentCallType.INBOUND;
    const leaving = settingsDraft.voicemailAction === VoiceVoicemailAction.MESSAGE;
    const max = VOICE_AGENT_FEATURE_LIMITS.voicemailMessageMax;

    const choose = (action: VoiceVoicemailAction) =>
        setSettings({
            voicemailAction: action,
            // A first "leave a message" starts from a suggestion rather than an empty box.
            ...(action === VoiceVoicemailAction.MESSAGE && !settingsDraft.voicemailMessage.trim()
                ? { voicemailMessage: SUGGESTED_VOICEMAIL_MESSAGE }
                : {}),
        });

    return (
        // No aria-labelledby here: a label containing "Voicemail" would also answer getByLabel('Voice') (the voice picker).
        <section className="grid gap-3" data-testid="voicemail-settings">
            <div className="grid gap-1">
                <h3 id="voicemail-title" className="flex items-center gap-2 font-medium">
                    <Voicemail className="text-muted-foreground size-4" />
                    Voicemail
                </h3>
                <p className="text-muted-foreground text-sm">
                    {inbound
                        ? 'Used when this agent places calls. Calls coming in never reach a voicemail.'
                        : 'When a call it places reaches an answering machine.'}
                </p>
            </div>
            <div role="radiogroup" aria-label="When a recording answers" className="grid gap-2 sm:grid-cols-2">
                {VOICEMAIL_CHOICES.map((choice) => {
                    const checked = settingsDraft.voicemailAction === choice.value;
                    return (
                        <button
                            key={choice.value}
                            type="button"
                            role="radio"
                            aria-checked={checked}
                            disabled={savingSettings}
                            onClick={() => choose(choice.value)}
                            className={cn(
                                'grid gap-0.5 rounded-md border px-3 py-2 text-left transition-colors',
                                checked ? 'border-primary bg-primary/5 ring-primary/30 ring-1' : 'hover:bg-muted/50',
                            )}
                        >
                            <span className="text-sm font-medium">{choice.label}</span>
                            <span className="text-muted-foreground text-xs">{choice.hint}</span>
                        </button>
                    );
                })}
            </div>
            {leaving ? (
                <div className="grid gap-2">
                    <Label htmlFor="voicemail-message">Message</Label>
                    <Textarea
                        id="voicemail-message"
                        value={settingsDraft.voicemailMessage}
                        maxLength={max}
                        onChange={(e) => setSettings({ voicemailMessage: e.target.value })}
                        disabled={savingSettings}
                        className="min-h-20"
                    />
                    <p className="text-muted-foreground text-xs">
                        Said word for word in the agent&rsquo;s voice, up to about 30 seconds. Variables like{' '}
                        <code className="font-mono">{'{{agent_name}}'}</code> are filled in per call.{' '}
                        {settingsDraft.voicemailMessage.length}/{max}
                    </p>
                </div>
            ) : null}
        </section>
    );
}

/** What the agent does around a call: on a voicemail, after it (analysis), and from one call to the next (memory). */
export function CallSettingsCard() {
    const { settingsDirty, settingsError, canSaveSettings, savingSettings, discardSettingsChanges, saveSettings } =
        usePage<UseVoiceAgentEditorPageReturn>();

    return (
        <Card id="call-settings" className="h-auto min-w-0 scroll-mt-4" data-testid="call-settings">
            <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2">
                    Call settings
                    {settingsDirty ? (
                        <span className="text-xs font-normal text-amber-600 dark:text-amber-400">Unsaved changes</span>
                    ) : null}
                </CardTitle>
                <CardDescription>
                    Voicemail, what is worked out after each call, and what the agent remembers about callers. Changes apply
                    from the next call.
                </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-5">
                <VoicemailSettings />
                <Separator />
                <AnalysisSettings />
                <Separator />
                <CallerMemorySettings />

                {settingsDirty ? (
                    <div className={cn('flex flex-wrap items-center justify-end gap-2', settingsError && 'justify-between')}>
                        {settingsError ? (
                            <p className="text-destructive text-sm" role="alert" data-testid="call-settings-error">
                                {settingsError}
                            </p>
                        ) : null}
                        <div className="flex gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={discardSettingsChanges}
                                disabled={savingSettings}
                            >
                                Discard settings
                            </Button>
                            <Button type="button" size="sm" onClick={() => void saveSettings()} disabled={!canSaveSettings}>
                                {savingSettings ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                                Save settings
                            </Button>
                        </div>
                    </div>
                ) : null}
            </CardContent>
        </Card>
    );
}
