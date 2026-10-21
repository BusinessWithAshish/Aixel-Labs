import 'server-only';

import {
    type TwilioVoiceRouting,
    type VoiceNumberDoc,
    VoiceProvider,
} from '@aixellabs/backend/db';
import { numberProviderInfo } from '@/helpers/voice-number-providers';
import { updateItem } from '@/server/voice-agent/accounts';
import { numberWebhookUrl, openSecret } from '@/server/voice-agent/engine';
import type { NumberProvider, OwnedNumberDoc, ProviderAccountNumber } from '@/server/voice-agent/number-provider';
import {
    getAccount,
    getIncomingNumber,
    listIncomingNumbers,
    TwilioApiError,
    updateIncomingNumber,
    type TwilioAuth,
    type TwilioIncomingNumber,
    type TwilioVoiceUpdate,
} from '@/server/voice-agent/twilio';

/**
 * Twilio. A number's calls go wherever its voice settings say: an Elastic SIP Trunk, else a TwiML
 * app, else its Voice URL (a webhook, a Studio flow, TwiML Bins). We only ever change those:
 *
 * - AI answering on  = the Voice URL becomes the engine's `/twiml?n=…&sig=…` (POST), and a TwiML
 *   app or SIP trunk the number was on is cleared, since Twilio would ignore the URL otherwise.
 *   What the number had is saved in `twilio.previousRouting` on the FIRST change only.
 * - AI answering off / remove = that saved routing is put back exactly, then forgotten. Left alone
 *   when the number no longer points at the engine (the customer changed it in the Console since).
 * - Calls out need nothing in the account: the engine places them with the Calls API and inline
 *   TwiML, and the number's own routing is never touched.
 */

/** Statuses the import list shows: voice-capable numbers are "active". */
const NO_VOICE = 'no voice';

/** A plain message when the credentials work but the account cannot be used, else null. */
function accountProblem(status: string): string | null {
    if (status === 'active') return null;
    return `This Twilio account is ${status}. Reactivate it in the Twilio Console, then connect again.`;
}

/** Checks the credentials, then lists every number in the account. */
export async function listTwilioAccountNumbers(auth: TwilioAuth): Promise<ProviderAccountNumber[]> {
    let status: string | null;
    try {
        status = (await getAccount(auth)).status;
    } catch (error) {
        if (error instanceof TwilioApiError && error.status === 404) {
            throw new Error(
                'Twilio has no account with that Account SID for these credentials. Copy the Account SID shown with the API key (Twilio Console, Account info).',
            );
        }
        // A Restricted API key may not read the account itself; listing the numbers below is the check then.
        if (!(error instanceof TwilioApiError && error.status === 403)) throw error;
        status = null;
    }
    const problem = status ? accountProblem(status) : null;
    if (problem) throw new Error(problem);

    const numbers = await listIncomingNumbers(auth);
    return numbers.map((n) => ({
        providerNumberId: n.sid,
        phoneNumber: n.phone_number,
        status: n.capabilities?.voice === false ? NO_VOICE : 'active',
    }));
}

/** Whether an account number can be imported (it must take voice calls). */
export function twilioNumberProblem(n: ProviderAccountNumber): string | null {
    return n.status === NO_VOICE
        ? `${n.phoneNumber} cannot take voice calls in Twilio (it is a messaging-only number). Leave it out.`
        : null;
}

export function twilioAuthOf(doc: VoiceNumberDoc): TwilioAuth {
    if (!doc.twilio?.accountSid) throw new Error('This Twilio number has no account saved. Remove it and import it again.');
    return {
        accountSid: doc.twilio.accountSid,
        apiKeySid: doc.twilio.apiKeySid ?? null,
        secret: openSecret(doc.apiKeySealed),
    };
}

function routingOf(n: TwilioIncomingNumber): TwilioVoiceRouting {
    return {
        voiceUrl: n.voice_url ?? '',
        voiceMethod: (n.voice_method || 'POST').toUpperCase(),
        voiceApplicationSid: n.voice_application_sid ?? '',
        trunkSid: n.trunk_sid ?? '',
    };
}

function engineUrl(doc: OwnedNumberDoc): string {
    return numberWebhookUrl('/twiml', doc._id.toString());
}

/** The number's calls reach the engine: its Voice URL is ours and nothing overrides it. */
function pointsAtEngine(n: TwilioIncomingNumber, doc: OwnedNumberDoc): boolean {
    return n.voice_url === engineUrl(doc) && !n.voice_application_sid && !n.trunk_sid;
}

async function savePreviousRouting(doc: OwnedNumberDoc, routing: TwilioVoiceRouting): Promise<void> {
    await updateItem('numbers', { _id: doc._id }, { set: { 'twilio.previousRouting': routing } });
    if (doc.twilio) doc.twilio.previousRouting = routing;
}

async function forgetPreviousRouting(doc: OwnedNumberDoc): Promise<void> {
    await updateItem('numbers', { _id: doc._id }, { unset: ['twilio.previousRouting'] });
    if (doc.twilio) delete doc.twilio.previousRouting;
}

function isCredentialsRejected(error: unknown): boolean {
    return error instanceof TwilioApiError && (error.status === 401 || error.code === 20003);
}

function isRefusal(error: unknown): error is TwilioApiError {
    return (
        error instanceof TwilioApiError &&
        error.status >= 400 &&
        error.status < 500 &&
        error.status !== 404 &&
        !isCredentialsRejected(error)
    );
}

/** Sends the number's calls to the engine, saving what it had first (once). */
async function routeCallsToAi(doc: OwnedNumberDoc): Promise<void> {
    const auth = twilioAuthOf(doc);
    const current = await getIncomingNumber(auth, doc.providerNumberId);
    if (current.capabilities?.voice === false) {
        throw new Error(`${doc.phoneNumber} cannot take voice calls in Twilio, so the AI cannot answer it.`);
    }
    // A retry after a half-finished switch: already ours, and the routing saved then is kept.
    if (pointsAtEngine(current, doc)) return;
    // Saved before anything changes, so a failure half-way still knows what to put back.
    const savedNow = !doc.twilio?.previousRouting;
    if (savedNow) await savePreviousRouting(doc, routingOf(current));

    const update: TwilioVoiceUpdate = { VoiceUrl: engineUrl(doc), VoiceMethod: 'POST' };
    if (current.voice_application_sid) update.VoiceApplicationSid = '';
    if (current.trunk_sid) update.TrunkSid = '';
    try {
        await updateIncomingNumber(auth, doc.providerNumberId, update);
    } catch (error) {
        // Twilio refused: nothing changed, so the copy is not kept (the customer may change it before the next try).
        if (savedNow && isRefusal(error)) await forgetPreviousRouting(doc);
        if (current.trunk_sid && isRefusal(error)) {
            throw new Error(
                `Twilio would not take ${doc.phoneNumber} off its SIP trunk (${error.message}). In the Twilio Console (Elastic SIP Trunking, your trunk, Numbers), remove the number from the trunk, then try again.`,
            );
        }
        throw error;
    }
}

/**
 * Puts the number's saved routing back, exactly. Nothing to do when we never changed it, when the
 * number is gone from the account, or when it no longer points at the engine.
 */
async function restorePreviousRouting(doc: OwnedNumberDoc): Promise<void> {
    const previous = doc.twilio?.previousRouting;
    if (!previous) return;
    const auth = twilioAuthOf(doc);
    let current: TwilioIncomingNumber;
    try {
        current = await getIncomingNumber(auth, doc.providerNumberId);
    } catch (error) {
        if (error instanceof TwilioApiError && error.status === 404) {
            await forgetPreviousRouting(doc);
            return;
        }
        throw error;
    }

    if (pointsAtEngine(current, doc)) {
        const update: TwilioVoiceUpdate = { VoiceUrl: previous.voiceUrl, VoiceMethod: previous.voiceMethod || 'POST' };
        // Setting a trunk clears the TwiML app and the other way round: only the one it had is sent.
        if (previous.voiceApplicationSid) update.VoiceApplicationSid = previous.voiceApplicationSid;
        if (previous.trunkSid) update.TrunkSid = previous.trunkSid;
        try {
            await updateIncomingNumber(auth, doc.providerNumberId, update);
        } catch (error) {
            if (isRefusal(error)) {
                const where = previous.trunkSid
                    ? `SIP trunk ${previous.trunkSid}`
                    : previous.voiceApplicationSid
                      ? `TwiML app ${previous.voiceApplicationSid}`
                      : previous.voiceUrl || 'no Voice URL';
                throw new Error(
                    `Twilio would not put ${doc.phoneNumber} back on ${where} (${error.message}). Set it in the Twilio Console (Phone Numbers, Active numbers), then try again.`,
                );
            }
            throw error;
        }
    }
    await forgetPreviousRouting(doc);
}

export const twilioNumbers: NumberProvider = {
    label: numberProviderInfo(VoiceProvider.TWILIO).label,

    startAnswering(doc) {
        return routeCallsToAi(doc);
    },

    stopAnswering(doc) {
        return restorePreviousRouting(doc);
    },

    // Calls out use the Calls API with inline TwiML: nothing to create or change in the account.
    async startPlacingCalls() {},

    async stopPlacingCalls() {},

    async prepareCall() {},

    /** Puts the number's routing back. Nothing else of ours lives in the account. */
    async release(doc) {
        try {
            twilioAuthOf(doc);
        } catch (error) {
            console.error('[voice] removeNumber: could not open the stored Twilio credentials', error);
            return;
        }
        try {
            await restorePreviousRouting(doc);
        } catch (error) {
            // Credentials Twilio no longer accepts cannot fix anything in their account; anything
            // else would leave the number pointing at the engine, so keep it.
            if (!isCredentialsRejected(error)) throw error;
            console.error('[voice] removeNumber: Twilio rejected the stored credentials', error);
        }
    },
};
