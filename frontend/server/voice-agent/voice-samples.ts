import 'server-only';

import { voiceKeyFor, VoiceKeyProvider, type MongoObjectId } from '@aixellabs/backend/db';
import { BUILT_IN_VOICES, SAMPLED_PROVIDERS } from '@/helpers/voice-catalogue';
import { FALLBACK_CATALOGUE } from '@/helpers/voice-stack';
import { voiceAccountsCollection } from '@/server/voice-agent/accounts';
import { openSecret } from '@/server/voice-agent/engine';
import { geminiApiBase } from '@/server/voice-agent/gemini-key';
import { providerApiUrl } from '@/server/voice-agent/provider-keys';
import { assertRateLimit } from '@/server/rate-limit';

/**
 * Samples of the voices whose providers publish none (OpenAI's, Gemini's): one short sentence, made on the
 * owner's own key with the provider's cheapest text-to-speech model the first time anyone plays it, then kept
 * (here per server, and by the CDN: a stock voice sounds the same for everyone).
 */

const SAMPLE_TEXT = 'Hi, thanks for calling! How can I help you today?';
const TIMEOUT_MS = 20_000;
const MAX_CACHED = 200;

export type VoiceSample = { audio: Blob; contentType: string };

const cache = new Map<string, VoiceSample>();

/** 16-bit mono PCM (Gemini's audio) as a WAV file. */
function wav(pcm: Buffer, sampleRate: number): Blob {
    const header = Buffer.alloc(44);
    header.write('RIFF', 0);
    header.writeUInt32LE(36 + pcm.length, 4);
    header.write('WAVEfmt ', 8);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20);
    header.writeUInt16LE(1, 22);
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(sampleRate * 2, 28);
    header.writeUInt16LE(2, 32);
    header.writeUInt16LE(16, 34);
    header.write('data', 36);
    header.writeUInt32LE(pcm.length, 40);
    return new Blob([new Uint8Array(header), new Uint8Array(pcm)], { type: 'audio/wav' });
}

async function post(url: string, headers: Record<string, string>, body: unknown): Promise<Response> {
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(body),
        cache: 'no-store',
        signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`The provider could not make the sample (HTTP ${res.status})`);
    return res;
}

async function synthesize(provider: VoiceKeyProvider, voiceId: string, key: string): Promise<VoiceSample> {
    const model = FALLBACK_CATALOGUE.tts.find((m) => m.provider === provider)?.model;
    if (provider === VoiceKeyProvider.OPENAI) {
        const res = await post(
            providerApiUrl(provider, 'https://api.openai.com/v1/audio/speech'),
            { Authorization: `Bearer ${key}` },
            { model, voice: voiceId, input: SAMPLE_TEXT, response_format: 'mp3' },
        );
        return { audio: await res.blob(), contentType: 'audio/mpeg' };
    }
    const res = await post(
        `${geminiApiBase()}/v1beta/models/${model}:generateContent`,
        { 'x-goog-api-key': key },
        {
            contents: [{ parts: [{ text: SAMPLE_TEXT }] }],
            generationConfig: {
                responseModalities: ['AUDIO'],
                speechConfig: {
                    voiceConfig: { prebuiltVoiceConfig: { voiceName: voiceId.charAt(0).toUpperCase() + voiceId.slice(1) } },
                },
            },
        },
    );
    type Part = { inlineData?: { data?: string; mimeType?: string } };
    const body = (await res.json()) as { candidates?: { content?: { parts?: Part[] } }[] };
    const audio = body.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData;
    if (!audio?.data) throw new Error('The provider sent no audio for the sample');
    const rate = Number(/rate=(\d+)/.exec(audio.mimeType ?? '')?.[1] ?? 24000);
    return { audio: wav(Buffer.from(audio.data, 'base64'), rate), contentType: 'audio/wav' };
}

/** A sample of one of `provider`'s built-in voices; null when it is not one, or the owner has no key for it. */
export async function voiceSample(userId: MongoObjectId, provider: string, voiceId: string): Promise<VoiceSample | null> {
    const sampled = SAMPLED_PROVIDERS.find((p) => p === provider);
    if (!sampled || !BUILT_IN_VOICES[sampled].some((v) => v.voiceId === voiceId)) return null;
    const id = `${sampled}:${voiceId}`;
    const kept = cache.get(id);
    if (kept) return kept;

    const accounts = await voiceAccountsCollection();
    const doc = await accounts.findOne({ userId }, { projection: { keys: 1 } });
    const key = voiceKeyFor(doc?.keys, { provider: sampled });
    if (!key) return null;
    assertRateLimit(`voice-check:${userId}`, 30); // a new sample spends the owner's credits
    const sample = await synthesize(sampled, voiceId, openSecret(key.keySealed));
    if (cache.size >= MAX_CACHED) cache.delete(cache.keys().next().value!);
    cache.set(id, sample);
    return sample;
}
