import {
    VOICE_STACK_MODELS,
    VoiceKeyProvider,
    VoiceStackKind,
    type VoiceStack,
    type VoiceStackModel,
    type VoiceStackPartName,
} from '@aixellabs/backend/db/types';

/**
 * The voice stack in words (Settings, the agent's key line, the voice picker). Models and their rates
 * are `VOICE_STACK_MODELS` (voice-call-rates.json); this adds names and where to get each key.
 */

export type VoiceKeyProviderInfo = {
    name: string;
    /** Where the owner creates a key. */
    keysUrl: string;
    keysUrlLabel: string;
    placeholder: string;
};

export const VOICE_KEY_PROVIDERS: Record<VoiceKeyProvider, VoiceKeyProviderInfo> = {
    [VoiceKeyProvider.GEMINI]: {
        name: 'Gemini',
        keysUrl: 'https://aistudio.google.com/apikey',
        keysUrlLabel: 'aistudio.google.com/apikey',
        placeholder: 'AIza…',
    },
    [VoiceKeyProvider.OPENAI]: {
        name: 'OpenAI',
        keysUrl: 'https://platform.openai.com/api-keys',
        keysUrlLabel: 'platform.openai.com/api-keys',
        placeholder: 'sk-…',
    },
    [VoiceKeyProvider.DEEPGRAM]: {
        name: 'Deepgram',
        keysUrl: 'https://console.deepgram.com',
        keysUrlLabel: 'console.deepgram.com',
        placeholder: 'Deepgram API key',
    },
    [VoiceKeyProvider.CARTESIA]: {
        name: 'Cartesia',
        keysUrl: 'https://play.cartesia.ai/keys',
        keysUrlLabel: 'play.cartesia.ai/keys',
        placeholder: 'sk_car_…',
    },
    [VoiceKeyProvider.ELEVENLABS]: {
        name: 'ElevenLabs',
        keysUrl: 'https://elevenlabs.io/app/settings/api-keys',
        keysUrlLabel: 'elevenlabs.io/app/settings/api-keys',
        placeholder: 'sk_…',
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

export function stackModel(part: VoiceStackPartName, model: string): VoiceStackModel | null {
    return VOICE_STACK_MODELS[part].find((m) => m.model === model) ?? null;
}

/** A part's default: its first model, on that provider's default key. */
export function defaultStackPart(part: VoiceStackPartName) {
    const { provider, model } = VOICE_STACK_MODELS[part][0];
    return { provider, model, keyId: null };
}

/** A whole stack of `kind` with every part on its default. */
export function defaultStack(kind: VoiceStackKind): VoiceStack<string> {
    if (kind === VoiceStackKind.REALTIME) return { kind, ...defaultStackPart('realtime') };
    return { kind, stt: defaultStackPart('stt'), llm: defaultStackPart('llm'), tts: defaultStackPart('tts') };
}

/** The providers a stack needs a key for. */
export function stackProviders(stack: VoiceStack<unknown>): VoiceKeyProvider[] {
    const parts = stack.kind === VoiceStackKind.REALTIME ? [stack] : [stack.stt, stack.llm, stack.tts];
    return [...new Set(parts.map((p) => p.provider))];
}

/** List price of a whole stack per call-minute, from its parts' rates. */
export function stackUsdPerMinute(stack: VoiceStack<unknown>): number {
    if (stack.kind === VoiceStackKind.REALTIME) return stackModel('realtime', stack.model)?.usdPerMinute ?? 0;
    return PIPELINE_PARTS.reduce((sum, part) => sum + (stackModel(part, stack[part].model)?.usdPerMinute ?? 0), 0);
}

/** The text-to-speech providers a pipeline voice may come from (those with a TTS model). */
export const TTS_PROVIDERS = [...new Set(VOICE_STACK_MODELS.tts.map((m) => m.provider))];
