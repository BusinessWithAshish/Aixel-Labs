import 'server-only';

import { createHash, randomBytes } from 'node:crypto';
import { type MongoObjectId, type VoiceSoftphoneDoc, VoiceProvider } from '@aixellabs/backend/db';
import { updateItem, voiceAccountsCollection } from '@/server/voice-agent/accounts';
import { numberWebhookUrl, openSecret, sealSecret } from '@/server/voice-agent/engine';
import type { OwnedNumberDoc } from '@/server/voice-agent/number-provider';
import {
    getCredentialConnection,
    isSipRegistered,
    setTexmlSipSubdomain,
    TelnyxApiError,
    updateCredentialConnection,
} from '@/server/voice-agent/telnyx';
import { appLabel, ensureTexmlApp } from '@/server/voice-agent/telnyx-numbers';
import { ensureTelnyxConnection, ensureTelnyxCredential } from '@/server/voice-agent/web-phone';

/**
 * The softphone: Linphone (set up from a one-time link or QR code, see helpers/linphone-provisioning.ts) signed in to the owner's own Telnyx account, so they hear their
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
 * - The browser (WebRTC over 443, which no network blocks) does the same with the number's telephony credential
 *   (the web dialer's): it dials the number's SIP address, or the agent dials `sip:<gencred…>@sip.telnyx.com`
 *   (`to` = BROWSER_TARGET) while the page waits for the call.
 */

export const SOFTPHONE_DOMAIN = 'sip.telnyx.com';
/** What placeTestCall takes as `to` for "call my softphone". */
export const SOFTPHONE_TARGET = 'softphone';
/** What placeTestCall takes as `to` for "call me in this browser". */
export const BROWSER_TARGET = 'browser';

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

/** How long Linphone's setup link works (it also stops after its first fetch). */
const PROVISIONING_TTL_MS = 10 * 60 * 1000;
const PROVISIONING_TOKEN = /^[A-Za-z0-9_-]{43}$/;

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

/**
 * Sets up the softphone on `number`'s Telnyx account, or gives the one there a new password. Returns the login and
 * the token of Linphone's one-time setup link; the password is shown now and kept nowhere but behind that link.
 */
export async function issueSoftphoneLogin(
    userId: MongoObjectId,
    number: OwnedNumberDoc,
): Promise<{ userName: string; password: string; token: string; expiresAt: Date }> {
    if (number.provider !== VoiceProvider.TELNYX) throw new Error('The softphone works with Telnyx numbers for now.');
    const key = openSecret(number.apiKeySealed);
    const connectionId = await ensureTelnyxConnection(key);
    const { user_name: userName } = await getCredentialConnection(key, connectionId);
    const password = randomBytes(18).toString('base64url');
    await updateCredentialConnection(key, connectionId, { password });

    const now = new Date();
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(now.getTime() + PROVISIONING_TTL_MS);
    const current = await getSoftphone(userId);
    await saveSoftphone(userId, {
        provider: VoiceProvider.TELNYX,
        numberId: number._id,
        connectionId,
        userName,
        provisioning: { tokenHash: hashToken(token), passwordSealed: sealSecret(password), expiresAt },
        createdAt: current?.connectionId === connectionId ? current.createdAt : now,
        updatedAt: now,
    });
    return { userName, password, token, expiresAt };
}

/**
 * The login behind a Linphone setup link, once: the link is spent by this fetch (or was, or expired), so a second
 * fetch gets null. Called by the public route Linphone fetches, which has no session: the token is the key.
 */
export async function takeSoftphoneProvisioning(token: string): Promise<{ userName: string; password: string } | null> {
    if (!PROVISIONING_TOKEN.test(token)) return null;
    const accounts = await voiceAccountsCollection();
    const doc = await accounts.findOneAndUpdate(
        { 'softphone.provisioning.tokenHash': hashToken(token), 'softphone.provisioning.expiresAt': { $gt: new Date() } },
        { $set: { 'softphone.provisioning': null } },
        { projection: { softphone: 1 } },
    );
    const provisioning = doc?.softphone?.provisioning;
    return provisioning ? { userName: doc.softphone!.userName, password: openSecret(provisioning.passwordSealed) } : null;
}

/**
 * Signs the softphone out for good: the connection gets a password nobody knows. The connection stays (the browser
 * phone uses it). Forgotten here even when Telnyx no longer takes the number's key.
 */
export async function removeSoftphone(userId: MongoObjectId, number: OwnedNumberDoc | null): Promise<void> {
    const softphone = await getSoftphone(userId);
    if (!softphone) return;
    if (number) {
        try {
            await updateCredentialConnection(openSecret(number.apiKeySealed), softphone.connectionId, {
                password: randomBytes(24).toString('base64url'),
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

/** The SIP URI that rings this browser, signed in with `number`'s telephony credential (the web dialer's). */
export async function browserUri(number: OwnedNumberDoc): Promise<string> {
    if (number.provider !== VoiceProvider.TELNYX) throw new Error('Only a Telnyx number can ring this browser for now.');
    const { key, connectionId, credential } = await ensureTelnyxCredential(number);
    if (!credential.sip_username) throw new Error('Telnyx did not give the browser phone a SIP address. Try again.');
    // Calls from the account's own connections only (the agent's), on connections made before this was set.
    await updateCredentialConnection(key, connectionId, {});
    return softphoneUri(credential.sip_username);
}

/** How long a rehearsal's address works (it is also spent by its first call). */
const REHEARSAL_TTL_MS = 10 * 60 * 1000;

/**
 * An outbound rehearsal: the owner dials the returned SIP user on the returned host and `agentId` runs the call as
 * if it had called them from `number` (engine: rehearsal_texml), with `variables`. Works on a trial account (the
 * call comes IN). The host is a SIP subdomain in `number`'s Telnyx account: a number there whose AI answers, else a
 * TeXML app made for `number` itself (its calls keep ringing where they did). Latest one wins.
 */
export async function issueRehearsal(
    number: OwnedNumberDoc,
    accountNumbers: OwnedNumberDoc[],
    agent: { _id: MongoObjectId; name: string },
    variables: Record<string, string>,
): Promise<{ user: string; host: string; expiresAt: Date }> {
    if (number.provider !== VoiceProvider.TELNYX) throw new Error('Rehearsals work with Telnyx numbers for now.');
    const answering = [number, ...accountNumbers].find((n) => n.texmlAppId && inSoftphoneAccount(n, number));
    const host = answering
        ? await ensureSipHost(answering)
        : await ensureSipHost({ ...number, texmlAppId: await ensureTexmlApp(number, openSecret(number.apiKeySealed)) });
    if (!host) throw new Error('Could not give this number a SIP address. Try again.');
    const token = randomBytes(12).toString('hex');
    const expiresAt = new Date(Date.now() + REHEARSAL_TTL_MS);
    const accounts = await voiceAccountsCollection();
    await accounts.updateOne(
        { userId: number.userId },
        {
            $set: {
                rehearsal: { tokenHash: hashToken(token), agentId: agent._id, numberId: number._id, variables, expiresAt },
                updatedAt: new Date(),
            },
        },
    );
    return { user: `${sipUserFor(agent.name)}-rehearse-${token}`, host, expiresAt };
}
