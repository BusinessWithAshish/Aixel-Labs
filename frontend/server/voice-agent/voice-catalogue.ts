import 'server-only';

import {
    voiceKeyFor,
    VoiceKeyProvider,
    VoiceStackKind,
    type VoiceProviderKeyDoc,
    type VoiceStack,
    type VoiceStackCatalogue,
    type VoiceStackModel,
    type VoiceStackPartName,
    type VoiceStackPrice,
} from '@aixellabs/backend/db';
import {
    BUILT_IN_VOICES,
    mergeVoices,
    SAMPLED_PROVIDERS,
    voiceSampleUrl,
    type VoiceGender,
    type VoiceOption,
} from '@/helpers/voice-catalogue';
import {
    audioTokensPerMinute,
    FALLBACK_CATALOGUE,
    needsPaidKey,
    sortByPrice,
    stackModelOf,
    stackParts,
    VOICE_KEY_PROVIDERS,
} from '@/helpers/voice-stack';
import { openSecret } from '@/server/voice-agent/engine';
import { geminiApiBase } from '@/server/voice-agent/gemini-key';
import { ownedStack, providerApiUrl } from '@/server/voice-agent/provider-keys';

/**
 * What an agent's stack section offers, loaded on the server with the page (keys never reach the browser):
 *
 *   models  Gemini and OpenAI: the Vercel AI Gateway's public catalogue (`/v1/models`: every model typed
 *           language / transcription / speech / realtime, with list prices), kept to the ones the owner's
 *           own key lists (Gemini `models.list`, OpenAI `/v1/models`) and the engine can run. Calls still
 *           go straight to each provider on the owner's key; the gateway is only read for its list.
 *           Deepgram, Cartesia and ElevenLabs publish no prices by API: voice-call-rates.json `stack`.
 *   voices  the built-in voices plus those in the owner's own Cartesia / ElevenLabs accounts, Deepgram's Aura
 *           voices (its public model list, with samples); OpenAI's and Gemini's get the app's own sample
 *           (`voiceSampleUrl`) when the owner has that key.
 *
 * Any failure falls back (the rates file's models, the built-in voices): the section always has a list.
 */

const TIMEOUT_MS = 5_000;
/** Public catalogues (the gateway's models, Deepgram's voices) are read once a day. */
const CATALOGUE_REVALIDATE_SECS = 24 * 60 * 60;

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

/** `revalidateSecs`: a public list, kept that long; else (anything on a key) read every time. */
async function getJson<T>(url: string, headers: HeadersInit, revalidateSecs?: number): Promise<T | null> {
    try {
        const res = await fetch(url, {
            headers,
            signal: AbortSignal.timeout(TIMEOUT_MS),
            // Tests point the providers at a fake (VOICE_PROVIDER_API_BASE): read it every time.
            ...(revalidateSecs && !process.env.VOICE_PROVIDER_API_BASE
                ? { next: { revalidate: revalidateSecs } }
                : { cache: 'no-store' as const }),
        });
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

/** The owner's default key of `provider`, opened; null when none (or it cannot be opened). */
function openKey(keys: VoiceProviderKeyDoc[], provider: VoiceKeyProvider): string | null {
    const key = voiceKeyFor(keys, { provider });
    try {
        return key ? openSecret(key.keySealed) : null;
    } catch {
        return null;
    }
}

type DeepgramVoice = {
    canonical_name: string;
    architecture: string;
    metadata?: { display_name?: string; accent?: string; sample?: string; tags?: string[] };
};

/** Deepgram's Aura voices (public: its model list needs no key). */
async function deepgramVoices(): Promise<VoiceOption[]> {
    const body = await getJson<{ tts?: DeepgramVoice[] }>(
        providerApiUrl(VoiceKeyProvider.DEEPGRAM, 'https://api.deepgram.com/v1/models'),
        {},
        CATALOGUE_REVALIDATE_SECS,
    );
    return (body?.tts ?? []).map(({ canonical_name, architecture, metadata: m = {} }) => {
        const tags = m.tags ?? [];
        return {
            provider: VoiceKeyProvider.DEEPGRAM,
            voiceId: canonical_name,
            name: m.display_name ?? canonical_name,
            gender: tags.includes('feminine') ? 'female' : tags.includes('masculine') ? 'male' : undefined,
            accent: m.accent,
            description: capital(tags.filter((t) => t !== 'feminine' && t !== 'masculine').join(', ')),
            previewUrl: m.sample,
            model: architecture,
        };
    });
}

/** Every voice the picker offers, per provider: the built-in ones, then the owner's own (on their default key). */
export async function agentVoices(keys: VoiceProviderKeyDoc[]): Promise<Record<VoiceKeyProvider, VoiceOption[]>> {
    const [elevenlabs, cartesia, deepgram] = await Promise.all([
        elevenLabsVoices(openKey(keys, VoiceKeyProvider.ELEVENLABS)),
        cartesiaVoices(openKey(keys, VoiceKeyProvider.CARTESIA)),
        deepgramVoices(),
    ]);
    const sampled = (provider: VoiceKeyProvider) =>
        voiceKeyFor(keys, { provider })
            ? BUILT_IN_VOICES[provider].map((v) => ({ ...v, previewUrl: voiceSampleUrl(provider, v.voiceId) }))
            : BUILT_IN_VOICES[provider];
    return {
        ...BUILT_IN_VOICES,
        ...Object.fromEntries(SAMPLED_PROVIDERS.map((p) => [p, sampled(p)])),
        [VoiceKeyProvider.ELEVENLABS]: mergeVoices(BUILT_IN_VOICES.elevenlabs, elevenlabs),
        [VoiceKeyProvider.CARTESIA]: mergeVoices(BUILT_IN_VOICES.cartesia, cartesia),
        [VoiceKeyProvider.DEEPGRAM]: deepgram,
    };
}

// ---------------------------------------------------------------------------
// Models
// ---------------------------------------------------------------------------

/** The gateway's catalogue, read once a day. Tests point `VOICE_CATALOGUE_URL` at a fake (read every time). */
const CATALOGUE_URL = process.env.VOICE_CATALOGUE_URL || 'https://ai-gateway.vercel.sh/v1/models';

/** USD per unit, as decimal strings. */
type GatewayPricing = Partial<
    Record<
        | 'input'
        | 'output'
        | 'audio_input_token_cost'
        | 'audio_output_token_cost'
        | 'speech_input_character_cost'
        | 'transcription_duration_cost_per_second'
        | 'realtime_session_duration_cost_per_second',
        string
    >
>;

type GatewayModel = {
    id: string;
    name: string;
    owned_by: string;
    type: string;
    tags?: string[] | null;
    pricing?: GatewayPricing;
};

const GATEWAY_PARTS: Record<string, VoiceStackPartName> = {
    realtime: 'realtime',
    transcription: 'stt',
    language: 'llm',
    speech: 'tts',
};
const GATEWAY_PROVIDERS: Record<string, VoiceKeyProvider> = {
    google: VoiceKeyProvider.GEMINI,
    openai: VoiceKeyProvider.OPENAI,
};

/**
 * Whether the engine (backend/voice/cascade.py, phone.py) can run it: a text model has to take tools and
 * chat completions (OpenAI's -pro and codex models are Responses-only; -batch / -fast are gateway-only
 * variants); Gemini hears through its live transcription model; OpenAI's through its file models (not
 * its websocket one). Gemini Live runs; OpenAI Realtime is listed as coming soon (`soon`).
 */
function runnable(part: VoiceStackPartName, provider: VoiceKeyProvider, m: GatewayModel): boolean {
    const id = m.id.split('/')[1] ?? '';
    const tags = m.tags ?? [];
    if (part === 'llm') {
        if (!tags.includes('tool-use') || /-(batch|fast)$|image|omni|banana|deep-research|gemma|oss/.test(id)) return false;
        return provider !== VoiceKeyProvider.OPENAI || !/-pro\b|codex/.test(id);
    }
    if (part === 'stt') return (provider === VoiceKeyProvider.GEMINI) === tags.includes('websocket-transcription');
    return true;
}

const usd = (v?: string) => (v === undefined ? undefined : Number(v));

/** The gateway's pricing in the unit the engine bills the part on; null = cannot be priced. */
function gatewayPrice(part: VoiceStackPartName, provider: VoiceKeyProvider, p: GatewayPricing): VoiceStackPrice | null {
    const [input, output] = [usd(p.input), usd(p.output)];
    const [audioIn, audioOut] = [usd(p.audio_input_token_cost), usd(p.audio_output_token_cost)];
    const perSecond = usd(p.transcription_duration_cost_per_second ?? p.realtime_session_duration_cost_per_second);
    if (perSecond !== undefined) return { usdPerMinute: perSecond * 60 };
    if (part === 'llm' && input !== undefined && output !== undefined)
        return { usdPerMillionTokens: { in: input * 1e6, out: output * 1e6 } };
    if (
        part === 'realtime' &&
        input !== undefined &&
        output !== undefined &&
        audioIn !== undefined &&
        audioOut !== undefined
    )
        return {
            usdPerMillionTokens: {
                textIn: input * 1e6,
                audioIn: audioIn * 1e6,
                textOut: output * 1e6,
                audioOut: audioOut * 1e6,
            },
        };
    if (part === 'stt' && audioIn !== undefined) return { usdPerMinute: audioIn * audioTokensPerMinute(provider) };
    if (part === 'tts' && p.speech_input_character_cost !== undefined)
        return { usdPerMillionChars: Number(p.speech_input_character_cost) * 1e6 };
    if (part === 'tts' && audioOut !== undefined) return { usdPerAudioMinute: audioOut * audioTokensPerMinute(provider) };
    return null;
}

async function gatewayModels(): Promise<GatewayModel[]> {
    try {
        const res = await fetch(CATALOGUE_URL, {
            signal: AbortSignal.timeout(TIMEOUT_MS),
            ...(process.env.VOICE_CATALOGUE_URL
                ? { cache: 'no-store' }
                : { next: { revalidate: CATALOGUE_REVALIDATE_SECS } }),
        });
        return res.ok ? (((await res.json()) as { data?: GatewayModel[] }).data ?? []) : [];
    } catch {
        return [];
    }
}

/**
 * The model ids the owner's key of `provider` may use (Gemini: with the method each part calls); null =
 * no key, or the list could not be read (then nothing is left out).
 */
async function keyModels(keys: VoiceProviderKeyDoc[], provider: VoiceKeyProvider): Promise<Map<string, string[]> | null> {
    const key = openKey(keys, provider);
    if (!key) return null;
    if (provider === VoiceKeyProvider.GEMINI) {
        const body = await getJson<{ models?: { name: string; supportedGenerationMethods?: string[] }[] }>(
            `${geminiApiBase()}/v1beta/models?pageSize=1000`,
            { 'x-goog-api-key': key },
        );
        const models = body?.models ?? [];
        return models.length
            ? new Map(models.map((m) => [m.name.replace(/^models\//, ''), m.supportedGenerationMethods ?? []]))
            : null;
    }
    const body = await getJson<{ data?: { id: string }[] }>(providerApiUrl(provider, 'https://api.openai.com/v1/models'), {
        Authorization: `Bearer ${key}`,
    });
    return body?.data?.length ? new Map(body.data.map((m) => [m.id, []])) : null;
}

/** Gemini: the methods a part's model has to offer (Live and live transcription are websocket-only). */
const GEMINI_METHOD: Record<VoiceStackPartName, string> = {
    realtime: 'bidiGenerateContent',
    stt: 'bidiGenerateContent',
    llm: 'generateContent',
    tts: 'generateContent',
};

/** Every model each part offers the owner, cheapest first. */
export async function stackCatalogue(keys: VoiceProviderKeyDoc[]): Promise<VoiceStackCatalogue> {
    const [gateway, gemini, openai] = await Promise.all([
        gatewayModels(),
        keyModels(keys, VoiceKeyProvider.GEMINI),
        keyModels(keys, VoiceKeyProvider.OPENAI),
    ]);
    const listed = { [VoiceKeyProvider.GEMINI]: gemini, [VoiceKeyProvider.OPENAI]: openai } as Partial<
        Record<VoiceKeyProvider, Map<string, string[]> | null>
    >;
    const keyHas = (part: VoiceStackPartName, provider: VoiceKeyProvider, id: string) => {
        const list = listed[provider];
        if (!list) return true;
        const methods = list.get(id);
        return !!methods && (!methods.length || methods.includes(GEMINI_METHOD[part]));
    };

    const catalogue = { realtime: [], stt: [], llm: [], tts: [] } as VoiceStackCatalogue;
    for (const m of gateway) {
        const part = GATEWAY_PARTS[m.type];
        const provider = GATEWAY_PROVIDERS[m.owned_by];
        const id = m.id.split('/')[1];
        if (!part || !provider || !id || !runnable(part, provider, m)) continue;
        const soon = part === 'realtime' && provider === VoiceKeyProvider.OPENAI;
        if (!soon && !keyHas(part, provider, id)) continue;
        const price = gatewayPrice(part, provider, m.pricing ?? {});
        if (price) catalogue[part].push(stackModelOf(part, { provider, model: id, name: m.name }, price, soon));
    }
    // The rates file's models the gateway did not price (Deepgram, Cartesia, ElevenLabs, or all when it is unreachable).
    for (const part of Object.keys(catalogue) as VoiceStackPartName[]) {
        const have = new Set(catalogue[part].map((m) => m.model));
        const extra = FALLBACK_CATALOGUE[part].filter((m) => !have.has(m.model) && keyHas(part, m.provider, m.model));
        catalogue[part] = sortByPrice([...catalogue[part], ...extra]);
    }
    return catalogue;
}

/**
 * A stack as stored for an agent: each part one of the catalogue's models (not a coming-soon one), on one of
 * the owner's keys of its provider (`ownedStack`), with the model's price for the engine to bill on. Gemini
 * speech models need a paid-tier key.
 */
export async function pricedStack(
    stack: VoiceStack<string | null>,
    keys: VoiceProviderKeyDoc[],
    catalogue?: VoiceStackCatalogue,
): Promise<VoiceStack> {
    const models = catalogue ?? (await stackCatalogue(keys));
    const prices = new Map<VoiceStackPartName, VoiceStackPrice>();
    for (const { name, part } of stackParts(stack)) {
        const model: VoiceStackModel | undefined = models[name].find(
            (m) => m.model === part.model && m.provider === part.provider,
        );
        if (!model) throw new Error(`${part.model} is not one of the models you can pick`);
        if (model.soon) throw new Error(`${model.name} is coming soon: pick another model`);
        if (needsPaidKey(name, part.provider) && voiceKeyFor(keys, part)?.tier === 'free') {
            throw new Error(`${model.name} needs a paid-tier ${VOICE_KEY_PROVIDERS[part.provider].name} key`);
        }
        prices.set(name, model.price);
    }
    const owned = ownedStack(stack, keys);
    if (owned.kind === VoiceStackKind.REALTIME) return { ...owned, price: prices.get('realtime') };
    return {
        kind: owned.kind,
        stt: { ...owned.stt, price: prices.get('stt') },
        llm: { ...owned.llm, price: prices.get('llm') },
        tts: { ...owned.tts, price: prices.get('tts') },
    };
}
