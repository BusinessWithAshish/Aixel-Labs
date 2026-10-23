import 'server-only';

import { randomBytes } from 'node:crypto';
import { type MongoObjectId, type VoiceSoftphoneDoc, VoiceProvider } from '@aixellabs/backend/db';
import { updateItem, voiceAccountsCollection } from '@/server/voice-agent/accounts';
import { numberWebhookUrl, openSecret } from '@/server/voice-agent/engine';
import type { OwnedNumberDoc } from '@/server/voice-agent/number-provider';
import {
    getCredentialConnection,
    isSipRegistered,
    setTexmlSipSubdomain,
    TelnyxApiError,
    updateCredentialConnection,
} from '@/server/voice-agent/telnyx';
import { appLabel } from '@/server/voice-agent/telnyx-numbers';
import { ensureTelnyxConnection } from '@/server/voice-agent/web-phone';

/**
 * The softphone: a SIP app (Zoiper, Linphone…) signed in to the owner's own Telnyx account, so they hear their
 * agents exactly as a phone caller does, over the internet, from any country and on a trial account.
 *
 * - The login is the SIP username + password of the account's "Aixel Labs web phone" credential connection (one per
 *   account, shared with the web dialer: trial accounts may hold one connection of each type). Its SIP URI takes
 *   calls from the account's own connections only ("internal"), which is how an agent calls it.
 * - Calls IN: a number's TeXML app gets a SIP subdomain that only the account's own connections may call, so
 *   `sip:<anything>@<subdomain>.sip.telnyx.com` from the softphone reaches the number's inbound agent like a call
 *   to the number. Strangers cannot, so nobody else runs up the owner's Gemini bill.
 * - Calls OUT: the agent dials `sip:<userName>@sip.telnyx.com` (placeTestCall, `to` = SOFTPHONE_TARGET).
 *   Telnyx refuses that on a trial account (D61) until the account is upgraded.
 */

export const SOFTPHONE_DOMAIN = 'sip.telnyx.com';
/** What placeTestCall takes as `to` for "call my softphone". */
export const SOFTPHONE_TARGET = 'softphone';

export function softphoneUri(userName: string): string {
    return `sip:${userName}@${SOFTPHONE_DOMAIN}`;
}

/** A SIP user part people can read: the agent's name, letters and digits only. */
export function sipUserFor(agentName: string): string {
    return (
        agentName
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '')
            .slice(0, 24) || 'agent'
    );
}

export async function getSoftphone(userId: MongoObjectId): Promise<VoiceSoftphoneDoc | null> {
    const accounts = await voiceAccountsCollection();
    const doc = await accounts.findOne({ userId }, { projection: { softphone: 1 } });
    return doc?.softphone ?? null;
}

async function saveSoftphone(userId: MongoObjectId, softphone: VoiceSoftphoneDoc | null): Promise<void> {
    const accounts = await voiceAccountsCollection();
    await accounts.updateOne({ userId }, { $set: { softphone, updatedAt: new Date() } });
}

/** Same Telnyx account (same API key) as the softphone's number. */
export function inSoftphoneAccount(doc: OwnedNumberDoc, softphoneNumber: OwnedNumberDoc): boolean {
    return (
        doc.provider === VoiceProvider.TELNYX &&
        (doc._id.equals(softphoneNumber._id) || openSecret(doc.apiKeySealed) === openSecret(softphoneNumber.apiKeySealed))
    );
}

/**
 * Sets up the softphone on `number`'s Telnyx account, or gives the one there a new password. Returns the login;
 * the password is not kept anywhere, so this is the only time it is shown.
 */
export async function issueSoftphoneLogin(
    userId: MongoObjectId,
    number: OwnedNumberDoc,
): Promise<{ userName: string; password: string }> {
    if (number.provider !== VoiceProvider.TELNYX) throw new Error('The softphone works with Telnyx numbers for now.');
    const key = openSecret(number.apiKeySealed);
    const connectionId = await ensureTelnyxConnection(key);
    const { user_name: userName } = await getCredentialConnection(key, connectionId);
    const password = randomBytes(18).toString('base64url');
    await updateCredentialConnection(key, connectionId, { password, sipUriCalling: 'internal' });

    const now = new Date();
    const current = await getSoftphone(userId);
    await saveSoftphone(userId, {
        provider: VoiceProvider.TELNYX,
        numberId: number._id,
        connectionId,
        userName,
        createdAt: current?.connectionId === connectionId ? current.createdAt : now,
        updatedAt: now,
    });
    return { userName, password };
}

/**
 * Signs the softphone out for good: the connection gets a password nobody knows and its SIP URI takes no calls.
 * The connection stays (the web dialer uses it). Forgotten here even when Telnyx no longer takes the number's key.
 */
export async function removeSoftphone(userId: MongoObjectId, number: OwnedNumberDoc | null): Promise<void> {
    const softphone = await getSoftphone(userId);
    if (!softphone) return;
    if (number) {
        try {
            await updateCredentialConnection(openSecret(number.apiKeySealed), softphone.connectionId, {
                password: randomBytes(24).toString('base64url'),
                sipUriCalling: 'disabled',
            });
        } catch (error) {
            const gone = error instanceof TelnyxApiError && [401, 403, 404].includes(error.status);
            if (!gone) throw error;
            console.error('[voice] removeSoftphone: Telnyx refused, forgetting it anyway', error);
        }
    }
    await saveSoftphone(userId, null);
}

/** Whether a softphone is signed in now, or null when Telnyx would not say. */
export async function softphoneRegistered(softphone: VoiceSoftphoneDoc, number: OwnedNumberDoc): Promise<boolean | null> {
    try {
        return await isSipRegistered(openSecret(number.apiKeySealed), softphone.userName);
    } catch (error) {
        console.error('[voice] softphoneRegistered: Telnyx would not say', error);
        return null;
    }
}

/**
 * The SIP host of a number that answers with an agent: its TeXML app's subdomain, set on first need. Null when
 * the AI does not answer the number (no TeXML app).
 */
export async function ensureSipHost(number: OwnedNumberDoc): Promise<string | null> {
    if (!number.texmlAppId) return null;
    if (number.sipSubdomain) return `${number.sipSubdomain}.${SOFTPHONE_DOMAIN}`;
    // Unique across Telnyx: a random one nobody can guess or collide with.
    const sipSubdomain = `aixel${randomBytes(6).toString('hex')}`;
    await setTexmlSipSubdomain(openSecret(number.apiKeySealed), number.texmlAppId, {
        friendlyName: appLabel(number),
        voiceUrl: numberWebhookUrl('/texml', number._id.toString()),
        sipSubdomain,
    });
    await updateItem('numbers', { _id: number._id }, { set: { sipSubdomain } });
    return `${sipSubdomain}.${SOFTPHONE_DOMAIN}`;
}
