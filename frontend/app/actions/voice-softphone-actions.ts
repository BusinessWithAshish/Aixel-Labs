'use server';

import {
    getCollection,
    MongoCollections,
    VOICE_AGENT_SUB_MODULES,
    VoiceProvider,
    type VoiceAgentDoc,
} from '@aixellabs/backend/db';
import { ALApiResponse } from '@aixellabs/backend/api/types';
import { assertValidObjectId, runAuthenticatedAction, toObjectId } from '@/helpers/server-action-helpers';
import { assertRateLimit } from '@/server/rate-limit';
import { findItem, listItems } from '@/server/voice-agent/accounts';
import type { OwnedNumberDoc } from '@/server/voice-agent/number-provider';
import { requireVoiceOwner, type VoiceOwnerScope } from '@/server/voice-agent/owner-scope';
import {
    ensureSipHost,
    getSoftphone,
    inSoftphoneAccount,
    issueSoftphoneLogin,
    removeSoftphone,
    SOFTPHONE_DOMAIN,
    sipUserFor,
    softphoneRegistered,
} from '@/server/voice-agent/softphone';

type SoftphoneNumber = { id: string; phoneNumber: string };

/** The softphone panel of one agent. */
export type SoftphoneView = {
    /** Null until set up. */
    login: {
        userName: string;
        domain: string;
        /** The number whose Telnyx account it is on. */
        phoneNumber: string;
        /** Signed in now; null when Telnyx would not say. */
        registered: boolean | null;
    } | null;
    /** Telnyx numbers it can be set up with. */
    telnyxNumbers: SoftphoneNumber[];
    /** SIP addresses that reach this agent like a call to the number (it answers them, in the softphone's account). */
    dialIn: (SoftphoneNumber & { address: string })[];
    /** Numbers this agent can ring the softphone from (in the softphone's account), its own first. */
    callFrom: SoftphoneNumber[];
};

/** What setting up or resetting returns: the only time the password is shown. */
export type SoftphoneLogin = { userName: string; password: string; domain: string };

const SUB_MODULE = VOICE_AGENT_SUB_MODULES.AGENTS;

async function softphoneOwner(userId: string): Promise<VoiceOwnerScope> {
    const owner = await requireVoiceOwner(userId, SUB_MODULE);
    // Each change and each look at the registration is a call to the owner's Telnyx account.
    assertRateLimit(`voice-softphone:${owner.userId}`, 20);
    return owner;
}

const numberOf = (doc: OwnedNumberDoc): SoftphoneNumber => ({ id: doc._id.toString(), phoneNumber: doc.phoneNumber });

export const getSoftphoneView = async (agentId: string): Promise<ALApiResponse<SoftphoneView>> => {
    assertValidObjectId(agentId, 'Agent ID');
    return runAuthenticatedAction(async function getSoftphoneView(userId) {
        const owner = await softphoneOwner(userId);
        const agents = await getCollection<VoiceAgentDoc>(MongoCollections.VOICE_AGENTS);
        const agent = await agents.findOne(
            { _id: toObjectId(agentId, 'Agent ID'), userId: owner.userId },
            { projection: { name: 1 } },
        );
        if (!agent?._id) throw new Error('Agent not found');

        const telnyx = (await listItems('numbers', owner.userId)).filter((n) => n.provider === VoiceProvider.TELNYX);
        const softphone = await getSoftphone(owner.userId);
        const home = softphone ? telnyx.find((n) => n._id.equals(softphone.numberId)) : undefined;
        const view: SoftphoneView = { login: null, telnyxNumbers: telnyx.map(numberOf), dialIn: [], callFrom: [] };
        if (!softphone || !home) return view;

        const reachable = telnyx.filter((n) => inSoftphoneAccount(n, home));
        const answering = reachable.filter((n) => n.inboundAgentId?.equals(agent._id));
        const [registered, hosts] = await Promise.all([
            softphoneRegistered(softphone, home),
            Promise.all(answering.map(ensureSipHost)),
        ]);
        view.login = { userName: softphone.userName, domain: SOFTPHONE_DOMAIN, phoneNumber: home.phoneNumber, registered };
        view.dialIn = answering.flatMap((n, i) =>
            hosts[i] ? [{ ...numberOf(n), address: `sip:${sipUserFor(agent.name)}@${hosts[i]}` }] : [],
        );
        const own = (n: OwnedNumberDoc) => (n.outboundAgentId?.equals(agent._id) ? 0 : 1);
        view.callFrom = [...reachable].sort((a, b) => own(a) - own(b)).map(numberOf);
        return view;
    });
};

/** Sets the softphone up on `numberId`'s Telnyx account. */
export const setUpSoftphone = async (numberId: string): Promise<ALApiResponse<SoftphoneLogin>> => {
    assertValidObjectId(numberId, 'Number ID');
    return runAuthenticatedAction(async function setUpSoftphone(userId) {
        const owner = await softphoneOwner(userId);
        const number = await findItem('numbers', { _id: toObjectId(numberId, 'Number ID') }, owner.userId);
        if (!number) throw new Error('Number not found');
        return { ...(await issueSoftphoneLogin(owner.userId, number)), domain: SOFTPHONE_DOMAIN };
    });
};

/** A new password: softphones signed in with the old one are signed out. */
export const resetSoftphonePassword = async (): Promise<ALApiResponse<SoftphoneLogin>> =>
    runAuthenticatedAction(async function resetSoftphonePassword(userId) {
        const owner = await softphoneOwner(userId);
        const softphone = await getSoftphone(owner.userId);
        const number = softphone && (await findItem('numbers', { _id: softphone.numberId }, owner.userId));
        if (!number) throw new Error('Set up your softphone first');
        return { ...(await issueSoftphoneLogin(owner.userId, number)), domain: SOFTPHONE_DOMAIN };
    });

export const removeSoftphoneLogin = async (): Promise<ALApiResponse<{ removed: true }>> =>
    runAuthenticatedAction(async function removeSoftphoneLogin(userId) {
        const owner = await softphoneOwner(userId);
        const softphone = await getSoftphone(owner.userId);
        const number = softphone && (await findItem('numbers', { _id: softphone.numberId }, owner.userId));
        await removeSoftphone(owner.userId, number);
        return { removed: true as const };
    });
