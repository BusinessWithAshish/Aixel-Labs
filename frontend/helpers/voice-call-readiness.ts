import {
    VoiceAgentChannel,
    VoiceKeyProvider,
    voiceKeyFor,
    voiceStackFor,
    type VoiceGeminiKeyTier,
    type VoiceStack,
    type VoiceStackPartName,
} from '@aixellabs/backend/db/types';
import { GEMINI_KEY_URL } from '@/helpers/voice-routes';
import { needsPaidKey, stackParts, VOICE_KEY_PROVIDERS, VOICE_STACK_PART_LABELS } from '@/helpers/voice-stack';

/**
 * What stops an agent's calls, each with its fix: the same things the engine refuses a call for
 * (product.require_prompt, product.gemini_key_for, cascade.resolve). The agent page shows them where calls
 * start; the actions that start calls refuse with them (`assertCallReady`). A key the provider refused is not
 * one: quota and billing can come back, and the key's own notice says so.
 */

export type VoiceCallBlocker = { message: string; fix: string; href: string };

type Key = { _id: unknown; provider: VoiceKeyProvider; tier?: VoiceGeminiKeyTier };

const PROMPT_HREF = '#agent-prompt';
const STACK_HREF = '#agent-stack-title';
/** The number an agent of each channel needs, and its picker on the agent page. */
const NUMBER_WORDS: Record<VoiceAgentChannel, { kind: string; href: string }> = {
    [VoiceAgentChannel.PHONE]: { kind: 'phone', href: '#agent-numbers-phone' },
    [VoiceAgentChannel.WHATSAPP]: { kind: 'WhatsApp', href: '#agent-numbers-whatsapp' },
    [VoiceAgentChannel.BOTH]: { kind: 'phone or WhatsApp', href: '#agent-numbers-phone' },
};

const and = (words: string[]) => words.join(' and ');

export function voiceCallBlockers({
    prompt,
    stack,
    keys,
    onNumber,
    channel = VoiceAgentChannel.PHONE,
}: {
    prompt: string;
    stack?: VoiceStack<unknown> | null;
    keys: Key[];
    /** For calls over a phone line (test calls, the browser and softphone tests): whether the agent is on a number. */
    onNumber?: boolean;
    /** Which number `onNumber` means. */
    channel?: VoiceAgentChannel;
}): VoiceCallBlocker[] {
    const blockers: VoiceCallBlocker[] = [];
    if (onNumber === false) {
        const { kind, href } = NUMBER_WORDS[channel];
        blockers.push({ message: `It is not on a ${kind} number yet.`, fix: `Link a ${kind} number`, href });
    }
    if (!prompt.trim()) {
        blockers.push({
            message: 'This agent has no prompt yet, so it would not know what to say.',
            fix: 'Write a prompt',
            href: PROMPT_HREF,
        });
    }
    // What each provider's key runs; every call also needs a Gemini key, for the summary after it.
    const uses = new Map<VoiceKeyProvider, { steps: string[]; keyId?: unknown; paidSteps: VoiceStackPartName[] }>();
    for (const { name, part } of stackParts(voiceStackFor({ stack }))) {
        const use = uses.get(part.provider) ?? { steps: [], keyId: part.keyId, paidSteps: [] };
        use.steps.push(VOICE_STACK_PART_LABELS[name].title.toLowerCase());
        if (needsPaidKey(name, part.provider)) use.paidSteps.push(name);
        uses.set(part.provider, use);
    }
    if (!uses.has(VoiceKeyProvider.GEMINI))
        uses.set(VoiceKeyProvider.GEMINI, { steps: ['the summary after each call'], paidSteps: [] });

    for (const [provider, { steps, keyId, paidSteps }] of uses) {
        const { name } = VOICE_KEY_PROVIDERS[provider];
        const key = voiceKeyFor(keys, { provider, keyId });
        if (!key) {
            blockers.push({
                message: `No ${name} API key: ${and(steps)} ${steps.length > 1 ? 'need' : 'needs'} one.`,
                fix: `Add a ${name} API key in Settings`,
                href: GEMINI_KEY_URL,
            });
        } else if (paidSteps.length && key.tier === 'free') {
            blockers.push({
                message: `${and(paidSteps.map((s) => VOICE_STACK_PART_LABELS[s].title))} needs a paid-tier Gemini key: on a free one Google cuts it off after about 4 sentences a minute.`,
                fix: 'Pick a paid-tier key',
                href: STACK_HREF,
            });
        }
    }
    return blockers;
}

/** The blockers in one line (a disabled button's tooltip, an action's refusal). */
export const blockerText = (blockers: VoiceCallBlocker[]) => blockers.map((b) => `${b.message} ${b.fix}.`).join(' ');
