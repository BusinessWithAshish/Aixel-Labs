import 'server-only';

import {
    VoiceKeyProvider,
    VoiceKeyStatus,
    VoiceStackKind,
    type VoiceAccountDoc,
    type VoiceStack,
    type VoiceStackPart,
    type VoiceProviderKey,
    type VoiceProviderKeyDoc,
} from '@aixellabs/backend/db';
import { VOICE_KEY_PROVIDERS } from '@/helpers/voice-stack';
import { checkGeminiKey, VoiceKeyError } from '@/server/voice-agent/gemini-key';

/**
 * The owner's provider keys (`VoiceAccountDoc.keys`): checking a key with its provider before it is
 * stored, and the client view. Which key a call runs on is `voiceKeyFor` (backend/src/db/types.ts).
 *
 * `VOICE_PROVIDER_API_BASE` points the non-Gemini requests (key checks, voice lists) at a fake in tests
 * (`{base}/{provider}{path}`); Gemini's check keeps its own `GEMINI_API_BASE`.
 */

const CHECK_TIMEOUT_MS = 10_000;

/** One free, read-only request per provider that only a working key gets a 2xx for. */
const KEY_CHECKS: Record<
    Exclude<VoiceKeyProvider, VoiceKeyProvider.GEMINI>,
    { url: string; headers: (key: string) => HeadersInit }
> = {
    [VoiceKeyProvider.OPENAI]: {
        url: 'https://api.openai.com/v1/models',
        headers: (key) => ({ Authorization: `Bearer ${key}` }),
    },
    [VoiceKeyProvider.DEEPGRAM]: {
        url: 'https://api.deepgram.com/v1/projects',
        headers: (key) => ({ Authorization: `Token ${key}` }),
    },
    [VoiceKeyProvider.CARTESIA]: {
        url: 'https://api.cartesia.ai/voices?limit=1',
        headers: (key) => ({ Authorization: `Bearer ${key}`, 'Cartesia-Version': '2026-08-14' }),
    },
    [VoiceKeyProvider.ELEVENLABS]: {
        url: 'https://api.elevenlabs.io/v1/user',
        headers: (key) => ({ 'xi-api-key': key }),
    },
};

/** A provider API URL, moved onto `VOICE_PROVIDER_API_BASE` when set (tests). */
export function providerApiUrl(provider: VoiceKeyProvider, url: string): string {
    const base = process.env.VOICE_PROVIDER_API_BASE?.replace(/\/$/, '');
    if (!base) return url;
    const { pathname, search } = new URL(url);
    return `${base}/${provider}${pathname}${search}`;
}

/**
 * Asks the provider whether it accepts `key`, with a request that costs nothing. Resolves when it
 * does; throws a `VoiceKeyError` with plain words and
 * the status it means otherwise. A network failure has no status (`null`).
 */
export async function checkProviderKey(provider: VoiceKeyProvider, key: string): Promise<void> {
    if (provider === VoiceKeyProvider.GEMINI) return checkGeminiKey(key);
    const { name } = VOICE_KEY_PROVIDERS[provider];
    let res: Response;
    try {
        res = await fetch(providerApiUrl(provider, KEY_CHECKS[provider].url), {
            headers: KEY_CHECKS[provider].headers(key),
            cache: 'no-store',
            signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
        });
    } catch {
        throw new VoiceKeyError(`Could not reach ${name} to check the key. Try again in a minute.`, null);
    }
    if (res.ok) return;
    if (res.status === 401) {
        throw new VoiceKeyError(
            `${name} says this is not a valid API key. Copy it again from your ${name} account.`,
            VoiceKeyStatus.INVALID,
        );
    }
    if (res.status === 403) {
        throw new VoiceKeyError(
            `${name} accepts this key but does not let it do this. Give the key full access, or create a new one.`,
            VoiceKeyStatus.API_DISABLED,
        );
    }
    if (res.status === 402 || res.status === 429) {
        throw new VoiceKeyError(
            `${name} says this key is out of credit or quota. Check the plan and billing of your ${name} account.`,
            VoiceKeyStatus.QUOTA,
        );
    }
    throw new VoiceKeyError(`${name} could not check the key right now (HTTP ${res.status}). Try again in a minute.`, null);
}

export function toProviderKeyView(key: Omit<VoiceProviderKeyDoc, 'keySealed'>): VoiceProviderKey {
    return {
        _id: key._id.toString(),
        provider: key.provider,
        label: key.label,
        last4: key.last4,
        status: key.status,
        statusMessage: key.statusMessage ?? null,
        checkedAt: key.checkedAt.toISOString(),
        savedAt: key.savedAt.toISOString(),
        ...(key.provider === VoiceKeyProvider.GEMINI ? { tier: key.tier ?? 'paid' } : {}),
    };
}

/** The owner's keys as the settings page lists them: oldest first, so each provider's first is its default. */
export function toProviderKeyViews(doc: Pick<VoiceAccountDoc, 'keys'> | null): VoiceProviderKey[] {
    return (doc?.keys ?? []).map(toProviderKeyView);
}

/** A stack as stored: its `keyId`s as ObjectIds, each one checked to be the owner's key of that part's provider. */
export function ownedStack(
    stack: VoiceStack<string | null>,
    keys: Pick<VoiceProviderKeyDoc, '_id' | 'provider'>[],
): VoiceStack {
    const part = <P extends VoiceStackPart<string | null>>({ keyId, ...rest }: P) => {
        if (!keyId) return { ...rest, keyId: null };
        const key = keys.find((k) => k._id.toString() === keyId && k.provider === rest.provider);
        if (!key) throw new Error(`Pick one of your ${VOICE_KEY_PROVIDERS[rest.provider].name} keys`);
        return { ...rest, keyId: key._id };
    };
    if (stack.kind === VoiceStackKind.REALTIME) return { ...part(stack), kind: stack.kind };
    return { kind: stack.kind, stt: part(stack.stt), llm: part(stack.llm), tts: part(stack.tts) };
}

/** A stored stack for the client: ids as strings. */
export function stackView(stack: VoiceStack): VoiceStack<string> {
    const part = ({ keyId, ...rest }: VoiceStackPart) => ({ ...rest, keyId: keyId ? keyId.toString() : null });
    if (stack.kind === VoiceStackKind.REALTIME) return { ...part(stack), kind: stack.kind };
    return { kind: stack.kind, stt: part(stack.stt), llm: part(stack.llm), tts: part(stack.tts) };
}
