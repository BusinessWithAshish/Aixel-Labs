import { VOICE_WEEKDAYS, VoiceStackKind, type VoiceAgent, type VoiceAgentBookingTool } from '@aixellabs/backend/db/types';
import { DEFAULT_VOICE_BOOKING_HOURS, defaultVoiceBookingTool } from '@/helpers/voice-agent-defaults';
import { callSettingsOf } from '@/helpers/voice-agent-features';
import type { BookingFormValues, VoiceAgentCallSettingsInput, VoiceAgentInput } from '@/helpers/voice-schemas';
import { FALLBACK_TIMEZONE } from '@/helpers/voice-time';
import { defaultStack } from '@/helpers/voice-stack';

/** What each editor card's form starts from: the saved agent, in the shape the form edits. */

export function agentFormValues(agent: VoiceAgent): VoiceAgentInput {
    return {
        name: agent.name,
        callType: agent.callType,
        voice: agent.voice,
        ttsVoice: agent.ttsVoice ?? null,
        stack: agent.stack ?? defaultStack(VoiceStackKind.REALTIME),
        prompt: agent.prompt,
        variables: { ...(agent.variables ?? {}) },
    };
}

/** Booking as the editor holds it: every day, a closed one keeping its times so switching it back on restores them. */
export function bookingFormValues(booking: VoiceAgentBookingTool | null, timezone = FALLBACK_TIMEZONE): BookingFormValues {
    const source = booking ?? defaultVoiceBookingTool(timezone);
    const fallback = DEFAULT_VOICE_BOOKING_HOURS.mon ?? { open: '09:00', close: '17:00' };
    return {
        enabled: source.enabled,
        timezone: source.timezone,
        slotMinutes: source.slotMinutes,
        maxDaysAhead: source.maxDaysAhead,
        destination: source.destination ?? null,
        days: Object.fromEntries(
            VOICE_WEEKDAYS.map((day) => {
                const hours = source.hours[day];
                return [day, { open: !!hours, from: hours?.open ?? fallback.open, to: hours?.close ?? fallback.close }];
            }),
        ) as BookingFormValues['days'],
    };
}

/** Call settings as the editor holds them: a choice field's answers typed as one comma-separated line. */
export function callSettingsFormValues(
    agent: Pick<VoiceAgent, 'voicemail' | 'analysis' | 'memory' | 'speech'>,
): VoiceAgentCallSettingsInput {
    const { voicemail, analysis, memory, speech } = callSettingsOf(agent);
    return {
        voicemail: { ...voicemail },
        analysis: {
            ...analysis,
            fields: analysis.fields.map((field) => ({ ...field, options: (field.options ?? []).join(', ') })),
        },
        memory,
        speech: { ...speech },
    };
}
