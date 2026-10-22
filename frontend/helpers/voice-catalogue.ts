import { VOICE_AGENT_VOICES, VoiceKeyProvider, type VoiceAgentVoice, type VoiceTtsVoice } from '@aixellabs/backend/db/types';
import { voiceAgentVoiceName } from '@/helpers/voice-agent-defaults';

/**
 * The voices the voice picker offers, per provider. Gemini Live's are the REALTIME stack's; the rest
 * are text-to-speech voices for a PIPELINE stack. These are the built-in lists; the server adds the
 * voices of the owner's own Cartesia / ElevenLabs accounts (`getVoiceCatalogue`).
 * Read 2026-10-22: ElevenLabs premade voices from api.elevenlabs.io/v1/voices (previews fetched and
 * played); Cartesia ids from LiveKit's docs (Cartesia lists voices only with a key); OpenAI's built-in
 * voice names for gpt-4o-mini-tts (OpenAI gives no gender or samples).
 */

export type VoiceGender = 'female' | 'male' | 'neutral';

export type VoiceOption = VoiceTtsVoice & {
    gender?: VoiceGender;
    accent?: string;
    /** A few words on how it sounds. */
    description?: string;
    /** An mp3 the picker plays. Absent = no sample to play. */
    previewUrl?: string;
};

const EL_PREVIEW = 'https://storage.googleapis.com/eleven-public-prod/premade/voices';

const el = (
    voiceId: string,
    name: string,
    gender: VoiceGender,
    accent: string,
    description: string,
    file?: string,
): VoiceOption => ({
    provider: VoiceKeyProvider.ELEVENLABS,
    voiceId,
    name,
    gender,
    accent,
    description,
    ...(file ? { previewUrl: `${EL_PREVIEW}/${voiceId}/${file}.mp3` } : {}),
});

const cartesia = (voiceId: string, name: string, gender: VoiceGender, accent: string, description: string): VoiceOption => ({
    provider: VoiceKeyProvider.CARTESIA,
    voiceId,
    name,
    gender,
    accent,
    description,
});

const openai = (voiceId: string): VoiceOption => ({
    provider: VoiceKeyProvider.OPENAI,
    voiceId,
    name: voiceId.charAt(0).toUpperCase() + voiceId.slice(1),
});

export const GEMINI_VOICE_OPTIONS: VoiceOption[] = (Object.keys(VOICE_AGENT_VOICES) as VoiceAgentVoice[]).map((voice) => ({
    provider: VoiceKeyProvider.GEMINI,
    voiceId: voice,
    name: voiceAgentVoiceName(voice),
    description: VOICE_AGENT_VOICES[voice],
}));

export const BUILT_IN_VOICES: Record<VoiceKeyProvider, VoiceOption[]> = {
    [VoiceKeyProvider.GEMINI]: GEMINI_VOICE_OPTIONS,
    [VoiceKeyProvider.ELEVENLABS]: [
        el('EXAVITQu4vr4xnSDxMaL', 'Sarah', 'female', 'American', 'Confident, warm', '01a3e33c-6e99-4ee7-8543-ff2216a32186'),
        el('CwhRBWXzGAHq8TQ4Fs17', 'Roger', 'male', 'American', 'Laid-back, casual', '58ee3ff5-f6f2-4628-93b8-e38eb31806b0'),
        el(
            'cgSgspJ2msm6clMCkdW9',
            'Jessica',
            'female',
            'American',
            'Playful, bright, warm',
            '56a97bf8-b69b-448f-846c-c3a11683d45a',
        ),
        el(
            'cjVigY5qzO86Huf0OWal',
            'Eric',
            'male',
            'American',
            'Smooth, trustworthy',
            'd098fda0-6456-4030-b3d8-63aa048c9070',
        ),
        el('iP95p4xoKVk53GoZ742B', 'Chris', 'male', 'American', 'Down-to-earth', '3f4bde72-cc48-40dd-829f-57fbf906f4d7'),
        el('SAz9YHcvj6GT2YYXdXww', 'River', 'neutral', 'American', 'Relaxed, calm', 'e6c95f0b-2227-491a-b3d7-2249240decb7'),
        el('Xb7hH8MSUJpSbSDYk0k2', 'Alice', 'female', 'British', 'Clear, engaging', 'd10f7534-11f6-41fe-a012-2de1e482d336'),
        el('XrExE9yKIg1WjnnlVkGX', 'Matilda', 'female', 'American', 'Professional', 'b930e18d-6b4d-466e-bab2-0ae97c6d8535'),
        el('pNInz6obpgDQGcFmaJgB', 'Adam', 'male', 'American', 'Dominant, firm', 'd6905d7a-dd26-4187-bfff-1bd3a5ea7cac'),
        el('onwK4e9ZLuTAKqWW03F9', 'Daniel', 'male', 'British', 'Steady broadcaster'),
    ],
    [VoiceKeyProvider.CARTESIA]: [
        cartesia('a167e0f3-df7e-4d52-a9c3-f949145efdab', 'Blake', 'male', 'American', 'Energetic'),
        cartesia('9626c31c-bec5-4cca-baa8-f8ba9e84c8bc', 'Jacqueline', 'female', 'American', 'Confident young adult'),
        cartesia('f31cc6a7-c1e8-4764-980c-60a361443dd1', 'Robyn', 'female', 'Australian', 'Neutral, mature'),
        cartesia('5c5ad5e7-1020-476b-8b91-fdcbe9cc313c', 'Daniela', 'female', 'Mexican', 'Calm'),
    ],
    [VoiceKeyProvider.OPENAI]: [
        openai('alloy'),
        openai('ash'),
        openai('ballad'),
        openai('coral'),
        openai('echo'),
        openai('fable'),
        openai('nova'),
        openai('onyx'),
        openai('sage'),
        openai('shimmer'),
        openai('verse'),
    ],
    [VoiceKeyProvider.DEEPGRAM]: [],
};

/** Built-in first, then the owner's own voices that are not built in. */
export function mergeVoices(builtIn: VoiceOption[], own: VoiceOption[]): VoiceOption[] {
    const seen = new Set(builtIn.map((v) => v.voiceId));
    return [...builtIn, ...own.filter((v) => !seen.has(v.voiceId))];
}
