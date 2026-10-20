import 'server-only';

import { fetch as undiciFetch, ProxyAgent, type Dispatcher } from 'undici';

/**
 * Minimal VoiceLink REST client (app.voicelink.co.in), used with the CUSTOMER's API token.
 *
 * - `VOICELINK_API_BASE`  overrides the base (a local fake in e2e).
 * - `VOICELINK_PROXY_URL` an Indian HTTP(S) proxy. VoiceLink refuses connections from
 *   non-Indian IPs, so every request goes through it when it is set.
 *
 * Responses are wrapped as `{ status, message, data }`; this client returns `data`. List
 * endpoints answer with a Laravel paginator (`{ data: [...], current_page, last_page }`) or a
 * bare list. Field names follow VoiceLink's API (snake_case); ids may come back as strings.
 */

const VOICELINK_TIMEOUT_MS = 20_000;
const PER_PAGE = 100;
const MAX_PAGES = 20;

/** `for_inbound_call` values. */
export const VoiceLinkInboundRoute = { MOBILE: 1, SIP_TRUNK: 2, WEBSOCKET_BOT: 3 } as const;
/** `for_outbound_call` values. */
export const VoiceLinkOutboundRoute = { SIP_TRUNK: 2, WEBSOCKET_BOT: 3, ONLY_ANSWER: 4 } as const;

export type VoiceLinkAuth = {
    token: string;
    /** Reseller accounts name the client the numbers belong to; direct accounts leave it null. */
    clientId: number | null;
};

export type VoiceLinkDid = {
    id: number;
    /** Digits with the country code, e.g. "919484950416". */
    didNumber: string;
    countryCode: string | null;
    status: number | null;
    statusLabel: string | null;
    isExpired: boolean;
};

export type VoiceLinkBot = {
    id: number;
    botName: string;
    websocketUrl: string | null;
    webhookUrl: string | null;
    status: number | null;
};

export type VoiceLinkBotInput = {
    botName: string;
    websocketUrl: string;
    webhookUrl: string;
    status: 0 | 1;
};

/** One DID's routing rule (one rule covers both directions). */
export type VoiceLinkRoutingRule = {
    id: number;
    didId: number | null;
    didNumber: string | null;
    forInboundCall: number | null;
    forOutboundCall: number | null;
    inboundSipTrunkId: number | null;
    inboundWebsocketBotId: number | null;
    outboundSipTrunkId: number | null;
    outboundWebsocketBotId: number | null;
    status: number | null;
};

/** The writable part of a rule. Null ids are left out of the request, as VoiceLink's own clients do. */
export type VoiceLinkRoutingWrite = Omit<VoiceLinkRoutingRule, 'id' | 'didId' | 'didNumber'>;

export class VoiceLinkApiError extends Error {
    constructor(
        message: string,
        readonly status: number,
    ) {
        super(message);
        this.name = 'VoiceLinkApiError';
    }
}

type Json = Record<string, unknown>;

function voicelinkBase(): string {
    return (process.env.VOICELINK_API_BASE ?? 'https://app.voicelink.co.in/api').replace(/\/$/, '');
}

let proxy: { url: string; agent: ProxyAgent } | null = null;

/** The proxy agent for `VOICELINK_PROXY_URL`, made once per URL. Undefined: connect directly. */
function dispatcher(): Dispatcher | undefined {
    const url = process.env.VOICELINK_PROXY_URL?.trim();
    if (!url) return undefined;
    if (proxy?.url !== url) proxy = { url, agent: new ProxyAgent(url) };
    return proxy.agent;
}

function toInt(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
    if (typeof value === 'string' && /^-?\d+$/.test(value.trim())) return Number(value.trim());
    return null;
}

function toText(value: unknown): string | null {
    if (typeof value === 'string') return value;
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    return null;
}

function isJson(value: unknown): value is Json {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** VoiceLink's own message: `message`, or the first Laravel validation error. */
function apiMessage(body: unknown): string | null {
    if (!isJson(body)) return null;
    if (isJson(body.errors)) {
        const first = Object.values(body.errors)[0];
        const text = Array.isArray(first) ? first[0] : first;
        if (typeof text === 'string' && text) return text;
    }
    return typeof body.message === 'string' && body.message ? body.message : null;
}

function describeError(status: number, body: unknown): string {
    if (status === 401 || status === 403) {
        return 'VoiceLink rejected this API token. Create a new one in your VoiceLink panel and try again.';
    }
    const message = apiMessage(body);
    return message ? `VoiceLink: ${message}` : `VoiceLink request failed (HTTP ${status})`;
}

async function voicelinkRequest(
    auth: VoiceLinkAuth,
    method: 'GET' | 'POST',
    path: string,
    options: { query?: Record<string, string | number | null>; body?: Json } = {},
): Promise<unknown> {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(options.query ?? {})) {
        if (value !== null) query.set(key, String(value));
    }
    const url = `${voicelinkBase()}${path}${query.size ? `?${query}` : ''}`;

    let res: Awaited<ReturnType<typeof undiciFetch>>;
    try {
        res = await undiciFetch(url, {
            method,
            headers: {
                Authorization: `Bearer ${auth.token}`,
                Accept: 'application/json',
                ...(options.body ? { 'Content-Type': 'application/json' } : {}),
            },
            body: options.body ? JSON.stringify(options.body) : undefined,
            signal: AbortSignal.timeout(VOICELINK_TIMEOUT_MS),
            dispatcher: dispatcher(),
        });
    } catch (error) {
        console.error('[voice] VoiceLink unreachable', path, error);
        throw new VoiceLinkApiError('Could not reach VoiceLink. Try again in a moment.', 0);
    }

    const text = await res.text();
    let body: unknown = null;
    if (text) {
        try {
            body = JSON.parse(text);
        } catch {
            body = null;
        }
    }
    if (!res.ok) throw new VoiceLinkApiError(describeError(res.status, body), res.status);
    // A 2xx can still carry a refusal in the envelope.
    if (isJson(body) && body.status === false) {
        throw new VoiceLinkApiError(`VoiceLink: ${apiMessage(body) ?? 'the request was refused'}`, 422);
    }
    return isJson(body) && 'data' in body ? body.data : body;
}

/** Rows of a paginated or bare-list `data`, with whether more pages follow. */
function pageRows(data: unknown): { rows: Json[]; hasNext: boolean } {
    if (Array.isArray(data)) return { rows: data.filter(isJson), hasNext: false };
    if (isJson(data) && Array.isArray(data.data)) {
        const current = toInt(data.current_page) ?? 1;
        const last = toInt(data.last_page) ?? 1;
        return { rows: data.data.filter(isJson), hasNext: current < last };
    }
    return { rows: [], hasNext: false };
}

async function listAllPages(auth: VoiceLinkAuth, path: string, withClientId: boolean): Promise<Json[]> {
    const rows: Json[] = [];
    for (let page = 1; page <= MAX_PAGES; page++) {
        const data = await voicelinkRequest(auth, 'GET', path, {
            query: { page, per_page: PER_PAGE, client_id: withClientId ? auth.clientId : null },
        });
        const result = pageRows(data);
        rows.push(...result.rows);
        if (!result.hasNext || result.rows.length === 0) break;
    }
    return rows;
}

function mapDid(row: Json): VoiceLinkDid | null {
    const id = toInt(row.id);
    const didNumber = toText(row.did_number);
    if (id === null || !didNumber) return null;
    return {
        id,
        didNumber: didNumber.replace(/\D/g, ''),
        countryCode: toText(row.country_code),
        status: toInt(row.status),
        statusLabel: toText(row.status_label),
        isExpired: row.is_expired === true || row.is_expired === 1,
    };
}

function mapBot(row: Json): VoiceLinkBot | null {
    const id = toInt(row.id);
    if (id === null) return null;
    return {
        id,
        botName: toText(row.bot_name) ?? '',
        websocketUrl: toText(row.websocket_url),
        webhookUrl: toText(row.webhook_url),
        status: toInt(row.status),
    };
}

function mapRouting(row: Json): VoiceLinkRoutingRule | null {
    const id = toInt(row.id);
    if (id === null) return null;
    return {
        id,
        didId: toInt(row.did_id),
        didNumber: toText(row.did_number)?.replace(/\D/g, '') ?? null,
        forInboundCall: toInt(row.for_inbound_call),
        forOutboundCall: toInt(row.for_outbound_call),
        inboundSipTrunkId: toInt(row.inbound_sip_trunk_id),
        inboundWebsocketBotId: toInt(row.inbound_websocket_bot_id),
        outboundSipTrunkId: toInt(row.outbound_sip_trunk_id),
        outboundWebsocketBotId: toInt(row.outbound_websocket_bot_id),
        status: toInt(row.status),
    };
}

function present<T>(value: T | null): value is T {
    return value !== null;
}

/** `GET /v1/reseller/did/purchased` — the account's numbers (for a client token, those assigned to it). Also the token check. */
export async function listDids(auth: VoiceLinkAuth): Promise<VoiceLinkDid[]> {
    return (await listAllPages(auth, '/v1/reseller/did/purchased', true)).map(mapDid).filter(present);
}

/** `GET /v1/websocket-bot/list` */
export async function listBots(auth: VoiceLinkAuth): Promise<VoiceLinkBot[]> {
    return (await listAllPages(auth, '/v1/websocket-bot/list', true)).map(mapBot).filter(present);
}

function botBody(auth: VoiceLinkAuth, input: VoiceLinkBotInput): Json {
    return {
        bot_name: input.botName,
        websocket_url: input.websocketUrl,
        webhook_url: input.webhookUrl,
        // Advisory: live calls stream A-law 8 kHz whatever this says; the engine reads the real format per call.
        audio_format: 'alaw',
        status: input.status,
        noise_cancel: 0,
        ...(auth.clientId !== null ? { client_id: auth.clientId } : {}),
    };
}

/** `POST /v1/websocket-bot/create` */
export async function createBot(auth: VoiceLinkAuth, input: VoiceLinkBotInput): Promise<{ id: number }> {
    const data = await voicelinkRequest(auth, 'POST', '/v1/websocket-bot/create', { body: botBody(auth, input) });
    const id = isJson(data) ? toInt(data.id) : null;
    if (id !== null) return { id };
    // No id in the answer: find the bot we just made by its name.
    const made = (await listBots(auth)).find((bot) => bot.botName === input.botName);
    if (!made) throw new VoiceLinkApiError('VoiceLink did not return the new WebSocket bot', 502);
    return { id: made.id };
}

/** `POST /v1/websocket-bot/update/{id}` — a full replace: name and status are always sent. */
export async function updateBot(auth: VoiceLinkAuth, botId: number, input: VoiceLinkBotInput): Promise<void> {
    await voicelinkRequest(auth, 'POST', `/v1/websocket-bot/update/${botId}`, { body: botBody(auth, input) });
}

/** `GET /v1/call-routing/list` */
export async function listRoutings(auth: VoiceLinkAuth): Promise<VoiceLinkRoutingRule[]> {
    return (await listAllPages(auth, '/v1/call-routing/list', true)).map(mapRouting).filter(present);
}

function routingBody(rule: VoiceLinkRoutingWrite): Json {
    const body: Json = {
        for_inbound_call: rule.forInboundCall,
        for_outbound_call: rule.forOutboundCall,
        status: rule.status,
    };
    const ids: [string, number | null][] = [
        ['inbound_websocket_bot_id', rule.inboundWebsocketBotId],
        ['inbound_sip_trunk_id', rule.inboundSipTrunkId],
        ['outbound_websocket_bot_id', rule.outboundWebsocketBotId],
        ['outbound_sip_trunk_id', rule.outboundSipTrunkId],
    ];
    for (const [key, value] of ids) if (value !== null) body[key] = value;
    return body;
}

/** `POST /v1/call-routing/create` — the DID's first rule. Returns its id. */
export async function createRouting(
    auth: VoiceLinkAuth,
    did: { id: number; didNumber: string },
    rule: VoiceLinkRoutingWrite,
): Promise<{ id: number }> {
    const data = await voicelinkRequest(auth, 'POST', '/v1/call-routing/create', {
        body: { did_number: did.didNumber, did_id: did.id, ...routingBody(rule) },
    });
    const id = isJson(data) ? toInt(data.id) : null;
    if (id !== null) return { id };
    const made = (await listRoutings(auth)).find((r) => r.didId === did.id || r.didNumber === did.didNumber);
    if (!made) throw new VoiceLinkApiError('VoiceLink did not return the new routing rule', 502);
    return { id: made.id };
}

/** `POST /v1/call-routing/update/{id}` — both halves are always sent. */
export async function updateRouting(auth: VoiceLinkAuth, routingId: number, rule: VoiceLinkRoutingWrite): Promise<void> {
    await voicelinkRequest(auth, 'POST', `/v1/call-routing/update/${routingId}`, { body: routingBody(rule) });
}
