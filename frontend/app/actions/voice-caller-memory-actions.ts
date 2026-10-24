'use server';

import {
    getCollection,
    MongoCollections,
    VOICE_AGENT_SUB_MODULES,
    type VoiceCallDoc,
    type VoiceCallerMemory,
    type MongoObjectId,
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
 * Caller memory: what an agent remembers about each number it talked with. The engine's analysis
 * pass writes it after each call onto that call (`voice_calls.memory`, keyed by the call's agent and
 * `callerPhone`, the latest one `current`) and reads the current one at the start of the next call.
 * Owners can see it and forget a caller, or everyone, at any time: forgetting removes it from
 * every call with that caller.
 */

/** An agent's remembered callers shown in the editor, most recent first. */
const LIST_LIMIT = 50;

type MemoryCall = VoiceCallDoc & { _id: MongoObjectId; memory: NonNullable<VoiceCallDoc['memory']> };

function mapMemory(doc: MemoryCall): VoiceCallerMemory {
    return {
        _id: doc._id.toString(),
        tenantId: doc.tenantId.toString(),
        userId: doc.userId.toString(),
        agentId: doc.agentId.toString(),
        phone: doc.callerPhone ?? '',
        brief: doc.memory.brief,
        lastCallId: doc._id.toString(),
        lastCallAt: doc.startedAt.toISOString(),
        calls: doc.memory.calls ?? 1,
        createdAt: (doc.memory.since ?? doc.startedAt).toISOString(),
        updatedAt: doc.endedAt.toISOString(),
    };
}

async function callsCollection() {
    await ensureVoiceAgentIndexes();
    return getCollection<VoiceCallDoc>(MongoCollections.VOICE_CALLS);
}

const CURRENT = { 'memory.current': true } as const;

export type VoiceCallerMemoryList = { memories: VoiceCallerMemory[]; total: number };

/** The callers one of the user's agents remembers (the latest 50, and how many in all). */
export const listVoiceCallerMemories = async (agentId: string): Promise<ALApiResponse<VoiceCallerMemoryList>> =>
    runAuthenticatedAction(async function listVoiceCallerMemories(userId) {
        const uid = requireUserObjectId(userId);
        const filter = { userId: uid, agentId: toObjectId(agentId, 'Agent ID'), ...CURRENT };
        const calls = await callsCollection();
        const [docs, total] = await Promise.all([
            calls.find(filter).sort({ startedAt: -1 }).limit(LIST_LIMIT).toArray(),
            calls.countDocuments(filter),
        ]);
        return { memories: (docs as MemoryCall[]).map(mapMemory), total };
    });

/** What the call's agent remembers now about the call's other party, or null. */
export const getCallerMemoryForCall = async (callId: string): Promise<ALApiResponse<VoiceCallerMemory | null>> => {
    assertValidObjectId(callId, 'Call ID');

    return runAuthenticatedAction(async function getCallerMemoryForCall(userId) {
        const owner = await requireVoiceOwner(userId, VOICE_AGENT_SUB_MODULES.CALL_LOGS);
        const calls = await callsCollection();
        const call = await calls.findOne(
            { _id: toObjectId(callId, 'Call ID'), userId: owner.userId },
            { projection: { agentId: 1, direction: 1, from: 1, to: 1, callerPhone: 1, test: 1 } },
        );
        if (!call) throw new Error('Call not found');
        // A test over the internet has no caller to remember (older docs may still carry digits from a SIP address).
        const phone = call.test ? null : (call.callerPhone ?? memoryPhoneOf(call));
        if (!phone) return null;
        const doc = await calls.findOne({ userId: owner.userId, agentId: call.agentId, callerPhone: phone, ...CURRENT });
        return doc ? mapMemory(doc as MemoryCall) : null;
    });
};

/** Forgets one caller (`memoryId`: the call their memory is on): the agent starts their next call knowing nothing about them. */
export const forgetVoiceCallerMemory = async (memoryId: string): Promise<ALApiResponse<{ id: string }>> => {
    assertValidObjectId(memoryId, 'Memory ID');

    return runAuthenticatedAction(async function forgetVoiceCallerMemory(userId) {
        const uid = requireUserObjectId(userId);
        const calls = await callsCollection();
        const doc = await calls.findOne({ _id: toObjectId(memoryId, 'Memory ID'), userId: uid, ...CURRENT });
        if (!doc) throw new Error('That caller was already forgotten');
        await calls.updateMany(
            { userId: uid, agentId: doc.agentId, callerPhone: doc.callerPhone, memory: { $exists: true } },
            { $unset: { memory: '' } },
        );
        return { id: memoryId };
    });
};

/** Forgets every caller one of the user's agents remembers. */
export const forgetAllVoiceCallerMemories = async (agentId: string): Promise<ALApiResponse<{ deleted: number }>> =>
    runAuthenticatedAction(async function forgetAllVoiceCallerMemories(userId) {
        const uid = requireUserObjectId(userId);
        const agent = toObjectId(agentId, 'Agent ID');
        const calls = await callsCollection();
        const deleted = await calls.countDocuments({ userId: uid, agentId: agent, ...CURRENT });
        await calls.updateMany({ userId: uid, agentId: agent, memory: { $exists: true } }, { $unset: { memory: '' } });
        return { deleted };
    });
