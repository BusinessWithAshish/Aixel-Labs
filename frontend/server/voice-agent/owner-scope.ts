import 'server-only';

import {
    getCollection,
    Modules,
    MongoCollections,
    MongoObjectId,
    type UserDoc,
    type VOICE_AGENT_SUB_MODULES,
} from '@aixellabs/backend/db';
import { requireAppSession } from '@/server/auth';

export type VoiceOwnerScope = {
    userId: MongoObjectId;
    tenantId: MongoObjectId;
};

/**
 * The signed-in owner of voice numbers / calls, after checking they were granted the
 * voice sub-module (the page guard only covers the first page load, not later actions).
 */
export async function requireVoiceOwner(userId: string, subModule: VOICE_AGENT_SUB_MODULES): Promise<VoiceOwnerScope> {
    const session = await requireAppSession();
    const granted = session.user.isAdmin || (session.user.moduleAccess?.[Modules.VOICE_AGENT] ?? []).includes(subModule);
    if (!granted) throw new Error('You do not have access to voice agents');

    const users = await getCollection<UserDoc>(MongoCollections.USERS);
    const user = await users.findOne({ _id: new MongoObjectId(userId) }, { projection: { tenantId: 1 } });
    if (!user?._id) throw new Error('User not found');
    return { userId: user._id, tenantId: user.tenantId };
}
