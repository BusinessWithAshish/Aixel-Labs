import 'server-only';

import { randomBytes } from 'node:crypto';
import AccessToken from 'twilio/lib/jwt/AccessToken';
import { VoiceProvider } from '@aixellabs/backend/db';
import { mintToken, openSecret, verifyToken } from '@/server/voice-agent/engine';
import type { OwnedNumberDoc } from '@/server/voice-agent/number-provider';
import {
    createCredentialConnection,
    createTelephonyCredential,
    createTelephonyCredentialToken,
    listCredentialConnections,
    listOutboundVoiceProfiles,
    listTelephonyCredentials,
} from '@/server/voice-agent/telnyx';
import { listApplications, saveApplication } from '@/server/voice-agent/twilio';
import { twilioAuthOf } from '@/server/voice-agent/twilio-numbers';

/**
 * The browser phone: the owner calls out from one of their numbers in the browser. It never
 * touches the number's own routing, so a number the AI answers keeps sending its calls to the AI,
 * and the browser only ever places calls (it is not offered incoming ones).
 *
 * - Telnyx: one credential connection "Aixel Labs web phone" per account (on its first outbound
 *   voice profile, like the Call Control app) and one telephony credential per number on it. The
 *   browser gets that credential's JWT (Telnyx: valid 24 hours) and sets the number as caller ID.
 * - Twilio: one TwiML app "Aixel Labs web phone" per account whose Voice URL is our
 *   `/api/voice-agent/web-phone/twiml`, and an access token (1 hour) signed with the number's API
 *   key. The browser's call carries the number id and a signed `t`; the route answers with a
 *   `<Dial callerId=number>`, so the caller ID is set here, never by the browser.
 * - VoiceLink: no browser calling (no WebRTC SDK; its media only reaches our engine).
 */

export type WebPhoneSession =
    | { provider: VoiceProvider.TELNYX; loginToken: string; callerNumber: string }
    | { provider: VoiceProvider.TWILIO; accessToken: string; params: Record<string, string> };

const WEB_PHONE_LABEL = 'Aixel Labs web phone';
const TWILIO_TOKEN_TTL_SECONDS = 3600;
/** Telnyx: a new credential may need ~5 s before it can sign in. */
const NEW_CREDENTIAL_DELAY_MS = 5000;

/** Why a number cannot call from the browser, or null when it can. */
export function webPhoneProblem(doc: Pick<OwnedNumberDoc, 'provider' | 'twilio'>): string | null {
    if (doc.provider === VoiceProvider.VOICELINK) return 'VoiceLink numbers cannot call from the browser.';
    if (doc.provider === VoiceProvider.TWILIO && !doc.twilio?.apiKeySid) {
        return 'This Twilio number was connected with the Auth Token. Connect it again with an API key to call from the browser.';
    }
    return null;
}

/** The account's "Aixel Labs web phone" credential connection, created on first need. The softphone signs in with its SIP login. */
export async function ensureTelnyxConnection(key: string): Promise<string> {
    const connections = await listCredentialConnections(key);
    const ours = connections.find((c) => c.connection_name === WEB_PHONE_LABEL);
    if (ours) return ours.id;
    const outboundVoiceProfileId = (await listOutboundVoiceProfiles(key))[0]?.id;
    if (!outboundVoiceProfileId) {
        throw new Error(
            'Your Telnyx account has no outbound voice profile. Create one in the Telnyx portal (Voice, Outbound Voice Profiles), then try again.',
        );
    }
    // Only tokens sign in; Telnyx still wants a SIP username (alphanumeric, unique) and password.
    const created = await createCredentialConnection(key, {
        connectionName: WEB_PHONE_LABEL,
        userName: `aixel${randomBytes(8).toString('hex')}`,
        password: randomBytes(18).toString('base64url'),
        outboundVoiceProfileId,
    });
    return created.id;
}

async function telnyxSession(doc: OwnedNumberDoc): Promise<WebPhoneSession> {
    const key = openSecret(doc.apiKeySealed);
    const connectionId = await ensureTelnyxConnection(key);
    const name = `${WEB_PHONE_LABEL} ${doc.phoneNumber}`;
    let credential = (await listTelephonyCredentials(key, name)).find(
        (c) => c.name === name && c.connection_id === connectionId && !c.expired,
    );
    if (!credential) {
        credential = await createTelephonyCredential(key, { connectionId, name });
        await new Promise((resolve) => setTimeout(resolve, NEW_CREDENTIAL_DELAY_MS));
    }
    const loginToken = await createTelephonyCredentialToken(key, credential.id);
    return { provider: VoiceProvider.TELNYX, loginToken, callerNumber: doc.phoneNumber };
}

/** Where Twilio fetches the TwiML for a browser call, on the site the owner is using now. */
function twimlUrl(origin: string): string {
    return `${origin}/api/voice-agent/web-phone/twiml`;
}

async function twilioSession(doc: OwnedNumberDoc, origin: string): Promise<WebPhoneSession> {
    const auth = twilioAuthOf(doc);
    if (!auth.apiKeySid) throw new Error(webPhoneProblem(doc) ?? 'This Twilio number has no API key.');
    const voiceUrl = twimlUrl(origin);
    const app = (await listApplications(auth, WEB_PHONE_LABEL))[0];
    const appSid =
        app?.voice_url === voiceUrl
            ? app.sid
            : (await saveApplication(auth, { sid: app?.sid, friendlyName: WEB_PHONE_LABEL, voiceUrl })).sid;

    const numberId = doc._id.toString();
    const token = new AccessToken(auth.accountSid, auth.apiKeySid, auth.secret, {
        identity: `web_${numberId}`,
        ttl: TWILIO_TOKEN_TTL_SECONDS,
    });
    token.addGrant(new AccessToken.VoiceGrant({ outgoingApplicationSid: appSid, incomingAllow: false }));
    return {
        provider: VoiceProvider.TWILIO,
        accessToken: token.toJwt(),
        params: { n: numberId, t: mintToken(['web-phone', numberId], TWILIO_TOKEN_TTL_SECONDS) },
    };
}

/** A short-lived browser credential for calling out from `doc`. Nothing else secret leaves the server. */
export function startWebPhoneSession(doc: OwnedNumberDoc, origin: string): Promise<WebPhoneSession> {
    const problem = webPhoneProblem(doc);
    if (problem) throw new Error(problem);
    return doc.provider === VoiceProvider.TWILIO ? twilioSession(doc, origin) : telnyxSession(doc);
}

/** The `t` a Twilio browser call carries (see `twilioSession`). */
export function verifyWebPhoneToken(numberId: string, t: string): boolean {
    return verifyToken(t, ['web-phone', numberId]);
}
