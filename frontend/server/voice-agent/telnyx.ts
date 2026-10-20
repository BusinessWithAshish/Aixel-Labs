import 'server-only';

/**
 * Minimal Telnyx v2 REST client, used with the CUSTOMER's API key (never ours).
 * `TELNYX_API_BASE` points it at a local fake in e2e; production uses Telnyx itself.
 *
 * Field names follow developers.telnyx.com/api-reference: TeXML apps take
 * `friendly_name` / `voice_url` / `voice_method`; Call Control apps take
 * `application_name` / `webhook_event_url` / `outbound.outbound_voice_profile_id`.
 */

const TELNYX_TIMEOUT_MS = 15_000;
const PAGE_SIZE = 250;
const MAX_PAGES = 20;

export type TelnyxPhoneNumber = {
    id: string;
    phone_number: string;
    status: string;
    connection_id?: string | null;
    connection_name?: string | null;
};

export type TelnyxOutboundVoiceProfile = {
    id: string;
    name: string;
};

export type TelnyxRecording = {
    id: string;
    call_control_id?: string;
    status: string;
    duration_millis?: number;
    download_urls?: { mp3?: string; wav?: string };
    created_at?: string;
};

type TelnyxData<T> = { data: T };
type TelnyxPage<T> = { data: T[]; meta?: { page_number?: number; total_pages?: number } };
type TelnyxErrorBody = { errors?: { code?: string; title?: string; detail?: string }[] };

export class TelnyxApiError extends Error {
    constructor(
        message: string,
        readonly status: number,
        /** Telnyx's own error code, e.g. "10039" (an account-level limit). */
        readonly code?: string,
    ) {
        super(message);
        this.name = 'TelnyxApiError';
    }
}

function telnyxBase(): string {
    return (process.env.TELNYX_API_BASE ?? 'https://api.telnyx.com').replace(/\/$/, '');
}

function firstError(text: string): { code?: string; detail?: string } {
    try {
        const first = (JSON.parse(text) as TelnyxErrorBody).errors?.[0];
        return { code: first?.code, detail: first?.detail ?? first?.title };
    } catch {
        return {};
    }
}

/**
 * Telnyx's own words win. A 403 is not always a bad key: trial accounts get 403 for their
 * limits ("You may only have 1 Call Control Application(s)…", "upgrade to call IN").
 */
function describeError(status: number, text: string): string {
    const { detail } = firstError(text);
    if (status === 401 || (status === 403 && !detail)) {
        return 'Telnyx rejected this API key. Copy a V2 API key from the Telnyx portal (Account settings, Keys & credentials).';
    }
    if (detail) return `Telnyx: ${detail}`;
    return `Telnyx request failed (HTTP ${status})`;
}

async function telnyxRequest<T>(
    apiKey: string,
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    path: string,
    body?: Record<string, unknown>,
): Promise<T> {
    let res: Response;
    try {
        res = await fetch(`${telnyxBase()}${path}`, {
            method,
            headers: {
                Authorization: `Bearer ${apiKey}`,
                Accept: 'application/json',
                ...(body ? { 'Content-Type': 'application/json' } : {}),
            },
            body: body ? JSON.stringify(body) : undefined,
            cache: 'no-store',
            signal: AbortSignal.timeout(TELNYX_TIMEOUT_MS),
        });
    } catch {
        throw new TelnyxApiError('Could not reach Telnyx. Try again in a moment.', 0);
    }

    const text = await res.text();
    if (!res.ok) throw new TelnyxApiError(describeError(res.status, text), res.status, firstError(text).code);
    return (text ? JSON.parse(text) : {}) as T;
}

async function listAllPages<T>(apiKey: string, path: string): Promise<T[]> {
    const items: T[] = [];
    for (let pageNumber = 1; pageNumber <= MAX_PAGES; pageNumber++) {
        const query = new URLSearchParams({ 'page[number]': String(pageNumber), 'page[size]': String(PAGE_SIZE) });
        const page = await telnyxRequest<TelnyxPage<T>>(apiKey, 'GET', `${path}?${query}`);
        items.push(...page.data);
        const totalPages = page.meta?.total_pages ?? 1;
        if (pageNumber >= totalPages || page.data.length === 0) break;
    }
    return items;
}

/** `GET /v2/phone_numbers` — every number in the account. Also the key check. */
export function listPhoneNumbers(apiKey: string): Promise<TelnyxPhoneNumber[]> {
    return listAllPages<TelnyxPhoneNumber>(apiKey, '/v2/phone_numbers');
}

/** `GET /v2/call_control_applications` */
export function listCallControlApplications(apiKey: string): Promise<{ id: string; application_name: string }[]> {
    return listAllPages<{ id: string; application_name: string }>(apiKey, '/v2/call_control_applications');
}

/** `GET /v2/outbound_voice_profiles` */
export function listOutboundVoiceProfiles(apiKey: string): Promise<TelnyxOutboundVoiceProfile[]> {
    return listAllPages<TelnyxOutboundVoiceProfile>(apiKey, '/v2/outbound_voice_profiles');
}

/** `POST /v2/texml_applications` — Telnyx fetches TeXML from `voiceUrl` when a call comes in. */
export async function createTexmlApplication(
    apiKey: string,
    input: { friendlyName: string; voiceUrl: string },
): Promise<{ id: string }> {
    const res = await telnyxRequest<TelnyxData<{ id: string }>>(apiKey, 'POST', '/v2/texml_applications', {
        friendly_name: input.friendlyName,
        voice_url: input.voiceUrl,
        voice_method: 'post',
    });
    return { id: res.data.id };
}

/** `POST /v2/call_control_applications` — the connection outbound calls are placed on. */
export async function createCallControlApplication(
    apiKey: string,
    input: { applicationName: string; webhookEventUrl: string; outboundVoiceProfileId: string },
): Promise<{ id: string }> {
    const res = await telnyxRequest<TelnyxData<{ id: string }>>(apiKey, 'POST', '/v2/call_control_applications', {
        application_name: input.applicationName,
        webhook_event_url: input.webhookEventUrl,
        webhook_api_version: '2',
        outbound: { outbound_voice_profile_id: input.outboundVoiceProfileId },
    });
    return { id: res.data.id };
}

/** `GET /v2/phone_numbers/{id}` — one number, with the connection it is on now. */
export async function getPhoneNumber(apiKey: string, phoneNumberId: string): Promise<TelnyxPhoneNumber> {
    const res = await telnyxRequest<TelnyxData<TelnyxPhoneNumber>>(
        apiKey,
        'GET',
        `/v2/phone_numbers/${encodeURIComponent(phoneNumberId)}`,
    );
    return res.data;
}

/**
 * `PATCH /v2/phone_numbers/{id}` with `connection_id`. `null` asks Telnyx to leave the number
 * on no connection: the documented request schema types `connection_id` as a string only
 * (the response allows null), so Telnyx may refuse it; callers turn that into a plain message.
 */
export async function setPhoneNumberConnection(
    apiKey: string,
    phoneNumberId: string,
    connectionId: string | null,
): Promise<void> {
    await telnyxRequest<TelnyxData<TelnyxPhoneNumber>>(
        apiKey,
        'PATCH',
        `/v2/phone_numbers/${encodeURIComponent(phoneNumberId)}`,
        { connection_id: connectionId },
    );
}

async function deleteIgnoringMissing(apiKey: string, path: string): Promise<void> {
    try {
        await telnyxRequest<unknown>(apiKey, 'DELETE', path);
    } catch (error) {
        if (error instanceof TelnyxApiError && error.status === 404) return;
        throw error;
    }
}

/** `DELETE /v2/texml_applications/{id}` (already gone counts as done). */
export function deleteTexmlApplication(apiKey: string, id: string): Promise<void> {
    return deleteIgnoringMissing(apiKey, `/v2/texml_applications/${encodeURIComponent(id)}`);
}

/** `DELETE /v2/call_control_applications/{id}` (already gone counts as done). */
export function deleteCallControlApplication(apiKey: string, id: string): Promise<void> {
    return deleteIgnoringMissing(apiKey, `/v2/call_control_applications/${encodeURIComponent(id)}`);
}

/** `GET /v2/recordings?filter[call_control_id]=…` */
export async function listRecordingsForCall(apiKey: string, callControlId: string): Promise<TelnyxRecording[]> {
    const query = new URLSearchParams({ 'filter[call_control_id]': callControlId });
    const res = await telnyxRequest<TelnyxPage<TelnyxRecording>>(apiKey, 'GET', `/v2/recordings?${query}`);
    return res.data;
}
