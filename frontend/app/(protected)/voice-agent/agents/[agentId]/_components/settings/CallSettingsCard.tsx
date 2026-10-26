'use client';

import { FormProvider } from 'react-hook-form';
import { Voicemail } from 'lucide-react';
import { VOICE_AGENT_FEATURE_LIMITS, VoiceAgentCallType, VoiceVoicemailAction } from '@aixellabs/backend/db/types';
import { SettingsSection } from '@/components/common/SettingsSection';
import { RadioCards } from '@/components/wrappers/RadioCards';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { usePage } from '@/contexts/PageStore';
import { SUGGESTED_VOICEMAIL_MESSAGE } from '@/helpers/voice-agent-features';
import type { UseVoiceAgentEditorPageReturn } from '../../_hooks/use-voice-agent-editor-page';
import { CardSaveActions } from '../CardSaveActions';
import { AnalysisSettings } from './AnalysisSettings';
import { CallerMemorySettings } from './CallerMemorySettings';
import { PersonalitySettings } from './PersonalitySettings';
import { SpeechSettings } from './SpeechSettings';
import { WhatsAppSettings } from './WhatsAppSettings';

const VOICEMAIL_CHOICES = [
    { value: VoiceVoicemailAction.HANG_UP, title: 'Hang up', description: 'End the call as soon as a recording answers.' },
    {
        value: VoiceVoicemailAction.MESSAGE,
        title: 'Leave a message',
        description: 'Wait for the beep, then say your message.',
    },
];

/** On a voicemail: hang up, or leave the owner's message after the beep. Only for calls the agent places. */
function VoicemailSettings() {
    const { settingsForm, settings } = usePage<UseVoiceAgentEditorPageReturn>();
    const max = VOICE_AGENT_FEATURE_LIMITS.voicemailMessageMax;

    const choose = (action: VoiceVoicemailAction) => {
        const dirty = { shouldDirty: true, shouldValidate: true };
        settingsForm.setValue('voicemail.action', action, dirty);
        // A first "leave a message" starts from a suggestion rather than an empty box.
        if (action === VoiceVoicemailAction.MESSAGE && !settingsForm.getValues('voicemail.message').trim()) {
            settingsForm.setValue('voicemail.message', SUGGESTED_VOICEMAIL_MESSAGE, dirty);
        }
    };

    return (
        // No titleId: a label containing "Voicemail" would also answer getByLabel('Voice') (the voice picker).
        <SettingsSection
            icon={Voicemail}
            title="Voicemail"
            description="When the person called doesn't pick up and a recording answers."
            data-testid="voicemail-settings"
        >
            <RadioCards
                value={settings.voicemail.action}
                onValueChange={choose}
                options={VOICEMAIL_CHOICES}
                aria-label="When a recording answers"
            />
            {settings.voicemail.action === VoiceVoicemailAction.MESSAGE ? (
                <Field>
                    <FieldLabel htmlFor="voicemail-message">Message</FieldLabel>
                    <Textarea
                        id="voicemail-message"
                        maxLength={max}
                        className="min-h-20"
                        {...settingsForm.register('voicemail.message')}
                    />
                    <FieldDescription className="text-xs">
                        Said word for word in the agent&rsquo;s voice, up to about 30 seconds. Variables like{' '}
                        <code className="font-mono">{'{{agent_name}}'}</code> are filled in per call.{' '}
                        {settings.voicemail.message.length}/{max}
                    </FieldDescription>
                </Field>
            ) : null}
        </SettingsSection>
    );
}

/**
 * What the agent does in and around a call: how it speaks and comes across, on a voicemail (calls it places only: an inbound
 * agent always answers, so the section is hidden and its saved value kept), after it (analysis), and from
 * one call to the next (memory).
 */
export function CallSettingsCard() {
    const { form, settingsForm, settingsDirty, settingsError, savingSettings, saveSettings } =
        usePage<UseVoiceAgentEditorPageReturn>();
    const places = form.callType !== VoiceAgentCallType.INBOUND;

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
                    Who speaks first, how the agent speaks and comes across{places ? ', voicemail' : ''}, what is worked out
                    after each call, and what it remembers about callers. Changes apply from the next call.
                </CardDescription>
                <CardSaveActions
                    dirty={settingsDirty}
                    error={settingsError}
                    saving={savingSettings}
                    onDiscard={() => settingsForm.reset()}
                    onSave={saveSettings}
                    saveLabel="Save settings"
                    discardLabel="Discard settings"
                    errorTestId="call-settings-error"
                />
            </CardHeader>
            <FormProvider {...settingsForm}>
                <CardContent className="grid gap-5">
                    <SpeechSettings />
                    <Separator />
                    <PersonalitySettings />
                    <Separator />
                    {places ? (
                        <>
                            <VoicemailSettings />
                            <Separator />
                        </>
                    ) : null}
                    <AnalysisSettings />
                    <Separator />
                    <CallerMemorySettings />
                    {places ? null : (
                        <>
                            <Separator />
                            <WhatsAppSettings />
                        </>
                    )}
                </CardContent>
            </FormProvider>
        </Card>
    );
}
