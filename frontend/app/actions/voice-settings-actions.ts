'use server';

import {
    VOICE_AGENT_SUB_MODULES,
    VoiceGeminiKeyStatus,
    type VoiceGeminiKey,
    type VoiceGeminiKeyView,
} from '@aixellabs/backend/db';
import { ALApiResponse } from '@aixellabs/backend/api/types';
import { requireUserObjectId, runAuthenticatedAction } from '@/helpers/server-action-helpers';
import { openSecret, sealSecret } from '@/server/voice-agent/engine';
import {
    checkGeminiKey,
    GeminiKeyError,
    loadGeminiKeyView,
    toGeminiKeyView,
    voiceSettingsCollection,
} from '@/server/voice-agent/gemini-key';
import { ensureVoiceAgentIndexes } from '@/server/voice-agent/indexes';
import { requireVoiceOwner } from '@/server/voice-agent/owner-scope';

const SUB_MODULE = VOICE_AGENT_SUB_MODULES.AGENTS;

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

/** The signed-in user's key, as the card shows it (never the key itself). */
export const getGeminiKeyStatus = async (): Promise<ALApiResponse<VoiceGeminiKeyView>> =>
    runAuthenticatedAction(async function getGeminiKeyStatus(userId) {
        return loadGeminiKeyView(requireUserObjectId(userId));
    });

/**
 * Checks the key with Google (one free call), then stores it sealed, replacing any key before it.
 * A key Google refuses is not stored.
 */
export const saveGeminiKey = async (apiKey: string): Promise<ALApiResponse<VoiceGeminiKeyView>> =>
    runAuthenticatedAction(async function saveGeminiKey(userId) {
        const owner = await requireVoiceOwner(userId, SUB_MODULE);
        const key = assertKeyShape(apiKey);
        await checkGeminiKey(key);

        const now = new Date();
        const gemini: VoiceGeminiKey = {
            keySealed: sealSecret(key),
            last4: key.slice(-4),
            status: VoiceGeminiKeyStatus.OK,
            statusMessage: null,
            checkedAt: now,
            savedAt: now,
        };
        await ensureVoiceAgentIndexes();
        const settings = await voiceSettingsCollection();
        await settings.updateOne(
            { userId: owner.userId },
            { $set: { gemini, updatedAt: now }, $setOnInsert: { tenantId: owner.tenantId, createdAt: now } },
            { upsert: true },
        );
        return toGeminiKeyView({ gemini });
    });

/**
 * Asks Google about the stored key again, e.g. after turning the API on or adding billing, and
 * keeps what it says. Only a network failure is an error.
 */
export const recheckGeminiKey = async (): Promise<ALApiResponse<VoiceGeminiKeyView>> =>
    runAuthenticatedAction(async function recheckGeminiKey(userId) {
        const owner = await requireVoiceOwner(userId, SUB_MODULE);
        const settings = await voiceSettingsCollection();
        const doc = await settings.findOne({ userId: owner.userId });
        if (!doc?.gemini) throw new Error('No Gemini API key is saved');

        let status = VoiceGeminiKeyStatus.OK;
        let statusMessage: string | null = null;
        try {
            await checkGeminiKey(openSecret(doc.gemini.keySealed));
        } catch (error) {
            if (!(error instanceof GeminiKeyError) || !error.status) throw error;
            status = error.status;
            statusMessage = error.message;
        }
        const checkedAt = new Date();
        await settings.updateOne(
            { userId: owner.userId, 'gemini.keySealed': doc.gemini.keySealed },
            { $set: { 'gemini.status': status, 'gemini.statusMessage': statusMessage, 'gemini.checkedAt': checkedAt } },
        );
        return toGeminiKeyView({ gemini: { ...doc.gemini, status, statusMessage, checkedAt } });
    });

/** Forgets the key. The owner's agents stop taking and placing calls until a key is added again. */
export const removeGeminiKey = async (): Promise<ALApiResponse<VoiceGeminiKeyView>> =>
    runAuthenticatedAction(async function removeGeminiKey(userId) {
        const owner = await requireVoiceOwner(userId, SUB_MODULE);
        const settings = await voiceSettingsCollection();
        await settings.updateOne({ userId: owner.userId }, { $set: { gemini: null, updatedAt: new Date() } });
        return toGeminiKeyView(null);
    });
