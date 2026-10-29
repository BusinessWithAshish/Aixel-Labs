import 'server-only';

import type { Filter } from 'mongodb';
import type { ZodType } from 'zod';
import type { ALApiResponse } from '@aixellabs/backend/api/types';
import { API_ENDPOINTS } from '@aixellabs/backend/config';
import { CONTENT_LAB_DEFAULT_COUNTRY, CONTENT_LAB_ERROR_MESSAGES } from '@aixellabs/backend/content-lab/constants';
import {
    CONTENT_LAB_BREAKDOWN_REQUEST_SCHEMA,
    CONTENT_LAB_CHECK_REQUEST_SCHEMA,
    CONTENT_LAB_CREATOR_REQUEST_SCHEMA,
    CONTENT_LAB_EXPLORE_REQUEST_SCHEMA,
} from '@aixellabs/backend/content-lab/schemas';
import {
    CONTENT_LAB_SUB_MODULES,
    getCollection,
    Modules,
    MongoCollections,
    type ContentLabBoardDoc,
    type ContentLabBoardRunDoc,
    type ContentLabBoardRunStatus,
    type MongoObjectId,
    type UserDoc,
} from '@aixellabs/backend/db';
import { hasSubModuleAccess } from '@/helpers/module-access-helpers';
import apiClient from '@/lib/api-client';
import { CONTENT_LAB_AI_KEY_MISSING, loadContentLabAiKey } from '@/server/content-lab/ai-key';
import { CONTENT_LAB_ADS_REQUEST_SCHEMA, fetchContentLabAds } from '@/server/content-lab/ads';
import {
    contentLabBoardRunsCollection,
    contentLabBoardsCollection,
    contentLabProfilesCollection,
    contentLabWatchlistCollection,
} from '@/server/content-lab/collections';
import { buildWritePrompt, generateWithGemini, parseVersions } from '@/server/content-lab/gemini';
import { CONTENT_LAB_WRITE_REQUEST_SCHEMA } from '@/server/content-lab/write-schema';
import { counted } from '@/app/(protected)/content-lab/boards/_utils/flow';
import { runBoard, storedNodeRun, type BoardNodeRun, type BoardRunDeps } from '@/app/(protected)/content-lab/boards/_utils/run-board';
import { DEFAULT_BOARD_SCHEDULE, nextScheduledRun } from '@/app/(protected)/content-lab/boards/_utils/schedule';

/**
 * Scheduled board runs, on the server. `POST /api/content-lab/boards/run-due` calls `runDueBoards`
 * every few minutes (the backend's ticker, see `backend/src/board-schedule-ticker.ts`); each due
 * board is claimed with a lease (so two callers never run it twice), its next run is set, then it
 * runs through the same `runBoard` as the browser with server-side deps: the backend for data and
 * the owner's Content Lab AI key (`loadContentLabAiKey`) for drafts. The drafts land on the board
 * and every run is kept in `content_lab_board_runs` (last `RUNS_KEPT` per board).
 */

/** A claimed board is left alone by other callers this long, even if its run dies. */
const LEASE_MS = 10 * 60_000;
/** One board's run never takes longer than this; a board starts only with at least this much budget left. */
export const BOARD_RUN_MS = 4 * 60_000;
export const RUNS_KEPT = 20;

type Proxy<TReq, TRes> = (body: TReq, signal: AbortSignal) => Promise<ALApiResponse<TRes>>;

/** Validates like the BFF route does, then calls the backend directly (no browser session here). */
function backendCall<TReq, TRes>(schema: ZodType<unknown, unknown>, endpoint: string): Proxy<TReq, TRes> {
    return async (body, signal) => {
        const parsed = schema.safeParse(body);
        if (!parsed.success) return { success: false, error: CONTENT_LAB_ERROR_MESSAGES.INVALID_PARAMS };
        return apiClient.post<TRes>(endpoint, parsed.data, { signal });
    };
}

/** What a scheduled run calls instead of the browser's `contentLabApi`, on the board owner's behalf. */
function serverRunDeps(userId: MongoObjectId): BoardRunDeps {
    return {
        explore: backendCall(CONTENT_LAB_EXPLORE_REQUEST_SCHEMA, API_ENDPOINTS.CONTENT_LAB.EXPLORE.full),
        breakdown: backendCall(CONTENT_LAB_BREAKDOWN_REQUEST_SCHEMA, API_ENDPOINTS.CONTENT_LAB.BREAKDOWN.full),
        check: backendCall(CONTENT_LAB_CHECK_REQUEST_SCHEMA, API_ENDPOINTS.CONTENT_LAB.CHECK.full),
        creator: backendCall(CONTENT_LAB_CREATOR_REQUEST_SCHEMA, API_ENDPOINTS.CONTENT_LAB.CREATOR.full),
        ads: async (body, signal) => {
            const parsed = CONTENT_LAB_ADS_REQUEST_SCHEMA.safeParse(body);
            if (!parsed.success) return { success: false, error: CONTENT_LAB_ERROR_MESSAGES.INVALID_PARAMS };
            return fetchContentLabAds(parsed.data, signal);
        },
        write: async (body, signal) => {
            const parsed = CONTENT_LAB_WRITE_REQUEST_SCHEMA.safeParse(body);
            if (!parsed.success) return { success: false, error: CONTENT_LAB_ERROR_MESSAGES.INVALID_PARAMS };
            const key = await loadContentLabAiKey(userId);
            if (!key) return { success: false, error: CONTENT_LAB_AI_KEY_MISSING };
            const request = parsed.data;
            try {
                const out = await generateWithGemini({ key, ...buildWritePrompt(request), signal });
                return { success: true, data: request.mode === 'draft' ? { text: out } : { versions: parseVersions(out) } };
            } catch (error) {
                return { success: false, error: error instanceof Error ? error.message : 'Could not write this' };
            }
        },
        watches: async () => {
            const watchlist = await contentLabWatchlistCollection();
            const docs = await watchlist.find({ userId }, { projection: { handle: 1, standouts: 1 } }).toArray();
            return { success: true, data: docs.map((doc) => ({ handle: doc.handle, standouts: doc.standouts ?? [] })) };
        },
    };
}

/** Admin, or any Content Lab page granted (as the BFF routes require). */
async function mayUseContentLab(userId: MongoObjectId): Promise<boolean> {
    const users = await getCollection<UserDoc>(MongoCollections.USERS);
    const user = await users.findOne({ _id: userId }, { projection: { isAdmin: 1, moduleAccess: 1 } });
    if (!user) return false;
    return (
        user.isAdmin ||
        Object.values(CONTENT_LAB_SUB_MODULES).some((subModule) => hasSubModuleAccess(user.moduleAccess, Modules.CONTENT_LAB, subModule))
    );
}

function runOutcome(nodes: ContentLabBoardRunDoc['nodes'], drafts: number): { status: ContentLabBoardRunStatus; summary: string } {
    const failed = nodes.filter((node) => node.status === 'error').length;
    const wrote = drafts ? `Wrote ${counted(drafts, 'draft', 'drafts')}` : 'No drafts written';
    if (!nodes.length) return { status: 'failed', summary: 'The board has no nodes' };
    if (failed === nodes.length) return { status: 'failed', summary: `Every node had a problem. ${wrote}.` };
    if (failed) return { status: 'partial', summary: `${wrote}. ${failed} of ${nodes.length} nodes had a problem.` };
    return { status: 'done', summary: `${wrote}.` };
}

/** Runs one claimed board and records it. Never throws: a failure is recorded on the run. */
async function runClaimedBoard(board: ContentLabBoardDoc & { _id: MongoObjectId }, signal: AbortSignal): Promise<ContentLabBoardRunStatus> {
    const runs = await contentLabBoardRunsCollection();
    const boards = await contentLabBoardsCollection();
    const startedAt = new Date();
    const { insertedId } = await runs.insertOne({
        boardId: board._id,
        userId: board.userId,
        trigger: 'schedule',
        status: 'running',
        summary: 'Running…',
        nodes: [],
        outputs: [],
        startedAt,
        finishedAt: null,
    });

    const results = new Map<string, BoardNodeRun>();
    const outputs: ContentLabBoardRunDoc['outputs'] = [];
    let outcome: { status: ContentLabBoardRunStatus; summary: string };
    try {
        const profile = await (await contentLabProfilesCollection()).findOne({ userId: board.userId });
        await runBoard({
            nodes: board.nodes,
            edges: board.edges,
            profile: { handles: profile?.handles ?? {}, country: profile?.country ?? CONTENT_LAB_DEFAULT_COUNTRY },
            deps: serverRunDeps(board.userId),
            signal: AbortSignal.any([signal, AbortSignal.timeout(BOARD_RUN_MS)]),
            onNode: (id, run) => results.set(id, run),
            onOutputText: (nodeId, text, format) => outputs.push({ nodeId, text, format }),
        });
        const nodes = [...results.entries()].filter(([, run]) => run.status !== 'running').map(([nodeId, run]) => ({ nodeId, ...storedNodeRun(run) }));
        outcome = runOutcome(nodes, outputs.length);
        await runs.updateOne({ _id: insertedId }, { $set: { ...outcome, nodes, outputs, finishedAt: new Date() } });
    } catch (error) {
        outcome = { status: 'failed', summary: error instanceof Error ? error.message : 'The run failed' };
        await runs.updateOne({ _id: insertedId }, { $set: { ...outcome, outputs, finishedAt: new Date() } });
    }

    // The drafts go onto the board's Output nodes (by id: a node deleted meanwhile is skipped).
    const set: Record<string, unknown> = { runLeaseUntil: null };
    if (outputs.length) {
        outputs.forEach((output, index) => (set[`nodes.$[o${index}].data.text`] = output.text));
        set.updatedAt = new Date();
    }
    await boards.updateOne(
        { _id: board._id },
        { $set: set },
        outputs.length ? { arrayFilters: outputs.map((output, index) => ({ [`o${index}.id`]: output.nodeId })) } : undefined,
    );

    const old = await runs
        .find({ boardId: board._id }, { projection: { _id: 1 } })
        .sort({ startedAt: -1 })
        .skip(RUNS_KEPT)
        .toArray();
    if (old.length) await runs.deleteMany({ _id: { $in: old.map((run) => run._id) } });
    return outcome.status;
}

export type RunDueBoardsResult = {
    ran: number;
    skipped: number;
    statuses: Partial<Record<ContentLabBoardRunStatus, number>>;
    /** A board is still due: the budget ran out first. The caller should call again straight away. */
    more: boolean;
};

/** Due now and not held by another caller. */
const dueFilter = (now: Date): Filter<ContentLabBoardDoc> => ({
    nextRunAt: { $lte: now },
    $or: [{ runLeaseUntil: null }, { runLeaseUntil: { $lte: now } }],
});

/**
 * Claims and runs due boards one at a time. A board starts only with a whole `BOARD_RUN_MS` of the
 * budget left, so none is cut short; the rest stay due (untouched) for the next call (`more`).
 */
export async function runDueBoards({ budgetMs, signal }: { budgetMs: number; signal: AbortSignal }): Promise<RunDueBoardsResult> {
    const deadline = Date.now() + budgetMs;
    const boards = await contentLabBoardsCollection();
    const result: RunDueBoardsResult = { ran: 0, skipped: 0, statuses: {}, more: false };

    while (!signal.aborted) {
        if (deadline - Date.now() < BOARD_RUN_MS) {
            result.more = (await boards.countDocuments(dueFilter(new Date()), { limit: 1 })) > 0;
            break;
        }
        const now = new Date();
        const board = await boards.findOneAndUpdate(
            dueFilter(now),
            { $set: { runLeaseUntil: new Date(now.getTime() + LEASE_MS) } },
            { sort: { nextRunAt: 1 }, returnDocument: 'after' },
        );
        if (!board?._id) break;

        // Set the next run before this one starts, so a run that dies is not retried in a loop. Only
        // while the schedule is still the one claimed: one the user saved meanwhile already set its own.
        const unchanged: Filter<ContentLabBoardDoc> = board.schedule
            ? { _id: board._id, schedule: board.schedule }
            : { _id: board._id, schedule: { $exists: false } };
        const release = () => boards.updateOne({ _id: board._id }, { $set: { runLeaseUntil: null } });
        const schedule = board.schedule ?? DEFAULT_BOARD_SCHEDULE;
        const allowed = await mayUseContentLab(board.userId);
        if (!allowed || schedule.repeat === 'off' || schedule.paused) {
            await boards.updateOne(unchanged, { $set: { nextRunAt: null, ...(allowed ? {} : { 'schedule.paused': true }) } });
            await release();
            result.skipped++;
            continue;
        }
        const { matchedCount } = await boards.updateOne(unchanged, { $set: { nextRunAt: nextScheduledRun(schedule, now) } });
        if (!matchedCount) {
            await release();
            result.skipped++;
            continue;
        }

        const status = await runClaimedBoard(board, signal);
        result.ran++;
        result.statuses[status] = (result.statuses[status] ?? 0) + 1;
    }
    return result;
}
