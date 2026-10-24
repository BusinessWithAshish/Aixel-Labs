'use server';

import {
    getCollection,
    MongoCollections,
    VOICE_AGENT_SUB_MODULES,
    VoiceProvider,
    type VoiceAgentDoc,
} from '@aixellabs/backend/db';
import { ALApiResponse } from '@aixellabs/backend/api/types';
import { getHiddenSubModules } from '@/flags';
import { runAuthenticatedAction, toObjectId } from '@/helpers/server-action-helpers';
import { requireAppSession } from '@/server/auth';
import { findItem, listItems } from '@/server/voice-agent/accounts';
import { requireVoiceOwner } from '@/server/voice-agent/owner-scope';
import { requestOrigin } from '@/server/voice-agent/public-url';
import { startWebPhoneSession, webPhoneProblem, type WebPhoneSession } from '@/server/voice-agent/web-phone';
import { agentSipAddress } from '@/helpers/voice-call-format';
import { ensureSipHost, sipUserFor } from '@/server/voice-agent/softphone';

/** A number as the Web dialer offers it. */
export type WebPhoneNumber = {
    id: string;
    phoneNumber: string;
    provider: VoiceProvider;
    /** Why it cannot call from the browser, else null. */
    problem: string | null;
};

/** An agent the Web dialer can call: it answers a Telnyx number, reached over SIP like a call to that number. */
export type WebPhoneAgent = { id: string; name: string; numberId: string; phoneNumber: string; address: string };

const SUB_MODULE = VOICE_AGENT_SUB_MODULES.WEB_DIALER;

/** The page is behind a flag; its actions follow it, so a hidden page cannot be used by calling them. */
async function requireWebDialer(userId: string) {
    const owner = await requireVoiceOwner(userId, SUB_MODULE);
    const { user } = await requireAppSession();
    if ((await getHiddenSubModules(user)).has(SUB_MODULE)) throw new Error('The web dialer is not available yet');
    return owner;
}

export const listWebPhoneNumbers = async (): Promise<ALApiResponse<WebPhoneNumber[]>> =>
    runAuthenticatedAction(async function listWebPhoneNumbers(userId) {
        const owner = await requireWebDialer(userId);
        const docs = await listItems('numbers', owner.userId);
        return docs.map((doc) => ({
            id: doc._id.toString(),
            phoneNumber: doc.phoneNumber,
            provider: doc.provider,
            problem: webPhoneProblem(doc),
        }));
    });

/**
 * A short-lived credential for the browser to call out from one of the owner's numbers. The page
 * asks for it while the owner dials, so Call starts at once; it is not tied to the number dialled.
 */
export const getWebPhoneSession = async (numberId: string): Promise<ALApiResponse<WebPhoneSession>> =>
    runAuthenticatedAction(async function getWebPhoneSession(userId) {
        const owner = await requireWebDialer(userId);
        const doc = await findItem('numbers', { _id: toObjectId(numberId, 'Number') }, owner.userId);
        if (!doc) throw new Error('Number not found');
        return startWebPhoneSession(doc, await requestOrigin());
    });

/**
 * The owner's agents that answer a Telnyx number, with the SIP address the browser dials to reach each one (only
 * the owner's own Telnyx account may call it). Sets the number's SIP subdomain on first need.
 */
export const listWebPhoneAgents = async (): Promise<ALApiResponse<WebPhoneAgent[]>> =>
    runAuthenticatedAction(async function listWebPhoneAgents(userId) {
        const owner = await requireWebDialer(userId);
        const numbers = (await listItems('numbers', owner.userId)).filter(
            (n) => n.provider === VoiceProvider.TELNYX && n.inboundAgentId && n.texmlAppId,
        );
        const agents = await getCollection<VoiceAgentDoc>(MongoCollections.VOICE_AGENTS);
        const names = new Map(
            (
                await agents
                    .find(
                        { userId: owner.userId, _id: { $in: numbers.map((n) => n.inboundAgentId!) } },
                        { projection: { name: 1 } },
                    )
                    .toArray()
            ).map((a) => [String(a._id), a.name]),
        );
        const hosts = await Promise.all(numbers.map(ensureSipHost));
        return numbers.flatMap((n, i) => {
            const name = names.get(String(n.inboundAgentId));
            const host = hosts[i];
            return name && host
                ? [
                      {
                          id: String(n.inboundAgentId),
                          name,
                          numberId: n._id.toString(),
                          phoneNumber: n.phoneNumber,
                          address: agentSipAddress(sipUserFor(name), host, 'browser'),
                      },
                  ]
                : [];
        });
    });
