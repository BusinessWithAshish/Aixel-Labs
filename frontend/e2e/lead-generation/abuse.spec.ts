import { LEAD_GENERATION_SUB_MODULES } from '@aixellabs/backend/db/types';
import { LEAD_GEN_ENRICH_API_ROUTE, LEAD_GEN_SCRAPE_API_ROUTE } from '@/config/app-config';
import { DAILY_LEAD_CAP, DAILY_LIMIT_MESSAGE, NO_CREDITS_MESSAGE } from '@/helpers/credits';
import { expect, test } from '../support/fixtures';
import { USER_STORAGE_STATE } from '../support/env';
import { backendRequests, mockBackend, searchLeads } from '../support/lead-gen';
import { E2E_USER } from '../support/users';

/** What a user could send by calling the routes directly, without the app's forms. */
const search = (body: Record<string, unknown> = {}) => ({
    subModule: LEAD_GENERATION_SUB_MODULES.GOOGLE_ADVANCED_SEARCH,
    body: { searchQuery: 'plumbers in pune', country: 'IN', ...body },
    listName: 'Direct call',
});

test.describe('signed out', () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    test('cannot look up an Instagram account', async ({ request }) => {
        const res = await request.get('/api/instagram/profile?username=instagram');
        expect(res.status()).toBe(401);
    });

    test('cannot enrich leads', async ({ request }) => {
        const res = await request.post(LEAD_GEN_ENRICH_API_ROUTE, { data: { leadIds: ['a'] } });
        expect(res.status()).toBe(401);
    });

    test('the public tenant lookup does not show what new members receive', async ({ request }) => {
        const res = await request.get('/api/tenant?name=e2e');
        const { data } = await res.json();
        expect(data.name).toBe('e2e');
        expect(data).not.toHaveProperty('defaultCredits');
        expect(data).not.toHaveProperty('defaultModuleAccess');
    });
});

test.describe('signed in, calling the routes directly', () => {
    test.use({ storageState: USER_STORAGE_STATE });

    test.afterEach(async ({ db }) => {
        await db.resetUser(E2E_USER);
    });

    test('a scrape cannot be taken without being charged, and its leads stay on the server', async ({ request, db }) => {
        await db.resetUser(E2E_USER, { credits: 100 });
        await mockBackend({ body: { success: true, data: searchLeads(3) } });

        const res = await request.post(LEAD_GEN_SCRAPE_API_ROUTE, { data: search() });
        const { data } = await res.json();

        expect(res.status()).toBe(200);
        expect(await db.getCredits(E2E_USER)).toBe(97);
        expect(data.leads).toHaveLength(3);
        expect(JSON.stringify(data)).not.toContain(searchLeads(3)[0]!.id);
    });

    test('an empty balance never reaches the backend', async ({ request, db }) => {
        await db.resetUser(E2E_USER, { credits: 0 });
        await mockBackend({ body: { success: true, data: searchLeads(3) } });

        const res = await request.post(LEAD_GEN_SCRAPE_API_ROUTE, { data: search() });

        expect(res.status()).toBe(402);
        expect((await res.json()).error).toBe(NO_CREDITS_MESSAGE);
        expect(backendRequests).toEqual([]);
    });

    test('a small balance cannot buy a full-size scrape', async ({ request, db }) => {
        await db.resetUser(E2E_USER, { credits: 3 });
        await mockBackend({ body: { success: true, data: searchLeads(3) } });

        await request.post(LEAD_GEN_SCRAPE_API_ROUTE, {
            data: {
                subModule: LEAD_GENERATION_SUB_MODULES.CRAWL,
                body: { domains: ['a.com', 'b.com', 'c.com', 'd.com', 'e.com'] },
                listName: 'Direct call',
            },
        });

        expect(backendRequests[0]!.body.domains).toEqual(['a.com', 'b.com', 'c.com']);
    });

    test('oversized and malformed requests never reach the backend', async ({ request, db }) => {
        await db.resetUser(E2E_USER);
        await mockBackend({ body: { success: true, data: [] } });

        const tooLong = await request.post(LEAD_GEN_SCRAPE_API_ROUTE, {
            data: { ...search(), padding: 'x'.repeat(70 * 1024) },
        });
        const tooManyCities = await request.post(LEAD_GEN_SCRAPE_API_ROUTE, {
            data: {
                subModule: LEAD_GENERATION_SUB_MODULES.GOOGLE_MAPS,
                body: { query: 'plumbers', cities: Array.from({ length: 26 }, (_, i) => `City ${i}`) },
                listName: 'Direct call',
            },
        });
        const invalid = await request.post(LEAD_GEN_SCRAPE_API_ROUTE, {
            data: { ...search(), body: { searchQuery: '' } },
        });
        const leadsPage = await request.post(LEAD_GEN_SCRAPE_API_ROUTE, {
            data: { ...search(), subModule: LEAD_GENERATION_SUB_MODULES.LEADS },
        });

        expect(tooLong.status()).toBe(413);
        expect(tooManyCities.status()).toBe(400);
        expect(invalid.status()).toBe(400);
        expect(leadsPage.status()).toBe(400);
        expect(backendRequests).toEqual([]);
    });

    test('a third simultaneous run waits in line and starts when a place frees up', async ({ request, db, playwright, baseURL }) => {
        await db.resetUser(E2E_USER);
        await mockBackend('hang');

        const contexts = await Promise.all(
            [0, 1].map(() => playwright.request.newContext({ baseURL, storageState: USER_STORAGE_STATE })),
        );
        const hanging = contexts.map((context) =>
            context.post(LEAD_GEN_SCRAPE_API_ROUTE, { data: search() }).catch(() => null),
        );
        await expect.poll(() => backendRequests.length).toBe(2);

        void request.post(LEAD_GEN_SCRAPE_API_ROUTE, { data: search() }).catch(() => null);
        await new Promise((resolve) => setTimeout(resolve, 2_000));
        expect(backendRequests).toHaveLength(2);

        await contexts[0]!.dispose();
        await expect.poll(() => backendRequests.length).toBe(3);

        await contexts[1]!.dispose();
        await Promise.all(hanging);
    });

    test('a run that waits too long is turned away', async ({ request, db, playwright, baseURL }) => {
        test.slow();
        await db.resetUser(E2E_USER);
        await mockBackend('hang');

        const contexts = await Promise.all(
            [0, 1].map(() => playwright.request.newContext({ baseURL, storageState: USER_STORAGE_STATE })),
        );
        const hanging = contexts.map((context) =>
            context.post(LEAD_GEN_SCRAPE_API_ROUTE, { data: search() }).catch(() => null),
        );
        await expect.poll(() => backendRequests.length).toBe(2);

        const third = await request.post(LEAD_GEN_SCRAPE_API_ROUTE, { data: search(), timeout: 70_000 });
        expect(third.status()).toBe(429);
        expect(backendRequests).toHaveLength(2);

        await Promise.all(contexts.map((context) => context.dispose()));
        await Promise.all(hanging);
    });

    test('the daily cap trims a run to what is left today and then stops further runs', async ({ request, db }) => {
        await db.resetUser(E2E_USER, { credits: 1000, usedToday: DAILY_LEAD_CAP - 2 });
        await mockBackend({ body: { success: true, data: searchLeads(3) } });

        const first = await request.post(LEAD_GEN_SCRAPE_API_ROUTE, { data: search() });
        const { data } = await first.json();
        expect(data.leads).toHaveLength(2);
        expect(data.dailyLimitReached).toBe(true);
        expect(await db.getCredits(E2E_USER)).toBe(998);

        backendRequests.length = 0;
        const second = await request.post(LEAD_GEN_SCRAPE_API_ROUTE, { data: search() });
        expect(second.status()).toBe(429);
        expect((await second.json()).error).toBe(DAILY_LIMIT_MESSAGE);
        expect(backendRequests).toEqual([]);
        expect(await db.getCredits(E2E_USER)).toBe(998);
    });

    test('yesterday\'s spending does not count against today', async ({ request, db }) => {
        await db.resetUser(E2E_USER, { credits: 1000, usedToday: DAILY_LEAD_CAP });
        await db.setCreditsDay(E2E_USER, '2020-01-01');
        await mockBackend({ body: { success: true, data: searchLeads(3) } });

        const res = await request.post(LEAD_GEN_SCRAPE_API_ROUTE, { data: search() });

        expect(res.status()).toBe(200);
        expect(await db.getCredits(E2E_USER)).toBe(997);
    });

    test('the hourly limit stops further runs', async ({ request, db }) => {
        await db.resetUser(E2E_USER);
        await db.seedRecentRuns(E2E_USER, 60);
        await mockBackend({ body: { success: true, data: searchLeads(1) } });

        const res = await request.post(LEAD_GEN_SCRAPE_API_ROUTE, { data: search() });

        expect(res.status()).toBe(429);
        expect(backendRequests).toEqual([]);
    });

    test('enrichment crawls the saved website and charges per website, whatever the browser sends', async ({ request, db }) => {
        await db.resetUser(E2E_USER, { credits: 100 });
        await mockBackend({ body: { success: true, data: searchLeads(1) } });
        await request.post(LEAD_GEN_SCRAPE_API_ROUTE, { data: search() });
        const leadIds = await db.getOwnedLeadIds(E2E_USER);

        await mockBackend({ body: { success: true, data: [] } });
        const res = await request.post(LEAD_GEN_ENRICH_API_ROUTE, {
            data: { leadIds, domains: ['attacker.example'], enriched: { domain: 'attacker.example' } },
        });

        expect(res.status()).toBe(200);
        expect(backendRequests).toHaveLength(1);
        expect(JSON.stringify(backendRequests[0]!.body)).not.toContain('attacker.example');
        expect((await res.json()).data.patchedCount).toBe(0);
    });

    test('enrichment saves what the crawl found and charges one credit per website', async ({ request, db }) => {
        await db.resetUser(E2E_USER, { credits: 100 });
        await mockBackend({ body: { success: true, data: searchLeads(1) } });
        await request.post(LEAD_GEN_SCRAPE_API_ROUTE, { data: search() });
        const leadIds = await db.getOwnedLeadIds(E2E_USER);
        expect(await db.getCredits(E2E_USER)).toBe(99);

        const domain = `plumber-1.example.com`;
        await mockBackend({ body: { success: true, data: [{ id: domain, domain, emails: [] }] } });
        const res = await request.post(LEAD_GEN_ENRICH_API_ROUTE, { data: { leadIds } });
        const { data } = await res.json();

        expect(res.status()).toBe(200);
        expect(backendRequests[0]!.body.domains).toHaveLength(1);
        expect(data.matchedCount).toBe(1);
        expect(await db.getCredits(E2E_USER)).toBe(98);
    });

    test('enriching another user\'s lead is refused', async ({ request, db }) => {
        await db.resetUser(E2E_USER);
        await mockBackend({ body: { success: true, data: [] } });

        const res = await request.post(LEAD_GEN_ENRICH_API_ROUTE, {
            data: { leadIds: ['507f1f77bcf86cd799439011'] },
        });

        expect(res.ok()).toBe(false);
        expect(backendRequests).toEqual([]);
    });
});
