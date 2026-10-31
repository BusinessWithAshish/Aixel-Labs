import 'server-only';

import type { WhatsAppCallingSettings } from '@aixellabs/backend/db';

/**
 * Minimal Meta Graph API client for the WhatsApp Cloud API, used with the CUSTOMER's own Meta app
 * (never ours). `WHATSAPP_GRAPH_BASE` points it at a local fake in e2e; production uses graph.facebook.com.
 *
 * Two credentials: the system-user access token (the WhatsApp account and its numbers) and the app
 * token `<app id>|<app secret>` (the app's own webhook subscription, and checking the access token).
 * Both go in the Authorization header, never in a URL. Errors come back as
 * `{ error: { message, code, error_subcode, error_user_msg } }`.
 */

/** The engine's whatsapp.py uses the same version. */
const GRAPH_VERSION = 'v23.0';
const GRAPH_TIMEOUT_MS = 15_000;
const MAX_PAGES = 20;

export type WhatsAppAuth = {
    /** The customer's Meta app (App settings > Basic). */
    appId: string;
    appSecret: string;
    /** A system user's access token, with whatsapp_business_management + whatsapp_business_messaging. */
    token: string;
};

export type WhatsAppTokenInfo = {
    is_valid?: boolean;
    app_id?: string;
    scopes?: string[];
    /** Per permission, the WhatsApp accounts (WABA ids) it was granted on; none when it "applies to all objects". */
    granular_scopes?: { scope: string; target_ids?: string[] }[];
};

export type WhatsAppPhoneNumber = {
    id: string;
    display_phone_number: string;
    verified_name?: string;
    /** "CLOUD_API" for a number the Cloud API can use (On-Premises and the Business app cannot). */
    platform_type?: string;
};

export type WhatsAppAppSubscription = {
    object: string;
    callback_url?: string;
    active?: boolean;
    fields?: { name: string }[];
};

type GraphError = { message?: string; code?: number; error_subcode?: number; error_user_msg?: string };

export class WhatsAppApiError extends Error {
    constructor(
        message: string,
        readonly status: number,
        /** Meta's error code, e.g. 190 (access token). */
        readonly code?: number,
    ) {
        super(message);
        this.name = 'WhatsAppApiError';
    }
}

/** Meta's error codes the customer can act on, in plain words. */
const KNOWN_ERRORS: Record<number, string> = {
    190: 'Meta rejected the access token: it expired or was revoked. Generate a new system user token (one that never expires) and connect again.',
    10: 'The access token is missing a permission. Generate it again with whatsapp_business_management and whatsapp_business_messaging, for this app and this WhatsApp account.',
    200: 'The access token is missing a permission. Generate it again with whatsapp_business_management and whatsapp_business_messaging, for this app and this WhatsApp account.',
    4: 'Meta is getting too many requests from this app right now. Try again in a few minutes.',
    80007: 'Meta is getting too many requests from this WhatsApp account right now. Try again in a few minutes.',
    80008: 'Meta is getting too many requests from this WhatsApp account right now. Try again in a few minutes.',
    130429: 'This number is sending more messages than Meta allows per second right now. Try again in a moment.',
    131056: 'Too many messages went to this person in a short time. Wait a little, then send again.',
    131042: 'Meta refused because of your WhatsApp account’s payment method. Check Payment settings in WhatsApp Manager, then try again.',
    131044: 'Your WhatsApp account has no payment method, and Meta needs one before calls work (even calls coming in, which are free). Add one in WhatsApp Manager (Payment settings), then try again.',
    138015: 'Meta turns on calling only for numbers that can message at least 2,000 people a day. Verify your business in Meta Business Settings (Security Center) to raise the limit, then try again.',
    138018: 'Meta could not see this app subscribed to calls yet. Wait a minute and try again.',
    131047: 'More than 24 hours have passed since this person last wrote, so WhatsApp only allows a template message now. Reply once they write again.',
};

function graphBase(): string {
    return (process.env.WHATSAPP_GRAPH_BASE ?? 'https://graph.facebook.com').replace(/\/$/, '');
}

export function appToken(auth: WhatsAppAuth): string {
    return `${auth.appId}|${auth.appSecret}`;
}

function describeError(status: number, error: GraphError): string {
    if (error.code && KNOWN_ERRORS[error.code]) return KNOWN_ERRORS[error.code];
    if (status === 401) return KNOWN_ERRORS[190];
    const words = error.error_user_msg || error.message;
    if (words) return `Meta: ${words.replace(/\s+/g, ' ').trim()}`;
    return `Meta request failed (HTTP ${status})`;
}

async function graphRequest<T>(
    bearer: string,
    method: 'GET' | 'POST',
    path: string,
    body?: Record<string, unknown> | FormData,
): Promise<T> {
    const json = body && !(body instanceof FormData);
    let res: Response;
    try {
        res = await fetch(`${graphBase()}/${GRAPH_VERSION}${path}`, {
            method,
            headers: {
                Authorization: `Bearer ${bearer}`,
                Accept: 'application/json',
                ...(json ? { 'Content-Type': 'application/json' } : {}),
            },
            body: json ? JSON.stringify(body) : body,
            cache: 'no-store',
            signal: AbortSignal.timeout(GRAPH_TIMEOUT_MS),
        });
    } catch {
        throw new WhatsAppApiError('Could not reach Meta. Try again in a moment.', 0);
    }

    const text = await res.text();
    let answer: { error?: GraphError } & Record<string, unknown> = {};
    try {
        answer = text ? JSON.parse(text) : {};
    } catch {
        // Not JSON: the status decides.
    }
    if (!res.ok || answer.error) {
        const error = answer.error ?? {};
        throw new WhatsAppApiError(describeError(res.status, error), res.status, error.code);
    }
    return answer as T;
}

/** `GET /debug_token`, asked with the app token: is the access token valid, whose app, which permissions on which WABAs. */
export async function debugToken(auth: WhatsAppAuth): Promise<WhatsAppTokenInfo> {
    const query = new URLSearchParams({ input_token: auth.token });
    const res = await graphRequest<{ data?: WhatsAppTokenInfo }>(appToken(auth), 'GET', `/debug_token?${query}`);
    return res.data ?? {};
}

/** `GET /me/assigned_whatsapp_business_accounts`: the WhatsApp accounts (WABA ids) assigned to the token's system user, every page. */
export async function listAssignedWabas(auth: WhatsAppAuth): Promise<string[]> {
    const ids: string[] = [];
    let after: string | null = null;
    for (let page = 0; page < MAX_PAGES; page++) {
        const query = new URLSearchParams({ fields: 'id', limit: '100', ...(after ? { after } : {}) });
        const res: { data?: { id: string }[]; paging?: { cursors?: { after?: string }; next?: string } } =
            await graphRequest(auth.token, 'GET', `/me/assigned_whatsapp_business_accounts?${query}`);
        ids.push(...(res.data ?? []).map((w) => w.id));
        after = res.paging?.next ? (res.paging.cursors?.after ?? null) : null;
        if (!after) break;
    }
    return ids;
}

/** `GET /{waba-id}/phone_numbers`, every page. */
export async function listPhoneNumbers(auth: WhatsAppAuth, wabaId: string): Promise<WhatsAppPhoneNumber[]> {
    const numbers: WhatsAppPhoneNumber[] = [];
    const fields = 'id,display_phone_number,verified_name,platform_type';
    let after: string | null = null;
    for (let page = 0; page < MAX_PAGES; page++) {
        const query = new URLSearchParams({ fields, limit: '100', ...(after ? { after } : {}) });
        const res: { data?: WhatsAppPhoneNumber[]; paging?: { cursors?: { after?: string }; next?: string } } =
            await graphRequest(auth.token, 'GET', `/${encodeURIComponent(wabaId)}/phone_numbers?${query}`);
        numbers.push(...(res.data ?? []));
        // The cursor only: following `next` would send the token to whatever URL it names.
        after = res.paging?.next ? (res.paging.cursors?.after ?? null) : null;
        if (!after) break;
    }
    return numbers;
}

/** `GET /{app-id}/subscriptions`: where the app's webhooks go now. */
export async function getAppSubscriptions(auth: WhatsAppAuth): Promise<WhatsAppAppSubscription[]> {
    const res = await graphRequest<{ data?: WhatsAppAppSubscription[] }>(
        appToken(auth),
        'GET',
        `/${encodeURIComponent(auth.appId)}/subscriptions`,
    );
    return res.data ?? [];
}

/**
 * `POST /{app-id}/subscriptions`: the app's WhatsApp webhooks (calls, messages) go to `callbackUrl`.
 * Meta checks the callback right away (a GET with `verifyToken`), so the engine must be up.
 */
export async function subscribeApp(auth: WhatsAppAuth, callbackUrl: string, verifyToken: string): Promise<void> {
    await graphRequest(appToken(auth), 'POST', `/${encodeURIComponent(auth.appId)}/subscriptions`, {
        object: 'whatsapp_business_account',
        callback_url: callbackUrl,
        verify_token: verifyToken,
        fields: ['calls', 'messages'],
    });
}

/** `POST /{waba-id}/subscribed_apps`: the app (the token's) gets this WhatsApp account's webhooks. */
export async function subscribeWaba(auth: WhatsAppAuth, wabaId: string): Promise<void> {
    await graphRequest(auth.token, 'POST', `/${encodeURIComponent(wabaId)}/subscribed_apps`, {});
}

/** `GET /{phone-number-id}/settings`: the number's calling settings, the part AI answering changes. */
export async function getCallingSettings(auth: WhatsAppAuth, phoneNumberId: string): Promise<WhatsAppCallingSettings> {
    const res = await graphRequest<{ calling?: { status?: string; call_icon_visibility?: string } }>(
        auth.token,
        'GET',
        `/${encodeURIComponent(phoneNumberId)}/settings`,
    );
    const calling = res.calling ?? {};
    return {
        status: calling.status ?? 'DISABLED',
        ...(calling.call_icon_visibility ? { call_icon_visibility: calling.call_icon_visibility } : {}),
    };
}

/** `POST /{phone-number-id}/settings` with `calling`: only the fields given change. */
export async function setCallingSettings(
    auth: WhatsAppAuth,
    phoneNumberId: string,
    calling: WhatsAppCallingSettings,
): Promise<void> {
    await graphRequest(auth.token, 'POST', `/${encodeURIComponent(phoneNumberId)}/settings`, { calling });
}

/** A voice note (OGG/Opus) from the business to `to`: `POST /{phone-number-id}/media`, then an `audio` message with
 * `voice: true`, so WhatsApp plays it as a voice note. Same 24-hour rule as a text. */
export async function sendVoiceMessage(
    auth: WhatsAppAuth,
    phoneNumberId: string,
    to: string,
    ogg: Uint8Array<ArrayBuffer>,
): Promise<void> {
    const form = new FormData();
    form.append('messaging_product', 'whatsapp');
    form.append('type', 'audio/ogg');
    form.append('file', new Blob([ogg], { type: 'audio/ogg' }), 'voice-note.ogg');
    const { id } = await graphRequest<{ id: string }>(
        auth.token,
        'POST',
        `/${encodeURIComponent(phoneNumberId)}/media`,
        form,
    );
    await graphRequest(auth.token, 'POST', `/${encodeURIComponent(phoneNumberId)}/messages`, {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'audio',
        audio: { id, voice: true },
    });
}

/** `POST /{phone-number-id}/messages`: a text from the business to `to` (their WhatsApp id, digits). Free-form text
 * is only allowed within 24 hours of their last message; Meta refuses it after (131047). */
export async function sendTextMessage(auth: WhatsAppAuth, phoneNumberId: string, to: string, text: string): Promise<void> {
    await graphRequest(auth.token, 'POST', `/${encodeURIComponent(phoneNumberId)}/messages`, {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'text',
        text: { body: text, preview_url: false },
    });
}
