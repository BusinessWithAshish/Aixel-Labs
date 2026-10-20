import {
    VOICE_RESERVED_TOOL_NAMES,
    VOICE_TOOL_NAME_PATTERN,
    type VoiceAgentWebhookToolView,
    type VoiceBookingDestination,
} from '@aixellabs/backend/db/types';
import { findVariables, type VariableMention } from '@/helpers/voice-agent-features';
import { voiceCalendarProviderLabel } from '@/helpers/voice-calendar-providers';

/** A function the prompt can name: built-in booking or one of the agent's custom tools. */
export type PromptTool = {
    name: string;
    /** One line, for the slash menu. */
    description: string;
    kind: 'booking' | 'custom';
    /** The agent gets it on its next call. */
    on: boolean;
};

/** A tool name written in the prompt. `tool` is null when the agent has no tool by that name. */
export type PromptToolMention = { start: number; end: number; name: string; tool: PromptTool | null };

/** The slash command being typed: "/" at `start`, then `query`, up to `end`. */
export type PromptSlashQuery = { start: number; end: number; query: string };

/** Every tool the prompt could name, on or off: booking as it is on screen, custom tools as saved. */
export function toolsForPrompt(
    booking: { enabled: boolean; destination: VoiceBookingDestination | null },
    webhooks: VoiceAgentWebhookToolView[],
): PromptTool[] {
    const where = booking.destination ? ` in ${voiceCalendarProviderLabel(booking.destination.provider)}` : '';
    return [
        {
            name: 'check_availability',
            description: `Finds the free times on a day${where}`,
            kind: 'booking',
            on: booking.enabled,
        },
        {
            name: 'book_appointment',
            description: `Books the caller into a time${where}`,
            kind: 'booking',
            on: booking.enabled,
        },
        ...webhooks.map((tool): PromptTool => ({
            name: tool.name,
            description: tool.description.split('\n')[0],
            kind: 'custom',
            on: tool.enabled,
        })),
    ];
}

// A whole word in tool-name form (lower case, digits, underscores).
const WORD = /\b[a-z][a-z0-9_]*\b/g;
// The non-space run around a word is a link or an address, not prose.
const LINK = /:\/\/|@|^www\.|\.[a-z]{2,}\//i;

/**
 * Tool names in the prompt: every name the agent has, and any other snake_case word (a tool that
 * was renamed or deleted). Words inside links, email addresses, {placeholders} and {{variables}} are left alone.
 */
export function findToolMentions(text: string, tools: PromptTool[]): PromptToolMention[] {
    const byName = new Map(tools.map((tool) => [tool.name, tool]));
    const reserved: readonly string[] = VOICE_RESERVED_TOOL_NAMES;
    const variables = findVariables(text);
    const mentions: PromptToolMention[] = [];
    for (const match of text.matchAll(WORD)) {
        const name = match[0];
        const start = match.index;
        const end = start + name.length;
        const tool = byName.get(name) ?? null;
        if (!tool && (!name.includes('_') || reserved.includes(name) || !VOICE_TOOL_NAME_PATTERN.test(name))) continue;
        if (text[start - 1] === '{') continue;
        if (variables.some((v) => start >= v.start && end <= v.end)) continue;
        const runStart = text.slice(0, start).search(/\S*$/);
        const runEnd = end + text.slice(end).search(/\s|$/);
        if (LINK.test(text.slice(runStart, runEnd))) continue;
        mentions.push({ start, end, name, tool });
    }
    return mentions;
}

/** Why a mention will not work on a call, or null when it will. */
export function mentionProblem({ tool }: PromptToolMention): string | null {
    if (!tool) return 'No tool by this name — add it in Tools, or fix the name';
    if (tool.on) return null;
    return tool.kind === 'booking'
        ? 'Appointment booking is off — turn it on in Tools'
        : 'This tool is off — turn it on in Tools';
}

/** The "/query" the caret is in, when the "/" starts a word (not inside a link, a path or "and/or"). */
export function slashQueryAt(text: string, caret: number): PromptSlashQuery | null {
    const match = /(?:^|\s)\/([a-z0-9_]*)$/i.exec(text.slice(0, caret));
    if (!match) return null;
    const start = caret - match[1].length - 1;
    const rest = /^[a-z0-9_]*/i.exec(text.slice(caret))?.[0].length ?? 0;
    return { start, end: caret + rest, query: text.slice(start + 1, caret + rest).toLowerCase() };
}

/** Tools that are on, best match first (name starts with the query, then contains it). */
export function filterPromptTools(tools: PromptTool[], query: string): PromptTool[] {
    const on = tools.filter((tool) => tool.on && tool.name.includes(query));
    return [...on.filter((tool) => tool.name.startsWith(query)), ...on.filter((tool) => !tool.name.startsWith(query))];
}

/** A `{{variable}}` the prompt can use: a built-in, or a custom one (with or without a default value). */
export type PromptVariable = { name: string; description: string; builtin: boolean; hasValue: boolean };

/** A `{{variable}}` written in the prompt. `variable` is null when it has no value anywhere but a call's own. */
export type PromptVariableMention = VariableMention & { variable: PromptVariable | null };

export function findVariableMentions(text: string, variables: PromptVariable[]): PromptVariableMention[] {
    const byName = new Map(variables.map((v) => [v.name, v]));
    return findVariables(text).map((mention) => ({ ...mention, variable: byName.get(mention.name) ?? null }));
}

/** Why a variable may come out empty on a call, or null when it always has a value. */
export function variableProblem({ variable }: PromptVariableMention): string | null {
    if (variable?.builtin || variable?.hasValue) return null;
    return 'No default value — empty unless the call brings one (a campaign column or a test call)';
}

/** The "{{query" the caret is in: from the braces to the end of the name (and its "}}" when typed). */
export function variableQueryAt(text: string, caret: number): PromptSlashQuery | null {
    const match = /\{\{\s*([A-Za-z0-9_]*)$/.exec(text.slice(0, caret));
    if (!match) return null;
    const start = caret - match[0].length;
    const rest = /^[A-Za-z0-9_]*(\s*\}\})?/.exec(text.slice(caret))?.[0].length ?? 0;
    return { start, end: caret + rest, query: match[1].toLowerCase() };
}

/** Variables matching the query, best match first. */
export function filterPromptVariables(variables: PromptVariable[], query: string): PromptVariable[] {
    const hits = variables.filter((v) => v.name.includes(query));
    return [...hits.filter((v) => v.name.startsWith(query)), ...hits.filter((v) => !v.name.startsWith(query))];
}
