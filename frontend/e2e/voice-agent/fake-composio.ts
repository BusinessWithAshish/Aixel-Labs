import { randomBytes } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { E2E_COMPOSIO_API_KEY, E2E_COMPOSIO_ORIGIN } from '../support/env';

type Json = Record<string, unknown>;

export type ComposioRequest = {
    method: string;
    path: string;
    query: URLSearchParams;
    apiKey: string | undefined;
    body: Json | null;
};

type FakeAccount = {
    id: string;
    userId: string;
    toolkit: string;
    authConfigId: string;
    status: 'INITIATED' | 'ACTIVE' | 'FAILED';
    /** Who signed in: the calendar tools name it (Google's main calendar id, Outlook's owner, Cal.com's user); Composio's own listing does not. */
    label: string;
    callbackUrl: string | null;
};

type FakeSession = {
    id: string;
    userId: string;
    toolkit: string;
    tools: Set<string>;
    /** The pinned connected account (none on a session that only makes Connect Links). */
    account: string | null;
    authConfigId: string | null;
    config: Json;
};

/** A tool run as Composio saw it: which session, whose account, what arguments. */
export type ToolRun = { session_id: string; user_id: string; connected_account_id: string | null; arguments: Json };

/** The toolkit tools this fake knows (Composio refuses a session naming any other slug). */
const KNOWN_TOOLS: Record<string, string[]> = {
    googlecalendar: [
        'GOOGLECALENDAR_FREE_BUSY_QUERY',
        'GOOGLECALENDAR_CREATE_EVENT',
        'GOOGLECALENDAR_DELETE_EVENT',
        'GOOGLECALENDAR_LIST_CALENDARS',
    ],
    outlook: [
        'OUTLOOK_GET_CALENDAR_VIEW',
        'OUTLOOK_CALENDAR_CREATE_EVENT',
        'OUTLOOK_CANCEL_EVENT',
        'OUTLOOK_DELETE_CALENDAR_EVENT',
        'OUTLOOK_LIST_CALENDARS',
    ],
    cal: [
        'CAL_GET_AVAILABLE_SLOTS_INFO',
        'CAL_POST_NEW_BOOKING_REQUEST',
        'CAL_CANCEL_BOOKING_VIA_UID',
        'CAL_LIST_EVENT_TYPES',
    ],
    calendly: [
        'CALENDLY_LIST_EVENT_TYPE_AVAILABLE_TIMES',
        'CALENDLY_POST_INVITEE',
        'CALENDLY_CANCEL_SCHEDULED_EVENT',
        'CALENDLY_GET_USER',
        'CALENDLY_LIST_EVENT_TYPES',
    ],
    // Content Lab: the user's own channel / profile, read only.
    youtube: ['YOUTUBE_LIST_CHANNELS', 'YOUTUBE_LIST_CHANNEL_VIDEOS', 'YOUTUBE_UPLOAD_VIDEO'],
    instagram: ['INSTAGRAM_GET_USER_INFO', 'INSTAGRAM_GET_IG_USER_MEDIA', 'INSTAGRAM_POST_IG_USER_MEDIA_PUBLISH'],
};

/** The YouTube channel every connected YouTube account owns unless a test says otherwise. */
export const FAKE_YOUTUBE_CHANNEL = {
    id: 'UCe2eKitchenLab000000000',
    title: 'My Kitchen Lab',
    customUrl: '@mykitchenlab',
    avatarUrl: 'https://yt3.ggpht.com/e2e-kitchen-lab=s240',
    subscribers: 48_200,
};

/** The Instagram business profile every connected Instagram account is unless a test says otherwise. */
export const FAKE_INSTAGRAM_USER = {
    id: '17841400000000001',
    username: 'mykitchenlab.ig',
    name: 'My Kitchen Lab',
    avatarUrl: 'https://scontent.cdninstagram.com/e2e-kitchen-lab.jpg',
    followers: 9_100,
};

/** What every session must say: the direct tools preset (no connection manager, sandbox, search, multi-execute). */
const PRESET: Json = {
    manage_connections: { enable: false },
    workbench: { enable: false },
    preload: { tools: 'all' },
    search: { enable: false },
    execute: { enable_multi_execute: false },
};

const notFound = (message: string) => ({ error: { message, code: 404, slug: 'NotFound', status: 404 } });
const badRequest = (message: string) => ({ error: { message, code: 400, slug: 'BadRequest', status: 400 } });
/** One auth config id per toolkit, so a fake started again mid-run matches what the app cached from the last one. */
const authConfigIdFor = (toolkit: string) => `ac_e2e_${toolkit}`;

/** Cal.com's event types unless a test says otherwise. */
export const CAL_EVENT_TYPES = [{ id: 1234, title: '30 min consultation', lengthInMinutes: 30 }];

/** A token Composio would hold for the account. It must never reach the browser. */
export const FAKE_ACCESS_TOKEN = 'ya29.e2e-fake-access-token-never-in-the-page';

const API = '/api/v3.1';

/**
 * Stands in for backend.composio.dev on `E2E_COMPOSIO_ORIGIN`: Composio-managed auth configs,
 * sessions (`/tool_router/session`: create, get, delete, `/link`, `/execute`), Connect Links
 * (`/link/<token>` marks the account ACTIVE, or FAILED when `refuseNext`, and sends the browser to
 * the callback the way Composio's hosted page does), connected accounts filtered by user, and the
 * tool slugs the app runs (calendar lists, cancelling events). A session must be the direct tools
 * preset for one toolkit with an explicit tool list; a link needs a session with no account pinned
 * for the toolkit; a tool runs only in a session that pins the account and lists the slug. The
 * legacy `/tools/execute/{slug}` and `/connected_accounts/link` answer 410, so nothing silently stays
 * on them. Accepts only the e2e key.
 */
export class FakeComposio {
    readonly requests: ComposioRequest[] = [];
    readonly authConfigs: { id: string; toolkit: string }[] = [];
    readonly accounts = new Map<string, FakeAccount>();
    readonly sessions = new Map<string, FakeSession>();
    /** Every tool run that reached a session. */
    readonly runs: (ToolRun & { slug: string })[] = [];
    /** Tool slug -> error text the next run of it fails with. */
    readonly failTool = new Map<string, string>();
    /** The next Connect Link is abandoned by the user (Composio returns status=failed). */
    refuseNext = false;
    /** The event types every Cal.com account has. */
    calEventTypes: { id: number; title: string; lengthInMinutes: number }[] = [...CAL_EVENT_TYPES];
    private readonly links = new Map<string, string>();
    private server: Server | null = null;

    static async start(): Promise<FakeComposio> {
        const fake = new FakeComposio();
        const { port, hostname } = new URL(E2E_COMPOSIO_ORIGIN);
        fake.server = createServer((req, res) => {
            void fake.dispatch(req, res).catch((error: unknown) => send(res, 500, { error: { message: String(error) } }));
        });
        await new Promise<void>((resolve, reject) => {
            fake.server?.once('error', reject);
            fake.server?.listen(Number(port), hostname, () => resolve());
        });
        return fake;
    }

    async stop(): Promise<void> {
        await new Promise<void>((resolve) => (this.server ? this.server.close(() => resolve()) : resolve()));
        this.server = null;
    }

    /** An account as if the user had connected it earlier. */
    seedAccount(fields: Pick<FakeAccount, 'id' | 'userId' | 'toolkit'> & Partial<FakeAccount>): FakeAccount {
        const account: FakeAccount = {
            authConfigId: 'ac_e2e_seeded',
            status: 'ACTIVE',
            label: 'ravi@example.com',
            callbackUrl: null,
            ...fields,
        };
        this.accounts.set(account.id, account);
        return account;
    }

    toolRuns(slug: string): ToolRun[] {
        return this.runs.filter((r) => r.slug === slug).map(({ slug: _slug, ...run }) => run);
    }

    /** Composio forgets a session (deleted on its side). */
    dropSession(id: string): void {
        this.sessions.delete(id);
    }

    find(method: string, path: string | RegExp): ComposioRequest[] {
        return this.requests.filter(
            (r) => r.method === method && (typeof path === 'string' ? r.path === path : path.test(r.path)),
        );
    }

    private async dispatch(req: IncomingMessage, res: ServerResponse): Promise<void> {
        const url = new URL(req.url ?? '/', E2E_COMPOSIO_ORIGIN);
        const body = await readBody(req);
        const apiKey = typeof req.headers['x-api-key'] === 'string' ? req.headers['x-api-key'] : undefined;
        const request: ComposioRequest = {
            method: req.method ?? 'GET',
            path: url.pathname,
            query: url.searchParams,
            apiKey,
            body,
        };
        this.requests.push(request);

        // The hosted Connect Link page (the browser, no API key).
        const link = url.pathname.match(/^\/link\/([a-z0-9]+)$/);
        if (link && request.method === 'GET') return this.connectPage(link[1], res);

        if (apiKey !== E2E_COMPOSIO_API_KEY)
            return send(res, 401, { error: { message: 'Invalid API key', code: 401, slug: 'Auth', status: 401 } });
        const path = url.pathname.slice(API.length);

        if (path === '/auth_configs' && request.method === 'GET') {
            const toolkit = url.searchParams.get('toolkit_slug');
            const items = this.authConfigs
                .filter((c) => !toolkit || c.toolkit === toolkit)
                .map((c) => ({
                    id: c.id,
                    is_composio_managed: true,
                    status: 'ENABLED',
                    toolkit: { slug: c.toolkit },
                    no_of_connections: 0,
                }));
            return send(res, 200, { items, next_cursor: null, total_pages: 1, current_page: 1, total_items: items.length });
        }
        if (path === '/auth_configs' && request.method === 'POST') {
            const toolkit = String((body?.toolkit as Json | undefined)?.slug ?? '');
            const config = { id: authConfigIdFor(toolkit), toolkit };
            if (!this.authConfigs.some((c) => c.id === config.id)) this.authConfigs.push(config);
            return send(res, 201, {
                toolkit: { slug: toolkit },
                auth_config: { id: config.id, auth_scheme: 'OAUTH2', is_composio_managed: true },
            });
        }
        if (path === '/connected_accounts/link' || /^\/tools\/execute\//.test(path)) {
            return send(res, 410, {
                error: {
                    message: `fake Composio: ${path} is the legacy direct flow; use a session`,
                    code: 410,
                    slug: 'Legacy',
                    status: 410,
                },
            });
        }
        if (path === '/tool_router/session' && request.method === 'POST') return this.createSession(body ?? {}, res);
        const session = path.match(/^\/tool_router\/session\/([^/]+)(\/link|\/execute)?$/);
        if (session) {
            const found = this.sessions.get(decodeURIComponent(session[1]));
            if (!found) return send(res, 404, notFound('Tool router session not found'));
            if (!session[2] && request.method === 'GET')
                return send(res, 200, { session_id: found.id, config: found.config, config_version: 1 });
            if (!session[2] && request.method === 'DELETE') {
                this.sessions.delete(found.id);
                return send(res, 200, { session_id: found.id, deleted: true });
            }
            if (session[2] === '/link' && request.method === 'POST') return this.link(found, body ?? {}, res);
            if (session[2] === '/execute' && request.method === 'POST') return this.execute(found, body ?? {}, res);
        }
        if (path === '/connected_accounts' && request.method === 'GET') {
            const users = url.searchParams.getAll('user_ids');
            const ids = url.searchParams.getAll('connected_account_ids');
            const items = [...this.accounts.values()]
                .filter((a) => (!users.length || users.includes(a.userId)) && (!ids.length || ids.includes(a.id)))
                .map((a) => ({
                    id: a.id,
                    toolkit: { slug: a.toolkit },
                    auth_config: {
                        id: a.authConfigId,
                        auth_scheme: 'OAUTH2',
                        is_composio_managed: true,
                        is_disabled: false,
                    },
                    status: a.status,
                    status_reason: a.status === 'FAILED' ? 'User closed the consent screen' : null,
                    // Like the real API: no display name, only Composio's own made-up name for the account.
                    word_id: `${a.toolkit}_quiet-otter`,
                    alias: null,
                    user_id: a.userId,
                    state: { authScheme: 'OAUTH2', val: { status: a.status, access_token: FAKE_ACCESS_TOKEN } },
                    is_disabled: false,
                }));
            return send(res, 200, { items, next_cursor: null, total_pages: 1, current_page: 1, total_items: items.length });
        }
        const del = path.match(/^\/connected_accounts\/([^/]+)$/);
        if (del && request.method === 'DELETE') {
            if (!this.accounts.delete(decodeURIComponent(del[1]))) {
                return send(res, 404, {
                    error: { message: 'Connected account not found', code: 404, slug: 'NotFound', status: 404 },
                });
            }
            return send(res, 200, { success: true });
        }
        return send(res, 404, { error: { message: `fake Composio: no ${request.method} ${url.pathname}` } });
    }

    private connectPage(token: string, res: ServerResponse): void {
        const account = this.accounts.get(this.links.get(token) ?? '');
        if (!account?.callbackUrl) return send(res, 404, { error: { message: 'Link expired' } });
        account.status = this.refuseNext ? 'FAILED' : 'ACTIVE';
        this.refuseNext = false;
        const back = new URL(account.callbackUrl);
        back.searchParams.set('status', account.status === 'ACTIVE' ? 'success' : 'failed');
        back.searchParams.set('connected_account_id', account.id);
        res.writeHead(302, { Location: back.toString() });
        res.end();
    }

    private createSession(body: Json, res: ServerResponse): void {
        const userId = typeof body.user_id === 'string' ? body.user_id : '';
        const enable = (body.toolkits as Json | undefined)?.enable;
        if (!userId || !Array.isArray(enable) || enable.length !== 1) {
            return send(res, 400, badRequest('fake: a session is for one user and one toolkit ({enable: [toolkit]})'));
        }
        const toolkit = String(enable[0]);
        // Real Composio (2026-10-18): 400 code 4300 "preload is not supported when multi-account is enabled".
        if ((body.multi_account as Json | undefined)?.enable && body.preload) {
            return send(res, 400, badRequest('preload is not supported when multi-account is enabled for this session'));
        }
        for (const [key, value] of Object.entries(PRESET)) {
            if (JSON.stringify(body[key]) !== JSON.stringify(value)) {
                return send(
                    res,
                    400,
                    badRequest(`fake: not the direct tools preset: ${key} must be ${JSON.stringify(value)}`),
                );
            }
        }
        const tools = ((body.tools as Json | undefined)?.[toolkit] as Json | undefined)?.enable;
        if (!Array.isArray(tools) || tools.length === 0)
            return send(res, 400, badRequest(`fake: list the tools to enable for ${toolkit}`));
        const unknown = tools.filter((t) => !(KNOWN_TOOLS[toolkit] ?? []).includes(String(t)));
        if (unknown.length)
            return send(res, 400, badRequest(`Invalid tool slugs for toolkit ${toolkit}: ${unknown.join(', ')}`));
        const pinned = ((body.connected_accounts as Json | undefined)?.[toolkit] as unknown[] | undefined) ?? [];
        if (pinned.length > 1) return send(res, 400, badRequest('fake: pin one connected account'));
        const accountId = pinned.length ? String(pinned[0]) : null;
        if (accountId) {
            const account = this.accounts.get(accountId);
            if (!account || account.userId !== userId || account.toolkit !== toolkit) {
                return send(res, 400, badRequest(`Connected account ${accountId} not found for this user and toolkit`));
            }
        }
        const authConfigId = ((body.auth_configs as Json | undefined)?.[toolkit] as string | undefined) ?? null;
        const id = `trs_${randomBytes(6).toString('hex')}`;
        this.sessions.set(id, {
            id,
            userId,
            toolkit,
            tools: new Set(tools.map(String)),
            account: accountId,
            authConfigId,
            config: body,
        });
        return send(res, 201, {
            session_id: id,
            mcp: { type: 'http', url: `${E2E_COMPOSIO_ORIGIN}/mcp/${id}` },
            tool_router_tools: tools,
            config: body,
            config_version: 1,
        });
    }

    private link(session: FakeSession, body: Json, res: ServerResponse): void {
        if (body.toolkit !== session.toolkit) return send(res, 400, badRequest('fake: that toolkit is not in this session'));
        if (session.account) {
            return send(
                res,
                400,
                badRequest('A connected account is already defined for this toolkit in the session configuration'),
            );
        }
        // A fake restarted mid-run (Playwright replaces a worker after a failure) still knows the id the app has cached.
        const config =
            this.authConfigs.find((c) => c.id === session.authConfigId && c.toolkit === session.toolkit) ??
            (session.authConfigId === authConfigIdFor(session.toolkit) ? { id: session.authConfigId, toolkit: session.toolkit } : undefined);
        if (!config) return send(res, 404, notFound('No auth config exists for the toolkit'));
        const id = `ca_${randomBytes(6).toString('hex')}`;
        const token = randomBytes(8).toString('hex');
        this.accounts.set(id, {
            id,
            userId: session.userId,
            toolkit: config.toolkit,
            authConfigId: config.id,
            status: 'INITIATED',
            label: 'ravi@example.com',
            callbackUrl: typeof body.callback_url === 'string' ? body.callback_url : null,
        });
        this.links.set(token, id);
        return send(res, 201, {
            link_token: token,
            redirect_url: `${E2E_COMPOSIO_ORIGIN}/link/${token}`,
            connected_account_id: id,
        });
    }

    private execute(session: FakeSession, body: Json, res: ServerResponse): void {
        const slug = String(body.tool_slug ?? '');
        // Real Composio (2026-10-19): the session pins the account; naming one needs multi-account on.
        if (body.account !== undefined && !(session.config.multi_account as Json | undefined)?.enable) {
            return send(res, 400, {
                error: {
                    message:
                        "The 'account' parameter is not supported for this project. Multi-account selection is not enabled.",
                    code: 4300,
                    slug: 'ToolRouterV2_BadRequest',
                    status: 400,
                },
            });
        }
        if (!session.tools.has(slug)) return send(res, 400, badRequest(`Tool ${slug} is not available in this session`));
        if (body.account !== undefined && body.account !== session.account) {
            return send(res, 400, badRequest(`Account ${String(body.account)} is not one of this session's connections`));
        }
        const account = this.accounts.get(session.account ?? '');
        if (!account || account.userId !== session.userId) {
            return send(res, 400, {
                error: { message: 'Connected account not found for this user', code: 1803, slug: 'NotFound', status: 400 },
            });
        }
        this.runs.push({
            slug,
            session_id: session.id,
            user_id: session.userId,
            connected_account_id: session.account,
            arguments: (body.arguments as Json | undefined) ?? {},
        });
        const failure = this.failTool.get(slug);
        if (failure) {
            this.failTool.delete(slug);
            return send(res, 200, { result_type: 'failed', data: {}, error: failure, log_id: 'log_e2e' });
        }
        const ok = (data: Json) => send(res, 200, { result_type: 'completed', data, error: null, log_id: 'log_e2e' });
        switch (slug) {
            case 'GOOGLECALENDAR_LIST_CALENDARS':
                return ok({
                    calendars: [
                        { id: 'clinic@group.calendar.google.com', summary: 'Clinic', accessRole: 'writer' },
                        { id: account.label, summary: "Ravi's calendar", primary: true, accessRole: 'owner' },
                    ],
                });
            case 'OUTLOOK_LIST_CALENDARS': {
                const owner = { name: 'Ravi', address: account.label };
                return ok({ value: [{ id: 'AAMkCal=', name: 'Calendar', isDefaultCalendar: true, canEdit: true, owner }] });
            }
            case 'CAL_LIST_EVENT_TYPES':
                return ok({
                    status: 'success',
                    data: this.calEventTypes.map((t) => ({
                        ...t,
                        slug: `type-${t.id}`,
                        users: [{ id: 7, username: account.label }],
                    })),
                });
            case 'YOUTUBE_LIST_CHANNELS': {
                const c = FAKE_YOUTUBE_CHANNEL;
                return ok({
                    items: [
                        {
                            kind: 'youtube#channel',
                            id: c.id,
                            snippet: {
                                title: c.title,
                                customUrl: c.customUrl,
                                description: 'Quick high-protein meals',
                                thumbnails: { default: { url: c.avatarUrl } },
                            },
                            statistics: { subscriberCount: String(c.subscribers), videoCount: '112' },
                        },
                    ],
                });
            }
            case 'INSTAGRAM_GET_USER_INFO': {
                const u = FAKE_INSTAGRAM_USER;
                return ok({
                    id: u.id,
                    username: u.username,
                    name: u.name,
                    profile_picture_url: u.avatarUrl,
                    followers_count: u.followers,
                });
            }
            case 'GOOGLECALENDAR_DELETE_EVENT':
            case 'OUTLOOK_CANCEL_EVENT':
            case 'CAL_CANCEL_BOOKING_VIA_UID':
            case 'CALENDLY_CANCEL_SCHEDULED_EVENT':
                return ok({});
            default:
                return send(res, 200, {
                    result_type: 'failed',
                    data: {},
                    error: `fake Composio: no tool ${slug}`,
                    log_id: 'log_e2e',
                });
        }
    }
}

async function readBody(req: IncomingMessage): Promise<Json | null> {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    if (chunks.length === 0) return null;
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Json;
}

function send(res: ServerResponse, status: number, body: Json): void {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
}
