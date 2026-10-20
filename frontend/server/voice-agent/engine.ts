import 'server-only';

import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * The contract with the voice engine (Python, `backend/voice/phone.py`).
 *
 * - `VOICE_ENGINE_URL`    the engine's public base URL, origin plus an optional path, e.g.
 *                         https://api.aixellabs.in/voice (Caddy's /voice/* route; must equal the engine's
 *                         `https://` + PUBLIC_HOST) or the old https://voicelab.aixellabs.in tunnel
 * - `VOICE_ENGINE_SECRET` the engine's `VOICELAB_KEY`. Both sides sign with it.
 *
 * Signatures are HMAC-SHA256 over `"|"`-joined parts, hex, first 32 chars. A timed
 * token is `"<exp>.<sig>"` with the expiry (unix seconds) as the first signed part,
 * the same scheme the engine already uses for its media streams (`make_token`).
 */

function engineSecret(): string {
    const secret = process.env.VOICE_ENGINE_SECRET;
    if (!secret) throw new Error('VOICE_ENGINE_SECRET is not set');
    return secret;
}

export function voiceEngineUrl(): string {
    const url = process.env.VOICE_ENGINE_URL;
    if (!url) throw new Error('VOICE_ENGINE_URL is not set');
    return url.replace(/\/$/, '');
}

function hmac(parts: string[]): string {
    return createHmac('sha256', engineSecret()).update(parts.join('|')).digest('hex').slice(0, 32);
}

/** A permanent signature, for URLs a provider keeps (a number's webhook). */
export function signParts(...parts: string[]): string {
    return hmac(parts);
}

/** A short-lived token: `<exp>.<sig>` over `exp|parts`. */
export function mintToken(parts: string[], ttlSeconds = 300): string {
    const exp = String(Math.floor(Date.now() / 1000) + ttlSeconds);
    return `${exp}.${hmac([exp, ...parts])}`;
}

export function verifyToken(token: string, parts: string[]): boolean {
    const [exp, sig] = token.split('.');
    if (!exp || !sig || Number(exp) < Date.now() / 1000) return false;
    const want = Buffer.from(hmac([exp, ...parts]));
    const got = Buffer.from(sig);
    return want.length === got.length && timingSafeEqual(want, got);
}

/** The browser's playground socket: `wss://<engine>/play?agent=…&user=…&t=…`. */
export function playgroundSocketUrl(agentId: string, userId: string): string {
    const t = mintToken(['play', agentId, userId], 120);
    const base = voiceEngineUrl().replace(/^http/, 'ws');
    return `${base}/play?agent=${agentId}&user=${userId}&t=${encodeURIComponent(t)}`;
}

/**
 * Where a provider sends a customer number's calls and events: Telnyx `/texml?n=<numberId>&sig=…`
 * and `/telnyx-events?n=…&sig=…`, VoiceLink `/voicelink-events?n=…&sig=…`, Twilio `/twiml?n=…&sig=…`
 * (the number's Voice URL, fetched with POST; the engine answers with `<Connect><Stream>`).
 */
export function numberWebhookUrl(
    path: '/texml' | '/telnyx-events' | '/voicelink-events' | '/twiml',
    numberId: string,
): string {
    return `${voiceEngineUrl()}${path}?n=${numberId}&sig=${signParts('number', numberId)}`;
}

/** The media socket a VoiceLink number's bot streams calls in to: `wss://<engine>/voicelink?n=…&sig=…`. */
export function voicelinkSocketUrl(numberId: string): string {
    const base = voiceEngineUrl().replace(/^http/, 'ws');
    return `${base}/voicelink?n=${numberId}&sig=${signParts('number', numberId)}`;
}

/** Server-to-engine call, authenticated with the shared secret. */
export async function engineFetch<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${voiceEngineUrl()}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${engineSecret()}` },
        body: JSON.stringify(body),
        cache: 'no-store',
    });
    const text = await res.text();
    // The whole body goes into the error: callers read its JSON `error` (cutting it broke the parse).
    if (!res.ok) throw new Error(`Voice engine ${path}: HTTP ${res.status} ${text.slice(0, 2000)}`);
    return JSON.parse(text) as T;
}

/**
 * Customer provider keys at rest: AES-256-GCM, key = sha256("aixel-voice-secrets|" + secret),
 * stored as `v1.<base64url(iv[12] + ciphertext + tag[16])>`. The engine opens them the same way.
 */
function sealKey(): Buffer {
    return createHash('sha256').update(`aixel-voice-secrets|${engineSecret()}`).digest();
}

export function sealSecret(plain: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', sealKey(), iv);
    const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    return `v1.${Buffer.concat([iv, body, cipher.getAuthTag()]).toString('base64url')}`;
}

export function openSecret(sealed: string): string {
    const [version, payload] = sealed.split('.');
    if (version !== 'v1' || !payload) throw new Error('Unknown sealed secret format');
    const raw = Buffer.from(payload, 'base64url');
    const decipher = createDecipheriv('aes-256-gcm', sealKey(), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(raw.length - 16));
    return Buffer.concat([decipher.update(raw.subarray(12, raw.length - 16)), decipher.final()]).toString('utf8');
}
