'use client';

import { AudioLines } from 'lucide-react';
import {
    VOICE_AGENT_FEATURE_LIMITS,
    VoiceAgentCallType,
    VoiceFirstSpeaker,
    VoiceReplyWait,
    VoiceToolWait,
} from '@aixellabs/backend/db/types';
import { NumberControlledField, StringControlledField } from '@/components/common/zod-form-builder/ZodControlledFields';
import { SettingsSection } from '@/components/common/SettingsSection';
import { RadioCards } from '@/components/wrappers/RadioCards';
import { FieldDescription, FieldLegend, FieldSet } from '@/components/ui/field';
import { usePage } from '@/contexts/PageStore';
import { defaultFirstSpeaker, SUGGESTED_TOOL_WAIT_LINE } from '@/helpers/voice-agent-features';
import type { UseVoiceAgentEditorPageReturn } from '../../_hooks/use-voice-agent-editor-page';

const LIMITS = VOICE_AGENT_FEATURE_LIMITS;
const SUBGRID_FIELD = 'sm:row-span-4 sm:grid sm:grid-rows-subgrid';

const TOOL_WAIT_CHOICES = [
    {
        value: VoiceToolWait.AGENT,
        title: 'Let the agent decide',
        description: 'A couple of words like “one moment”, or nothing.',
    },
    { value: VoiceToolWait.SILENT, title: 'Stay silent', description: 'Nothing until the answer is back.' },
    { value: VoiceToolWait.SAY, title: 'Say a set line', description: 'Your line, in the agent’s voice.' },
];

const REPLY_WAIT_CHOICES = [
    { value: VoiceReplyWait.QUICK, title: 'Quick', description: 'Answers soonest. May cut in on a pause.' },
    { value: VoiceReplyWait.NORMAL, title: 'Normal', description: 'Right for most calls.' },
    {
        value: VoiceReplyWait.PATIENT,
        title: 'Patient',
        description: 'Waits through pauses. For callers who think as they talk.',
    },
];

/** Who speaks first, by call type (phone.serve in the engine: RingGate waits for a "hello?", 3 s at most). Default first. */
const FIRST_SPEAKER_CHOICES = {
    [VoiceAgentCallType.INBOUND]: [
        {
            value: VoiceFirstSpeaker.AGENT,
            title: 'Agent greets the caller',
            description: 'Says its opening line as it picks up, as callers expect from a business.',
        },
        {
            value: VoiceFirstSpeaker.CALLER,
            title: 'Wait for the caller',
            description: 'Picks up quietly and greets them after their “hello?” (or 3 seconds of silence).',
        },
    ],
    [VoiceAgentCallType.OUTBOUND]: [
        {
            value: VoiceFirstSpeaker.CALLER,
            title: 'Wait for their “hello?”',
            description: 'Once they pick up, waits for them to answer (up to 3 seconds), then says its opening line.',
        },
        {
            value: VoiceFirstSpeaker.AGENT,
            title: 'Speak as soon as they pick up',
            description: 'Starts its opening line the moment the call connects; their “hello?” may overlap it.',
        },
    ],
};

/** Turn taking and waits during a call: who speaks first,: what she does while a tool works, how soon she answers, silence, time limit. */
export function SpeechSettings() {
    const { form, settingsForm, settings } = usePage<UseVoiceAgentEditorPageReturn>();
    const dirty = { shouldDirty: true, shouldValidate: true };

    const chooseToolWait = (toolWait: VoiceToolWait) => {
        settingsForm.setValue('speech.toolWait', toolWait, dirty);
        // A first "say a set line" starts from a suggestion rather than an empty box.
        if (toolWait === VoiceToolWait.SAY && !settingsForm.getValues('speech.toolWaitLine').trim()) {
            settingsForm.setValue('speech.toolWaitLine', SUGGESTED_TOOL_WAIT_LINE, dirty);
        }
    };

    return (
        <SettingsSection
            titleId="speech-title"
            icon={AudioLines}
            title="Speech & behaviour"
            description="How the agent takes turns and fills waits during a call."
            className="gap-4"
            data-testid="speech-settings"
        >
            <FieldSet data-testid="first-speaker">
                <FieldLegend variant="label">Who speaks first</FieldLegend>
                <FieldDescription className="text-xs">
                    {form.callType === VoiceAgentCallType.INBOUND
                        ? 'When someone calls this agent’s number.'
                        : 'When the person this agent calls picks up.'}{' '}
                    In the playground, waiting means it says nothing until you speak.
                </FieldDescription>
                <RadioCards
                    value={settings.speech.firstSpeaker ?? defaultFirstSpeaker(form.callType)}
                    onValueChange={(firstSpeaker) => settingsForm.setValue('speech.firstSpeaker', firstSpeaker, dirty)}
                    options={FIRST_SPEAKER_CHOICES[form.callType]}
                    aria-label="Who speaks first"
                    className="sm:grid-cols-2"
                />
            </FieldSet>

            <FieldSet>
                <FieldLegend variant="label">While a tool works</FieldLegend>
                <FieldDescription className="text-xs">
                    Checking the calendar, booking, or one of your own tools. If an answer takes long, a short “mm” still
                    plays so the caller knows the line is live.
                </FieldDescription>
                <RadioCards
                    value={settings.speech.toolWait}
                    onValueChange={chooseToolWait}
                    options={TOOL_WAIT_CHOICES}
                    aria-label="While a tool works"
                    className="sm:grid-cols-3"
                />
                {settings.speech.toolWait === VoiceToolWait.SAY ? (
                    <StringControlledField
                        name="speech.toolWaitLine"
                        id="speech-tool-wait-line"
                        label="Line to say"
                        description={`Said word for word as each tool starts. Variables like {{agent_name}} work. ${settings.speech.toolWaitLine.length}/${LIMITS.toolWaitLineMax}`}
                        classNames={{ description: 'text-xs' }}
                        inputProps={{ maxLength: LIMITS.toolWaitLineMax }}
                    />
                ) : null}
            </FieldSet>

            <FieldSet>
                <FieldLegend variant="label">Reply wait</FieldLegend>
                <FieldDescription className="text-xs">
                    How long the agent waits after the caller stops talking before it answers.
                </FieldDescription>
                <RadioCards
                    value={settings.speech.replyWait}
                    onValueChange={(replyWait) => settingsForm.setValue('speech.replyWait', replyWait, dirty)}
                    options={REPLY_WAIT_CHOICES}
                    aria-label="Reply wait"
                    className="sm:grid-cols-3"
                />
            </FieldSet>

            {/* Each field spans the same 4 rows (label, description, input, error): inputs line up whatever the description's length. */}
            <div className="grid gap-4 sm:grid-cols-2">
                <NumberControlledField
                    name="speech.silenceSecs"
                    id="speech-silence-secs"
                    label="Check in after silence (seconds)"
                    description={`${LIMITS.silenceSecsMin}–${LIMITS.silenceSecsMax} seconds, or 0 for never. If the caller says nothing for this long, the agent asks if they are still there. Still nothing, and it says goodbye.`}
                    className={SUBGRID_FIELD}
                    classNames={{ description: 'text-xs' }}
                    min={0}
                    max={LIMITS.silenceSecsMax}
                />
                <NumberControlledField
                    name="speech.maxCallMinutes"
                    id="speech-max-call-minutes"
                    label="Time limit (minutes)"
                    description={`${LIMITS.maxCallMinutesMin}–${LIMITS.maxCallMinutesMax} minutes, or 0 for no limit. The agent wraps up and ends the call at this point.`}
                    className={SUBGRID_FIELD}
                    classNames={{ description: 'text-xs' }}
                    min={0}
                    max={LIMITS.maxCallMinutesMax}
                />
            </div>
        </SettingsSection>
    );
}
