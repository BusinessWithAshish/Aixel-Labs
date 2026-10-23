import {
    VOICE_CALL_RATES,
    VOICE_STACK_MODELS,
    VoiceKeyProvider,
    VoiceStackKind,
    type VoiceStack,
    type VoiceStackCatalogue,
    type VoiceStackModel,
    type VoiceStackPartName,
    type VoiceStackPrice,
} from '@aixellabs/backend/db/types';

/**
 * The voice stack in words and numbers (the agent's stack section, the cost bill, the voice picker).
 * Models and prices come from the catalogue (`stackCatalogue`, server/voice-agent/voice-catalogue.ts);
 * `FALLBACK_CATALOGUE` is voice-call-rates.json's list for when it cannot be read.
 */

export type VoiceKeyProviderInfo = {
    name: string;
    /** Where the owner creates a key. */
    keysUrl: string;
    keysUrlLabel: string;
    placeholder: string;
    /** The provider's own mark, under public/brand-logos. */
    logo: string;
    /** A one-colour mark (drawn black): inverted in dark mode. */
    mono?: boolean;
};

export const VOICE_KEY_PROVIDERS: Record<VoiceKeyProvider, VoiceKeyProviderInfo> = {
    [VoiceKeyProvider.GEMINI]: {
        name: 'Gemini',
        keysUrl: 'https://aistudio.google.com/apikey',
        keysUrlLabel: 'aistudio.google.com/apikey',
        placeholder: 'AIza…',
        logo: '/brand-logos/gemini.svg',
    },
    [VoiceKeyProvider.OPENAI]: {
        name: 'OpenAI',
        keysUrl: 'https://platform.openai.com/api-keys',
        keysUrlLabel: 'platform.openai.com/api-keys',
        placeholder: 'sk-…',
        logo: '/brand-logos/openai.svg',
        mono: true,
    },
    [VoiceKeyProvider.DEEPGRAM]: {
        name: 'Deepgram',
        keysUrl: 'https://console.deepgram.com',
        keysUrlLabel: 'console.deepgram.com',
        placeholder: 'Deepgram API key',
        logo: '/brand-logos/deepgram.svg',
        mono: true,
    },
    [VoiceKeyProvider.CARTESIA]: {
        name: 'Cartesia',
        keysUrl: 'https://play.cartesia.ai/keys',
        keysUrlLabel: 'play.cartesia.ai/keys',
        placeholder: 'sk_car_…',
        logo: '/brand-logos/cartesia.svg',
    },
    [VoiceKeyProvider.ELEVENLABS]: {
        name: 'ElevenLabs',
        keysUrl: 'https://elevenlabs.io/app/settings/api-keys',
        keysUrlLabel: 'elevenlabs.io/app/settings/api-keys',
        placeholder: 'sk_…',
        logo: '/brand-logos/elevenlabs.svg',
        mono: true,
    },
};

export const VOICE_KEY_PROVIDER_ORDER = Object.values(VoiceKeyProvider);

export const VOICE_STACK_PART_LABELS: Record<VoiceStackPartName, { title: string; description: string }> = {
    realtime: { title: 'Voice model', description: 'Hears the caller and answers out loud.' },
    stt: { title: 'Speech to text', description: 'Writes down what the caller says.' },
    llm: { title: 'Thinking (LLM)', description: 'Decides what to say back.' },
    tts: { title: 'Text to speech', description: 'Says it in the voice you pick.' },
};

export const PIPELINE_PARTS = ['stt', 'llm', 'tts'] as const;

const ESTIMATE = VOICE_CALL_RATES.estimate;

/** Audio tokens a minute of speech is billed as, on `provider`. */
export const audioTokensPerMinute = (provider: VoiceKeyProvider) =>
    provider === VoiceKeyProvider.OPENAI ? ESTIMATE.audioTokensPerMinute.openai : ESTIMATE.audioTokensPerMinute.gemini;

/** What a list price comes to per call-minute, on the estimate's typical minute (voice-call-rates.json `estimate.perMinuteSource`). */
export function usdPerMinuteOf(price: VoiceStackPrice, provider: VoiceKeyProvider): number {
    if ('usdPerMinute' in price) return price.usdPerMinute;
    if ('usdPerMillionChars' in price) return (price.usdPerMillionChars * ESTIMATE.ttsCharsPerMinute) / 1e6;
    if ('usdPerAudioMinute' in price) return price.usdPerAudioMinute;
    const t = price.usdPerMillionTokens;
    if ('in' in t)
        return ((ESTIMATE.llmTokensPerTurn * t.in + ESTIMATE.llmOutTokensPerTurn * t.out) * ESTIMATE.turnsPerMinute) / 1e6;
    if (provider === VoiceKeyProvider.OPENAI)
        return (
            (ESTIMATE.audioTokensPerMinute.openaiRealtimeIn * t.audioIn +
                ESTIMATE.audioTokensPerMinute.openaiRealtimeOut * t.audioOut) /
            1e6
        );
    return (audioTokensPerMinute(provider) * (t.audioIn + t.audioOut)) / 1e6;
}

/** voice-call-rates.json's price of a fallback model (`pipeline`, realtime Gemini's `gemini`). */
function ratesFilePrice(part: VoiceStackPartName, model: string): VoiceStackPrice | null {
    if (part === 'realtime') return { usdPerMillionTokens: VOICE_CALL_RATES.gemini.usdPerMillionTokens };
    const rate = (VOICE_CALL_RATES.pipeline[part] as Record<string, VoiceStackPrice & { source?: string }>)[model];
    return rate ? (Object.fromEntries(Object.entries(rate).filter(([k]) => k !== 'source')) as VoiceStackPrice) : null;
}

/** Gemini's speech-to-text and text-to-speech are cut off on a free-tier key after a few sentences a minute. */
export const needsPaidKey = (part: VoiceStackPartName, provider: VoiceKeyProvider) =>
    provider === VoiceKeyProvider.GEMINI && (part === 'stt' || part === 'tts');

/** A catalogue model, priced. */
export function stackModelOf(
    part: VoiceStackPartName,
    m: Pick<VoiceStackModel, 'provider' | 'model' | 'name'>,
    price: VoiceStackPrice,
    soon = false,
): VoiceStackModel {
    return {
        ...m,
        price,
        usdPerMinute: usdPerMinuteOf(price, m.provider),
        ...(soon ? { soon } : {}),
        ...(needsPaidKey(part, m.provider) ? { paidKeyOnly: true } : {}),
    };
}

const byPrice = (a: VoiceStackModel, b: VoiceStackModel) => a.usdPerMinute - b.usdPerMinute || a.name.localeCompare(b.name);

/** The rates file's models of each part, priced and cheapest first. */
export const FALLBACK_CATALOGUE = Object.fromEntries(
    (['realtime', ...PIPELINE_PARTS] as VoiceStackPartName[]).map((part) => [
        part,
        VOICE_STACK_MODELS[part]
            .flatMap((m) => {
                const price = ratesFilePrice(part, m.model);
                return price ? [stackModelOf(part, m, price)] : [];
            })
            .sort(byPrice),
    ]),
) as VoiceStackCatalogue;

/** Cheapest first (ties by name). */
export const sortByPrice = (models: VoiceStackModel[]) => [...models].sort(byPrice);

export function stackModel(
    part: VoiceStackPartName,
    model: string,
    catalogue: VoiceStackCatalogue = FALLBACK_CATALOGUE,
): VoiceStackModel | null {
    return catalogue[part].find((m) => m.model === model) ?? FALLBACK_CATALOGUE[part].find((m) => m.model === model) ?? null;
}

/** A part's default: the rates file's first model, on that provider's default key. */
export function defaultStackPart(part: VoiceStackPartName) {
    const { provider, model } = VOICE_STACK_MODELS[part][0];
    return { provider, model, keyId: null };
}

/** A whole stack of `kind` with every part on its default. */
export function defaultStack(kind: VoiceStackKind): VoiceStack<string> {
    if (kind === VoiceStackKind.REALTIME) return { kind, ...defaultStackPart('realtime') };
    return { kind, stt: defaultStackPart('stt'), llm: defaultStackPart('llm'), tts: defaultStackPart('tts') };
}

/** The parts of a stack, by name. */
export function stackParts<P>(stack: VoiceStack<P>) {
    return stack.kind === VoiceStackKind.REALTIME
        ? [{ name: 'realtime' as VoiceStackPartName, part: stack }]
        : PIPELINE_PARTS.map((name) => ({ name: name as VoiceStackPartName, part: stack[name] }));
}

/** List price of a whole stack per call-minute, from its parts' rates. */
export function stackUsdPerMinute(stack: VoiceStack<unknown>, catalogue?: VoiceStackCatalogue): number {
    return stackParts(stack).reduce(
        (sum, { name, part }) => sum + (stackModel(name, part.model, catalogue)?.usdPerMinute ?? 0),
        0,
    );
}
