import { createCipheriv, createHash, randomBytes } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { VOICE_AGENT_SUB_MODULES } from '@aixellabs/backend/db/types';
import { SubModuleUrls } from '@/config/app-config';
import {
    E2E_TELNYX_API_BASE,
    E2E_TWILIO_API_BASE,
    E2E_TWILIO_MEDIA_BASE,
    E2E_VOICE_ENGINE_SECRET,
    E2E_VOICE_ENGINE_URL,
    E2E_VOICELINK_API_BASE,
} from '../support/env';
import type { FakePlaygroundEngine } from '../support/voice-agents';

export const PHONE_NUMBERS_URL = SubModuleUrls[VOICE_AGENT_SUB_MODULES.PHONE_NUMBERS];
export const CALL_LOGS_URL = SubModuleUrls[VOICE_AGENT_SUB_MODULES.CALL_LOGS];

/** Placeholder customer key: a fake that only the local fake Telnyx accepts. */
export const FAKE_TELNYX_KEY = 'KEY_e2e_fake_telnyx_key_do_not_use';

export type RecordedRequest = {
    method: string;
    path: string;
    query: Record<string, string>;
    authorization: string | undefined;
    /** The Range header, for the recording downloads. */
    range: string | undefined;
    body: Record<string, unknown> | null;
};

type JsonValue = Record<string, unknown>;

/** Seals a key the way `server/voice-agent/engine.ts` does, so specs can seed numbers the app can open. */
export function sealForE2e(plain: string): string {
    const key = createHash('sha256').update(`aixel-voice-secrets|${E2E_VOICE_ENGINE_SECRET}`).digest();
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    return `v1.${Buffer.concat([iv, body, cipher.getAuthTag()]).toString('base64url')}`;
}

async function readBody(req: IncomingMessage): Promise<JsonValue | null> {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    if (chunks.length === 0) return null;
    const text = Buffer.concat(chunks).toString('utf8');
    // Twilio's API takes forms; everything else here speaks JSON.
    if (req.headers['content-type']?.startsWith('application/x-www-form-urlencoded')) {
        return Object.fromEntries(new URLSearchParams(text));
    }
    return JSON.parse(text) as JsonValue;
}

function send(res: ServerResponse, status: number, body?: JsonValue): void {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(body ? JSON.stringify(body) : '');
}

abstract class FakeHttpServer {
    readonly requests: RecordedRequest[] = [];
    private server: Server | null = null;

    protected abstract handle(req: RecordedRequest, res: ServerResponse): void;

    async start(baseUrl: string): Promise<void> {
        const { port, hostname } = new URL(baseUrl);
        this.server = createServer((req, res) => {
            void (async () => {
                const url = new URL(req.url ?? '/', baseUrl);
                const recorded: RecordedRequest = {
                    method: req.method ?? 'GET',
                    path: url.pathname,
                    query: Object.fromEntries(url.searchParams),
                    authorization: req.headers.authorization,
                    range: req.headers.range,
                    body: await readBody(req),
                };
                this.requests.push(recorded);
                this.handle(recorded, res);
            })().catch((error: unknown) => send(res, 500, { error: String(error) }));
        });
        await new Promise<void>((resolve, reject) => {
            this.server?.once('error', reject);
            this.server?.listen(Number(port), hostname, () => resolve());
        });
    }

    async stop(): Promise<void> {
        await new Promise<void>((resolve) => (this.server ? this.server.close(() => resolve()) : resolve()));
        this.server = null;
    }

    clear(): void {
        this.requests.length = 0;
    }

    find(method: string, path: string | RegExp): RecordedRequest[] {
        return this.requests.filter(
            (r) => r.method === method && (typeof path === 'string' ? r.path === path : path.test(r.path)),
        );
    }
}

export type FakeTelnyxNumber = { id: string; phone_number: string; status: string; connection_id: string | null };

/** The SIP connection the first fake number is on before we touch it: the customer's own routing. */
export const CUSTOMER_CONNECTION_ID = '1684641123236054244';

/**
 * Stands in for api.telnyx.com on `E2E_TELNYX_API_BASE`. Accepts only `FAKE_TELNYX_KEY`
 * and keeps just enough state (numbers, apps, recordings) to answer like the real API.
 */
export class FakeTelnyx extends FakeHttpServer {
    numbers: FakeTelnyxNumber[] = [];
    outboundVoiceProfiles: { id: string; name: string }[] = [];
    readonly texmlApps = new Map<string, JsonValue>();
    readonly callControlApps = new Map<string, JsonValue>();
    /** Credential connections (SIP logins), by id, with the password Telnyx would hold. */
    readonly credentialConnections = new Map<string, JsonValue>();
    /** SIP usernames a softphone is signed in with now (`GET /v2/sip_registration_status`). */
    readonly registered = new Set<string>();
    /** call_control_id -> recordings Telnyx would list for it. */
    readonly recordings = new Map<string, JsonValue[]>();
    /**
     * Files behind the recordings' pre-signed download links (path -> bytes), served without the
     * API key like S3 does, with Range support. See {@link FakeTelnyx.addRecordingFile}.
     */
    readonly files = new Map<string, Buffer>();
    /**
     * Whether `PATCH /v2/phone_numbers/{id}` with `connection_id: null` is refused. Telnyx documents
     * `connection_id` as a string in the request, so specs cover both answers.
     */
    refuseNullConnection = false;
    /**
     * How many Call Control apps the account may hold (null = no limit). A real trial account
     * holds one, and answers a second with 403 code 10039, "Account Level Limit Reached".
     */
    callControlAppLimit: number | null = null;
    private nextId = 0;

    static async start(): Promise<FakeTelnyx> {
        const fake = new FakeTelnyx();
        await fake.start(E2E_TELNYX_API_BASE);
        return fake;
    }

    reset(): void {
        this.clear();
        this.numbers = [
            {
                id: '1293384261075731499',
                phone_number: '+13473703925',
                status: 'active',
                connection_id: CUSTOMER_CONNECTION_ID,
            },
            { id: '1293384261075731500', phone_number: '+13475550142', status: 'active', connection_id: null },
        ];
        this.outboundVoiceProfiles = [{ id: '1911630617284445511', name: 'Default' }];
        this.texmlApps.clear();
        this.callControlApps.clear();
        this.credentialConnections.clear();
        this.registered.clear();
        this.recordings.clear();
        this.files.clear();
        this.refuseNullConnection = false;
        this.callControlAppLimit = null;
    }

    /** A Call Control app the customer already has (theirs, not ours). */
    addCustomerCallControlApp(name: string): string {
        const id = this.newId();
        this.callControlApps.set(id, { id, record_type: 'call_control_application', application_name: name });
        return id;
    }

    /** A TeXML app already in the account (as `ensureTexmlApp` leaves it); returns its id. */
    addTexmlApp(fields: JsonValue): string {
        const id = this.newId();
        this.texmlApps.set(id, { id, record_type: 'texml_application', ...fields });
        return id;
    }

    /** Serves `bytes` at `/download/<name>` and returns its full URL, as a pre-signed link would be. */
    addRecordingFile(name: string, bytes: Buffer): string {
        const path = `/download/${name}`;
        this.files.set(path, bytes);
        return `${E2E_TELNYX_API_BASE}${path}`;
    }

    private serveFile(req: RecordedRequest, res: ServerResponse, file: Buffer): void {
        const type = req.path.endsWith('.wav') ? 'audio/wav' : 'audio/mpeg';
        // S3 answers with a generic type; the app must not rely on it.
        const headers = { 'Content-Type': type === 'audio/wav' ? 'binary/octet-stream' : type, 'Accept-Ranges': 'bytes' };
        const match = req.range ? /^bytes=(\d*)-(\d*)$/.exec(req.range) : null;
        if (!match) {
            res.writeHead(200, { ...headers, 'Content-Length': String(file.length) });
            res.end(file);
            return;
        }
        const start = match[1] ? Number(match[1]) : Math.max(0, file.length - Number(match[2]));
        const end = match[1] && match[2] ? Math.min(Number(match[2]), file.length - 1) : file.length - 1;
        if (start > end || start >= file.length) {
            res.writeHead(416, { 'Content-Range': `bytes */${file.length}` });
            res.end();
            return;
        }
        res.writeHead(206, {
            ...headers,
            'Content-Range': `bytes ${start}-${end}/${file.length}`,
            'Content-Length': String(end - start + 1),
        });
        res.end(file.subarray(start, end + 1));
    }

    private newId(): string {
        this.nextId += 1;
        return `2${String(this.nextId).padStart(18, '0')}`;
    }

    protected handle(req: RecordedRequest, res: ServerResponse): void {
        const file = req.method === 'GET' ? this.files.get(req.path) : undefined;
        if (file) return this.serveFile(req, res, file);
        if (req.authorization !== `Bearer ${FAKE_TELNYX_KEY}`) {
            send(res, 401, { errors: [{ code: '10009', title: 'Authentication failed', detail: 'Invalid API key' }] });
            return;
        }
        const page = (data: JsonValue[]) => ({
            data,
            meta: { page_number: 1, page_size: 250, total_pages: 1, total_results: data.length },
        });
        const now = new Date().toISOString();

        if (req.method === 'GET' && req.path === '/v2/phone_numbers') {
            send(res, 200, page(this.numbers.map((n) => ({ ...n, record_type: 'phone_number', connection_name: null }))));
            return;
        }
        const numberMatch = /^\/v2\/phone_numbers\/([^/]+)$/.exec(req.path);
        if (req.method === 'GET' && numberMatch) {
            const number = this.numbers.find((n) => n.id === numberMatch[1]);
            if (!number) return send(res, 404, { errors: [{ code: '10005', title: 'Resource not found' }] });
            send(res, 200, { data: { ...number, record_type: 'phone_number', connection_name: null } });
            return;
        }
        if (req.method === 'PATCH' && numberMatch) {
            const number = this.numbers.find((n) => n.id === numberMatch[1]);
            if (!number) return send(res, 404, { errors: [{ code: '10005', title: 'Resource not found' }] });
            const connectionId = req.body?.connection_id;
            if (connectionId === null && this.refuseNullConnection) {
                return send(res, 422, {
                    errors: [{ code: '10015', title: 'Invalid value', detail: 'connection_id must be a string' }],
                });
            }
            if (typeof connectionId === 'string' || connectionId === null) number.connection_id = connectionId;
            send(res, 200, { data: { ...number, record_type: 'phone_number' } });
            return;
        }
        if (req.method === 'GET' && req.path === '/v2/outbound_voice_profiles') {
            send(res, 200, page(this.outboundVoiceProfiles.map((p) => ({ ...p, record_type: 'outbound_voice_profile' }))));
            return;
        }
        if (req.method === 'POST' && req.path === '/v2/texml_applications') {
            const app = { id: this.newId(), record_type: 'texml_application', ...req.body, created_at: now };
            this.texmlApps.set(String(app.id), app);
            send(res, 201, { data: app });
            return;
        }
        if (req.method === 'GET' && req.path === '/v2/call_control_applications') {
            send(res, 200, page([...this.callControlApps.values()]));
            return;
        }
        if (req.method === 'POST' && req.path === '/v2/call_control_applications') {
            if (this.callControlAppLimit !== null && this.callControlApps.size >= this.callControlAppLimit) {
                const limit = this.callControlAppLimit;
                return send(res, 403, {
                    errors: [
                        {
                            code: '10039',
                            title: 'Account Level Limit Reached',
                            detail: `You may only have ${limit} Call Control Application(s) at your account level. Refer to https://telnyx.com/upgrade`,
                        },
                    ],
                });
            }
            const app = { id: this.newId(), record_type: 'call_control_application', ...req.body, created_at: now };
            this.callControlApps.set(String(app.id), app);
            send(res, 201, { data: app });
            return;
        }
        if (req.method === 'GET' && req.path === '/v2/credential_connections') {
            send(res, 200, page([...this.credentialConnections.values()].map((c) => ({ ...c, password: '********' }))));
            return;
        }
        if (req.method === 'POST' && req.path === '/v2/credential_connections') {
            const connection = { id: this.newId(), record_type: 'credential_connection', ...req.body, created_at: now };
            this.credentialConnections.set(String(connection.id), connection);
            send(res, 201, { data: connection });
            return;
        }
        const connectionMatch = /^\/v2\/credential_connections\/([^/]+)$/.exec(req.path);
        const connection = connectionMatch ? this.credentialConnections.get(connectionMatch[1]) : undefined;
        if (connectionMatch && !connection)
            return send(res, 404, { errors: [{ code: '10005', title: 'Resource not found' }] });
        if (req.method === 'GET' && connection) {
            send(res, 200, { data: { ...connection, password: '********' } });
            return;
        }
        if (req.method === 'PATCH' && connection) {
            Object.assign(connection, req.body);
            send(res, 200, { data: { ...connection, password: '********' } });
            return;
        }
        if (req.method === 'GET' && req.path === '/v2/sip_registration_status') {
            const userName = req.query.username ?? '';
            if (![...this.credentialConnections.values()].some((c) => c.user_name === userName)) {
                return send(res, 404, { errors: [{ code: '10005', title: 'Resource not found' }] });
            }
            const registered = this.registered.has(userName);
            send(res, 200, {
                credential_type: 'sip_credential_connection',
                credential_username: userName,
                registered,
                sip_registration_status: registered ? 'registered' : 'trying',
            });
            return;
        }
        const appMatch = /^\/v2\/(texml_applications|call_control_applications)\/([^/]+)$/.exec(req.path);
        if (req.method === 'PATCH' && appMatch?.[1] === 'texml_applications') {
            const app = this.texmlApps.get(appMatch[2]);
            if (!app) return send(res, 404, { errors: [{ code: '10005', title: 'Resource not found' }] });
            // Telnyx requires both on every update.
            if (!req.body?.friendly_name || !req.body?.voice_url) {
                return send(res, 422, {
                    errors: [{ code: '10015', title: 'Invalid value', detail: 'friendly_name and voice_url are required' }],
                });
            }
            Object.assign(app, req.body);
            send(res, 200, { data: app });
            return;
        }
        if (req.method === 'DELETE' && appMatch) {
            const apps = appMatch[1] === 'texml_applications' ? this.texmlApps : this.callControlApps;
            const app = apps.get(appMatch[2]);
            if (!app) return send(res, 404, { errors: [{ code: '10005', title: 'Resource not found' }] });
            apps.delete(appMatch[2]);
            for (const n of this.numbers) if (n.connection_id === appMatch[2]) n.connection_id = null;
            send(res, 200, { data: app });
            return;
        }
        if (req.method === 'GET' && req.path === '/v2/recordings') {
            send(res, 200, page(this.recordings.get(req.query['filter[call_control_id]'] ?? '') ?? []));
            return;
        }
        send(res, 404, { errors: [{ code: '10005', title: 'Resource not found', detail: `${req.method} ${req.path}` }] });
    }
}

/** Placeholder customer token: only the local fake VoiceLink accepts it. */
export const FAKE_VOICELINK_TOKEN = '41|e2e_fake_voicelink_token_do_not_use';

/** The SIP trunk the first fake DID routes both directions to before we touch it. */
export const VOICELINK_CUSTOMER_TRUNK_ID = 31;

export type FakeVoiceLinkDid = {
    id: number;
    did_number: string;
    country_code: string;
    status: number;
    status_label: string;
    client_id: number | null;
    expiry_date: string;
    is_expired: boolean;
};

export type FakeVoiceLinkBot = {
    id: number;
    bot_name: string;
    websocket_url: string;
    webhook_url: string | null;
    audio_format: string;
    noise_cancel: number;
    status: number;
    client_id: number | null;
};

export type FakeVoiceLinkRouting = {
    id: number;
    did_id: number;
    did_number: string;
    for_inbound_call: number | null;
    for_outbound_call: number | null;
    inbound_sip_trunk_id: number | null;
    inbound_websocket_bot_id: number | null;
    outbound_sip_trunk_id: number | null;
    outbound_websocket_bot_id: number | null;
    status: number;
};

const ROUTING_FIELDS = [
    'for_inbound_call',
    'for_outbound_call',
    'inbound_sip_trunk_id',
    'inbound_websocket_bot_id',
    'outbound_sip_trunk_id',
    'outbound_websocket_bot_id',
] as const;

function intOrNull(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * Stands in for app.voicelink.co.in/api on `E2E_VOICELINK_API_BASE`. Accepts only
 * `FAKE_VOICELINK_TOKEN`, answers in VoiceLink's `{ status, message, data }` envelope with Laravel
 * pagination, and keeps DIDs, WebSocket bots and the one routing rule per DID. Like the real API,
 * `update` endpoints replace every field (a missing id becomes null) and a rule may only name an
 * active bot.
 */
export class FakeVoiceLink extends FakeHttpServer {
    dids: FakeVoiceLinkDid[] = [];
    readonly bots = new Map<number, FakeVoiceLinkBot>();
    /** did_id -> its rule. */
    readonly routings = new Map<number, FakeVoiceLinkRouting>();
    private nextId = 700;

    static async start(): Promise<FakeVoiceLink> {
        const fake = new FakeVoiceLink();
        await fake.start(E2E_VOICELINK_API_BASE);
        return fake;
    }

    /** DID 501 routes both halves to the customer's SIP trunk; DID 502 has no rule. */
    reset(): void {
        this.clear();
        const did = (id: number, didNumber: string): FakeVoiceLinkDid => ({
            id,
            did_number: didNumber,
            country_code: '91',
            status: 1,
            status_label: 'Active',
            client_id: null,
            expiry_date: '2027-03-31',
            is_expired: false,
        });
        this.dids = [did(501, '919484950416'), did(502, '918069450100')];
        this.bots.clear();
        this.routings.clear();
        this.routings.set(501, {
            id: 9001,
            did_id: 501,
            did_number: '919484950416',
            for_inbound_call: 2,
            for_outbound_call: 2,
            inbound_sip_trunk_id: VOICELINK_CUSTOMER_TRUNK_ID,
            inbound_websocket_bot_id: null,
            outbound_sip_trunk_id: VOICELINK_CUSTOMER_TRUNK_ID,
            outbound_websocket_bot_id: null,
            status: 1,
        });
    }

    /** Every request that could change something in the customer's VoiceLink account. */
    writes(): RecordedRequest[] {
        return this.requests.filter((r) => r.method !== 'GET');
    }

    private ok(res: ServerResponse, data: unknown): void {
        send(res, 200, { status: true, message: 'Success', data } as JsonValue);
    }

    private refuse(res: ServerResponse, message: string): void {
        send(res, 422, { status: false, message, errors: { request: [message] } });
    }

    private paginate(res: ServerResponse, req: RecordedRequest, rows: unknown[]): void {
        const perPage = Number(req.query.per_page ?? 10);
        const page = Number(req.query.page ?? 1);
        this.ok(res, {
            current_page: page,
            data: rows.slice((page - 1) * perPage, page * perPage),
            per_page: perPage,
            total: rows.length,
            last_page: Math.max(1, Math.ceil(rows.length / perPage)),
        });
    }

    /** The refusal when the rule names an unknown or inactive bot (VoiceLink's own check), else null. */
    private badBot(body: JsonValue): string | null {
        for (const [route, key] of [
            ['for_inbound_call', 'inbound_websocket_bot_id'],
            ['for_outbound_call', 'outbound_websocket_bot_id'],
        ] as const) {
            if (body[route] !== 3) continue;
            const bot = this.bots.get(Number(body[key]));
            if (!bot || bot.status !== 1) {
                return 'Selected WebSocket bot is not valid, not active, or does not belong to you.';
            }
        }
        return null;
    }

    private applyRouting(rule: FakeVoiceLinkRouting, body: JsonValue): void {
        for (const field of ROUTING_FIELDS) rule[field] = intOrNull(body[field]);
        rule.status = intOrNull(body.status) ?? 1;
    }

    protected handle(req: RecordedRequest, res: ServerResponse): void {
        if (req.authorization !== `Bearer ${FAKE_VOICELINK_TOKEN}`) {
            send(res, 401, { status: false, message: 'Unauthenticated.' });
            return;
        }
        const body = req.body ?? {};

        if (req.method === 'GET' && req.path === '/v1/reseller/did/purchased') return this.paginate(res, req, this.dids);
        if (req.method === 'GET' && req.path === '/v1/websocket-bot/list') {
            // The real list reports bots in use as inactive: never trust its status.
            return this.paginate(
                res,
                req,
                [...this.bots.values()].map((bot) => ({ ...bot, status: 0 })),
            );
        }
        if (req.method === 'GET' && req.path === '/v1/call-routing/list') {
            return this.paginate(res, req, [...this.routings.values()]);
        }

        if (req.method === 'POST' && req.path === '/v1/websocket-bot/create') {
            if (typeof body.bot_name !== 'string' || typeof body.websocket_url !== 'string') {
                return this.refuse(res, 'The bot name and websocket url fields are required.');
            }
            this.nextId += 1;
            const bot: FakeVoiceLinkBot = {
                id: this.nextId,
                bot_name: body.bot_name,
                websocket_url: body.websocket_url,
                webhook_url: typeof body.webhook_url === 'string' ? body.webhook_url : null,
                audio_format: String(body.audio_format ?? 'l16_16k'),
                noise_cancel: intOrNull(body.noise_cancel) ?? 0,
                status: intOrNull(body.status) ?? 1,
                client_id: intOrNull(body.client_id),
            };
            this.bots.set(bot.id, bot);
            return this.ok(res, bot);
        }
        const botUpdate = /^\/v1\/websocket-bot\/update\/(\d+)$/.exec(req.path);
        if (req.method === 'POST' && botUpdate) {
            const bot = this.bots.get(Number(botUpdate[1]));
            if (!bot) return send(res, 404, { status: false, message: 'WebSocket bot not found.' });
            if (typeof body.bot_name !== 'string' || intOrNull(body.status) === null) {
                return this.refuse(res, 'The bot name and status fields are required.');
            }
            Object.assign(bot, {
                bot_name: body.bot_name,
                websocket_url: String(body.websocket_url ?? ''),
                webhook_url: typeof body.webhook_url === 'string' ? body.webhook_url : null,
                status: intOrNull(body.status),
            });
            return this.ok(res, { id: bot.id });
        }

        if (req.method === 'POST' && req.path === '/v1/call-routing/create') {
            const didId = intOrNull(body.did_id);
            if (didId === null || !this.dids.some((d) => d.id === didId))
                return this.refuse(res, 'The selected did is invalid.');
            if (this.routings.has(didId)) return this.refuse(res, 'Routing already exists for this DID.');
            const bad = this.badBot(body);
            if (bad) return this.refuse(res, bad);
            this.nextId += 1;
            const rule = { id: this.nextId, did_id: didId, did_number: String(body.did_number) } as FakeVoiceLinkRouting;
            this.applyRouting(rule, body);
            this.routings.set(didId, rule);
            return this.ok(res, rule);
        }
        const routingUpdate = /^\/v1\/call-routing\/update\/(\d+)$/.exec(req.path);
        if (req.method === 'POST' && routingUpdate) {
            const rule = [...this.routings.values()].find((r) => r.id === Number(routingUpdate[1]));
            if (!rule) return send(res, 404, { status: false, message: 'Routing not found.' });
            const bad = this.badBot(body);
            if (bad) return this.refuse(res, bad);
            this.applyRouting(rule, body);
            return this.ok(res, { id: rule.id });
        }

        send(res, 404, { status: false, message: `${req.method} ${req.path} not found` });
    }
}

/** Placeholder Twilio credentials: only the local fake Twilio accepts them. */
export const FAKE_TWILIO_ACCOUNT_SID = `AC${'e2e0'.repeat(8)}`;
export const FAKE_TWILIO_KEY_SID = `SK${'e2e1'.repeat(8)}`;
export const FAKE_TWILIO_KEY_SECRET = 'e2e_fake_twilio_key_secret_do_not_use';
export const FAKE_TWILIO_AUTH_TOKEN = 'e2e_fake_twilio_auth_token_do_not_use';

/** Where the customer's numbers sent calls before we touched them. */
export const TWILIO_CUSTOMER_VOICE_URL = 'https://hooks.customer.example/voice/incoming';
export const TWILIO_CUSTOMER_APP_SID = `AP${'0a1b'.repeat(8)}`;
export const TWILIO_CUSTOMER_TRUNK_SID = `TK${'2c3d'.repeat(8)}`;

export type FakeTwilioNumber = {
    sid: string;
    phone_number: string;
    friendly_name: string;
    voice_url: string | null;
    voice_method: string;
    voice_application_sid: string | null;
    trunk_sid: string | null;
    sms_url: string | null;
    capabilities: { voice: boolean; sms: boolean; mms: boolean; fax: boolean };
};

export type FakeTwilioRecording = {
    sid: string;
    call_sid: string;
    status: string;
    duration: string;
    channels: number;
};

function basicCredentials(authorization: string | undefined): [string, string] | null {
    if (!authorization?.startsWith('Basic ')) return null;
    const [user, ...rest] = Buffer.from(authorization.slice(6), 'base64').toString('utf8').split(':');
    return [user, rest.join(':')];
}

function sendBytes(req: RecordedRequest, res: ServerResponse, file: Buffer, type: string): void {
    const headers = { 'Content-Type': type, 'Accept-Ranges': 'bytes' };
    const match = req.range ? /^bytes=(\d*)-(\d*)$/.exec(req.range) : null;
    if (!match) {
        res.writeHead(200, { ...headers, 'Content-Length': String(file.length) });
        res.end(file);
        return;
    }
    const start = match[1] ? Number(match[1]) : Math.max(0, file.length - Number(match[2]));
    const end = match[1] && match[2] ? Math.min(Number(match[2]), file.length - 1) : file.length - 1;
    if (start > end || start >= file.length) {
        res.writeHead(416, { 'Content-Range': `bytes */${file.length}` });
        res.end();
        return;
    }
    res.writeHead(206, {
        ...headers,
        'Content-Range': `bytes ${start}-${end}/${file.length}`,
        'Content-Length': String(end - start + 1),
    });
    res.end(file.subarray(start, end + 1));
}

/** The host behind Twilio's short-lived media links (another origin): serves files with no credentials, with Range. */
class FakeTwilioMedia extends FakeHttpServer {
    readonly files = new Map<string, Buffer>();

    protected handle(req: RecordedRequest, res: ServerResponse): void {
        const file = req.method === 'GET' && req.query.Signature === 'e2e' ? this.files.get(req.path) : undefined;
        if (!file) return send(res, 403, { error: 'AccessDenied' });
        sendBytes(req, res, file, 'audio/mpeg');
    }
}

/**
 * Stands in for api.twilio.com on `E2E_TWILIO_API_BASE` (2010-04-01 API): form bodies, JSON
 * answers with Twilio's `{ code, message, status }` errors. Accepts the fake API key
 * (`FAKE_TWILIO_KEY_SID` + secret) or the fake Auth Token for `FAKE_TWILIO_ACCOUNT_SID`. Keeps the
 * account's numbers with their voice routing, and its recordings, whose `.mp3` answers with a
 * redirect to a pre-signed link on `E2E_TWILIO_MEDIA_BASE`, like Twilio's own.
 */
export class FakeTwilio extends FakeHttpServer {
    numbers: FakeTwilioNumber[] = [];
    account = { status: 'active', type: 'Full' };
    /** A Restricted API key without the account-read permission: the account fetch answers 403. */
    accountReadable = true;
    /** Twilio refusing to take a number off its SIP trunk (`TrunkSid=""`). */
    refuseTrunkRemoval = false;
    /** Numbers per page of IncomingPhoneNumbers (Twilio pages with `next_page_uri`). */
    pageSize = 50;
    /** call SID -> its recordings. */
    readonly recordings = new Map<string, FakeTwilioRecording[]>();
    readonly media = new FakeTwilioMedia();

    static async start(): Promise<FakeTwilio> {
        const fake = new FakeTwilio();
        await fake.start(E2E_TWILIO_API_BASE);
        await fake.media.start(E2E_TWILIO_MEDIA_BASE);
        return fake;
    }

    async stop(): Promise<void> {
        await Promise.all([super.stop(), this.media.stop()]);
    }

    /**
     * PN…101 rings the customer's own webhook, PN…102 is on their TwiML app, PN…103 on their SIP
     * trunk, PN…104 only sends messages.
     */
    reset(): void {
        this.clear();
        this.media.clear();
        this.media.files.clear();
        const number = (n: number, routing: Partial<FakeTwilioNumber>, voice = true): FakeTwilioNumber => ({
            sid: `PN${String(n).padStart(32, '0')}`,
            phone_number: `+1415555${String(n).padStart(4, '0')}`,
            friendly_name: `(415) 555-${String(n).padStart(4, '0')}`,
            voice_url: null,
            voice_method: 'POST',
            voice_application_sid: null,
            trunk_sid: null,
            sms_url: 'https://hooks.customer.example/sms',
            capabilities: { voice, sms: true, mms: true, fax: false },
            ...routing,
        });
        this.numbers = [
            number(101, { voice_url: TWILIO_CUSTOMER_VOICE_URL, voice_method: 'GET' }),
            number(102, { voice_application_sid: TWILIO_CUSTOMER_APP_SID, voice_url: '' }),
            number(103, { trunk_sid: TWILIO_CUSTOMER_TRUNK_SID }),
            number(104, {}, false),
        ];
        this.account = { status: 'active', type: 'Full' };
        this.accountReadable = true;
        this.refuseTrunkRemoval = false;
        this.pageSize = 50;
        this.recordings.clear();
    }

    /** A completed recording of `callSid`, its audio served through the redirect. */
    addRecording(callSid: string, bytes: Buffer, seconds: number): string {
        const sid = `RE${callSid.slice(2, 34).padEnd(32, '0')}`;
        this.recordings.set(callSid, [
            { sid, call_sid: callSid, status: 'completed', duration: String(seconds), channels: 2 },
        ]);
        this.media.files.set(`/media/${sid}.mp3`, bytes);
        return sid;
    }

    /** Requests that could change something in the customer's Twilio account. */
    writes(): RecordedRequest[] {
        return this.requests.filter((r) => r.method !== 'GET');
    }

    private error(res: ServerResponse, status: number, code: number, message: string): void {
        send(res, status, { code, message, more_info: `https://www.twilio.com/docs/errors/${code}`, status });
    }

    protected handle(req: RecordedRequest, res: ServerResponse): void {
        const credentials = basicCredentials(req.authorization);
        const viaKey = credentials?.[0] === FAKE_TWILIO_KEY_SID && credentials[1] === FAKE_TWILIO_KEY_SECRET;
        const viaToken = credentials?.[0] === FAKE_TWILIO_ACCOUNT_SID && credentials[1] === FAKE_TWILIO_AUTH_TOKEN;
        if (!viaKey && !viaToken) return this.error(res, 401, 20003, 'Authenticate');
        const prefix = `/2010-04-01/Accounts/${FAKE_TWILIO_ACCOUNT_SID}`;
        if (req.path !== `${prefix}.json` && !req.path.startsWith(`${prefix}/`)) {
            return this.error(res, 404, 20404, `The requested resource ${req.path} was not found`);
        }
        const rest = req.path.slice(prefix.length);

        if (req.method === 'GET' && rest === '.json') {
            if (!this.accountReadable) return this.error(res, 403, 70051, 'Authorization error');
            return send(res, 200, { sid: FAKE_TWILIO_ACCOUNT_SID, friendly_name: 'E2E account', ...this.account });
        }
        if (req.method === 'GET' && rest === '/IncomingPhoneNumbers.json') {
            const page = Number(req.query.Page ?? 0);
            const rows = this.numbers.slice(page * this.pageSize, (page + 1) * this.pageSize);
            const more = (page + 1) * this.pageSize < this.numbers.length;
            return send(res, 200, {
                incoming_phone_numbers: rows.map((n) => ({ ...n, account_sid: FAKE_TWILIO_ACCOUNT_SID, status: 'in-use' })),
                page,
                page_size: this.pageSize,
                next_page_uri: more
                    ? `${prefix}/IncomingPhoneNumbers.json?PageSize=${this.pageSize}&Page=${page + 1}&PageToken=PAe2e`
                    : null,
            });
        }
        const numberMatch = /^\/IncomingPhoneNumbers\/(PN\w+)\.json$/.exec(rest);
        if (numberMatch) {
            const number = this.numbers.find((n) => n.sid === numberMatch[1]);
            if (!number) return this.error(res, 404, 20404, 'The requested resource was not found');
            if (req.method === 'POST') {
                const body = (req.body ?? {}) as Record<string, string>;
                if (this.refuseTrunkRemoval && number.trunk_sid && body.TrunkSid === '') {
                    return this.error(res, 400, 21422, 'This phone number cannot be removed from the trunk right now');
                }
                if ('VoiceUrl' in body) number.voice_url = body.VoiceUrl;
                if ('VoiceMethod' in body) number.voice_method = body.VoiceMethod;
                if ('VoiceApplicationSid' in body) number.voice_application_sid = body.VoiceApplicationSid || null;
                if ('TrunkSid' in body) number.trunk_sid = body.TrunkSid || null;
            }
            return send(res, 200, { ...number, account_sid: FAKE_TWILIO_ACCOUNT_SID, status: 'in-use' });
        }
        const callRecordings = /^\/Calls\/(CA\w+)\/Recordings\.json$/.exec(rest);
        if (req.method === 'GET' && callRecordings) {
            return send(res, 200, { recordings: this.recordings.get(callRecordings[1]) ?? [] });
        }
        // What the engine asks of the account during a call: start the recording, hang up.
        if (req.method === 'POST' && callRecordings) {
            return send(res, 201, {
                sid: `RE${callRecordings[1].slice(2)}`,
                call_sid: callRecordings[1],
                status: 'in-progress',
                channels: 2,
            });
        }
        const call = /^\/Calls\/(CA\w+)\.json$/.exec(rest);
        if (req.method === 'POST' && call) {
            return send(res, 200, { sid: call[1], status: String(req.body?.Status ?? 'in-progress') });
        }
        const media = /^\/Recordings\/(RE\w+)\.(mp3|wav)$/.exec(rest);
        if (req.method === 'GET' && media) {
            const known = [...this.recordings.values()].flat().some((r) => r.sid === media[1]);
            if (!known) return this.error(res, 404, 20404, 'The requested resource was not found');
            res.writeHead(302, {
                Location: `${E2E_TWILIO_MEDIA_BASE}/media/${media[1]}.mp3?Expires=9999999999&Signature=e2e`,
            });
            res.end();
            return;
        }
        this.error(res, 404, 20404, `${req.method} ${req.path} is not faked`);
    }
}

/**
 * Twilio's side of a Media Stream, against the engine's `/twilio` socket: `connected`, then `start`
 * with the `<Parameter>`s from our TwiML as `customParameters`, then 20 ms of mu-law silence every
 * 20 ms (the caller saying nothing), and `stop` when the call ends. Records what the engine sends.
 */
export class FakeTwilioMediaStream {
    readonly streamSid = `MZ${randomBytes(16).toString('hex')}`;
    readonly messages: Record<string, unknown>[] = [];
    /** Bytes of her audio (8 kHz mu-law), and when the first arrived (ms after `start`). */
    audioBytes = 0;
    firstAudioMs: number | null = null;
    closeCode: number | null = null;
    private startedAt = 0;
    private timer: ReturnType<typeof setInterval> | null = null;
    private readonly closed: Promise<void>;

    private constructor(
        private readonly socket: WebSocket,
        readonly callSid: string,
    ) {
        this.closed = new Promise((resolve) => socket.addEventListener('close', () => resolve(), { once: true }));
        socket.addEventListener('message', (event) => {
            const message = JSON.parse(String(event.data)) as Record<string, unknown>;
            this.messages.push(message);
            const media = message.media as { payload?: string } | undefined;
            if (message.event === 'media' && media?.payload) {
                this.audioBytes += Buffer.from(media.payload, 'base64').length;
                this.firstAudioMs ??= Date.now() - this.startedAt;
            }
        });
        socket.addEventListener('close', (event) => {
            this.closeCode = event.code;
            if (this.timer) clearInterval(this.timer);
        });
    }

    /** Opens `/twilio` on the engine and starts the call with the TwiML's parameters. */
    static async open(
        engineUrl: string,
        callSid: string,
        customParameters: Record<string, string>,
    ): Promise<FakeTwilioMediaStream> {
        const socket = new WebSocket(`${engineUrl.replace(/^http/, 'ws')}/twilio`);
        await new Promise<void>((resolve, reject) => {
            socket.addEventListener('open', () => resolve(), { once: true });
            socket.addEventListener('error', () => reject(new Error('could not open /twilio')), { once: true });
        });
        const stream = new FakeTwilioMediaStream(socket, callSid);
        socket.send(JSON.stringify({ event: 'connected', protocol: 'Call', version: '1.0.0' }));
        stream.startedAt = Date.now();
        socket.send(
            JSON.stringify({
                event: 'start',
                sequenceNumber: '1',
                streamSid: stream.streamSid,
                start: {
                    accountSid: FAKE_TWILIO_ACCOUNT_SID,
                    streamSid: stream.streamSid,
                    callSid,
                    tracks: ['inbound'],
                    mediaFormat: { encoding: 'audio/x-mulaw', sampleRate: 8000, channels: 1 },
                    customParameters,
                },
            }),
        );
        const silence = Buffer.alloc(160, 0xff).toString('base64');
        let seq = 1;
        stream.timer = setInterval(() => {
            if (socket.readyState !== WebSocket.OPEN) return;
            seq += 1;
            socket.send(
                JSON.stringify({
                    event: 'media',
                    sequenceNumber: String(seq),
                    streamSid: stream.streamSid,
                    media: { track: 'inbound', chunk: String(seq), timestamp: String(seq * 20), payload: silence },
                }),
            );
        }, 20);
        return stream;
    }

    /** The caller hangs up: Twilio sends `stop`, then the socket closes. */
    async stop(): Promise<void> {
        if (this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(
                JSON.stringify({
                    event: 'stop',
                    streamSid: this.streamSid,
                    stop: { accountSid: FAKE_TWILIO_ACCOUNT_SID, callSid: this.callSid },
                }),
            );
        }
        await Promise.race([this.closed, new Promise((resolve) => setTimeout(resolve, 5000))]);
        if (this.timer) clearInterval(this.timer);
        if (this.socket.readyState === WebSocket.OPEN) this.socket.close();
    }

    /** Every message from the engine named our stream. */
    allCarryStreamSid(): boolean {
        return this.messages.every((m) => m.streamSid === this.streamSid);
    }
}

/** `to` values the fake engine refuses, the way the real one answers (409 / 424 with `{ error }`). */
export const ENGINE_DNC_NUMBER = '+15550000409';
export const ENGINE_UNVERIFIED_NUMBER = '+15550000502';
/** What the engine answers for a Twilio trial account calling a number it has not verified. */
export const ENGINE_TWILIO_TRIAL_NUMBER = '+15550000503';

/** Stands in for the voice engine's `POST /calls` on `E2E_VOICE_ENGINE_URL`. */
export class FakeVoiceEngine extends FakeHttpServer {
    static async start(): Promise<FakeVoiceEngine> {
        const fake = new FakeVoiceEngine();
        await fake.start(E2E_VOICE_ENGINE_URL);
        return fake;
    }

    protected handle(req: RecordedRequest, res: ServerResponse): void {
        if (req.authorization !== `Bearer ${E2E_VOICE_ENGINE_SECRET}`) return send(res, 401, { error: 'unauthorized' });
        if (req.method === 'POST' && req.path === '/calls') {
            const to = req.body?.to;
            if (to === ENGINE_DNC_NUMBER) return send(res, 409, { error: `${to} is on the do-not-call list` });
            if (to === ENGINE_UNVERIFIED_NUMBER) {
                return send(res, 424, {
                    error: 'Telnyx refused the call: Destination number is not verified on this trial account',
                });
            }
            if (to === ENGINE_TWILIO_TRIAL_NUMBER) {
                return send(res, 424, {
                    error: `Twilio refused the call: The number ${to} is unverified. Trial accounts may only make calls to verified numbers.`,
                });
            }
            send(res, 200, { ok: true, callId: 'v3:e2e-fake-call-control-id' });
            return;
        }
        send(res, 404, { error: 'not found' });
    }
}

/** A real mono 16-bit PCM WAV: `seconds` of a quiet 440 Hz tone, for the recording player to load and seek. */
export function makeTestWav(seconds: number, sampleRate = 8000): Buffer {
    const samples = Math.round(seconds * sampleRate);
    const data = Buffer.alloc(samples * 2);
    for (let i = 0; i < samples; i++) {
        data.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 3000), i * 2);
    }
    const header = Buffer.alloc(44);
    header.write('RIFF', 0, 'ascii');
    header.writeUInt32LE(36 + data.length, 4);
    header.write('WAVE', 8, 'ascii');
    header.write('fmt ', 12, 'ascii');
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20); // PCM
    header.writeUInt16LE(1, 22); // mono
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(sampleRate * 2, 28);
    header.writeUInt16LE(2, 32);
    header.writeUInt16LE(16, 34);
    header.write('data', 36, 'ascii');
    header.writeUInt32LE(data.length, 40);
    return Buffer.concat([header, data]);
}

/** A tool result the engine pushes on the playground socket as each tool finishes. */
export type PlaygroundToolEvent = {
    name: string;
    arguments: Record<string, unknown>;
    result: string;
    ok: boolean;
};

/** Sends `{"type":"tool", ...}` from the fake playground engine, the way the real engine reports a tool run. */
export function sendPlaygroundTool(engine: FakePlaygroundEngine, tool: PlaygroundToolEvent): void {
    // `sendEvent` is typed for flat frames; the socket only sees the JSON.
    engine.sendEvent({ type: 'tool', ...tool } as unknown as Record<string, string | number>);
}
