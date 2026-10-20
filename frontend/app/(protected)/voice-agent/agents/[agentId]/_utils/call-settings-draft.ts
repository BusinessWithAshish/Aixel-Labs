import {
    VOICE_AGENT_FEATURE_LIMITS,
    VOICE_VARIABLE_NAME_PATTERN,
    type VoiceAgent,
    type VoiceAnalysisFieldType,
    VoiceVoicemailAction,
} from '@aixellabs/backend/db/types';
import { callSettingsOf } from '@/helpers/voice-agent-features';
import type { VoiceAgentCallSettingsInput } from '@/helpers/voice-schemas';

/** One custom analysis field as edited: a choice's answers are typed as one comma-separated line. */
export type AnalysisFieldDraft = {
    /** React key only. */
    key: string;
    name: string;
    type: VoiceAnalysisFieldType;
    description: string;
    options: string;
};

/** The Call settings card, as edited (saved together with `saveVoiceAgentCallSettings`). */
export type CallSettingsDraft = {
    voicemailAction: VoiceVoicemailAction;
    voicemailMessage: string;
    summary: boolean;
    sentiment: boolean;
    success: boolean;
    successDefinition: string;
    fields: AnalysisFieldDraft[];
    memory: boolean;
};

let nextKey = 0;
export function newFieldKey(): string {
    nextKey += 1;
    return `field-${nextKey}`;
}

export function settingsToDraft(agent: Pick<VoiceAgent, 'voicemail' | 'analysis' | 'memory'>): CallSettingsDraft {
    const { voicemail, analysis, memory } = callSettingsOf(agent);
    return {
        voicemailAction: voicemail.action,
        voicemailMessage: voicemail.message,
        summary: analysis.summary,
        sentiment: analysis.sentiment,
        success: analysis.success,
        successDefinition: analysis.successDefinition,
        fields: analysis.fields.map((field) => ({
            key: newFieldKey(),
            name: field.name,
            type: field.type,
            description: field.description,
            options: (field.options ?? []).join(', '),
        })),
        memory,
    };
}

export function splitOptions(text: string): string[] {
    return text
        .split(',')
        .map((option) => option.trim())
        .filter(Boolean);
}

export function draftToSettings(draft: CallSettingsDraft): VoiceAgentCallSettingsInput {
    return {
        voicemail: { action: draft.voicemailAction, message: draft.voicemailMessage.trim() },
        analysis: {
            summary: draft.summary,
            sentiment: draft.sentiment,
            success: draft.success,
            successDefinition: draft.successDefinition.trim(),
            fields: draft.fields.map((field) => ({
                name: field.name.trim(),
                type: field.type,
                description: field.description.trim(),
                ...(field.type === 'choice' ? { options: splitOptions(field.options) } : {}),
            })),
        },
        memory: draft.memory,
    };
}

export function sameSettings(a: CallSettingsDraft, b: CallSettingsDraft): boolean {
    return JSON.stringify(draftToSettings(a)) === JSON.stringify(draftToSettings(b));
}

/** The first thing that stops the settings from saving, in the server's words, or null. */
export function settingsDraftError(draft: CallSettingsDraft): string | null {
    const limits = VOICE_AGENT_FEATURE_LIMITS;
    const settings = draftToSettings(draft);
    if (settings.voicemail.action === VoiceVoicemailAction.MESSAGE && !settings.voicemail.message) {
        return 'Write the message to leave';
    }
    if (settings.voicemail.message.length > limits.voicemailMessageMax) {
        return `The voicemail message is up to ${limits.voicemailMessageMax} characters (about 30 seconds)`;
    }
    if (settings.analysis.success && !settings.analysis.successDefinition) return 'Say what makes a call successful';
    const seen = new Set<string>();
    for (const field of settings.analysis.fields) {
        if (!VOICE_VARIABLE_NAME_PATTERN.test(field.name)) {
            return 'Field names are lowercase letters, numbers and _, starting with a letter (like budget)';
        }
        if (seen.has(field.name)) return `There are two fields called ${field.name}`;
        seen.add(field.name);
        if (!field.description) return 'Say what each field means';
        if (field.type === 'choice' && (field.options?.length ?? 0) < 2) {
            return `Give ${field.name} at least two answers to choose from`;
        }
    }
    return null;
}
