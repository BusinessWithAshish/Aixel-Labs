import 'server-only';

import { type VoiceNumberDoc, type WhatsAppCallingSettings, VoiceProvider } from '@aixellabs/backend/db';
import { numberProviderInfo } from '@/helpers/voice-number-providers';
import { updateItem } from '@/server/voice-agent/accounts';
import { isWhatsAppWebhook, openSecret, whatsappWebhook } from '@/server/voice-agent/engine';
import type { NumberProvider, OwnedNumberDoc, ProviderAccountNumber } from '@/server/voice-agent/number-provider';
import {
    debugToken,
    getAppSubscriptions,
    getCallingSettings,
    listAssignedWabas,
    listPhoneNumbers,
    setCallingSettings,
    subscribeApp,
    subscribeWaba,
    WhatsAppApiError,
    type WhatsAppAuth,
} from '@/server/voice-agent/whatsapp';

/**
 * WhatsApp (the customer's own Meta app, WhatsApp Cloud API). A number's calls reach the engine when
 * three things hold, set in this order (Meta refuses calling before an app is subscribed to `calls`):
 *
 * - AI answering on = the app's webhook (fields `calls`, `messages`) points at the engine's
 *   `/whatsapp?app=…`, the app is subscribed to the number's WhatsApp account, and the number's calling
 *   is ENABLED with the call button shown. Its calling settings before that are saved in
 *   `whatsapp.previousCalling` on the FIRST change only.
 * - AI answering off / remove = those calling settings are put back, then forgotten. The app's webhook
 *   stays on the engine (the app is the customer's app for Aixel Labs, and the engine ignores numbers
 *   without an inbound agent).
 * - The inbound agent answers the number's WhatsApp chats too (the engine's `messages` webhook).
 * - Calls out are not built yet: placing calls is refused in plain words.
 *
 * Connecting refuses an app whose WhatsApp webhooks already go somewhere else: we never take over an
 * integration the customer runs.
 */

const SCOPES = ['whatsapp_business_management', 'whatsapp_business_messaging'];
const NOT_CLOUD_API = 'not on the Cloud API';
const PLACING_CALLS_SOON =
    'A WhatsApp number answers calls and chats for now: placing calls from WhatsApp is coming soon. Give it an inbound agent.';

/** A number in the customer's WhatsApp accounts, as offered for import: with the account it is in. */
export type WhatsAppAccountNumber = ProviderAccountNumber & { wabaId: string };

function e164(display: string): string {
    return `+${display.replace(/\D/g, '')}`;
}

function isTokenRejected(error: unknown): boolean {
    return error instanceof WhatsAppApiError && (error.status === 401 || error.code === 190);
}

/**
 * The WhatsApp accounts to list: `wabaId` when the customer named one, else the ones the token names. Refused in plain
 * words when the token is not right for this app. An admin system user's token "applies to all objects": Meta then names
 * no accounts in debug_token, and may list none assigned to it either, though the token can open them.
 */
async function checkedAccounts(auth: WhatsAppAuth, wabaId?: string): Promise<string[]> {
    let info;
    try {
        info = await debugToken(auth);
    } catch (error) {
        // debug_token is asked with the app token: Meta refusing it means the App ID or App secret is wrong.
        if (error instanceof WhatsAppApiError && error.status >= 400 && error.status < 500) {
            throw new Error('Meta did not accept that App ID and App secret. Copy both from your app: App settings, Basic.');
        }
        throw error;
    }
    if (!info.is_valid) throw new Error('Meta says this access token is not valid (expired or revoked). Generate a new one.');
    if (info.app_id !== auth.appId) {
        throw new Error('This access token belongs to another Meta app. Generate it for the app whose App ID you pasted.');
    }
    const missing = SCOPES.filter((scope) => !info.scopes?.includes(scope));
    if (missing.length) throw new Error(`The access token is missing ${missing.join(' and ')}. Generate it again with both.`);
    if (wabaId) return [wabaId];
    const accounts = new Set(
        (info.granular_scopes ?? [])
            .filter((g) => g.scope === 'whatsapp_business_management')
            .flatMap((g) => g.target_ids ?? []),
    );
    if (accounts.size === 0) {
        for (const wabaId of await listAssignedWabas(auth)) accounts.add(wabaId);
    }
    if (accounts.size === 0) {
        throw new Error(
            'Meta does not say which WhatsApp account this token is for. Paste your WhatsApp Business Account ID below (your Meta app: WhatsApp, API Setup), then try again.',
        );
    }
    return [...accounts];
}

/** Refuses an app whose WhatsApp webhooks already go to someone else's URL. */
async function assertAppFree(auth: WhatsAppAuth): Promise<void> {
    const current = (await getAppSubscriptions(auth)).find((s) => s.object === 'whatsapp_business_account');
    if (current?.callback_url && !isWhatsAppWebhook(current.callback_url)) {
        const host = URL.canParse(current.callback_url) ? new URL(current.callback_url).host : 'another service';
        throw new Error(
            `This Meta app already sends its WhatsApp webhooks to ${host}. Create a new Meta app just for Aixel Labs, so nothing you run today stops working.`,
        );
    }
}

/** Checks the credentials, then lists every number in the WhatsApp accounts the token reaches. */
export async function listWhatsAppAccountNumbers(auth: WhatsAppAuth, named?: string): Promise<WhatsAppAccountNumber[]> {
    const accounts = await checkedAccounts(auth, named);
    await assertAppFree(auth);
    const numbers: WhatsAppAccountNumber[] = [];
    for (const wabaId of accounts) {
        const found = await listPhoneNumbers(auth, wabaId).catch((error: unknown) => {
            if (named && error instanceof WhatsAppApiError && error.status >= 400 && error.status < 500 && !isTokenRejected(error)) {
                throw new Error(`This token cannot open WhatsApp account ${named}. Check the ID (your Meta app: WhatsApp, API Setup), and that the account is assigned to the system user.`);
            }
            throw error;
        });
        for (const n of found) {
            numbers.push({
                providerNumberId: n.id,
                phoneNumber: e164(n.display_phone_number),
                status: !n.platform_type || n.platform_type === 'CLOUD_API' ? 'active' : NOT_CLOUD_API,
                wabaId,
            });
        }
    }
    return numbers;
}

/** Whether an account number can be imported (the Cloud API must own it: not the Business app, not On-Premises). */
export function whatsappNumberProblem(n: ProviderAccountNumber): string | null {
    return n.status === NOT_CLOUD_API
        ? `${n.phoneNumber} is not on the WhatsApp Cloud API (it is on the WhatsApp Business app or On-Premises), so calls cannot reach it. Move it to the Cloud API in WhatsApp Manager, or leave it out.`
        : null;
}

export function whatsappAuthOf(doc: VoiceNumberDoc): WhatsAppAuth {
    if (!doc.whatsapp?.appId) throw new Error('This WhatsApp number has no Meta app saved. Remove it and import it again.');
    return {
        appId: doc.whatsapp.appId,
        appSecret: openSecret(doc.whatsapp.appSecretSealed),
        token: openSecret(doc.apiKeySealed),
    };
}

async function savePreviousCalling(doc: OwnedNumberDoc, calling: WhatsAppCallingSettings): Promise<void> {
    await updateItem('numbers', { _id: doc._id }, { set: { 'whatsapp.previousCalling': calling } });
    if (doc.whatsapp) doc.whatsapp.previousCalling = calling;
}

async function forgetPreviousCalling(doc: OwnedNumberDoc): Promise<void> {
    await updateItem('numbers', { _id: doc._id }, { unset: ['whatsapp.previousCalling'] });
    if (doc.whatsapp) delete doc.whatsapp.previousCalling;
}

/** Webhook to the engine, the app on the number's account, then calling on (saving what it had first, once). */
async function routeCallsToAi(doc: OwnedNumberDoc): Promise<void> {
    if (!doc.whatsapp) throw new Error('This WhatsApp number has no Meta app saved. Remove it and import it again.');
    const auth = whatsappAuthOf(doc);
    const { callbackUrl, verifyToken } = whatsappWebhook(auth.appId);
    await assertAppFree(auth);
    await subscribeApp(auth, callbackUrl, verifyToken);
    await subscribeWaba(auth, doc.whatsapp.wabaId);

    // Chats work from here on. Calls need Meta to turn calling on, which it refuses below a 2,000 messaging
    // limit (138015): that is kept on the number and shown, never a reason to stop the chats.
    let calling: { on: boolean; problem: string | null };
    let savedNow = false;
    try {
        const current = await getCallingSettings(auth, doc.providerNumberId);
        // Saved before anything changes, so a failure half-way still knows what to put back.
        savedNow = !doc.whatsapp.previousCalling;
        if (savedNow) await savePreviousCalling(doc, current);
        await setCallingSettings(auth, doc.providerNumberId, { status: 'ENABLED', call_icon_visibility: 'DEFAULT' });
        calling = { on: true, problem: null };
    } catch (error) {
        if (!(error instanceof WhatsAppApiError) || error.status === 0 || error.status >= 500) throw error;
        // Meta refused: nothing changed, so the copy made now is not kept.
        if (savedNow) await forgetPreviousCalling(doc);
        calling = { on: false, problem: error.message };
    }
    await updateItem('numbers', { _id: doc._id }, { set: { 'whatsapp.calling': calling } });
    doc.whatsapp.calling = calling;
}

/** Puts the number's saved calling settings back. Nothing to do when we never changed them. */
async function restorePreviousCalling(doc: OwnedNumberDoc): Promise<void> {
    const previous = doc.whatsapp?.previousCalling;
    if (!previous) return;
    await setCallingSettings(whatsappAuthOf(doc), doc.providerNumberId, previous);
    await forgetPreviousCalling(doc);
}

export const whatsappNumbers: NumberProvider = {
    label: numberProviderInfo(VoiceProvider.WHATSAPP).label,

    startAnswering(doc) {
        return routeCallsToAi(doc);
    },

    stopAnswering(doc) {
        return restorePreviousCalling(doc);
    },

    async startPlacingCalls() {
        throw new Error(PLACING_CALLS_SOON);
    },

    async stopPlacingCalls() {},

    async prepareCall() {
        throw new Error(PLACING_CALLS_SOON);
    },

    /** Puts the number's calling settings back. */
    async release(doc) {
        try {
            whatsappAuthOf(doc);
        } catch (error) {
            console.error('[voice] removeNumber: could not open the stored WhatsApp credentials', error);
            return;
        }
        try {
            await restorePreviousCalling(doc);
        } catch (error) {
            // A token Meta no longer accepts cannot change anything in their account: forget the number anyway.
            if (!isTokenRejected(error)) throw error;
            console.error('[voice] removeNumber: Meta rejected the stored WhatsApp token', error);
        }
    },
};
