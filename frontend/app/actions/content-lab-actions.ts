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
    type ContentLabProfile,
    type ContentLabProfileDoc,
    type ContentLabStandout,
    type ContentLabWatch,
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
import {
    contentLabBoardsCollection,
    contentLabProfilesCollection,
    contentLabWatchlistCollection,
} from '@/server/content-lab/collections';
import {
    CONTENT_LAB_BOARD_TEMPLATE_IDS,
    CONTENT_LAB_BOARD_TEMPLATES,
    CONTENT_LAB_DEFAULT_LANGUAGE,
} from '@/app/(protected)/content-lab/_constants';

const MAX_NODES = 60;
const MAX_EDGES = 200;
const MAX_STANDOUTS = 10;

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

export type ContentLabBoardSummary = Pick<ContentLabBoard, '_id' | 'title' | 'templateId' | 'updatedAt'> & {
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
    }, 'Every wire must join two boxes on this board');

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
        createdAt: doc.createdAt.toISOString(),
        updatedAt: doc.updatedAt.toISOString(),
    };
}

/** The user's boards, last edited first. */
export const listContentLabBoards = async (): Promise<ALApiResponse<ContentLabBoardSummary[]>> =>
    runAuthenticatedAction(async function listContentLabBoards(userId) {
        const boards = await contentLabBoardsCollection();
        const docs = await boards
            .find({ userId: requireUserObjectId(userId) }, { projection: { title: 1, templateId: 1, updatedAt: 1, nodes: 1 } })
            .sort({ updatedAt: -1 })
            .toArray();
        return docs.map((doc) => ({
            _id: doc._id.toString(),
            title: doc.title,
            templateId: doc.templateId,
            updatedAt: doc.updatedAt.toISOString(),
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

/** Autosave: the board's boxes (positions, settings, output text) and wires. */
export const saveContentLabBoard = async (
    boardId: string,
    graph: { nodes: ContentLabBoardNode[]; edges: ContentLabBoardEdge[] },
): Promise<ALApiResponse<{ updatedAt: string }>> =>
    runAuthenticatedAction(async function saveContentLabBoard(userId) {
        const { nodes, edges } = parse(GRAPH_SCHEMA, graph);
        const updatedAt = new Date();
        const boards = await contentLabBoardsCollection();
        const { matchedCount } = await boards.updateOne(
            { _id: toObjectId(boardId, 'Board'), userId: requireUserObjectId(userId) },
            { $set: { nodes, edges, updatedAt } },
        );
        if (!matchedCount) throw new Error('Board not found');
        return { updatedAt: updatedAt.toISOString() };
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
        const { deletedCount } = await boards.deleteOne({
            _id: toObjectId(boardId, 'Board'),
            userId: requireUserObjectId(userId),
        });
        if (!deletedCount) throw new Error('Board not found');
        return { id: boardId };
    });

// ─── Watching ────────────────────────────────────────────────────────────────

/** Only the fields a watch keeps; the rest of the BFF response is dropped. */
const CREATOR_RESPONSE_SCHEMA = z.object({
    creator: z.object({ name: z.string().nullable(), followers: z.number().nullable() }),
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
        usualViews: doc.usualViews,
        standouts: doc.standouts,
        lastCheckedAt: doc.lastCheckedAt?.toISOString() ?? null,
        createdAt: doc.createdAt.toISOString(),
    };
}

/** Posts at or above the outlier multiple, newest first. */
function standoutsOf(posts: z.output<typeof CREATOR_RESPONSE_SCHEMA>['posts']): ContentLabStandout[] {
    return posts
        .filter((post) => (post.multiple ?? 0) >= CONTENT_LAB_OUTLIER_MULTIPLE)
        .sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''))
        .slice(0, MAX_STANDOUTS)
        .map((post) => ({
            postId: post.id,
            title: post.title,
            url: post.url,
            format: post.format,
            multiple: post.multiple!,
            publishedAt: post.publishedAt,
        }));
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
                    usualViews: creator.usualViews,
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
        return mapProfile(await profiles.findOne({ userId: requireUserObjectId(userId) }), userId);
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
            { upsert: true, returnDocument: 'after' },
        );
        return mapProfile(doc, userId);
    });
