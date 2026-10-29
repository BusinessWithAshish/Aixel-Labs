'use server';

import { z } from 'zod';
import { ALApiResponse } from '@aixellabs/backend/api/types';
import {
    CONTENT_LAB_WRITE_FORMATS,
    ContentLabNodeKind,
    type ContentLabBoard,
    type ContentLabBoardDoc,
    type ContentLabBoardEdge,
    type ContentLabBoardNode,
    type ContentLabBoardRun,
    type ContentLabBoardRunDoc,
    type ContentLabBoardSchedule,
    CONTENT_LAB_SCHEDULE_EVERY_HOURS,
    CONTENT_LAB_SCHEDULE_REPEATS,
    VOICE_WEEKDAYS,
    type ContentLabProfile,
    type ContentLabProfileDoc,
    type ContentLabStandout,
    type ContentLabWatch,
    type ContentLabWatchPost,
    type ContentLabWatchDoc,
} from '@aixellabs/backend/db';
import {
    CONTENT_LAB_DEFAULT_COUNTRY,
    CONTENT_LAB_FORMATS,
    CONTENT_LAB_OUTLIER_MULTIPLE,
    CONTENT_LAB_PLATFORMS,
} from '@aixellabs/backend/content-lab/constants';
import type { ContentLabPlatform, CONTENT_LAB_CREATOR_RESPONSE } from '@aixellabs/backend/content-lab/types';
import { requireUserObjectId, runAuthenticatedAction, toObjectId } from '@/helpers/server-action-helpers';
import { isIanaTimezone } from '@/helpers/voice-time';
import {
    contentLabBoardRunsCollection,
    contentLabBoardsCollection,
    contentLabProfilesCollection,
    contentLabWatchlistCollection,
} from '@/server/content-lab/collections';
import {
    CONTENT_LAB_BOARD_TEMPLATE_IDS,
    CONTENT_LAB_BOARD_TEMPLATES,
    CONTENT_LAB_DEFAULT_LANGUAGE,
} from '@/app/(protected)/content-lab/_constants';
import { nextScheduledRun } from '@/app/(protected)/content-lab/boards/_utils/schedule';

const MAX_NODES = 60;
const MAX_EDGES = 200;
const MAX_STANDOUTS = 10;
/** Recent posts kept per watch, for the card's thumbnails. */
const MAX_RECENT = 12;

/** Parses at the trust boundary; the first issue becomes the action's error. */
function parse<T extends z.ZodTypeAny>(schema: T, input: unknown): z.output<T> {
    const result = schema.safeParse(input);
    if (!result.success) {
        const issue = result.error.issues[0];
        throw new Error(issue ? `${issue.path.join('.') || 'Input'}: ${issue.message}` : 'Invalid input');
    }
    return result.data;
}

/** No leading @, no spaces around, lowercase. */
const normaliseHandle = (handle: string) => handle.trim().replace(/^@+/, '').toLowerCase();

const PLATFORM_SCHEMA = z.enum(CONTENT_LAB_PLATFORMS);
const HANDLE_SCHEMA = z.string().trim().max(200).transform(normaliseHandle);
const COUNTRY_SCHEMA = z
    .string()
    .trim()
    .regex(/^[A-Za-z]{2}$/, 'Use a 2-letter country code')
    .transform((value) => value.toUpperCase());
const LANGUAGE_SCHEMA = z.string().trim().min(1).max(40);

// ─── Boards ──────────────────────────────────────────────────────────────────

export type ContentLabBoardSummary = Pick<ContentLabBoard, '_id' | 'title' | 'templateId' | 'updatedAt' | 'schedule' | 'nextRunAt'> & {
    nodeCount: number;
};

const NODE_SCHEMA = z.object({
    id: z.string().min(1).max(64),
    kind: z.nativeEnum(ContentLabNodeKind),
    x: z.number().finite(),
    y: z.number().finite(),
    data: z.object({
        title: z.string().max(120).optional(),
        query: z.string().max(200).optional(),
        platforms: z.array(PLATFORM_SCHEMA).max(CONTENT_LAB_PLATFORMS.length).optional(),
        country: z.string().max(2).optional(),
        platform: PLATFORM_SCHEMA.optional(),
        handle: z.string().max(200).optional(),
        url: z.string().max(500).optional(),
        text: z.string().max(20_000).optional(),
        format: z.enum(CONTENT_LAB_WRITE_FORMATS).optional(),
        language: z.string().max(40).optional(),
    }),
});

const EDGE_SCHEMA = z.object({
    id: z.string().min(1).max(140),
    source: z.string().min(1).max(64),
    target: z.string().min(1).max(64),
});

const GRAPH_SCHEMA = z
    .object({ nodes: z.array(NODE_SCHEMA).max(MAX_NODES), edges: z.array(EDGE_SCHEMA).max(MAX_EDGES) })
    .refine(({ nodes, edges }) => {
        const ids = new Set(nodes.map((node) => node.id));
        return ids.size === nodes.length && edges.every((edge) => ids.has(edge.source) && ids.has(edge.target));
    }, 'Every wire must join two nodes on this board');

const TITLE_SCHEMA = z.string().trim().min(1, 'Give the board a name').max(120);

const CREATE_BOARD_SCHEMA = z.object({
    templateId: z.enum(CONTENT_LAB_BOARD_TEMPLATE_IDS),
    seed: z
        .object({ url: z.string().trim().max(500).optional(), query: z.string().trim().max(200).optional() })
        .optional(),
});

function mapBoard(doc: ContentLabBoardDoc): ContentLabBoard {
    return {
        _id: doc._id!.toString(),
        userId: doc.userId.toString(),
        title: doc.title,
        templateId: doc.templateId,
        nodes: doc.nodes,
        edges: doc.edges,
        schedule: doc.schedule,
        nextRunAt: doc.nextRunAt?.toISOString() ?? null,
        createdAt: doc.createdAt.toISOString(),
        updatedAt: doc.updatedAt.toISOString(),
    };
}

/** The user's boards, last edited first. */
export const listContentLabBoards = async (): Promise<ALApiResponse<ContentLabBoardSummary[]>> =>
    runAuthenticatedAction(async function listContentLabBoards(userId) {
        const boards = await contentLabBoardsCollection();
        const docs = await boards
            .find(
                { userId: requireUserObjectId(userId) },
                { projection: { title: 1, templateId: 1, updatedAt: 1, nodes: 1, schedule: 1, nextRunAt: 1 } },
            )
            .sort({ updatedAt: -1 })
            .toArray();
        return docs.map((doc) => ({
            _id: doc._id.toString(),
            title: doc.title,
            templateId: doc.templateId,
            updatedAt: doc.updatedAt.toISOString(),
            schedule: doc.schedule,
            nextRunAt: doc.nextRunAt?.toISOString() ?? null,
            nodeCount: doc.nodes?.length ?? 0,
        }));
    });

export const getContentLabBoard = async (boardId: string): Promise<ALApiResponse<ContentLabBoard>> =>
    runAuthenticatedAction(async function getContentLabBoard(userId) {
        const boards = await contentLabBoardsCollection();
        const doc = await boards.findOne({ _id: toObjectId(boardId, 'Board'), userId: requireUserObjectId(userId) });
        if (!doc) throw new Error('Board not found');
        return mapBoard(doc);
    });

/**
 * A new board from a template: its boxes and wires, with the user's default country and language.
 * `seed` fills the Post box's link and the topic of What's working / Competitor ads.
 */
export const createContentLabBoard = async (input: {
    templateId: string;
    seed?: { url?: string; query?: string };
}): Promise<ALApiResponse<{ id: string }>> =>
    runAuthenticatedAction(async function createContentLabBoard(userId) {
        const uid = requireUserObjectId(userId);
        const { templateId, seed } = parse(CREATE_BOARD_SCHEMA, input);
        const template = CONTENT_LAB_BOARD_TEMPLATES.find((item) => item.id === templateId)!;
        const profile = await (await contentLabProfilesCollection()).findOne({ userId: uid });
        const country = profile?.country ?? CONTENT_LAB_DEFAULT_COUNTRY;
        const language = profile?.language ?? CONTENT_LAB_DEFAULT_LANGUAGE;

        const nodes: ContentLabBoardNode[] = template.nodes.map((node) => {
            const data = { ...node.data };
            if (node.kind === ContentLabNodeKind.POST && seed?.url) data.url = seed.url;
            if ((node.kind === ContentLabNodeKind.WORKING || node.kind === ContentLabNodeKind.ADS) && seed?.query) {
                data.query = seed.query;
            }
            if ('country' in data) data.country = country;
            if (node.kind === ContentLabNodeKind.WRITE) data.language = language;
            return { ...node, data };
        });
        const edges: ContentLabBoardEdge[] = template.edges.map((edge) => ({ ...edge }));

        const now = new Date();
        const boards = await contentLabBoardsCollection();
        const { insertedId } = await boards.insertOne({
            userId: uid,
            title: seed?.query ? `${template.title} · ${seed.query}` : template.title,
            templateId: template.id,
            nodes,
            edges,
            createdAt: now,
            updatedAt: now,
        });
        return { id: insertedId.toString() };
    });

const SAVE_OPTIONS_SCHEMA = z.object({
    /** The board's `updatedAt` the edits started from; the save is refused (conflict) when it changed since. */
    baseUpdatedAt: z.string().datetime().optional(),
    /** Save over whatever is there now (the user chose to after a conflict). */
    overwrite: z.boolean().optional(),
});

export type ContentLabBoardSaveResult = { status: 'saved'; updatedAt: string } | { status: 'conflict'; updatedAt: string };

/**
 * Save (the board's Save button / Ctrl+S): its nodes (positions, settings, output text) and wires.
 * Only over the version the edits started from, so a tab opened before a scheduled run wrote its
 * drafts cannot silently wipe them: then it answers `conflict` with the board's current `updatedAt`.
 */
export const saveContentLabBoard = async (
    boardId: string,
    graph: { nodes: ContentLabBoardNode[]; edges: ContentLabBoardEdge[] },
    options: { baseUpdatedAt?: string; overwrite?: boolean } = {},
): Promise<ALApiResponse<ContentLabBoardSaveResult>> =>
    runAuthenticatedAction(async function saveContentLabBoard(userId) {
        const { nodes, edges } = parse(GRAPH_SCHEMA, graph);
        const { baseUpdatedAt, overwrite } = parse(SAVE_OPTIONS_SCHEMA, options);
        const owned = { _id: toObjectId(boardId, 'Board'), userId: requireUserObjectId(userId) };
        const updatedAt = new Date();
        const boards = await contentLabBoardsCollection();
        const { matchedCount } = await boards.updateOne(
            baseUpdatedAt && !overwrite ? { ...owned, updatedAt: new Date(baseUpdatedAt) } : owned,
            { $set: { nodes, edges, updatedAt } },
        );
        if (!matchedCount) {
            const current = await boards.findOne(owned, { projection: { updatedAt: 1 } });
            if (!current) throw new Error('Board not found');
            return { status: 'conflict', updatedAt: current.updatedAt.toISOString() };
        }
        return { status: 'saved', updatedAt: updatedAt.toISOString() };
    });

export const renameContentLabBoard = async (boardId: string, title: string): Promise<ALApiResponse<{ title: string }>> =>
    runAuthenticatedAction(async function renameContentLabBoard(userId) {
        const name = parse(TITLE_SCHEMA, title);
        const boards = await contentLabBoardsCollection();
        const { matchedCount } = await boards.updateOne(
            { _id: toObjectId(boardId, 'Board'), userId: requireUserObjectId(userId) },
            { $set: { title: name, updatedAt: new Date() } },
        );
        if (!matchedCount) throw new Error('Board not found');
        return { title: name };
    });

export const deleteContentLabBoard = async (boardId: string): Promise<ALApiResponse<{ id: string }>> =>
    runAuthenticatedAction(async function deleteContentLabBoard(userId) {
        const boards = await contentLabBoardsCollection();
        const _id = toObjectId(boardId, 'Board');
        const { deletedCount } = await boards.deleteOne({ _id, userId: requireUserObjectId(userId) });
        if (!deletedCount) throw new Error('Board not found');
        await (await contentLabBoardRunsCollection()).deleteMany({ boardId: _id });
        return { id: boardId };
    });

// ─── Board schedule ──────────────────────────────────────────────────────────

/** Runs shown in a board's history. */
const RUNS_LISTED = 10;
/** A run still "running" after this died with its server call (the scheduler's lease is 10 minutes). */
const STALE_RUN_MS = 15 * 60_000;

const SCHEDULE_SCHEMA = z
    .object({
        repeat: z.enum(CONTENT_LAB_SCHEDULE_REPEATS),
        time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Pick a time'),
        days: z.array(z.enum(VOICE_WEEKDAYS)).max(7),
        everyHours: z.number().int().refine((value) => (CONTENT_LAB_SCHEDULE_EVERY_HOURS as readonly number[]).includes(value), 'Pick how often'),
        timezone: z.string().max(64).refine(isIanaTimezone, 'Pick a timezone'),
        paused: z.boolean(),
    })
    .refine((schedule) => schedule.repeat !== 'weekdays' || schedule.days.length > 0, { message: 'Pick at least one day', path: ['days'] });

function mapBoardRun(doc: ContentLabBoardRunDoc): ContentLabBoardRun {
    const stale = doc.status === 'running' && Date.now() - doc.startedAt.getTime() > STALE_RUN_MS;
    return {
        _id: doc._id!.toString(),
        boardId: doc.boardId.toString(),
        userId: doc.userId.toString(),
        trigger: doc.trigger,
        status: stale ? 'failed' : doc.status,
        summary: stale ? 'Did not finish in time' : doc.summary,
        nodes: doc.nodes,
        outputs: doc.outputs,
        startedAt: doc.startedAt.toISOString(),
        finishedAt: doc.finishedAt?.toISOString() ?? null,
    };
}

/** Sets when the board runs by itself (or turns it off / pauses it) and works out its next run. */
export const saveContentLabBoardSchedule = async (
    boardId: string,
    schedule: ContentLabBoardSchedule,
): Promise<ALApiResponse<{ schedule: ContentLabBoardSchedule; nextRunAt: string | null }>> =>
    runAuthenticatedAction(async function saveContentLabBoardSchedule(userId) {
        const next = parse(SCHEDULE_SCHEMA, schedule);
        const nextRunAt = nextScheduledRun(next, new Date());
        const boards = await contentLabBoardsCollection();
        const { matchedCount } = await boards.updateOne(
            { _id: toObjectId(boardId, 'Board'), userId: requireUserObjectId(userId) },
            { $set: { schedule: next, nextRunAt } },
        );
        if (!matchedCount) throw new Error('Board not found');
        return { schedule: next, nextRunAt: nextRunAt?.toISOString() ?? null };
    });

/** The board's latest scheduled runs, newest first. */
export const listContentLabBoardRuns = async (boardId: string): Promise<ALApiResponse<ContentLabBoardRun[]>> =>
    runAuthenticatedAction(async function listContentLabBoardRuns(userId) {
        const runs = await contentLabBoardRunsCollection();
        const docs = await runs
            .find({ boardId: toObjectId(boardId, 'Board'), userId: requireUserObjectId(userId) })
            .sort({ startedAt: -1 })
            .limit(RUNS_LISTED)
            .toArray();
        return docs.map(mapBoardRun);
    });

// ─── Watching ────────────────────────────────────────────────────────────────

const OPTIONAL_URL = z.string().max(2_000).nullish();

/** Only the fields a watch keeps; the rest of the BFF response is dropped. */
const CREATOR_RESPONSE_SCHEMA = z.object({
    creator: z.object({
        name: z.string().max(300).nullable(),
        followers: z.number().nullable(),
        url: OPTIONAL_URL,
        avatarUrl: OPTIONAL_URL,
        bio: z.string().max(5_000).nullish(),
    }),
    usualViews: z.number().nullable(),
    posts: z
        .array(
            z.object({
                id: z.string().max(200),
                title: z.string().max(2_000),
                url: z.string().max(1_000),
                format: z.enum(CONTENT_LAB_FORMATS),
                multiple: z.number().nullable(),
                publishedAt: z.string().nullable(),
                thumbnailUrl: OPTIONAL_URL,
                views: z.number().nullish(),
            }),
        )
        .max(200),
});

const ADD_WATCH_SCHEMA = z.object({
    platform: PLATFORM_SCHEMA,
    handle: HANDLE_SCHEMA.pipe(z.string().min(1, 'Type a handle')),
    creator: CREATOR_RESPONSE_SCHEMA,
});

function mapWatch(doc: ContentLabWatchDoc): ContentLabWatch {
    return {
        _id: doc._id!.toString(),
        userId: doc.userId.toString(),
        platform: doc.platform,
        handle: doc.handle,
        name: doc.name,
        followers: doc.followers,
        avatarUrl: doc.avatarUrl ?? null,
        bio: doc.bio ?? null,
        profileUrl: doc.profileUrl ?? null,
        usualViews: doc.usualViews,
        recent: doc.recent ?? [],
        standouts: doc.standouts,
        lastCheckedAt: doc.lastCheckedAt?.toISOString() ?? null,
        createdAt: doc.createdAt.toISOString(),
    };
}

type CreatorPost = z.output<typeof CREATOR_RESPONSE_SCHEMA>['posts'][number];

const newestFirst = (posts: CreatorPost[]) => [...posts].sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''));

const toWatchPost = (post: CreatorPost): ContentLabWatchPost => ({
    postId: post.id,
    title: post.title,
    url: post.url,
    format: post.format,
    multiple: post.multiple,
    publishedAt: post.publishedAt,
    thumbnailUrl: post.thumbnailUrl ?? null,
    views: post.views ?? null,
});

/** Posts at or above the outlier multiple, newest first. */
function standoutsOf(posts: CreatorPost[]): ContentLabStandout[] {
    return newestFirst(posts)
        .filter((post) => (post.multiple ?? 0) >= CONTENT_LAB_OUTLIER_MULTIPLE)
        .slice(0, MAX_STANDOUTS)
        .map((post) => ({ ...toWatchPost(post), multiple: post.multiple! }));
}

export const listContentLabWatches = async (): Promise<ALApiResponse<ContentLabWatch[]>> =>
    runAuthenticatedAction(async function listContentLabWatches(userId) {
        const watchlist = await contentLabWatchlistCollection();
        const docs = await watchlist.find({ userId: requireUserObjectId(userId) }).sort({ createdAt: -1 }).toArray();
        return docs.map(mapWatch);
    });

/**
 * Watches a creator, or refreshes one already watched: upserts by (user, platform, handle) with
 * what `contentLabApi.creator` just returned (the browser fetches it, so the BFF stays the only scraper path).
 */
export const addContentLabWatch = async (input: {
    platform: ContentLabPlatform;
    handle: string;
    creator: CONTENT_LAB_CREATOR_RESPONSE;
}): Promise<ALApiResponse<ContentLabWatch>> =>
    runAuthenticatedAction(async function addContentLabWatch(userId) {
        const uid = requireUserObjectId(userId);
        const { platform, handle, creator } = parse(ADD_WATCH_SCHEMA, input);
        const now = new Date();
        const watchlist = await contentLabWatchlistCollection();
        const doc = await watchlist.findOneAndUpdate(
            { userId: uid, platform, handle },
            {
                $set: {
                    name: creator.creator.name,
                    followers: creator.creator.followers,
                    avatarUrl: creator.creator.avatarUrl ?? null,
                    bio: creator.creator.bio?.trim() || null,
                    profileUrl: creator.creator.url ?? null,
                    usualViews: creator.usualViews,
                    recent: newestFirst(creator.posts).slice(0, MAX_RECENT).map(toWatchPost),
                    standouts: standoutsOf(creator.posts),
                    lastCheckedAt: now,
                },
                $setOnInsert: { userId: uid, platform, handle, createdAt: now },
            },
            { upsert: true, returnDocument: 'after' },
        );
        if (!doc) throw new Error('Could not save the watch');
        return mapWatch(doc);
    });

export const removeContentLabWatch = async (watchId: string): Promise<ALApiResponse<{ id: string }>> =>
    runAuthenticatedAction(async function removeContentLabWatch(userId) {
        const watchlist = await contentLabWatchlistCollection();
        await watchlist.deleteOne({ _id: toObjectId(watchId, 'Watch'), userId: requireUserObjectId(userId) });
        return { id: watchId };
    });

// ─── Profile (Settings) ──────────────────────────────────────────────────────

const OPTIONAL_HANDLE = HANDLE_SCHEMA.optional().transform((value) => value || undefined);

const PROFILE_SCHEMA = z.object({
    handles: z.object({ youtube: OPTIONAL_HANDLE, instagram: OPTIONAL_HANDLE }),
    betaHandles: z.object({ x: OPTIONAL_HANDLE, linkedin: OPTIONAL_HANDLE }),
    country: COUNTRY_SCHEMA,
    language: LANGUAGE_SCHEMA,
});

export type ContentLabProfileInput = z.input<typeof PROFILE_SCHEMA>;

/** Drops empty handles so the stored record only lists accounts the user gave. */
const compact = <T extends Record<string, string | undefined>>(record: T) =>
    Object.fromEntries(Object.entries(record).filter(([, value]) => !!value)) as Partial<Record<keyof T, string>>;

function mapProfile(doc: ContentLabProfileDoc | null, userId: string): ContentLabProfile {
    return {
        _id: doc?._id?.toString(),
        userId,
        handles: doc?.handles ?? {},
        betaHandles: doc?.betaHandles ?? {},
        country: doc?.country ?? CONTENT_LAB_DEFAULT_COUNTRY,
        language: doc?.language ?? CONTENT_LAB_DEFAULT_LANGUAGE,
        updatedAt: (doc?.updatedAt ?? new Date(0)).toISOString(),
    };
}

/** The user's own handles and defaults; defaults when they have not saved any. */
export const getContentLabProfile = async (): Promise<ALApiResponse<ContentLabProfile>> =>
    runAuthenticatedAction(async function getContentLabProfile(userId) {
        const profiles = await contentLabProfilesCollection();
        // The sealed AI key and connections stay out (see content-lab-settings-actions).
        const doc = await profiles.findOne({ userId: requireUserObjectId(userId) }, { projection: { aiKeys: 0, connections: 0 } });
        return mapProfile(doc, userId);
    });

export const saveContentLabProfile = async (input: ContentLabProfileInput): Promise<ALApiResponse<ContentLabProfile>> =>
    runAuthenticatedAction(async function saveContentLabProfile(userId) {
        const uid = requireUserObjectId(userId);
        const { handles, betaHandles, country, language } = parse(PROFILE_SCHEMA, input);
        const profiles = await contentLabProfilesCollection();
        const doc = await profiles.findOneAndUpdate(
            { userId: uid },
            {
                $set: { handles: compact(handles), betaHandles: compact(betaHandles), country, language, updatedAt: new Date() },
                $setOnInsert: { userId: uid },
            },
            { upsert: true, returnDocument: 'after', projection: { aiKeys: 0, connections: 0 } },
        );
        return mapProfile(doc, userId);
    });
