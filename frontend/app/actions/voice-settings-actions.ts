'use server';

import {
    MongoObjectId,
    VOICE_AGENT_SUB_MODULES,
    VOICE_KEY_LIMITS,
    VoiceKeyProvider,
    VoiceKeyStatus,
    type VoiceGeminiKeyTier,
    type VoiceGeminiKeyView,
    type VoiceProviderKey,
    type VoiceProviderKeyDoc,
    type VoiceStackCatalogue,
} from '@aixellabs/backend/db';
import { ALApiResponse } from '@aixellabs/backend/api/types';
import { requireUserObjectId, runAuthenticatedAction, toObjectId } from '@/helpers/server-action-helpers';
import { parseOrThrow, voiceKeyInputSchema, type VoiceKeyInput } from '@/helpers/voice-schemas';
import { openSecret, sealSecret } from '@/server/voice-agent/engine';
import { loadGeminiKeyView, VoiceKeyError } from '@/server/voice-agent/gemini-key';
import { checkProviderKey, toProviderKeyView, toProviderKeyViews } from '@/server/voice-agent/provider-keys';
import type { VoiceOption } from '@/helpers/voice-catalogue';
import { agentVoices, stackCatalogue } from '@/server/voice-agent/voice-catalogue';
import { ensureVoiceAccount, voiceAccountsCollection } from '@/server/voice-agent/accounts';
import { requireVoiceOwner } from '@/server/voice-agent/owner-scope';

const SUB_MODULE = VOICE_AGENT_SUB_MODULES.SETTINGS;

/** Keys without the sealed keys (the other lists are not needed). */
const NO_SEALED = { 'keys.keySealed': 0, numbers: 0, calendars: 0 } as const;

function assertTier(tier: VoiceGeminiKeyTier): VoiceGeminiKeyTier {
    if (tier !== 'free' && tier !== 'paid') throw new Error('Pick the free tier or the paid tier');
    return tier;
}

/** The owner's key with `keyId`, sealed key included (server only), or a plain error. */
async function findOwnedKey(userId: MongoObjectId, keyId: string): Promise<VoiceProviderKeyDoc> {
    const id = toObjectId(keyId, 'Key ID');
    const accounts = await voiceAccountsCollection();
    const doc = await accounts.findOne({ userId, 'keys._id': id }, { projection: { 'keys.$': 1 } });
    const key = doc?.keys?.[0];
    if (!key) throw new Error('That key is not saved any more');
    return key;
}

/**
 * The Gemini key the signed-in user's agents run on, or one agent's when `agentId` is given (as the
 * key cards and notices show it, never the key itself).
 */
export const getGeminiKeyStatus = async (agentId?: string): Promise<ALApiResponse<VoiceGeminiKeyView>> =>
    runAuthenticatedAction(async function getGeminiKeyStatus(userId) {
        return loadGeminiKeyView(requireUserObjectId(userId), agentId ? toObjectId(agentId, 'Agent ID') : undefined);
    });

/** Every key the owner saved, oldest first. */
export const getVoiceKeys = async (): Promise<ALApiResponse<VoiceProviderKey[]>> =>
    runAuthenticatedAction(async function getVoiceKeys(userId) {
        const accounts = await voiceAccountsCollection();
        const doc = await accounts.findOne({ userId: requireUserObjectId(userId) }, { projection: NO_SEALED });
        return toProviderKeyViews(doc);
    });

/**
 * Checks a key with its provider (one free request), then stores it sealed after the owner's other
 * keys. A key the provider refuses is not stored. Returns every key.
 */
export const addVoiceKey = async (input: VoiceKeyInput): Promise<ALApiResponse<VoiceProviderKey[]>> =>
    runAuthenticatedAction(async function addVoiceKey(userId) {
        const owner = await requireVoiceOwner(userId, SUB_MODULE);
        const { provider, label, apiKey, tier } = parseOrThrow(voiceKeyInputSchema, input, 'Check the key');
        await checkProviderKey(provider, apiKey);

        const now = new Date();
        const key: VoiceProviderKeyDoc = {
            _id: new MongoObjectId(),
            provider,
            label: label || `Key ending ${apiKey.slice(-4)}`,
            keySealed: sealSecret(apiKey),
            last4: apiKey.slice(-4),
            status: VoiceKeyStatus.OK,
            statusMessage: null,
            checkedAt: now,
            savedAt: now,
            ...(provider === VoiceKeyProvider.GEMINI ? { tier: assertTier(tier) } : {}),
        };
        await ensureVoiceAccount(owner);
        const accounts = await voiceAccountsCollection();
        const doc = await accounts.findOneAndUpdate(
            { userId: owner.userId, [`keys.${VOICE_KEY_LIMITS.maxPerOwner - 1}`]: { $exists: false } },
            { $push: { keys: key }, $set: { updatedAt: now } },
            { returnDocument: 'after', projection: NO_SEALED },
        );
        if (!doc) throw new Error(`You can keep up to ${VOICE_KEY_LIMITS.maxPerOwner} keys. Remove one first.`);
        return toProviderKeyViews(doc);
    });

/**
 * Asks the provider about a stored key again (a free request), e.g. after turning the API on or
 * adding billing, and keeps what it says. The settings page also runs it every 10 minutes for each
 * key while it is open. Only a network failure is an error.
 */
export const recheckVoiceKey = async (keyId: string): Promise<ALApiResponse<VoiceProviderKey>> =>
    runAuthenticatedAction(async function recheckVoiceKey(userId) {
        const owner = await requireVoiceOwner(userId, SUB_MODULE);
        const key = await findOwnedKey(owner.userId, keyId);

        let status = VoiceKeyStatus.OK;
        let statusMessage: string | null = null;
        try {
            await checkProviderKey(key.provider, openSecret(key.keySealed));
        } catch (error) {
            if (!(error instanceof VoiceKeyError) || !error.status) throw error;
            status = error.status;
            statusMessage = error.message;
        }
        const checkedAt = new Date();
        const accounts = await voiceAccountsCollection();
        await accounts.updateOne(
            { userId: owner.userId, 'keys._id': key._id },
            { $set: { 'keys.$.status': status, 'keys.$.statusMessage': statusMessage, 'keys.$.checkedAt': checkedAt } },
        );
        return toProviderKeyView({ ...key, status, statusMessage, checkedAt });
    });

/** Records which Google tier a Gemini key is on (Google does not tell us; the owner does). */
export const setGeminiKeyTier = async (keyId: string, tier: VoiceGeminiKeyTier): Promise<ALApiResponse<VoiceProviderKey>> =>
    runAuthenticatedAction(async function setGeminiKeyTier(userId) {
        const owner = await requireVoiceOwner(userId, SUB_MODULE);
        assertTier(tier);
        const key = await findOwnedKey(owner.userId, keyId);
        if (key.provider !== VoiceKeyProvider.GEMINI) throw new Error('Only Gemini keys have a tier');
        const accounts = await voiceAccountsCollection();
        await accounts.updateOne(
            { userId: owner.userId, 'keys._id': key._id },
            { $set: { 'keys.$.tier': tier, updatedAt: new Date() } },
        );
        return toProviderKeyView({ ...key, tier });
    });

/** Makes a key its provider's default (the first of that provider): agents without their own key move to it. */
export const makeDefaultVoiceKey = async (keyId: string): Promise<ALApiResponse<VoiceProviderKey[]>> =>
    runAuthenticatedAction(async function makeDefaultVoiceKey(userId) {
        const owner = await requireVoiceOwner(userId, SUB_MODULE);
        const key = await findOwnedKey(owner.userId, keyId);
        const accounts = await voiceAccountsCollection();
        // One update (a pipeline), so the key is never out of the list: it first, then the rest in order.
        const doc = await accounts.findOneAndUpdate(
            { userId: owner.userId },
            [
                {
                    $set: {
                        keys: {
                            $concatArrays: [
                                { $filter: { input: '$keys', cond: { $eq: ['$$this._id', key._id] } } },
                                { $filter: { input: '$keys', cond: { $ne: ['$$this._id', key._id] } } },
                            ],
                        },
                        updatedAt: new Date(),
                    },
                },
            ],
            { returnDocument: 'after', projection: NO_SEALED },
        );
        return toProviderKeyViews(doc);
    });

/**
 * Forgets a key. Agents and stacks that pointed at it run on that provider's next key; with none left,
 * agents whose stack needs the provider stop taking and placing calls until a key is added again.
 */
export const removeVoiceKey = async (keyId: string): Promise<ALApiResponse<VoiceProviderKey[]>> =>
    runAuthenticatedAction(async function removeVoiceKey(userId) {
        const owner = await requireVoiceOwner(userId, SUB_MODULE);
        const id = toObjectId(keyId, 'Key ID');
        const accounts = await voiceAccountsCollection();
        const doc = await accounts.findOneAndUpdate(
            { userId: owner.userId },
            { $pull: { keys: { _id: id } }, $set: { updatedAt: new Date() } },
            { returnDocument: 'after', projection: NO_SEALED },
        );
        return toProviderKeyViews(doc);
    });

// ---------------------------------------------------------------------------
// What an agent's stack section offers
// ---------------------------------------------------------------------------

export type VoiceAgentStackOptions = {
    /** The owner's keys, oldest first (each provider's first is its default). */
    keys: VoiceProviderKey[];
    /** The models each part may use, cheapest first, with their prices. */
    catalogue: VoiceStackCatalogue;
    /** Every voice the picker offers, per provider. */
    voices: Record<VoiceKeyProvider, VoiceOption[]>;
};

/** The keys, models and voices an agent's stack can use, loaded with the page (the keys stay on the server). */
export const getAgentStackOptions = async (): Promise<ALApiResponse<VoiceAgentStackOptions>> =>
    runAuthenticatedAction(async function getAgentStackOptions(userId) {
        const owner = await requireVoiceOwner(userId, VOICE_AGENT_SUB_MODULES.AGENTS);
        const accounts = await voiceAccountsCollection();
        const doc = await accounts.findOne({ userId: owner.userId }, { projection: { keys: 1 } });
        const keys = doc?.keys ?? [];
        const [catalogue, voices] = await Promise.all([stackCatalogue(keys), agentVoices(keys)]);
        return { keys: toProviderKeyViews(doc), catalogue, voices };
    });
