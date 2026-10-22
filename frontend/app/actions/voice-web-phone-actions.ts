'use server';

import { VOICE_AGENT_SUB_MODULES, type VoiceProvider } from '@aixellabs/backend/db';
import { ALApiResponse } from '@aixellabs/backend/api/types';
import { getHiddenSubModules } from '@/flags';
import { runAuthenticatedAction, toObjectId } from '@/helpers/server-action-helpers';
import { NEEDS_COUNTRY_CODE, toE164 } from '@/helpers/voice-web-phone';
import { requireAppSession } from '@/server/auth';
import { findItem, listItems } from '@/server/voice-agent/accounts';
import { requireVoiceOwner } from '@/server/voice-agent/owner-scope';
import { requestOrigin } from '@/server/voice-agent/public-url';
import { startWebPhoneSession, webPhoneProblem, type WebPhoneSession } from '@/server/voice-agent/web-phone';

/** A number as the Web dialer offers it. */
export type WebPhoneNumber = {
    id: string;
    phoneNumber: string;
    provider: VoiceProvider;
    /** Calls in are answered by an AI agent (they keep going there; the browser only calls out). */
    answeredByAi: boolean;
    /** Why it cannot call from the browser, else null. */
    problem: string | null;
};

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
            answeredByAi: !!doc.inboundAgentId,
            problem: webPhoneProblem(doc),
        }));
    });

/** A short-lived credential for the browser to call `to` from one of the owner's numbers. */
export const startWebPhoneCall = async (numberId: string, to: string): Promise<ALApiResponse<WebPhoneSession>> =>
    runAuthenticatedAction(async function startWebPhoneCall(userId) {
        const owner = await requireWebDialer(userId);
        if (!toE164(String(to ?? ''))) throw new Error(NEEDS_COUNTRY_CODE);
        const doc = await findItem('numbers', { _id: toObjectId(numberId, 'Number') }, owner.userId);
        if (!doc) throw new Error('Number not found');
        return startWebPhoneSession(doc, await requestOrigin());
    });
