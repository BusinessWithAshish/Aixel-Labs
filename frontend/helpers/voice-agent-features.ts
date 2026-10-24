import {
    VOICE_AGENT_FEATURE_LIMITS,
    VOICE_BUILTIN_VARIABLES,
    VOICE_VARIABLE_NAME_PATTERN,
    type VoiceAgent,
    type VoiceAgentAnalysis,
    type VoiceAgentSpeech,
    type VoiceAgentVoicemail,
    VoiceAgentCallType,
    type VoiceAnalysisFieldType,
    type VoiceBuiltinVariable,
    VoiceCallDirection,
    type VoiceCallTest,
    VoiceFirstSpeaker,
    VoicePace,
    VoiceReplyLength,
    VoiceReplyWait,
    VoiceTone,
    VoiceToolWait,
    VoiceVoicemailAction,
} from '@aixellabs/backend/db/types';

/**
 * Agent features the engine applies per call (`product.py` / `analysis.py` in the voice engine):
 * `{{variables}}` in the prompt and voicemail message, the voicemail message itself,
 * the post-call analysis and caller memory. Shared by the editor, its server actions and the
 * test-call dialog.
 */

/** `{{ name }}`: the engine's own pattern (spaces inside the braces allowed, names case-insensitive). */
const VARIABLE = /\{\{\s*([A-Za-z][A-Za-z0-9_]{0,43})\s*\}\}/g;

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

/** Speech never set: the model decides what to say while a tool works, normal reply wait, no silence or time limit. */
export const DEFAULT_VOICE_AGENT_SPEECH: Required<VoiceAgentSpeech> = {
    toolWait: VoiceToolWait.AGENT,
    toolWaitLine: '',
    replyWait: VoiceReplyWait.NORMAL,
    silenceSecs: 0,
    maxCallMinutes: 0,
    firstSpeaker: null,
    tone: VoiceTone.DEFAULT,
    pace: VoicePace.NORMAL,
    replyLength: VoiceReplyLength.NORMAL,
};

/** Who speaks first when the agent leaves it to its call type (the engine's speech.settings). */
export function defaultFirstSpeaker(callType: VoiceAgentCallType): VoiceFirstSpeaker {
    return callType === VoiceAgentCallType.OUTBOUND ? VoiceFirstSpeaker.CALLER : VoiceFirstSpeaker.AGENT;
}

/** The line the editor suggests when an owner first picks "say a set line". */
export const SUGGESTED_TOOL_WAIT_LINE = 'One moment, let me check that for you.';

export const VOICE_ANALYSIS_FIELD_TYPE_LABELS: Record<VoiceAnalysisFieldType, string> = {
    text: 'Text',
    number: 'Number',
    boolean: 'Yes / no',
    choice: 'Choice',
};

/** An agent's call settings as the editor shows them (never set up: hang up on voicemail, summary only, no memory, default speech). */
export function callSettingsOf(agent: Pick<VoiceAgent, 'voicemail' | 'analysis' | 'memory' | 'speech'>): {
    voicemail: VoiceAgentVoicemail;
    analysis: VoiceAgentAnalysis;
    memory: boolean;
    speech: Required<VoiceAgentSpeech>;
} {
    return {
        voicemail: agent.voicemail ?? DEFAULT_VOICE_AGENT_VOICEMAIL,
        analysis: agent.analysis ?? DEFAULT_VOICE_AGENT_ANALYSIS,
        memory: agent.memory === true,
        // Saved before a setting existed: that setting's default.
        speech: { ...DEFAULT_VOICE_AGENT_SPEECH, ...agent.speech },
    };
}

/** The number a call's caller memory is kept under (the engine's `normalize_number`): the other person, as +digits. */
export function memoryPhoneOf(call: {
    direction: VoiceCallDirection;
    from?: string;
    to?: string;
    test?: VoiceCallTest | null;
}): string | null {
    if (call.test) return null;
    const other =
        call.direction === VoiceCallDirection.INBOUND
            ? call.from
            : call.direction === VoiceCallDirection.OUTBOUND
              ? call.to
              : undefined;
    // A SIP address (with or without "sip:") is never a phone number, whatever digits it holds.
    if (!other || other.includes('@') || /[a-z]/i.test(other.trim().replace(/^tel:/i, ''))) return null;
    const digits = other.replace(/\D/g, '');
    return digits.length >= 7 ? `+${digits}` : null;
}

/** A call's own variables (a test call's, a rehearsal's): well-formed names, values trimmed and capped, empty ones left to the agent's defaults. */
export function cleanCallVariables(input: unknown): Record<string, string> {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
    const entries = Object.entries(input as Record<string, unknown>)
        .filter(
            ([name, value]) =>
                VOICE_VARIABLE_NAME_PATTERN.test(name) && !isBuiltinVariable(name) && typeof value === 'string',
        )
        .map(
            ([name, value]) =>
                [name, (value as string).trim().slice(0, VOICE_AGENT_FEATURE_LIMITS.maxVariableLength)] as const,
        )
        .filter(([, value]) => value);
    if (entries.length > VOICE_AGENT_FEATURE_LIMITS.maxVariables) throw new Error('Too many variables for one call');
    return Object.fromEntries(entries);
}
