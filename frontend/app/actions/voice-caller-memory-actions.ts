'use server';

import {
    getCollection,
    MongoCollections,
    VOICE_AGENT_SUB_MODULES,
    type VoiceCallDoc,
    type VoiceCallerMemory,
    type VoiceCallerMemoryDoc,
} from '@aixellabs/backend/db';
import { ALApiResponse } from '@aixellabs/backend/api/types';
import {
    assertValidObjectId,
    requireUserObjectId,
    runAuthenticatedAction,
    toObjectId,
} from '@/helpers/server-action-helpers';
import { memoryPhoneOf } from '@/helpers/voice-agent-features';
import { ensureVoiceAgentIndexes } from '@/server/voice-agent/indexes';
import { requireVoiceOwner } from '@/server/voice-agent/owner-scope';

/**
 * Caller memory: what an agent remembers about each number it talked with (`voice_caller_memories`,
 * written by the engine's analysis pass after each call, read at the start of the next one).
 * Owners can see it and forget a caller, or everyone, at any time.
 */

/** An agent's remembered callers shown in the editor, most recent first. */
const LIST_LIMIT = 50;

function mapMemory(doc: VoiceCallerMemoryDoc): VoiceCallerMemory {
    return {
        _id: doc._id?.toString(),
        tenantId: doc.tenantId.toString(),
        userId: doc.userId.toString(),
        agentId: doc.agentId.toString(),
        phone: doc.phone,
        brief: doc.brief,
        lastCallId: doc.lastCallId.toString(),
        lastCallAt: doc.lastCallAt.toISOString(),
        calls: doc.calls ?? 1,
        createdAt: doc.createdAt.toISOString(),
        updatedAt: doc.updatedAt.toISOString(),
    };
}

async function memoriesCollection() {
    await ensureVoiceAgentIndexes();
    return getCollection<VoiceCallerMemoryDoc>(MongoCollections.VOICE_CALLER_MEMORIES);
}

export type VoiceCallerMemoryList = { memories: VoiceCallerMemory[]; total: number };

/** The callers one of the user's agents remembers (the latest 50, and how many in all). */
export const listVoiceCallerMemories = async (agentId: string): Promise<ALApiResponse<VoiceCallerMemoryList>> =>
    runAuthenticatedAction(async function listVoiceCallerMemories(userId) {
        const uid = requireUserObjectId(userId);
        const filter = { userId: uid, agentId: toObjectId(agentId, 'Agent ID') };
        const memories = await memoriesCollection();
        const [docs, total] = await Promise.all([
            memories.find(filter).sort({ lastCallAt: -1 }).limit(LIST_LIMIT).toArray(),
            memories.countDocuments(filter),
        ]);
        return { memories: docs.map(mapMemory), total };
    });

/** What the call's agent remembers now about the call's other party, or null. */
export const getCallerMemoryForCall = async (callId: string): Promise<ALApiResponse<VoiceCallerMemory | null>> => {
    assertValidObjectId(callId, 'Call ID');

    return runAuthenticatedAction(async function getCallerMemoryForCall(userId) {
        const owner = await requireVoiceOwner(userId, VOICE_AGENT_SUB_MODULES.CALL_LOGS);
        const calls = await getCollection<VoiceCallDoc>(MongoCollections.VOICE_CALLS);
        const call = await calls.findOne(
            { _id: toObjectId(callId, 'Call ID'), userId: owner.userId },
            { projection: { agentId: 1, direction: 1, from: 1, to: 1 } },
        );
        if (!call) throw new Error('Call not found');
        const phone = memoryPhoneOf(call);
        if (!phone) return null;
        const memories = await memoriesCollection();
        const doc = await memories.findOne({ userId: owner.userId, agentId: call.agentId, phone });
        return doc ? mapMemory(doc) : null;
    });
};

/** Forgets one caller: the agent starts their next call knowing nothing about them. */
export const forgetVoiceCallerMemory = async (memoryId: string): Promise<ALApiResponse<{ id: string }>> => {
    assertValidObjectId(memoryId, 'Memory ID');

    return runAuthenticatedAction(async function forgetVoiceCallerMemory(userId) {
        const uid = requireUserObjectId(userId);
        const memories = await memoriesCollection();
        const { deletedCount } = await memories.deleteOne({ _id: toObjectId(memoryId, 'Memory ID'), userId: uid });
        if (deletedCount === 0) throw new Error('That caller was already forgotten');
        return { id: memoryId };
    });
};

/** Forgets every caller one of the user's agents remembers. */
export const forgetAllVoiceCallerMemories = async (agentId: string): Promise<ALApiResponse<{ deleted: number }>> =>
    runAuthenticatedAction(async function forgetAllVoiceCallerMemories(userId) {
        const uid = requireUserObjectId(userId);
        const memories = await memoriesCollection();
        const { deletedCount } = await memories.deleteMany({ userId: uid, agentId: toObjectId(agentId, 'Agent ID') });
        return { deleted: deletedCount };
    });
