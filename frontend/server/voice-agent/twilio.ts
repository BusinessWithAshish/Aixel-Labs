import 'server-only';

/**
 * Minimal Twilio REST client (2010-04-01 API), used with the CUSTOMER's credentials (never ours).
 * `TWILIO_API_BASE` points it at a local fake in e2e; production uses api.twilio.com.
 *
 * Twilio takes form-encoded bodies and answers JSON with snake_case fields. Every path names the
 * account (`/Accounts/AC…`). Auth is HTTP Basic: an API key (`SK…` + its secret) or the account's
 * own SID + Auth Token. Errors come back as `{ code, message, more_info, status }`.
 */

const TWILIO_TIMEOUT_MS = 15_000;
const PAGE_SIZE = 1000;
const MAX_PAGES = 20;

export type TwilioAuth = {
    /** AC…: the account every path names. */
    accountSid: string;
    /** SK…: the API key, or null when `secret` is the account's Auth Token. */
    apiKeySid: string | null;
    /** The API key's secret, or the Auth Token. */
    secret: string;
};

export type TwilioAccount = {
    sid: string;
    friendly_name?: string;
    /** "active" | "suspended" | "closed" */
    status: string;
    /** "Trial" | "Full" */
    type?: string;
};

export type TwilioIncomingNumber = {
    sid: string;
    phone_number: string;
    friendly_name?: string;
    voice_url: string | null;
    voice_method: string | null;
    voice_application_sid: string | null;
    trunk_sid: string | null;
    status?: string;
    capabilities?: { voice?: boolean; sms?: boolean; mms?: boolean; fax?: boolean };
};

export type TwilioRecording = {
    sid: string;
    call_sid?: string;
    /** "in-progress" | "paused" | "stopped" | "processing" | "completed" | "absent" */
    status: string;
    /** Seconds, as a string ("-1" while recording). */
    duration?: string | null;
    channels?: number;
};

/** The writable voice routing of a number, in Twilio's own field names. */
export type TwilioVoiceUpdate = {
    VoiceUrl?: string;
    VoiceMethod?: string;
    VoiceApplicationSid?: string;
    TrunkSid?: string;
};

type TwilioErrorBody = { code?: number; message?: string };
type TwilioPage = { next_page_uri?: string | null };

export class TwilioApiError extends Error {
    constructor(
        message: string,
        readonly status: number,
        /** Twilio's own error code, e.g. 20003 (authentication). */
        readonly code?: number,
    ) {
        super(message);
        this.name = 'TwilioApiError';
    }
}

/** A Restricted API key without a permission we use (Twilio answers 403). */
const KEY_PERMISSIONS_MISSING =
    'Your Twilio API key is not allowed to do this. Give it the permissions in the setup guide (Phone Numbers: read and update numbers; Voice: Calls and Call Recordings), or use a Standard API key.';

/** Twilio's error codes the customer can act on, in plain words. */
const KNOWN_ERRORS: Record<number, string> = {
    20003: 'Twilio rejected these credentials. Check the Account SID, and the API key SID and secret (or the Auth Token).',
    20005: 'This Twilio account is not active (suspended or closed). Sort it out in the Twilio Console, then try again.',
    20008: 'These are Twilio test credentials, which cannot see or change real numbers. Use your live Account SID and a live API key.',
    20429: 'Twilio is getting too many requests right now. Try again in a minute.',
    70051: KEY_PERMISSIONS_MISSING,
};

export function twilioBase(): string {
    return (process.env.TWILIO_API_BASE ?? 'https://api.twilio.com').replace(/\/$/, '');
}

/** `Basic …` for the customer's credentials: the API key SID, or the account SID with the Auth Token. */
export function twilioAuthorization(auth: TwilioAuth): string {
    const user = auth.apiKeySid ?? auth.accountSid;
    return `Basic ${Buffer.from(`${user}:${auth.secret}`).toString('base64')}`;
}

function parseError(text: string): TwilioErrorBody {
    try {
        const body = JSON.parse(text) as TwilioErrorBody;
        return { code: typeof body.code === 'number' ? body.code : undefined, message: body.message };
    } catch {
        return {};
    }
}

function describeError(status: number, body: TwilioErrorBody): string {
    if (body.code && KNOWN_ERRORS[body.code]) return KNOWN_ERRORS[body.code];
    if (status === 401) return KNOWN_ERRORS[20003];
    if (status === 403) return KEY_PERMISSIONS_MISSING;
    if (body.message) return `Twilio: ${body.message.replace(/\s+/g, ' ').trim()}`;
    return `Twilio request failed (HTTP ${status})`;
}

function accountPath(auth: TwilioAuth, rest: string): string {
    return `/2010-04-01/Accounts/${encodeURIComponent(auth.accountSid)}${rest}`;
}

async function twilioRequest<T>(
    auth: TwilioAuth,
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    form?: Record<string, string>,
): Promise<T> {
    let res: Response;
    try {
        res = await fetch(`${twilioBase()}${path}`, {
            method,
            headers: {
                Authorization: twilioAuthorization(auth),
                Accept: 'application/json',
                ...(form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
            },
            body: form ? new URLSearchParams(form).toString() : undefined,
            cache: 'no-store',
            signal: AbortSignal.timeout(TWILIO_TIMEOUT_MS),
        });
    } catch {
        throw new TwilioApiError('Could not reach Twilio. Try again in a moment.', 0);
    }

    const text = await res.text();
    if (!res.ok) {
        const body = parseError(text);
        throw new TwilioApiError(describeError(res.status, body), res.status, body.code);
    }
    return (text ? JSON.parse(text) : {}) as T;
}

/** `GET /Accounts/{AC}.json` — the credentials check, and whether the account is a trial. */
export function getAccount(auth: TwilioAuth): Promise<TwilioAccount> {
    return twilioRequest<TwilioAccount>(auth, 'GET', accountPath(auth, '.json'));
}

/** `GET /Accounts/{AC}/IncomingPhoneNumbers.json`, every page (Twilio hands out the next page's path). */
export async function listIncomingNumbers(auth: TwilioAuth): Promise<TwilioIncomingNumber[]> {
    const numbers: TwilioIncomingNumber[] = [];
    let path: string | null = accountPath(auth, `/IncomingPhoneNumbers.json?PageSize=${PAGE_SIZE}`);
    for (let page = 0; path && page < MAX_PAGES; page++) {
        const res: TwilioPage & { incoming_phone_numbers?: TwilioIncomingNumber[] } = await twilioRequest(auth, 'GET', path);
        numbers.push(...(res.incoming_phone_numbers ?? []));
        // Only a path inside this API is followed: a link elsewhere would carry the customer's credentials there.
        path = res.next_page_uri?.startsWith('/2010-04-01/') ? res.next_page_uri : null;
    }
    return numbers;
}

/** `GET /Accounts/{AC}/IncomingPhoneNumbers/{PN}.json` — one number, with where its calls go now. */
export function getIncomingNumber(auth: TwilioAuth, numberSid: string): Promise<TwilioIncomingNumber> {
    return twilioRequest<TwilioIncomingNumber>(
        auth,
        'GET',
        accountPath(auth, `/IncomingPhoneNumbers/${encodeURIComponent(numberSid)}.json`),
    );
}

/**
 * `POST /Accounts/{AC}/IncomingPhoneNumbers/{PN}.json` with the voice fields to change. An empty
 * string clears a field; fields left out are not touched.
 */
export function updateIncomingNumber(
    auth: TwilioAuth,
    numberSid: string,
    update: TwilioVoiceUpdate,
): Promise<TwilioIncomingNumber> {
    const form: Record<string, string> = {};
    for (const [key, value] of Object.entries(update)) if (value !== undefined) form[key] = value;
    return twilioRequest<TwilioIncomingNumber>(
        auth,
        'POST',
        accountPath(auth, `/IncomingPhoneNumbers/${encodeURIComponent(numberSid)}.json`),
        form,
    );
}

/** `GET /Accounts/{AC}/Calls/{CA}/Recordings.json` — the call's recordings. */
export async function listCallRecordings(auth: TwilioAuth, callSid: string): Promise<TwilioRecording[]> {
    const res = await twilioRequest<{ recordings?: TwilioRecording[] }>(
        auth,
        'GET',
        accountPath(auth, `/Calls/${encodeURIComponent(callSid)}/Recordings.json`),
    );
    return res.recordings ?? [];
}

/** Where a recording's audio is served (needs the same credentials; Twilio redirects to a short-lived link). */
export function recordingMediaUrl(auth: TwilioAuth, recordingSid: string, format: 'mp3' | 'wav'): string {
    return `${twilioBase()}${accountPath(auth, `/Recordings/${encodeURIComponent(recordingSid)}.${format}`)}`;
}
