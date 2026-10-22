'use server';

import {
    getCollection,
    MongoCollections,
    MongoObjectId,
    VOICE_AGENT_SUB_MODULES,
    VOICE_KEY_LIMITS,
    VoiceKeyProvider,
    VoiceKeyStatus,
    VoiceStackKind,
    voiceStackFor,
    type VoiceAgentDoc,
    type VoiceGeminiKeyTier,
    type VoiceGeminiKeyView,
    type VoiceProviderKey,
    type VoiceProviderKeyDoc,
    type VoiceStack,
} from '@aixellabs/backend/db';
import { ALApiResponse } from '@aixellabs/backend/api/types';
import { requireUserObjectId, runAuthenticatedAction, toObjectId } from '@/helpers/server-action-helpers';
import { parseOrThrow, voiceKeyInputSchema, voiceStackSchema, type VoiceKeyInput } from '@/helpers/voice-schemas';
import { openSecret, sealSecret } from '@/server/voice-agent/engine';
import { loadGeminiKeyView, VoiceKeyError } from '@/server/voice-agent/gemini-key';
import {
    checkProviderKey,
    ownedStack,
    stackView,
    toProviderKeyView,
    toProviderKeyViews,
} from '@/server/voice-agent/provider-keys';
import type { VoiceOption } from '@/helpers/voice-catalogue';
import { ownVoices } from '@/server/voice-agent/voice-catalogue';
import { ensureVoiceAccount, voiceAccountsCollection } from '@/server/voice-agent/accounts';
import { requireVoiceOwner } from '@/server/voice-agent/owner-scope';

const SUB_MODULE = VOICE_AGENT_SUB_MODULES.SETTINGS;

/** Keys and stack without the sealed keys (the other lists are not needed). */
const NO_SEALED = { 'keys.keySealed': 0, numbers: 0, calendars: 0 } as const;

export type VoiceStackSettings = {
    keys: VoiceProviderKey[];
    /** Null = never picked: VOICE_DEFAULT_STACK. */
    stack: VoiceStack<string> | null;
};

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

/** Every key the owner saved and the stack their agents run on. */
export const getVoiceStackSettings = async (): Promise<ALApiResponse<VoiceStackSettings>> =>
    runAuthenticatedAction(async function getVoiceStackSettings(userId) {
        const accounts = await voiceAccountsCollection();
        const doc = await accounts.findOne({ userId: requireUserObjectId(userId) }, { projection: NO_SEALED });
        return { keys: toProviderKeyViews(doc), stack: doc?.stack ? stackView(doc.stack) : null };
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

/** Saves the stack the owner's agents run on (agents with their own stack keep it). */
export const saveVoiceStack = async (input: unknown): Promise<ALApiResponse<VoiceStack<string>>> =>
    runAuthenticatedAction(async function saveVoiceStack(userId) {
        const owner = await requireVoiceOwner(userId, SUB_MODULE);
        const parsed = parseOrThrow(voiceStackSchema, input, 'Check the stack');
        await ensureVoiceAccount(owner);
        const accounts = await voiceAccountsCollection();
        const doc = await accounts.findOne({ userId: owner.userId }, { projection: NO_SEALED });
        const stack = ownedStack(parsed, doc?.keys ?? []);
        await accounts.updateOne({ userId: owner.userId }, { $set: { stack, updatedAt: new Date() } });
        return stackView(stack);
    });

// ---------------------------------------------------------------------------
// One agent's stack and key, and the voices it may speak in
// ---------------------------------------------------------------------------

export type VoiceAgentStackChoice = {
    /** The agent's own stack; null = it runs on the owner's. */
    own: VoiceStack<string> | null;
    /** What its calls run on (`voiceStackFor`). */
    stack: VoiceStack<string>;
    /** The owner's Gemini keys, default first. */
    geminiKeys: VoiceProviderKey[];
};

async function agentStackChoice(userId: MongoObjectId, agentId?: string) {
    const accounts = await voiceAccountsCollection();
    const agents = await getCollection<VoiceAgentDoc>(MongoCollections.VOICE_AGENTS);
    const [doc, agent] = await Promise.all([
        accounts.findOne({ userId }, { projection: NO_SEALED }),
        agentId ? agents.findOne({ _id: toObjectId(agentId, 'Agent ID'), userId }, { projection: { stack: 1 } }) : null,
    ]);
    if (agentId && !agent) throw new Error('Agent not found');
    const view: VoiceAgentStackChoice = {
        own: agent?.stack ? stackView(agent.stack) : null,
        stack: stackView(voiceStackFor(agent, doc)),
        geminiKeys: toProviderKeyViews(doc).filter((key) => key.provider === VoiceKeyProvider.GEMINI),
    };
    return { doc, agent, view };
}

/** The stack an agent runs on (or, with no `agentId`, a new agent would), and the Gemini keys it may pick. */
export const getAgentStack = async (agentId?: string): Promise<ALApiResponse<VoiceAgentStackChoice>> =>
    runAuthenticatedAction(async function getAgentStack(userId) {
        const owner = await requireVoiceOwner(userId, VOICE_AGENT_SUB_MODULES.AGENTS);
        return (await agentStackChoice(owner.userId, agentId)).view;
    });

/**
 * Picks the Gemini key one agent runs on (null = the owner's default). The agent gets its own stack:
 * the one it runs on now, with that key.
 */
export const setAgentGeminiKey = async (
    agentId: string,
    keyId: string | null,
): Promise<ALApiResponse<VoiceAgentStackChoice>> =>
    runAuthenticatedAction(async function setAgentGeminiKey(userId) {
        const owner = await requireVoiceOwner(userId, VOICE_AGENT_SUB_MODULES.AGENTS);
        const { doc, agent } = await agentStackChoice(owner.userId, agentId);
        const current = stackView(voiceStackFor(agent, doc));
        const gemini = { keyId };
        const next: VoiceStack<string | null> =
            current.kind === VoiceStackKind.REALTIME
                ? { ...current, ...gemini }
                : current.llm.provider === VoiceKeyProvider.GEMINI
                  ? { ...current, llm: { ...current.llm, ...gemini } }
                  : current;
        if (next === current) throw new Error('This agent does not run on Gemini');
        const agents = await getCollection<VoiceAgentDoc>(MongoCollections.VOICE_AGENTS);
        await agents.updateOne(
            { _id: agent!._id, userId: owner.userId },
            { $set: { stack: ownedStack(next, doc?.keys ?? []), updatedAt: new Date() } },
        );
        return (await agentStackChoice(owner.userId, agentId)).view;
    });

/** Puts an agent back on the owner's stack and keys. */
export const clearAgentStack = async (agentId: string): Promise<ALApiResponse<VoiceAgentStackChoice>> =>
    runAuthenticatedAction(async function clearAgentStack(userId) {
        const owner = await requireVoiceOwner(userId, VOICE_AGENT_SUB_MODULES.AGENTS);
        const agents = await getCollection<VoiceAgentDoc>(MongoCollections.VOICE_AGENTS);
        await agents.updateOne(
            { _id: toObjectId(agentId, 'Agent ID'), userId: owner.userId },
            { $set: { stack: null, updatedAt: new Date() } },
        );
        return (await agentStackChoice(owner.userId, agentId)).view;
    });

/** The voices in the owner's own Cartesia and ElevenLabs accounts, on top of the picker's built-in ones. */
export const getVoiceCatalogue = async (): Promise<ALApiResponse<Partial<Record<VoiceKeyProvider, VoiceOption[]>>>> =>
    runAuthenticatedAction(async function getVoiceCatalogue(userId) {
        const owner = await requireVoiceOwner(userId, VOICE_AGENT_SUB_MODULES.AGENTS);
        const accounts = await voiceAccountsCollection();
        const doc = await accounts.findOne({ userId: owner.userId }, { projection: { keys: 1 } });
        return ownVoices(doc?.keys ?? []);
    });
