'use client';

import { Smile } from 'lucide-react';
import { VoicePace, VoiceReplyLength, VoiceTone } from '@aixellabs/backend/db/types';
import { SelectControlledField } from '@/components/common/zod-form-builder/ZodControlledFields';
import { SettingsSection } from '@/components/common/SettingsSection';

const TONES = [
    { value: VoiceTone.DEFAULT, label: 'As the prompt says' },
    { value: VoiceTone.WARM, label: 'Warm' },
    { value: VoiceTone.FRIENDLY, label: 'Friendly' },
    { value: VoiceTone.PROFESSIONAL, label: 'Professional' },
    { value: VoiceTone.FORMAL, label: 'Formal' },
    { value: VoiceTone.ENERGETIC, label: 'Energetic' },
];
const PACES = [
    { value: VoicePace.RELAXED, label: 'Relaxed' },
    { value: VoicePace.NORMAL, label: 'Normal' },
    { value: VoicePace.BRISK, label: 'Brisk' },
];
const LENGTHS = [
    { value: VoiceReplyLength.BRIEF, label: 'Brief: a sentence or two' },
    { value: VoiceReplyLength.NORMAL, label: 'Normal' },
];
const FIELD = { description: 'text-xs' };

/** Tone, pace and reply length: added to the agent's instructions on every call (`# Your style`). */
export function PersonalitySettings() {
    return (
        <SettingsSection
            titleId="personality-title"
            icon={Smile}
            title="Personality"
            description="How the agent comes across. Added to its instructions on every call, on top of your prompt."
            data-testid="personality-settings"
        >
            <div className="grid gap-4 sm:grid-cols-3">
                <SelectControlledField name="speech.tone" id="speech-tone" label="Tone" options={TONES} classNames={FIELD} />
                <SelectControlledField
                    name="speech.pace"
                    id="speech-pace"
                    label="Speaking pace"
                    description="Gemini Live voices follow it; a separate text-to-speech voice keeps its own pace."
                    options={PACES}
                    classNames={FIELD}
                />
                <SelectControlledField
                    name="speech.replyLength"
                    id="speech-reply-length"
                    label="Reply length"
                    options={LENGTHS}
                    classNames={FIELD}
                />
            </div>
        </SettingsSection>
    );
}
