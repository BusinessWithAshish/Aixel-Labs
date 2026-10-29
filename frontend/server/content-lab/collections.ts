import 'server-only';

import {
    getCollection,
    MongoCollections,
    type ContentLabBoardDoc,
    type ContentLabBoardRunDoc,
    type ContentLabProfileDoc,
    type ContentLabWatchDoc,
} from '@aixellabs/backend/db';

let indexesEnsured = false;

/**
 * One profile per user, boards listed newest first, due scheduled boards found by `nextRunAt`,
 * a board's runs newest first, one watch per (user, platform, handle).
 */
async function ensureContentLabIndexes(): Promise<void> {
    if (indexesEnsured) return;

    const [profiles, boards, boardRuns, watchlist] = await Promise.all([
        getCollection<ContentLabProfileDoc>(MongoCollections.CONTENT_LAB_PROFILES),
        getCollection<ContentLabBoardDoc>(MongoCollections.CONTENT_LAB_BOARDS),
        getCollection<ContentLabBoardRunDoc>(MongoCollections.CONTENT_LAB_BOARD_RUNS),
        getCollection<ContentLabWatchDoc>(MongoCollections.CONTENT_LAB_WATCHLIST),
    ]);
    await Promise.all([
        profiles.createIndex({ userId: 1 }, { unique: true }),
        boards.createIndex({ userId: 1, updatedAt: -1 }),
        boards.createIndex({ nextRunAt: 1 }, { partialFilterExpression: { nextRunAt: { $type: 'date' } } }),
        boardRuns.createIndex({ boardId: 1, startedAt: -1 }),
        watchlist.createIndex({ userId: 1, platform: 1, handle: 1 }, { unique: true }),
        watchlist.createIndex({ userId: 1, createdAt: -1 }),
    ]);

    indexesEnsured = true;
}

export async function contentLabProfilesCollection() {
    await ensureContentLabIndexes();
    return getCollection<ContentLabProfileDoc>(MongoCollections.CONTENT_LAB_PROFILES);
}

export async function contentLabBoardsCollection() {
    await ensureContentLabIndexes();
    return getCollection<ContentLabBoardDoc>(MongoCollections.CONTENT_LAB_BOARDS);
}

export async function contentLabBoardRunsCollection() {
    await ensureContentLabIndexes();
    return getCollection<ContentLabBoardRunDoc>(MongoCollections.CONTENT_LAB_BOARD_RUNS);
}

export async function contentLabWatchlistCollection() {
    await ensureContentLabIndexes();
    return getCollection<ContentLabWatchDoc>(MongoCollections.CONTENT_LAB_WATCHLIST);
}
