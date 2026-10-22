'use server';

import {
    VOICE_AGENT_SUB_MODULES,
    VoiceKeyStatus,
    type VoiceAccountDoc,
    type VoiceGeminiKeyTier,
    type VoiceGeminiKeyView,
} from '@aixellabs/backend/db';
import { ALApiResponse } from '@aixellabs/backend/api/types';
import { requireUserObjectId, runAuthenticatedAction } from '@/helpers/server-action-helpers';
import { openSecret, sealSecret } from '@/server/voice-agent/engine';
import { checkGeminiKey, GeminiKeyError, loadGeminiKeyView, toGeminiKeyView } from '@/server/voice-agent/gemini-key';
import { voiceAccountsCollection } from '@/server/voice-agent/accounts';
import { requireVoiceOwner } from '@/server/voice-agent/owner-scope';

const SUB_MODULE = VOICE_AGENT_SUB_MODULES.SETTINGS;

function assertKeyShape(apiKey: string): string {
    const key = typeof apiKey === 'string' ? apiKey.trim() : '';
    if (!key) throw new Error('Paste your Gemini API key');
    if (key.length < 20 || key.length > 200 || /\s/.test(key)) {
        throw new Error(
            'That does not look like a Gemini API key. Copy it from aistudio.google.com/apikey (it starts with AIza).',
        );
    }
    return key;
}

function assertTier(tier: VoiceGeminiKeyTier): VoiceGeminiKeyTier {
    if (tier !== 'free' && tier !== 'paid') throw new Error('Pick the free tier or the paid tier');
    return tier;
}

/** The signed-in user's key, as the card shows it (never the key itself). */
export const getGeminiKeyStatus = async (): Promise<ALApiResponse<VoiceGeminiKeyView>> =>
    runAuthenticatedAction(async function getGeminiKeyStatus(userId) {
        return loadGeminiKeyView(requireUserObjectId(userId));
    });

/**
 * Checks the key with Google (one free call), then stores it sealed with the tier the owner says it
 * is on, replacing any key before it. A key Google refuses is not stored.
 */
export const saveGeminiKey = async (apiKey: string, tier: VoiceGeminiKeyTier): Promise<ALApiResponse<VoiceGeminiKeyView>> =>
    runAuthenticatedAction(async function saveGeminiKey(userId) {
        const owner = await requireVoiceOwner(userId, SUB_MODULE);
        const key = assertKeyShape(apiKey);
        assertTier(tier);
        await checkGeminiKey(key);

        const now = new Date();
        const gemini: NonNullable<VoiceAccountDoc['gemini']> = {
            keySealed: sealSecret(key),
            last4: key.slice(-4),
            status: VoiceKeyStatus.OK,
            statusMessage: null,
            checkedAt: now,
            savedAt: now,
            tier,
        };
        const accounts = await voiceAccountsCollection();
        await accounts.updateOne(
            { userId: owner.userId },
            { $set: { gemini, updatedAt: now }, $setOnInsert: { tenantId: owner.tenantId, createdAt: now } },
            { upsert: true },
        );
        return toGeminiKeyView({ gemini });
    });

/**
 * Asks Google about the stored key again (the free list-models call), e.g. after turning the API on
 * or adding billing, and keeps what it says. The key card also runs it every 10 minutes while the
 * settings page is open. Only a network failure is an error.
 */
export const recheckGeminiKey = async (): Promise<ALApiResponse<VoiceGeminiKeyView>> =>
    runAuthenticatedAction(async function recheckGeminiKey(userId) {
        const owner = await requireVoiceOwner(userId, SUB_MODULE);
        const accounts = await voiceAccountsCollection();
        const doc = await accounts.findOne({ userId: owner.userId });
        if (!doc?.gemini) throw new Error('No Gemini API key is saved');

        let status = VoiceKeyStatus.OK;
        let statusMessage: string | null = null;
        try {
            await checkGeminiKey(openSecret(doc.gemini.keySealed));
        } catch (error) {
            if (!(error instanceof GeminiKeyError) || !error.status) throw error;
            status = error.status;
            statusMessage = error.message;
        }
        const checkedAt = new Date();
        await accounts.updateOne(
            { userId: owner.userId, 'gemini.keySealed': doc.gemini.keySealed },
            { $set: { 'gemini.status': status, 'gemini.statusMessage': statusMessage, 'gemini.checkedAt': checkedAt } },
        );
        return toGeminiKeyView({ gemini: { ...doc.gemini, status, statusMessage, checkedAt } });
    });

/** Records which Google tier the saved key is on (Google does not tell us; the owner does). */
export const setGeminiKeyTier = async (tier: VoiceGeminiKeyTier): Promise<ALApiResponse<VoiceGeminiKeyView>> =>
    runAuthenticatedAction(async function setGeminiKeyTier(userId) {
        const owner = await requireVoiceOwner(userId, SUB_MODULE);
        assertTier(tier);
        const accounts = await voiceAccountsCollection();
        const doc = await accounts.findOneAndUpdate(
            { userId: owner.userId, gemini: { $type: 'object' } },
            { $set: { 'gemini.tier': tier, updatedAt: new Date() } },
            { returnDocument: 'after', projection: { 'gemini.keySealed': 0 } },
        );
        if (!doc) throw new Error('No Gemini API key is saved');
        return toGeminiKeyView(doc);
    });

/** Forgets the key. The owner's agents stop taking and placing calls until a key is added again. */
export const removeGeminiKey = async (): Promise<ALApiResponse<VoiceGeminiKeyView>> =>
    runAuthenticatedAction(async function removeGeminiKey(userId) {
        const owner = await requireVoiceOwner(userId, SUB_MODULE);
        const accounts = await voiceAccountsCollection();
        await accounts.updateOne({ userId: owner.userId }, { $set: { gemini: null, updatedAt: new Date() } });
        return toGeminiKeyView(null);
    });
