import {
    VOICE_RESERVED_TOOL_NAMES,
    VOICE_TOOL_NAME_PATTERN,
    VOICE_TOOL_PARAM_NAME_PATTERN,
    VOICE_WEBHOOK_LIMITS,
    type VoiceAgentWebhookToolView,
    type VoiceWebhookParamType,
} from '@aixellabs/backend/db/types';
import type { VoiceWebhookToolInput } from '@/helpers/voice-schemas';

export type ParamDraft = {
    /** Row key for React only. */
    key: string;
    name: string;
    type: VoiceWebhookParamType;
    required: boolean;
    description: string;
};

/** keep = leave the saved secret as it is; set = use `secretValue`; clear = remove it on save. */
export type SecretMode = 'keep' | 'set' | 'clear';

export type WebhookToolDraft = {
    name: string;
    description: string;
    url: string;
    params: ParamDraft[];
    enabled: boolean;
    /** Whether the saved tool has a secret (the secret itself never reaches the browser). */
    hasSecret: boolean;
    secretMode: SecretMode;
    secretValue: string;
};

let rowCounter = 0;
export function newParamRow(): ParamDraft {
    rowCounter += 1;
    return { key: `p${rowCounter}`, name: '', type: 'string', required: true, description: '' };
}

export function toolToDraft(tool: VoiceAgentWebhookToolView | null): WebhookToolDraft {
    return {
        name: tool?.name ?? '',
        description: tool?.description ?? '',
        url: tool?.url ?? '',
        params: (tool?.parameters ?? []).map((p) => ({ ...newParamRow(), ...p })),
        enabled: tool?.enabled ?? true,
        hasSecret: tool?.hasSecret ?? false,
        secretMode: tool?.hasSecret ? 'keep' : 'set',
        secretValue: '',
    };
}

export function draftToInput(draft: WebhookToolDraft): VoiceWebhookToolInput {
    const secretValue = draft.secretValue.trim();
    const secret: VoiceWebhookToolInput['secret'] =
        draft.secretMode === 'keep'
            ? { action: 'keep' }
            : draft.secretMode === 'clear' || !secretValue
              ? { action: 'clear' }
              : { action: 'set', value: secretValue };
    return {
        name: draft.name.trim(),
        description: draft.description.trim(),
        url: draft.url.trim(),
        parameters: draft.params.map(({ name, type, required, description }) => ({
            name: name.trim(),
            type,
            required,
            description: description.trim(),
        })),
        enabled: draft.enabled,
        secret,
    };
}

/** Same comparison for "has anything changed" as for saving. */
export function sameDraft(a: WebhookToolDraft, b: WebhookToolDraft): boolean {
    return JSON.stringify(draftToInput(a)) === JSON.stringify(draftToInput(b)) && a.secretValue === b.secretValue;
}

/**
 * The first problem with the dialog, or null. The server checks all of this again (and the URL
 * rules in full); this only saves a round trip for the common mistakes.
 */
export function webhookDraftError(draft: WebhookToolDraft, otherNames: string[], forTest = false): string | null {
    const name = draft.name.trim();
    if (!name) return 'Give the tool a name, like check_order';
    if (!VOICE_TOOL_NAME_PATTERN.test(name)) {
        return 'Tool names are 2 to 40 lowercase letters, numbers and _, starting with a letter (like check_order)';
    }
    if ((VOICE_RESERVED_TOOL_NAMES as readonly string[]).includes(name)) {
        return 'That name belongs to a built-in tool. Pick another one.';
    }
    if (otherNames.includes(name)) return `This agent already has a tool called ${name}`;
    if (!forTest && !draft.description.trim()) return 'Say when the agent should use this tool';
    if (draft.description.trim().length > VOICE_WEBHOOK_LIMITS.descriptionMax) {
        return `The description is up to ${VOICE_WEBHOOK_LIMITS.descriptionMax} characters`;
    }
    const url = draft.url.trim();
    if (!url) return 'Enter the URL to call';
    if (!/^https?:\/\/[^/\s]+/i.test(url)) return 'Enter a full URL, starting with https://';
    if (draft.params.length > VOICE_WEBHOOK_LIMITS.maxParams) {
        return `A tool has up to ${VOICE_WEBHOOK_LIMITS.maxParams} parameters`;
    }
    const seen = new Set<string>();
    for (const [index, p] of draft.params.entries()) {
        const paramName = p.name.trim();
        if (!paramName) return `Name parameter ${index + 1}, or remove it`;
        if (!VOICE_TOOL_PARAM_NAME_PATTERN.test(paramName)) {
            return 'Parameter names are lowercase letters, numbers and _, starting with a letter (like order_id)';
        }
        if (seen.has(paramName)) return `There are two parameters called ${paramName}`;
        seen.add(paramName);
    }
    if (draft.hasSecret && draft.secretMode === 'set' && !draft.secretValue.trim()) {
        return 'Enter the new secret, or keep the current one';
    }
    return null;
}

/** "api.example.com" from a URL, or the text as typed when it is not one yet. */
export function urlHost(url: string): string {
    try {
        return new URL(url).host;
    } catch {
        return url;
    }
}
