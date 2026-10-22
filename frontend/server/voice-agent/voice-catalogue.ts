import 'server-only';

import { voiceKeyFor, VoiceKeyProvider, type VoiceProviderKeyDoc } from '@aixellabs/backend/db';
import type { VoiceGender, VoiceOption } from '@/helpers/voice-catalogue';
import { openSecret } from '@/server/voice-agent/engine';
import { providerApiUrl } from '@/server/voice-agent/provider-keys';

/**
 * The voices in the owner's own text-to-speech accounts (cloned and library voices included), for the
 * voice picker. ElevenLabs lists its premade voices even without a key; Cartesia lists none without
 * one. Any failure is an empty list: the picker still has its built-in voices.
 */

const TIMEOUT_MS = 8_000;

const GENDERS: Record<string, VoiceGender> = {
    female: 'female',
    feminine: 'female',
    male: 'male',
    masculine: 'male',
    neutral: 'neutral',
    gender_neutral: 'neutral',
};

type ElevenLabsVoice = {
    voice_id: string;
    name: string;
    description?: string | null;
    preview_url?: string | null;
    labels?: { gender?: string; accent?: string; descriptive?: string };
};

type CartesiaVoice = {
    id: string;
    name: string;
    description?: string | null;
    gender?: string | null;
    preview_file_url?: string | null;
    accents?: { accent?: string }[];
};

async function getJson<T>(url: string, headers: HeadersInit): Promise<T | null> {
    try {
        const res = await fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS), cache: 'no-store' });
        return res.ok ? ((await res.json()) as T) : null;
    } catch {
        return null;
    }
}

const capital = (s?: string | null) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : undefined);

async function elevenLabsVoices(key: string | null): Promise<VoiceOption[]> {
    const body = await getJson<{ voices?: ElevenLabsVoice[] }>(
        providerApiUrl(VoiceKeyProvider.ELEVENLABS, 'https://api.elevenlabs.io/v1/voices'),
        key ? { 'xi-api-key': key } : {},
    );
    return (body?.voices ?? []).map((v) => ({
        provider: VoiceKeyProvider.ELEVENLABS,
        voiceId: v.voice_id,
        name: v.name,
        gender: GENDERS[v.labels?.gender ?? ''],
        accent: capital(v.labels?.accent),
        description: capital(v.labels?.descriptive) ?? v.description ?? undefined,
        previewUrl: v.preview_url ?? undefined,
    }));
}

async function cartesiaVoices(key: string | null): Promise<VoiceOption[]> {
    if (!key) return [];
    const body = await getJson<{ data?: CartesiaVoice[] }>(
        providerApiUrl(VoiceKeyProvider.CARTESIA, 'https://api.cartesia.ai/voices?limit=100&expand[]=preview_file_url'),
        { Authorization: `Bearer ${key}`, 'Cartesia-Version': '2026-08-14' },
    );
    return (body?.data ?? []).map((v) => ({
        provider: VoiceKeyProvider.CARTESIA,
        voiceId: v.id,
        name: v.name,
        gender: GENDERS[v.gender ?? ''],
        accent: capital(v.accents?.[0]?.accent),
        description: v.description ?? undefined,
        previewUrl: v.preview_file_url ?? undefined,
    }));
}

/** Each provider's voices on the owner's default key of that provider. */
export async function ownVoices(keys: VoiceProviderKeyDoc[]): Promise<Partial<Record<VoiceKeyProvider, VoiceOption[]>>> {
    const open = (provider: VoiceKeyProvider) => {
        const key = voiceKeyFor(keys, { provider });
        try {
            return key ? openSecret(key.keySealed) : null;
        } catch {
            return null;
        }
    };
    const [elevenlabs, cartesia] = await Promise.all([
        elevenLabsVoices(open(VoiceKeyProvider.ELEVENLABS)),
        cartesiaVoices(open(VoiceKeyProvider.CARTESIA)),
    ]);
    return { [VoiceKeyProvider.ELEVENLABS]: elevenlabs, [VoiceKeyProvider.CARTESIA]: cartesia };
}
