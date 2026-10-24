import 'server-only';

import { getCollection, MongoCollections, type MongoObjectId, type VoiceAgentDoc } from '@aixellabs/backend/db';
import { blockerText, voiceCallBlockers, type VoiceCallBlocker } from '@/helpers/voice-call-readiness';
import { voiceAccountsCollection } from '@/server/voice-agent/accounts';

type ReadinessAgent = Pick<VoiceAgentDoc, '_id' | 'prompt' | 'stack'>;

/** What stops each agent's calls (`voiceCallBlockers`), by agent id, on the owner's keys. */
export async function agentCallBlockers(
    userId: MongoObjectId,
    agents: ReadinessAgent[],
): Promise<Map<string, VoiceCallBlocker[]>> {
    const accounts = await voiceAccountsCollection();
    const account = await accounts.findOne({ userId }, { projection: { 'keys.keySealed': 0, numbers: 0, calendars: 0 } });
    const keys = account?.keys ?? [];
    return new Map(agents.map((a) => [String(a._id), voiceCallBlockers({ prompt: a.prompt ?? '', stack: a.stack, keys })]));
}

/** Refuses to start a call the engine would refuse, in the same words the agent page shows. */
export async function assertCallReady(userId: MongoObjectId, agentId: MongoObjectId): Promise<void> {
    const agents = await getCollection<VoiceAgentDoc>(MongoCollections.VOICE_AGENTS);
    const agent = await agents.findOne({ _id: agentId, userId }, { projection: { prompt: 1, stack: 1 } });
    if (!agent) throw new Error('Agent not found');
    const blockers = (await agentCallBlockers(userId, [agent])).get(String(agent._id)) ?? [];
    if (blockers.length) throw new Error(blockerText(blockers));
}
