import 'server-only';

import { type VoiceNumberDoc, VoiceProvider } from '@aixellabs/backend/db';
import { findItemsAnywhere, updateItem } from '@/server/voice-agent/accounts';
import { numberProviderInfo } from '@/helpers/voice-number-providers';
import { numberWebhookUrl, openSecret } from '@/server/voice-agent/engine';
import type { NumberProvider, OwnedNumberDoc, ProviderAccountNumber } from '@/server/voice-agent/number-provider';
import {
    createCallControlApplication,
    createTexmlApplication,
    deleteCallControlApplication,
    deleteTexmlApplication,
    getPhoneNumber,
    listCallControlApplications,
    listOutboundVoiceProfiles,
    listPhoneNumbers,
    setPhoneNumberConnection,
    TelnyxApiError,
    type TelnyxPhoneNumber,
} from '@/server/voice-agent/telnyx';

/** Every number in the Telnyx account. Also the key check. */
export async function listTelnyxAccountNumbers(apiKey: string): Promise<ProviderAccountNumber[]> {
    const numbers = await listPhoneNumbers(apiKey);
    return numbers.map((n) => ({ providerNumberId: n.id, phoneNumber: n.phone_number, status: n.status }));
}

export function appLabel(doc: Pick<OwnedNumberDoc, 'phoneNumber'>): string {
    return `Aixel Labs voice agent ${doc.phoneNumber}`;
}

/** One Call Control app serves every number of a Telnyx account: each call carries its own webhook and stream. */
const CALL_CONTROL_APP_LABEL = 'Aixel Labs voice agents';

/** Telnyx's code for an account-level limit (a trial account may hold only one Call Control app). */
const ACCOUNT_LIMIT_CODE = '10039';

async function setNumberFields(doc: OwnedNumberDoc, fields: Partial<VoiceNumberDoc>): Promise<void> {
    await updateItem('numbers', { _id: doc._id }, { set: fields });
}

/**
 * The Call Control app (calls out) in the customer's Telnyx account, found or created on first need.
 * It does not touch the number's own routing: calls in keep ringing wherever they did.
 *
 * The app is shared by the account's numbers, because the engine names the webhook and the
 * media stream on every dial. If the account is at its app limit (trial accounts: one), one of
 * the customer's own apps is used as it is, unchanged.
 */
async function ensureCallControlApp(doc: OwnedNumberDoc, key: string): Promise<string> {
    if (doc.callControlAppId) return doc.callControlAppId;
    const apps = await listCallControlApplications(key);
    const ours = apps.find((app) => app.application_name === CALL_CONTROL_APP_LABEL);
    if (ours) {
        await setNumberFields(doc, { callControlAppId: ours.id });
        return ours.id;
    }
    const profiles = await listOutboundVoiceProfiles(key);
    const outboundVoiceProfileId = profiles[0]?.id;
    if (!outboundVoiceProfileId) {
        throw new Error(
            'Your Telnyx account has no outbound voice profile. Create one in the Telnyx portal (Voice, Outbound Voice Profiles), then try again.',
        );
    }
    let appId: string;
    try {
        appId = (
            await createCallControlApplication(key, {
                applicationName: CALL_CONTROL_APP_LABEL,
                webhookEventUrl: numberWebhookUrl('/telnyx-events', doc._id.toString()),
                outboundVoiceProfileId,
            })
        ).id;
    } catch (error) {
        const atLimit = error instanceof TelnyxApiError && error.code === ACCOUNT_LIMIT_CODE;
        if (!atLimit || apps.length === 0) throw error;
        appId = apps[0].id;
    }
    await setNumberFields(doc, { callControlAppId: appId });
    return appId;
}

/** Deletes the shared Call Control app only when it is ours and no other number still uses it. */
async function releaseCallControlApp(doc: OwnedNumberDoc, key: string): Promise<void> {
    if (!doc.callControlAppId) return;
    const users = await findItemsAnywhere('numbers', { callControlAppId: doc.callControlAppId });
    if (users.some((n) => !n._id.equals(doc._id) && n.callControlAppId === doc.callControlAppId)) return;
    const apps = await listCallControlApplications(key);
    const app = apps.find((a) => a.id === doc.callControlAppId);
    if (app?.application_name === CALL_CONTROL_APP_LABEL) await deleteCallControlApplication(key, app.id);
}

/** The TeXML app (calls in) in the customer's Telnyx account, created on first need. Saved as soon as it exists. */
async function ensureTexmlApp(doc: OwnedNumberDoc, key: string): Promise<string> {
    if (doc.texmlAppId) return doc.texmlAppId;
    const app = await createTexmlApplication(key, {
        friendlyName: appLabel(doc),
        voiceUrl: numberWebhookUrl('/texml', doc._id.toString()),
    });
    await setNumberFields(doc, { texmlAppId: app.id });
    return app.id;
}

/**
 * Points the number at our TeXML app, first saving the connection it is on now. If it already
 * points at our app (a retry after a half-finished switch), the connection saved then is kept.
 */
async function routeCallsToAi(doc: OwnedNumberDoc, key: string): Promise<void> {
    const texmlAppId = await ensureTexmlApp(doc, key);
    const current = await getPhoneNumber(key, doc.providerNumberId);
    if (current.connection_id === texmlAppId) return;

    await setNumberFields(doc, { previousConnectionId: current.connection_id ?? null });
    await setPhoneNumberConnection(key, doc.providerNumberId, texmlAppId);
}

function isRefusal(error: unknown): error is TelnyxApiError {
    return error instanceof TelnyxApiError && error.status >= 400 && error.status < 500;
}

function isKeyRejected(error: unknown): boolean {
    return error instanceof TelnyxApiError && (error.status === 401 || error.status === 403);
}

/**
 * Puts the number back on the connection it had before the AI answered it. Left alone when it
 * no longer points at our TeXML app (the customer moved it in the Telnyx portal since).
 */
async function restorePreviousConnection(doc: OwnedNumberDoc, key: string): Promise<void> {
    if (!doc.texmlAppId) return;
    let current: TelnyxPhoneNumber;
    try {
        current = await getPhoneNumber(key, doc.providerNumberId);
    } catch (error) {
        // Gone from their account: nothing left to point anywhere.
        if (error instanceof TelnyxApiError && error.status === 404) return;
        throw error;
    }
    if (current.connection_id !== doc.texmlAppId) return;

    const previous = doc.previousConnectionId ?? null;
    try {
        await setPhoneNumberConnection(key, doc.providerNumberId, previous);
    } catch (error) {
        if (previous === null && isRefusal(error) && !isKeyRejected(error)) {
            throw new Error(
                `${doc.phoneNumber} had no connection in Telnyx before the AI answered it, and Telnyx would not leave it without one. In the Telnyx portal (Numbers, My numbers), pick a connection for it, then try again.`,
            );
        }
        throw error;
    }
}

/**
 * Telnyx: calls in go through a TeXML app we create (the number's connection is switched to it
 * and back); calls out go through a Call Control app, which leaves the number's routing alone.
 */
export const telnyxNumbers: NumberProvider = {
    label: numberProviderInfo(VoiceProvider.TELNYX).label,

    async startAnswering(doc) {
        await routeCallsToAi(doc, openSecret(doc.apiKeySealed));
    },

    async stopAnswering(doc) {
        if (doc.inboundAgentId || doc.texmlAppId) await restorePreviousConnection(doc, openSecret(doc.apiKeySealed));
        await setNumberFields(doc, { previousConnectionId: null });
    },

    async startPlacingCalls(doc) {
        await ensureCallControlApp(doc, openSecret(doc.apiKeySealed));
    },

    // The Call Control app is kept for next time.
    async stopPlacingCalls() {},

    async prepareCall(doc) {
        await ensureCallControlApp(doc, openSecret(doc.apiKeySealed));
    },

    /** Restores the number's connection, then deletes the apps we created (best effort). */
    async release(doc) {
        let key: string;
        try {
            key = openSecret(doc.apiKeySealed);
        } catch (error) {
            console.error('[voice] removeNumber: could not open the stored key', error);
            return;
        }
        try {
            await restorePreviousConnection(doc, key);
        } catch (error) {
            // A key Telnyx no longer accepts cannot fix anything in their account; anything else
            // would leave the number pointing at an app we are about to delete, so stop here.
            if (!isKeyRejected(error)) throw error;
            console.error('[voice] removeNumber: Telnyx rejected the stored key', error);
        }

        const cleanup: Promise<void>[] = [];
        if (doc.texmlAppId) cleanup.push(deleteTexmlApplication(key, doc.texmlAppId));
        cleanup.push(releaseCallControlApp(doc, key));
        const results = await Promise.allSettled(cleanup);
        for (const result of results) {
            if (result.status === 'rejected') console.error('[voice] removeNumber: Telnyx cleanup failed', result.reason);
        }
    },
};
