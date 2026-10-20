import {
    VOICE_AGENT_FEATURE_LIMITS,
    VOICE_BUILTIN_VARIABLES,
    VoiceVoicemailAction,
    type VoiceAgent,
    type VoiceAgentAnalysis,
    type VoiceAgentVoicemail,
    type VoiceAnalysisFieldType,
    type VoiceBuiltinVariable,
} from '@aixellabs/backend/db/types';

/**
 * Agent features the engine applies per call (`product.py` / `analysis.py` in the voice engine):
 * `{{variables}}` in the prompt, call notes and voicemail message, the voicemail message itself,
 * the post-call analysis and caller memory. Shared by the editor, its server actions and the
 * test-call dialog.
 */

/** `{{ name }}`: the engine's own pattern (spaces inside the braces allowed, names case-insensitive). */
const VARIABLE = /\{\{\s*([A-Za-z][A-Za-z0-9_]{0,43})\s*\}\}/g;

/** A variable or analysis field name as the editor saves it. */
export const VOICE_VARIABLE_NAME_PATTERN = /^[a-z][a-z0-9_]{0,43}$/;

/** What each built-in holds, for the editor's lists. Values are worked out per call. */
export const VOICE_BUILTIN_VARIABLE_INFO: Record<VoiceBuiltinVariable, string> = {
    now: 'Date and time, like “Monday 19 October 2026, 4:50 PM”',
    today: 'Today’s date, like “Monday 19 October 2026”',
    weekday: 'Today’s day of the week',
    caller_number: 'The other person’s number (empty in the playground)',
    agent_name: 'This agent’s name',
    business_timezone: 'The booking timezone (Tools), else UTC',
};

export function isBuiltinVariable(name: string): name is VoiceBuiltinVariable {
    return (VOICE_BUILTIN_VARIABLES as readonly string[]).includes(name);
}

/** A `{{variable}}` written in a text, with its lower-case name. */
export type VariableMention = { start: number; end: number; name: string };

export function findVariables(text: string): VariableMention[] {
    return [...text.matchAll(VARIABLE)].map((m) => ({
        start: m.index,
        end: m.index + m[0].length,
        name: m[1].toLowerCase(),
    }));
}

/** Variable names the texts use that are not built-in, in first-use order. */
export function customVariableNames(...texts: string[]): string[] {
    const names = texts.flatMap((text) => findVariables(text).map((v) => v.name));
    return [...new Set(names)].filter((name) => !isBuiltinVariable(name));
}

/** What a call that reaches voicemail does when the agent has never been set: hang up. */
export const DEFAULT_VOICE_AGENT_VOICEMAIL: VoiceAgentVoicemail = {
    action: VoiceVoicemailAction.HANG_UP,
    message: '',
};

/** The message the editor suggests when an owner first picks "leave a message". */
export const SUGGESTED_VOICEMAIL_MESSAGE =
    'Hi, this is {{agent_name}}. Sorry I missed you. I was calling about something I think could help you. Please call me back on this number when you have a moment. Thanks!';

/** No settings = a summary only (the engine's `analysis.settings`). */
export const DEFAULT_VOICE_AGENT_ANALYSIS: VoiceAgentAnalysis = {
    summary: true,
    sentiment: false,
    success: false,
    successDefinition: '',
    fields: [],
};

export const VOICE_ANALYSIS_FIELD_TYPES: readonly { value: VoiceAnalysisFieldType; label: string }[] = [
    { value: 'text', label: 'Text' },
    { value: 'number', label: 'Number' },
    { value: 'boolean', label: 'Yes / no' },
    { value: 'choice', label: 'Choice' },
];

/** An agent's call settings as the editor shows them (never set up: hang up on voicemail, summary only, no memory). */
export function callSettingsOf(agent: Pick<VoiceAgent, 'voicemail' | 'analysis' | 'memory'>): {
    voicemail: VoiceAgentVoicemail;
    analysis: VoiceAgentAnalysis;
    memory: boolean;
} {
    return {
        voicemail: agent.voicemail ?? DEFAULT_VOICE_AGENT_VOICEMAIL,
        analysis: agent.analysis ?? DEFAULT_VOICE_AGENT_ANALYSIS,
        memory: agent.memory === true,
    };
}

/** The number a call's caller memory is kept under (the engine's `normalize_number`): the other person, as +digits. */
export function memoryPhoneOf(call: { direction: string; from?: string; to?: string }): string | null {
    const other = call.direction === 'INBOUND' ? call.from : call.direction === 'OUTBOUND' ? call.to : undefined;
    if (!other || other.trim().toLowerCase().startsWith('sip:')) return null;
    const digits = other.replace(/\D/g, '');
    return digits.length >= 7 ? `+${digits}` : null;
}

export { VOICE_AGENT_FEATURE_LIMITS };
