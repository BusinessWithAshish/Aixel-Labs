import 'server-only';

import { getCollection, MongoCollections, MongoObjectId, type VoiceAgentDoc } from '@aixellabs/backend/db';

/**
 * The `agentId` match Call logs and Analytics read calls, bookings and campaigns with: one agent,
 * else the owner's current agents, or every agent (deleted ones too) when asked. Calls keep their
 * `agentId` after the agent is deleted.
 */
export async function agentIdMatch(
    userId: MongoObjectId,
    agentId: string | null,
    includeDeleted: boolean,
): Promise<{ agentId?: MongoObjectId | { $in: MongoObjectId[] } }> {
    if (agentId) return { agentId: new MongoObjectId(agentId) };
    if (includeDeleted) return {};
    const agents = await getCollection<VoiceAgentDoc>(MongoCollections.VOICE_AGENTS);
    return { agentId: { $in: await agents.distinct('_id', { userId }) } };
}
