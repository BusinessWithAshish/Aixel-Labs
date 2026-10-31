import 'server-only';

import { getCollection, MongoCollections, type LeadGenRunDoc, type MongoObjectId } from '@aixellabs/backend/db';
import type { LEAD_GENERATION_SUB_MODULES } from '@aixellabs/backend/db/types';
import { isMongoDuplicateKeyError } from '@/server/auth/membership/duplicate-key';

/** Runs one user may have in progress at once. */
const MAX_ACTIVE_RUNS_PER_USER = 2;
/** Runs one user may start per hour. Enriching a long list takes one run per 50 websites. */
const MAX_RUNS_PER_HOUR = 60;
/** Runs in progress across all users before new ones are turned away. */
const MAX_ACTIVE_RUNS_TOTAL = 20;
/** A run older than this lost its server (the scrape routes stop at 300 seconds), so it no longer holds a slot. */
const STALE_RUN_MS = 6 * 60 * 1000;
const RUN_HISTORY_SECONDS = 3 * 24 * 60 * 60;
const HOUR_MS = 60 * 60 * 1000;

/** How long a run waits in line for a free place before giving up; leaves the rest of the route's 300 seconds to scrape. */
const QUEUE_WAIT_MS = 45_000;
const QUEUE_POLL_MS = 3_000;

export type LeadGenRunRefusal = { refused: true; error: string; status: 429 | 499 | 503 };
export type LeadGenRun = { refused: false; finish: () => Promise<void> };

let indexesEnsured = false;

async function getRunsCollection() {
    const runs = await getCollection<LeadGenRunDoc>(MongoCollections.LEAD_GEN_RUNS);
    if (!indexesEnsured) {
        await Promise.all([
            runs.createIndex(
                { userId: 1, activeSlot: 1 },
                { unique: true, partialFilterExpression: { activeSlot: { $exists: true } } },
            ),
            runs.createIndex({ activeSlot: 1, startedAt: 1 }),
            runs.createIndex({ userId: 1, startedAt: 1 }),
            runs.createIndex({ startedAt: 1 }, { expireAfterSeconds: RUN_HISTORY_SECONDS }),
        ]);
        indexesEnsured = true;
    }
    return runs;
}

/** One try for a place. A refusal marked `full` may succeed once another run ends. */
async function tryStartRun(
    userId: MongoObjectId,
    subModule: LEAD_GENERATION_SUB_MODULES,
): Promise<LeadGenRun | (LeadGenRunRefusal & { full: boolean })> {
    const runs = await getRunsCollection();
    const now = new Date();

    await runs.updateMany(
        { activeSlot: { $exists: true }, startedAt: { $lt: new Date(now.getTime() - STALE_RUN_MS) } },
        { $unset: { activeSlot: '' } },
    );

    const startedLastHour = await runs.countDocuments({
        userId,
        startedAt: { $gt: new Date(now.getTime() - HOUR_MS) },
    });
    if (startedLastHour >= MAX_RUNS_PER_HOUR) {
        return {
            refused: true,
            full: false,
            status: 429,
            error: "You've reached the hourly limit for searches. Try again later.",
        };
    }

    const activeTotal = await runs.countDocuments({ activeSlot: { $exists: true } });
    if (activeTotal >= MAX_ACTIVE_RUNS_TOTAL) {
        return {
            refused: true,
            full: true,
            status: 503,
            error: "We're handling a lot of searches right now. Try again in a few minutes.",
        };
    }

    for (let activeSlot = 0; activeSlot < MAX_ACTIVE_RUNS_PER_USER; activeSlot++) {
        try {
            const { insertedId } = await runs.insertOne({ userId, subModule, startedAt: now, activeSlot });
            return {
                refused: false,
                finish: async () => {
                    await runs.updateOne({ _id: insertedId }, { $unset: { activeSlot: '' } });
                },
            };
        } catch (error) {
            if (!isMongoDuplicateKeyError(error)) throw error;
        }
    }

    return {
        refused: true,
        full: true,
        status: 429,
        error: `You already have ${MAX_ACTIVE_RUNS_PER_USER} searches running. Wait for one to finish.`,
    };
}

/**
 * Claims a place for one scrape or enrich run, waiting in line while everything is busy, or says
 * why not. Limits live in Mongo because each serverless instance would otherwise count alone.
 * Waiting runs are not strictly first come, first served. Call `finish` when the run ends, however it ends.
 */
export async function startLeadGenRun(
    userId: MongoObjectId,
    subModule: LEAD_GENERATION_SUB_MODULES,
    signal: AbortSignal,
): Promise<LeadGenRun | LeadGenRunRefusal> {
    const deadline = Date.now() + QUEUE_WAIT_MS;
    for (;;) {
        if (signal.aborted) return { refused: true, status: 499, error: 'Request cancelled' };
        const attempt = await tryStartRun(userId, subModule);
        if (!attempt.refused || !attempt.full || Date.now() >= deadline) return attempt;
        await new Promise((resolve) => setTimeout(resolve, QUEUE_POLL_MS));
    }
}
