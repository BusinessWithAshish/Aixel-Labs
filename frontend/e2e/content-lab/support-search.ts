import { type BrowserContext, expect, type Page, type Request } from '@playwright/test';
import { encryptOverrides } from 'flags';
import type {
    CONTENT_LAB_BREAKDOWN_RESPONSE,
    CONTENT_LAB_CHECK_RESPONSE,
    CONTENT_LAB_CREATOR_RESPONSE,
    CONTENT_LAB_EXPLORE_RESPONSE,
    CONTENT_LAB_POST,
    ContentLabFormat,
    ContentLabPlatform,
} from '@aixellabs/backend/content-lab/types';
import { CONTENT_LAB_API_ROUTES } from '@/config/app-config';
import { FeatureFlagKey } from '@/flags';
import { waitForHydration } from '../support/voice-agents';
import { E2E_BASE_URL, E2E_FLAGS_SECRET } from '../support/env';

/** Every Search spec runs at these three sizes. */
export const VIEWPORTS = [
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 } } },
    { name: 'tablet', use: { viewport: { width: 820, height: 1180 } } },
    { name: 'mobile', use: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } },
] as const;

/** Content Lab is behind its page flag: turn it on for this browser only. */
export async function enableContentLab(context: BrowserContext): Promise<void> {
    const value = await encryptOverrides({ [FeatureFlagKey.CONTENT_LAB]: true }, E2E_FLAGS_SECRET);
    await context.addCookies([{ name: 'vercel-flag-overrides', value, url: E2E_BASE_URL }]);
}

export async function expectNoHorizontalOverflow(page: Page): Promise<void> {
    const { scrollWidth, innerWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
    }));
    expect(scrollWidth, 'page scrolls sideways').toBeLessThanOrEqual(innerWidth);
}

export const SMART_BOX = 'input[aria-label="Topic, link or @creator"]';

export async function waitForSmartBox(page: Page): Promise<void> {
    await waitForHydration(page, SMART_BOX);
}

type BffKey = keyof typeof CONTENT_LAB_API_ROUTES;
type Reply = { status?: number; body: { success: boolean; data?: unknown; error?: string } } | 'hang';

/**
 * Replaces one Content Lab BFF route in the browser (like `mockScrape`). `reply` may depend on the
 * request body; `'hang'` leaves it in flight. Returns the bodies sent, in order.
 */
export async function mockContentLab(page: Page, key: BffKey, reply: Reply | ((body: Record<string, unknown>) => Reply)) {
    const requests: Record<string, unknown>[] = [];
    await page.route(`**${CONTENT_LAB_API_ROUTES[key]}`, async (route) => {
        const body = (route.request().postDataJSON() ?? {}) as Record<string, unknown>;
        requests.push(body);
        const answer = typeof reply === 'function' ? reply(body) : reply;
        if (answer === 'hang') return;
        await route.fulfill({ status: answer.status ?? 200, json: answer.body });
    });
    return { requests };
}

export const ok = (data: unknown): Reply => ({ body: { success: true, data } });
export const fail = (error: string, status = 502): Reply => ({ status, body: { success: false, error } });

/** Requests to `key` the page aborted (a newer search replaced them). */
export function trackAborted(page: Page, key: BffKey): Request[] {
    const aborted: Request[] = [];
    page.on('requestfailed', (request) => {
        if (request.url().endsWith(CONTENT_LAB_API_ROUTES[key])) aborted.push(request);
    });
    return aborted;
}

const SIGNALS = { hasNumber: true, hasPrice: false, hasQuestion: false, hasYear: false, isListicle: false, hasPov: false, isChallenge: true, length: 38 };

export function makePost(overrides: Partial<CONTENT_LAB_POST> & { platform?: ContentLabPlatform; format?: ContentLabFormat } = {}): CONTENT_LAB_POST {
    const platform = overrides.platform ?? 'youtube';
    const id = overrides.id ?? `${platform}:vid${Math.random().toString(36).slice(2, 10)}`;
    const nativeId = id.split(':')[1];
    return {
        id,
        platform,
        format: 'video',
        url: platform === 'youtube' ? `https://www.youtube.com/watch?v=${nativeId}` : `https://www.instagram.com/reel/${nativeId}/`,
        title: 'I tried 30 days of protein breakfasts',
        thumbnailUrl: null,
        publishedAt: '2026-10-01T10:00:00.000Z',
        views: 1_200_000,
        likes: 54_000,
        comments: 1_900,
        durationSeconds: 702,
        creator: { platform, id: 'UCfitwithriya', handle: 'fitwithriya', name: 'Fit with Riya', url: null, followers: 410_000 },
        usualViews: 85_000,
        multiple: 14.1,
        reasons: ['Number + 30-day test'],
        signals: SIGNALS,
        ...overrides,
    };
}

export const EXPLORE_POSTS = [
    makePost({ id: 'youtube:vidAAAAAA1' }),
    makePost({
        id: 'instagram:reelBBBBB2',
        platform: 'instagram',
        format: 'reel',
        title: 'What I eat in a day on ₹20k/month',
        creator: { platform: 'instagram', id: 'hostelkitchen', handle: 'hostelkitchen', name: 'Hostel Kitchen', url: null, followers: 220_000 },
        views: 2_100_000,
        usualViews: 180_000,
        multiple: 11.7,
        reasons: ['₹ budget in first line'],
        durationSeconds: 34,
    }),
    makePost({
        id: 'youtube:vidCCCCCC3',
        format: 'short',
        title: '3 breakfasts under ₹50',
        creator: { platform: 'youtube', id: 'UCdesidiet', handle: 'desidiet', name: 'Desi Diet', url: null, followers: 90_000 },
        views: 90_000,
        usualViews: 13_000,
        multiple: 6.9,
        reasons: ['₹ price in title'],
        durationSeconds: 52,
    }),
];

export function exploreResponse(overrides: Partial<CONTENT_LAB_EXPLORE_RESPONSE> = {}): CONTENT_LAB_EXPLORE_RESPONSE {
    return {
        query: 'protein breakfast',
        country: 'IN',
        platforms: ['youtube', 'instagram'],
        posts: EXPLORE_POSTS,
        takeaways: [
            { headline: '5 of 6', detail: 'winners put a number or ₹ price in the first line.' },
            { headline: 'Reels win', detail: 'on Instagram right now; long videos win on YouTube.' },
            { headline: 'Gap', detail: 'Almost nobody does this in Hindi.' },
        ],
        niche: { postCount: 48, outlierCount: 9, medianMultiple: 1.3, bestFormat: { youtube: 'video', instagram: 'reel' } },
        errors: {},
        ...overrides,
    };
}

export function creatorResponse(platform: ContentLabPlatform): CONTENT_LAB_CREATOR_RESPONSE {
    const post = platform === 'youtube' ? EXPLORE_POSTS[0] : EXPLORE_POSTS[1];
    return { creator: post.creator, usualViews: post.usualViews, posts: [post] };
}

export function breakdownResponse(format: ContentLabFormat): CONTENT_LAB_BREAKDOWN_RESPONSE {
    if (format === 'video') {
        return {
            post: makePost({ id: 'youtube:vidAAAAAA1', format: 'video', durationSeconds: 702 }),
            hook: { text: 'Ninety percent of people eat the wrong breakfast for muscle.', type: 'shock number + promise of proof', seconds: 6 },
            structure: [
                { label: 'Hook', startSeconds: 0, endSeconds: 6 },
                { label: 'Setup', startSeconds: 6, endSeconds: 70 },
                { label: '3 tests', startSeconds: 70, endSeconds: 250 },
                { label: 'Re-hook', startSeconds: 250, endSeconds: 300 },
                { label: 'Results', startSeconds: 300, endSeconds: 660 },
                { label: 'CTA', startSeconds: 660, endSeconds: 702 },
            ],
            cta: { text: "Comment PLAN and I'll send the PDF.", atPercent: 92 },
            audience: { rewatchedSeconds: [134, 330], topComments: ['Veg version please!'] },
            text: 'Ninety percent of people eat the wrong breakfast…',
            whyItWorked: ['A concrete number up front sets the stakes.', 'The payoff is promised early.'],
        };
    }
    if (format === 'carousel') {
        return {
            post: makePost({
                id: 'instagram:carDDDDDD4',
                platform: 'instagram',
                format: 'carousel',
                title: '7 high-protein swaps (save this)',
                views: null,
                likes: 60_000,
                usualViews: 6_000,
                multiple: 10,
                durationSeconds: null,
            }),
            hook: { text: '7 high-protein swaps (save this)', type: 'number + benefit + save ask', seconds: null },
            structure: [
                { label: 'Cover', startSeconds: null, endSeconds: null },
                ...Array.from({ length: 6 }, (_, i) => ({ label: `Swap ${i + 1}`, startSeconds: null, endSeconds: null })),
                { label: 'Save CTA', startSeconds: null, endSeconds: null },
            ],
            cta: { text: 'Save this and send it to your gym buddy.', atPercent: null },
            audience: { rewatchedSeconds: [], topComments: [] },
            text: null,
            whyItWorked: ['A number and a direct ask to save.'],
        };
    }
    return {
        post: makePost({ ...EXPLORE_POSTS[1], format }),
        hook: { text: '₹20,000 a month. Full day of eating.', type: 'price on screen', seconds: 1.5 },
        structure: [
            { label: 'Hook', startSeconds: 0, endSeconds: 2 },
            { label: '4 meals', startSeconds: 2, endSeconds: 30 },
            { label: 'Total ₹', startSeconds: 30, endSeconds: 34 },
        ],
        cta: { text: 'Follow for the full week.', atPercent: 95 },
        audience: { rewatchedSeconds: [31], topComments: ['How is this ₹20k?'] },
        text: 'Full day of eating on ₹20k',
        whyItWorked: ['The price is on screen before a word is spoken.'],
    };
}

export const CHECK_RESPONSE: CONTENT_LAB_CHECK_RESPONSE = {
    score: 42,
    checks: [
        { label: 'Starts with a clear topic', passed: true, detail: '"protein breakfast" matches what people search' },
        { label: 'No number or ₹ price', passed: false, detail: '5 of 6 winners this month have one' },
        { label: 'No promise or stakes', passed: false, detail: 'Winners promise a result: "30 days", "under ₹50"' },
    ],
    winners: EXPLORE_POSTS,
};

export const REWRITES = [
    "I ate a gym trainer's breakfast for 7 days (₹40/day)",
    '3 protein breakfasts under ₹50 that beat eggs',
    "Why my breakfast wasn't building muscle (fixed in 30 days)",
];
