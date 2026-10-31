import type { BrowserContext, Page, Request } from '@playwright/test';
import { encryptOverrides } from 'flags';
import { MongoClient, ObjectId, type Db } from 'mongodb';
import type {
    CONTENT_LAB_BREAKDOWN_RESPONSE,
    CONTENT_LAB_CHECK_RESPONSE,
    CONTENT_LAB_CREATOR_RESPONSE,
    CONTENT_LAB_EXPLORE_RESPONSE,
    CONTENT_LAB_POST,
    CONTENT_LAB_KEYWORD_RESPONSE,
    CONTENT_LAB_SUGGEST_RESPONSE,
    ContentLabPlatform,
} from '@aixellabs/backend/content-lab/types';
import {
    CONTENT_LAB_SUB_MODULES,
    MongoCollections,
    type ContentLabBoardDoc,
    type ContentLabBoardRunDoc,
    type ContentLabProfileDoc,
    type ContentLabWatchDoc,
    type UserDoc,
} from '@aixellabs/backend/db/types';
import { CONTENT_LAB_API_ROUTES, SubModuleUrls } from '@/config/app-config';
import { FeatureFlagKey } from '@/flags';
import type { CONTENT_LAB_ADS_RESPONSE, CONTENT_LAB_WRITE_REQUEST } from '@/helpers/content-lab-api';
import { expect, test as base } from '../support/fixtures';
import { E2E_BASE_URL, E2E_DB_NAME, E2E_FLAGS_SECRET, E2E_MONGODB_URI, E2E_TENANT } from '../support/env';
import type { E2eUser } from '../support/users';

export { expect };

export const BOARDS_URL = SubModuleUrls[CONTENT_LAB_SUB_MODULES.BOARDS];
export const WATCHING_URL = SubModuleUrls[CONTENT_LAB_SUB_MODULES.WATCHING];
export const SETTINGS_URL = SubModuleUrls[CONTENT_LAB_SUB_MODULES.SETTINGS];

/** Every spec runs at these three sizes. */
export const VIEWPORTS = [
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 } } },
    { name: 'tablet', use: { viewport: { width: 820, height: 1180 }, hasTouch: true } },
    { name: 'mobile', use: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } },
] as const;

/** Content Lab is behind its page flag: turn it on for this browser only. */
export async function enableContentLab(context: BrowserContext): Promise<void> {
    const value = await encryptOverrides({ [FeatureFlagKey.CONTENT_LAB]: true }, E2E_FLAGS_SECRET);
    await context.addCookies([{ name: 'vercel-flag-overrides', value, url: E2E_BASE_URL }]);
}

/** Nothing on the page (or its scroll container) sticks out sideways. */
export async function expectNoSidewaysScroll(page: Page): Promise<void> {
    const overflow = await page.evaluate(() => {
        const doc = document.documentElement.scrollWidth - document.documentElement.clientWidth;
        const container = document.getElementById('page-children-container');
        const inner = container ? container.scrollWidth - container.clientWidth : 0;
        return Math.max(doc, inner);
    });
    expect(overflow, 'horizontal overflow (px)').toBeLessThanOrEqual(1);
}

/** Content Lab collections, straight from this worker's e2e database. */
export class ContentLabDb {
    private constructor(
        private readonly client: MongoClient,
        private readonly db: Db,
    ) {}

    static async connect(): Promise<ContentLabDb> {
        const client = new MongoClient(E2E_MONGODB_URI, { serverSelectionTimeoutMS: 10_000 });
        await client.connect();
        return new ContentLabDb(client, client.db(E2E_DB_NAME));
    }

    close = () => this.client.close();

    get boards() {
        return this.db.collection<ContentLabBoardDoc>(MongoCollections.CONTENT_LAB_BOARDS);
    }
    get boardRuns() {
        return this.db.collection<ContentLabBoardRunDoc>(MongoCollections.CONTENT_LAB_BOARD_RUNS);
    }
    get watchlist() {
        return this.db.collection<ContentLabWatchDoc>(MongoCollections.CONTENT_LAB_WATCHLIST);
    }
    get profiles() {
        return this.db.collection<ContentLabProfileDoc>(MongoCollections.CONTENT_LAB_PROFILES);
    }

    async userId(user: E2eUser): Promise<ObjectId> {
        const doc = await this.db.collection<UserDoc>(MongoCollections.USERS).findOne({ firebaseUid: user.firebaseUid, tenantName: E2E_TENANT });
        if (!doc?._id) throw new Error(`E2E user ${user.firebaseUid} is not seeded`);
        return doc._id;
    }

    /** Removes the user's boards, watches and profile. */
    async reset(user: E2eUser): Promise<void> {
        const userId = await this.userId(user);
        await Promise.all([
            this.boards.deleteMany({ userId }),
            this.boardRuns.deleteMany({ userId }),
            this.watchlist.deleteMany({ userId }),
            this.profiles.deleteMany({ userId }),
        ]);
    }

    async insertBoard(user: E2eUser, board: Pick<ContentLabBoardDoc, 'title' | 'nodes' | 'edges'> & Partial<ContentLabBoardDoc>): Promise<string> {
        const now = new Date();
        const { insertedId } = await this.boards.insertOne({
            userId: await this.userId(user),
            templateId: null,
            createdAt: now,
            updatedAt: now,
            ...board,
        });
        return insertedId.toString();
    }

    /** A finished scheduled run of a board, as the server's scheduler records it. */
    async insertBoardRun(
        user: E2eUser,
        boardId: string,
        run: Pick<ContentLabBoardRunDoc, 'status' | 'summary' | 'nodes' | 'outputs'> & Partial<ContentLabBoardRunDoc>,
    ): Promise<string> {
        const startedAt = new Date(Date.now() - 60 * 60_000);
        const { insertedId } = await this.boardRuns.insertOne({
            boardId: new ObjectId(boardId),
            userId: await this.userId(user),
            trigger: 'schedule',
            startedAt,
            finishedAt: new Date(startedAt.getTime() + 60_000),
            ...run,
        });
        return insertedId.toString();
    }

    /** What a scheduled run does to a board: writes an Output's draft and bumps `updatedAt`. */
    async writeScheduledDraft(boardId: string, nodeId: string, text: string): Promise<void> {
        await this.boards.updateOne(
            { _id: new ObjectId(boardId) },
            { $set: { 'nodes.$[o].data.text': text, updatedAt: new Date() } },
            { arrayFilters: [{ 'o.id': nodeId }] },
        );
    }

    async getBoard(id: string) {
        return this.boards.findOne({ _id: new ObjectId(id) });
    }

    async listBoards(user: E2eUser) {
        return this.boards.find({ userId: await this.userId(user) }).sort({ createdAt: 1 }).toArray();
    }

    async setProfile(user: E2eUser, fields: Partial<ContentLabProfileDoc>): Promise<void> {
        const userId = await this.userId(user);
        await this.profiles.updateOne(
            { userId },
            { $set: { handles: {}, country: 'IN', language: 'English', updatedAt: new Date(), ...fields } },
            { upsert: true },
        );
    }

    async insertWatch(user: E2eUser, fields: Pick<ContentLabWatchDoc, 'platform' | 'handle'> & Partial<ContentLabWatchDoc>): Promise<string> {
        const { insertedId } = await this.watchlist.insertOne({
            userId: await this.userId(user),
            name: null,
            followers: null,
            usualViews: null,
            standouts: [],
            lastCheckedAt: null,
            createdAt: new Date(),
            ...fields,
        });
        return insertedId.toString();
    }
}

export const test = base.extend<{ lab: ContentLabDb }>({
    lab: async ({}, provide) => {
        const lab = await ContentLabDb.connect();
        await provide(lab);
        await lab.close();
    },
});

// ─── Fake BFF ────────────────────────────────────────────────────────────────

const SIGNALS = { hasNumber: false, hasPrice: false, hasQuestion: false, hasYear: false, isListicle: false, hasPov: false, isChallenge: false, length: 30 };

export function fakePost(overrides: Partial<CONTENT_LAB_POST> & { id: string; title: string }): CONTENT_LAB_POST {
    const platform: ContentLabPlatform = overrides.platform ?? 'youtube';
    return {
        platform,
        format: platform === 'youtube' ? 'video' : 'reel',
        url: `https://example.com/${overrides.id}`,
        thumbnailUrl: null,
        publishedAt: '2026-10-20T10:00:00.000Z',
        views: 100_000,
        likes: 1_000,
        comments: 100,
        durationSeconds: 60,
        creator: { platform, id: 'c1', handle: 'fitwithriya', name: 'Fit with Riya', url: null, followers: 120_000 },
        usualViews: 20_000,
        multiple: 5,
        reasons: ['Number in the title'],
        signals: { ...SIGNALS, length: overrides.title.length },
        ...overrides,
    };
}

export function fakeCreator(handle: string, multiples: (number | null)[]): CONTENT_LAB_CREATOR_RESPONSE {
    return {
        creator: {
            platform: 'youtube',
            id: handle,
            handle,
            name: `Name of ${handle}`,
            url: `https://www.youtube.com/@${handle}`,
            followers: 120_000,
            avatarUrl: null,
            bio: `Bio of ${handle}`,
        },
        usualViews: 85_000,
        posts: multiples.map((multiple, index) =>
            fakePost({
                id: `youtube:${handle}-${index}`,
                title: `${handle} post ${index}`,
                multiple,
                publishedAt: `2026-10-${String(20 - index).padStart(2, '0')}T10:00:00.000Z`,
            }),
        ),
    };
}

export const FAKE_EXPLORE: CONTENT_LAB_EXPLORE_RESPONSE = {
    query: 'protein breakfast',
    country: 'IN',
    platforms: ['youtube', 'instagram'],
    posts: [
        fakePost({ id: 'youtube:a1', title: 'I tried 30 days of protein breakfasts', multiple: 14.1, signals: { ...SIGNALS, hasNumber: true, isChallenge: true, length: 37 } }),
        fakePost({ id: 'instagram:a2', platform: 'instagram', title: 'What I eat on ₹20k a month', multiple: 11.7, signals: { ...SIGNALS, hasNumber: true, hasPrice: true, length: 26 } }),
        fakePost({ id: 'youtube:a3', title: '3 breakfasts under ₹50', multiple: 6.9, signals: { ...SIGNALS, hasNumber: true, hasPrice: true, isListicle: true, length: 22 } }),
    ],
    takeaways: [],
    niche: { postCount: 24, outlierCount: 3, medianMultiple: 1.2, bestFormat: {} },
    errors: {},
    nextCursor: null,
};

export const FAKE_BREAKDOWN: CONTENT_LAB_BREAKDOWN_RESPONSE = {
    post: fakePost({ id: 'youtube:p1', title: 'Why your gym diet is failing', multiple: 3.1 }),
    hook: { text: 'Your breakfast is the reason', type: 'call-out', seconds: 2 },
    structure: [
        { label: 'Hook', startSeconds: 0, endSeconds: 3 },
        { label: 'Three tests', startSeconds: 3, endSeconds: 50 },
        { label: 'CTA', startSeconds: 50, endSeconds: 60 },
    ],
    cta: { text: 'Comment PLAN', atPercent: 90 },
    audience: { rewatchedSeconds: [], topComments: [] },
    text: 'Full transcript',
    whyItWorked: ['Expert + question'],
};

export const FAKE_CHECK: CONTENT_LAB_CHECK_RESPONSE = {
    score: 81,
    checks: [
        { label: 'Number in hook', passed: true, detail: '5 of 6 winners' },
        { label: 'Under 60 characters', passed: false, detail: 'Yours is 72' },
    ],
    winners: [],
};

type Handlers = {
    explore?: () => CONTENT_LAB_EXPLORE_RESPONSE;
    breakdown?: () => CONTENT_LAB_BREAKDOWN_RESPONSE;
    creator?: (body: { platform: ContentLabPlatform; handle: string }) => CONTENT_LAB_CREATOR_RESPONSE;
    suggest?: (body: { platform: ContentLabPlatform; query: string; country?: string }) => CONTENT_LAB_SUGGEST_RESPONSE;
    keyword?: (body: { query: string; country?: string; trend?: boolean }) => CONTENT_LAB_KEYWORD_RESPONSE;
    write?: (body: CONTENT_LAB_WRITE_REQUEST) => { text: string };
    check?: () => CONTENT_LAB_CHECK_RESPONSE;
    ads?: () => CONTENT_LAB_ADS_RESPONSE;
    /** Waits this long before answering, so in-progress states can be seen. */
    delayMs?: number;
};

/** Stands in for `app/api/content-lab/*` in the browser and records what the page sent. */
export async function mockContentLabApi(page: Page, handlers: Handlers): Promise<Record<keyof typeof CONTENT_LAB_API_ROUTES, Request[]>> {
    const calls = { EXPLORE: [], BREAKDOWN: [], CHECK: [], CREATOR: [], SUGGEST: [], KEYWORD: [], WRITE: [], ADS: [] } as Record<
        keyof typeof CONTENT_LAB_API_ROUTES,
        Request[]
    >;
    const answer: Record<keyof typeof CONTENT_LAB_API_ROUTES, ((body: never) => unknown) | undefined> = {
        EXPLORE: handlers.explore,
        BREAKDOWN: handlers.breakdown,
        CHECK: handlers.check,
        CREATOR: handlers.creator,
        SUGGEST: handlers.suggest,
        KEYWORD: handlers.keyword,
        WRITE: handlers.write,
        ADS: handlers.ads,
    };
    for (const key of Object.keys(CONTENT_LAB_API_ROUTES) as (keyof typeof CONTENT_LAB_API_ROUTES)[]) {
        await page.route(`**${CONTENT_LAB_API_ROUTES[key]}`, async (route) => {
            calls[key].push(route.request());
            if (handlers.delayMs) await new Promise((resolve) => setTimeout(resolve, handlers.delayMs));
            const handler = answer[key];
            const body = handler
                ? { success: true, data: handler(route.request().postDataJSON() as never) }
                : { success: false, error: `${key} is not mocked` };
            await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
        });
    }
    return calls;
}
