'use server';

import {
    getCollection,
    MongoCollections,
    VOICE_AGENT_SUB_MODULES,
    VoiceProvider,
    type VoiceAgentDoc,
} from '@aixellabs/backend/db';
import { ALApiResponse } from '@aixellabs/backend/api/types';
import QRCode from 'qrcode';
import { assertValidObjectId, runAuthenticatedAction, toObjectId } from '@/helpers/server-action-helpers';
import { assertRateLimit } from '@/server/rate-limit';
import { findItem, listItems } from '@/server/voice-agent/accounts';
import { assertCallReady } from '@/server/voice-agent/call-readiness';
import { cleanCallVariables, customVariableNames } from '@/helpers/voice-agent-features';
import type { VoiceAgentVariableOption } from '@/app/actions/voice-agent-actions';
import type { OwnedNumberDoc } from '@/server/voice-agent/number-provider';
import { requestOrigin } from '@/server/voice-agent/public-url';
import { startWebPhoneSession, type WebPhoneSession } from '@/server/voice-agent/web-phone';
import { requireVoiceOwner, type VoiceOwnerScope } from '@/server/voice-agent/owner-scope';
import {
    ensureSipHost,
    getSoftphone,
    issueRehearsal,
    inSoftphoneAccount,
    issueSoftphoneLogin,
    removeSoftphone,
    SOFTPHONE_DOMAIN,
    sipUserFor,
    softphoneRegistered,
} from '@/server/voice-agent/softphone';

type SoftphoneNumber = { id: string; phoneNumber: string };

/** The test panel of one agent: over the browser, or a softphone. */
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
    /**
     * Telnyx numbers this agent answers, with what reaches it like a call to the number (`agentSipAddress`).
     * `softphone`: in the softphone's account, so the softphone may dial it too.
     */
    dialIn: (SoftphoneNumber & { user: string; host: string; softphone: boolean })[];
    /** Telnyx numbers this agent can ring you from, its own first. `softphone`: can ring the softphone. */
    callFrom: (SoftphoneNumber & { softphone: boolean })[];
    /** The agent's own `{{variables}}` with their defaults, for a rehearsal to fill in. */
    variables: VoiceAgentVariableOption[];
};

/** Where to dial for an outbound rehearsal (`agentSipAddress(user, host, …)`): once, before `expiresAt`. */
export type RehearsalAddress = { user: string; host: string; expiresAt: string };

/** What setting up or resetting returns: the only time the password is shown, with Linphone's one-time setup link. */
export type SoftphoneLogin = {
    userName: string;
    password: string;
    domain: string;
    /** Linphone fetches its whole setup from here, once, within 10 minutes. */
    setupLink: string;
    /** The link as a QR code (an SVG document), for Linphone's "Scan QR code". */
    setupQrSvg: string;
    expiresAt: string;
};

const SUB_MODULE = VOICE_AGENT_SUB_MODULES.AGENTS;

async function softphoneOwner(userId: string): Promise<VoiceOwnerScope> {
    const owner = await requireVoiceOwner(userId, SUB_MODULE);
    // Each change, sign-in and look at the registration is a call to the owner's Telnyx account.
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
            { projection: { name: 1, prompt: 1, variables: 1, 'voicemail.message': 1 } },
        );
        if (!agent?._id) throw new Error('Agent not found');

        const telnyx = (await listItems('numbers', owner.userId)).filter((n) => n.provider === VoiceProvider.TELNYX);
        const softphone = await getSoftphone(owner.userId);
        const home = softphone ? telnyx.find((n) => n._id.equals(softphone.numberId)) : undefined;
        const reaches = (n: OwnedNumberDoc) => !!home && inSoftphoneAccount(n, home);
        const answering = telnyx.filter((n) => n.inboundAgentId?.equals(agent._id) && n.texmlAppId);
        const [registered, hosts] = await Promise.all([
            softphone && home ? softphoneRegistered(softphone, home) : null,
            Promise.all(answering.map(ensureSipHost)),
        ]);
        const own = (n: OwnedNumberDoc) => (n.outboundAgentId?.equals(agent._id) ? 0 : 1);
        return {
            login:
                softphone && home
                    ? { userName: softphone.userName, domain: SOFTPHONE_DOMAIN, phoneNumber: home.phoneNumber, registered }
                    : null,
            telnyxNumbers: telnyx.map(numberOf),
            dialIn: answering.flatMap((n, i) =>
                hosts[i] ? [{ ...numberOf(n), user: sipUserFor(agent.name), host: hosts[i], softphone: reaches(n) }] : [],
            ),
            callFrom: [...telnyx].sort((a, b) => own(a) - own(b)).map((n) => ({ ...numberOf(n), softphone: reaches(n) })),
            variables: customVariableNames(agent.prompt ?? '', agent.voicemail?.message ?? '').map((name) => ({
                name,
                value: agent.variables?.[name] ?? '',
            })),
        };
    });
};

/** The browser's sign-in on a Telnyx number (its telephony credential), to call the agent or be called by it. */
export const getBrowserTestSession = async (numberId: string): Promise<ALApiResponse<WebPhoneSession>> => {
    assertValidObjectId(numberId, 'Number ID');
    return runAuthenticatedAction(async function getBrowserTestSession(userId) {
        const owner = await softphoneOwner(userId);
        const number = await findItem('numbers', { _id: toObjectId(numberId, 'Number ID') }, owner.userId);
        if (number?.provider !== VoiceProvider.TELNYX) throw new Error('Number not found');
        return startWebPhoneSession(number, await requestOrigin());
    });
};

async function issueLogin(owner: VoiceOwnerScope, number: OwnedNumberDoc): Promise<SoftphoneLogin> {
    const { token, expiresAt, ...login } = await issueSoftphoneLogin(owner.userId, number);
    const setupLink = `${await requestOrigin()}/api/voice-agent/softphone/provision/${token}`;
    return {
        ...login,
        domain: SOFTPHONE_DOMAIN,
        setupLink,
        setupQrSvg: await QRCode.toString(setupLink, { type: 'svg', margin: 1 }),
        expiresAt: expiresAt.toISOString(),
    };
}

/** Sets the softphone up on `numberId`'s Telnyx account. */
export const setUpSoftphone = async (numberId: string): Promise<ALApiResponse<SoftphoneLogin>> => {
    assertValidObjectId(numberId, 'Number ID');
    return runAuthenticatedAction(async function setUpSoftphone(userId) {
        const owner = await softphoneOwner(userId);
        const number = await findItem('numbers', { _id: toObjectId(numberId, 'Number ID') }, owner.userId);
        if (!number) throw new Error('Number not found');
        return issueLogin(owner, number);
    });
};

/** A new password and a new Linphone setup link: softphones signed in with the old password are signed out. */
export const resetSoftphonePassword = async (): Promise<ALApiResponse<SoftphoneLogin>> =>
    runAuthenticatedAction(async function resetSoftphonePassword(userId) {
        const owner = await softphoneOwner(userId);
        const softphone = await getSoftphone(owner.userId);
        const number = softphone && (await findItem('numbers', { _id: softphone.numberId }, owner.userId));
        if (!number) throw new Error('Set up your softphone first');
        return issueLogin(owner, number);
    });

export const removeSoftphoneLogin = async (): Promise<ALApiResponse<{ removed: true }>> =>
    runAuthenticatedAction(async function removeSoftphoneLogin(userId) {
        const owner = await softphoneOwner(userId);
        const softphone = await getSoftphone(owner.userId);
        const number = softphone && (await findItem('numbers', { _id: softphone.numberId }, owner.userId));
        await removeSoftphone(owner.userId, number);
        return { removed: true as const };
    });

/**
 * An outbound rehearsal, for accounts that cannot place the call (a Telnyx trial): the owner dials the address and
 * the agent runs the call as if it had called them from `numberId`, with these `{{variables}}`. Counts as a test call.
 */
export const startRehearsal = async (
    agentId: string,
    numberId: string,
    variables: Record<string, string> = {},
): Promise<ALApiResponse<RehearsalAddress>> => {
    assertValidObjectId(agentId, 'Agent ID');
    assertValidObjectId(numberId, 'Number ID');
    const callVariables = cleanCallVariables(variables);
    return runAuthenticatedAction(async function startRehearsal(userId) {
        const owner = await requireVoiceOwner(userId, SUB_MODULE);
        assertRateLimit(`voice-call:${owner.userId}`, 10);
        const agents = await getCollection<VoiceAgentDoc>(MongoCollections.VOICE_AGENTS);
        const agent = await agents.findOne(
            { _id: toObjectId(agentId, 'Agent ID'), userId: owner.userId },
            { projection: { name: 1 } },
        );
        if (!agent?._id) throw new Error('Agent not found');
        const numbers = await listItems('numbers', owner.userId);
        const number = numbers.find((n) => n._id.equals(toObjectId(numberId, 'Number ID')));
        if (!number) throw new Error('Number not found');
        // The same refusals as every other call (no prompt, a key its stack needs).
        await assertCallReady(owner.userId, agent._id);
        const rehearsal = await issueRehearsal(number, numbers, agent, callVariables);
        return { ...rehearsal, expiresAt: rehearsal.expiresAt.toISOString() };
    });
};
