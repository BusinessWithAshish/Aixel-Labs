import 'server-only';

import {
    getCollection,
    MongoCollections,
    voiceKeyFor,
    VoiceKeyProvider,
    VoiceKeyStatus,
    VoiceStackKind,
    voiceStackFor,
    type MongoObjectId,
    type VoiceAccountDoc,
    type VoiceAgentDoc,
    type VoiceGeminiKeyView,
} from '@aixellabs/backend/db';
import { NO_SEALED, voiceAccountsCollection } from '@/server/voice-agent/accounts';

/**
 * Each owner runs their agents on their own Gemini API keys (`VoiceAccountDoc.keys`, sealed); an agent
 * runs on its stack's key, else the owner's default (`voiceKeyFor`). This module and the engine's
 * `product.gemini_key_for` are the only places that decide which key a call uses; a later "use Aixel
 * Labs credits" option would be chosen here.
 *
 * `GEMINI_API_BASE` points the key check at a fake in tests (default: Google's API).
 */

export const GEMINI_KEY_MISSING_MESSAGE =
    'Add your Gemini API key first, under Voice agent > Settings. Your agents run on your own key.';

const CHECK_TIMEOUT_MS = 10_000;

export function geminiApiBase(): string {
    return (process.env.GEMINI_API_BASE || 'https://generativelanguage.googleapis.com').replace(/\/$/, '');
}

/** A provider's refusal of a key, in plain words, with the status it means for the key. */
export class VoiceKeyError extends Error {
    constructor(
        message: string,
        readonly status: VoiceKeyStatus | null,
    ) {
        super(message);
    }
}

type GoogleError = { error?: { message?: string; status?: string; details?: { reason?: string }[] } };

function refusal(httpStatus: number, body: GoogleError): VoiceKeyError {
    const message = body.error?.message ?? '';
    const reasons = (body.error?.details ?? []).map((d) => d.reason ?? '');
    if (reasons.includes('API_KEY_EXPIRED') || /expired/i.test(message)) {
        return new VoiceKeyError(
            'This API key has expired. Create a new one in Google AI Studio (aistudio.google.com/apikey).',
            VoiceKeyStatus.INVALID,
        );
    }
    if (httpStatus === 400 || reasons.includes('API_KEY_INVALID')) {
        return new VoiceKeyError(
            'Google says this is not a valid API key. Copy it again from Google AI Studio (aistudio.google.com/apikey).',
            VoiceKeyStatus.INVALID,
        );
    }
    if (reasons.includes('SERVICE_DISABLED') || /has not been used in project|is disabled/i.test(message)) {
        return new VoiceKeyError(
            'The Gemini API is turned off for the Google Cloud project this key belongs to. Turn on the "Generative Language API" for that project, or create the key in Google AI Studio, which turns it on for you.',
            VoiceKeyStatus.API_DISABLED,
        );
    }
    if (httpStatus === 403) {
        return new VoiceKeyError(
            'This key is not allowed to use the Gemini API (its API restrictions block it). Allow the "Generative Language API" on the key in Google Cloud, or create a new key in Google AI Studio.',
            VoiceKeyStatus.API_DISABLED,
        );
    }
    if (httpStatus === 429) {
        return new VoiceKeyError(
            'Google says this key is out of quota right now. Check the plan and billing of its project in Google AI Studio, or try again later.',
            VoiceKeyStatus.QUOTA,
        );
    }
    return new VoiceKeyError(`Google could not check the key right now (HTTP ${httpStatus}). Try again in a minute.`, null);
}

/**
 * Checks a key with one free metadata call (list models): no tokens, so it never uses the owner's
 * Gemini quota or bill, which is why the key card can repeat it every few minutes. Resolves when Google accepts it; throws a
 * `VoiceKeyError` with plain words otherwise. A network failure has no key status (`null`).
 */
export async function checkGeminiKey(key: string): Promise<void> {
    let res: Response;
    try {
        res = await fetch(`${geminiApiBase()}/v1beta/models?pageSize=1`, {
            headers: { 'x-goog-api-key': key },
            cache: 'no-store',
            signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
        });
    } catch {
        throw new VoiceKeyError('Could not reach Google to check the key. Try again in a minute.', null);
    }
    if (res.ok) return;
    const body = (await res.json().catch(() => ({}))) as GoogleError;
    throw refusal(res.status, body);
}

/** The view when no key is saved (also what a page shows if the status could not be read). */
export const NO_GEMINI_KEY: VoiceGeminiKeyView = {
    set: false,
    id: null,
    label: null,
    last4: null,
    status: null,
    statusMessage: null,
    checkedAt: null,
    tier: null,
};

/** The Gemini key a stack runs on (`voiceKeyFor`): the agent's stack when given, else the owner's default Gemini key. */
export function toGeminiKeyView(
    account: Pick<VoiceAccountDoc, 'keys'> | null,
    agent?: Pick<VoiceAgentDoc, 'stack'> | null,
): VoiceGeminiKeyView {
    const stack = voiceStackFor(agent);
    const part = stack.kind === VoiceStackKind.REALTIME ? stack : stack.llm;
    const key = voiceKeyFor(account?.keys, {
        provider: VoiceKeyProvider.GEMINI,
        keyId: part.provider === VoiceKeyProvider.GEMINI ? part.keyId : null,
    });
    if (!key) return NO_GEMINI_KEY;
    return {
        set: true,
        id: key._id.toString(),
        label: key.label,
        last4: key.last4,
        status: key.status,
        statusMessage: key.statusMessage ?? null,
        checkedAt: key.checkedAt.toISOString(),
        tier: key.tier ?? 'paid',
    };
}

/** What the Gemini key the owner's agents (or one agent) run on looks like to the UI (never the key). */
export async function loadGeminiKeyView(userId: MongoObjectId, agentId?: MongoObjectId): Promise<VoiceGeminiKeyView> {
    const accounts = await voiceAccountsCollection();
    const [doc, agent] = await Promise.all([
        accounts.findOne({ userId }, { projection: NO_SEALED }),
        agentId
            ? getCollection<VoiceAgentDoc>(MongoCollections.VOICE_AGENTS).then((agents) =>
                  agents.findOne({ _id: agentId, userId }, { projection: { stack: 1 } }),
              )
            : null,
    ]);
    return toGeminiKeyView(doc, agent);
}

/** Throws a plain message when the owner has no Gemini key: nothing that runs a call may start without one. */
export async function assertGeminiKeySet(userId: MongoObjectId): Promise<void> {
    const accounts = await voiceAccountsCollection();
    const has = await accounts.countDocuments({ userId, 'keys.provider': VoiceKeyProvider.GEMINI }, { limit: 1 });
    if (!has) throw new Error(GEMINI_KEY_MISSING_MESSAGE);
}
