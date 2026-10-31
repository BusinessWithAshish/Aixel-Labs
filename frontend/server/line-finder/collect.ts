import 'server-only';

import type { AnyBulkWriteOperation } from 'mongodb';
import { API_ENDPOINTS } from '@aixellabs/backend/config';
import type { LineFinderPersonDoc, LineFinderVideoDoc, MongoObjectId } from '@aixellabs/backend/db';
import {
    LINE_FINDER_CAPTIONS_OUTCOME,
    LINE_FINDER_LIMITS,
    LINE_FINDER_PERSON_STATUS,
    LINE_FINDER_STOP_REASONS,
    LINE_FINDER_VIDEO_STATUS,
} from '@aixellabs/backend/line-finder/constants';
import type {
    LINE_FINDER_CAPTIONS_RESPONSE,
    LINE_FINDER_DISCOVERED_VIDEO,
    LINE_FINDER_DISCOVER_RESPONSE,
} from '@aixellabs/backend/line-finder/types';
import apiClient from '@/lib/api-client';
import {
    lineFinderLinesCollection,
    lineFinderPeopleCollection,
    lineFinderVideosCollection,
} from '@/server/line-finder/collections';

/**
 * Collection, on the server. `POST /api/line-finder/collect/run-due` calls `runDueCollection` every
 * minute (the backend's ticker, see `backend/src/line-finder-ticker.ts`). Each call claims one person with a
 * lease, works through their videos until its time is up, and leaves the rest for the next call. Progress is in
 * Mongo, so nothing is lost when a call ends or a deploy lands.
 */

/** A claimed person is left alone by other callers this long, even if the call dies. */
const LEASE_MS = 6 * 60_000;

async function claimNextPerson(): Promise<LineFinderPersonDoc | null> {
    const people = await lineFinderPeopleCollection();
    const now = new Date();
    return people.findOneAndUpdate(
        {
            status: LINE_FINDER_PERSON_STATUS.COLLECTING,
            $or: [{ leaseUntil: null }, { leaseUntil: { $lte: now } }],
        },
        { $set: { leaseUntil: new Date(now.getTime() + LEASE_MS) } },
        { sort: { createdAt: 1 }, returnDocument: 'after' },
    );
}

/** Links found videos to a person, most viewed first, up to the per-person cap. A video someone else has isn't reset. */
async function saveDiscoveredVideos(personId: MongoObjectId, found: LINE_FINDER_DISCOVERED_VIDEO[]): Promise<void> {
    const videos = await lineFinderVideosCollection();
    const chosen = [...found]
        .sort((a, b) => (b.views ?? 0) - (a.views ?? 0))
        .slice(0, LINE_FINDER_LIMITS.VIDEOS_PER_PERSON);
    if (chosen.length === 0) return;

    const operations: AnyBulkWriteOperation<LineFinderVideoDoc>[] = chosen.map((video) => ({
        updateOne: {
            filter: { videoId: video.videoId },
            update: {
                $addToSet: { personIds: personId },
                $setOnInsert: {
                    ...video,
                    status: LINE_FINDER_VIDEO_STATUS.PENDING,
                    language: null,
                    isAuto: null,
                    error: null,
                    collectedAt: null,
                },
            },
            upsert: true,
        },
    }));
    await videos.bulkWrite(operations, { ordered: false });
}

type VideoResult = 'ok' | 'failed' | 'budget';

/** Fetches and saves one video. Lines go in before the status, and search only reads finished videos. */
async function collectVideo(videoId: string): Promise<VideoResult> {
    const [videos, lines] = await Promise.all([lineFinderVideosCollection(), lineFinderLinesCollection()]);
    const finish = (status: LineFinderVideoDoc['status'], extra: Partial<LineFinderVideoDoc> = {}) =>
        videos.updateOne({ videoId }, { $set: { status, error: null, collectedAt: new Date(), ...extra } });

    const response = await apiClient.post<LINE_FINDER_CAPTIONS_RESPONSE>(API_ENDPOINTS.LINE_FINDER.CAPTIONS.full, { videoId });
    // The backend itself didn't answer. The video stays pending, for a later try.
    if (!response.success || !response.data) return 'failed';
    const result = response.data;

    switch (result.outcome) {
        case LINE_FINDER_CAPTIONS_OUTCOME.BUDGET:
            return 'budget';
        case LINE_FINDER_CAPTIONS_OUTCOME.NO_CAPTIONS:
            await finish(LINE_FINDER_VIDEO_STATUS.NO_CAPTIONS);
            return 'ok';
        case LINE_FINDER_CAPTIONS_OUTCOME.FAILED:
            await finish(LINE_FINDER_VIDEO_STATUS.FAILED, { error: result.error });
            return 'failed';
        case LINE_FINDER_CAPTIONS_OUTCOME.OK:
            await lines.deleteMany({ videoId });
            await lines.insertMany(result.lines.map((line, idx) => ({ videoId, idx, ...line })));
            await finish(LINE_FINDER_VIDEO_STATUS.DONE, { language: result.language, isAuto: result.isAuto });
            return 'ok';
    }
}

/** Works on one person until they're finished, they have to stop, or the time runs out. */
async function collectPerson(person: LineFinderPersonDoc, deadline: number): Promise<void> {
    const personId = person._id as MongoObjectId;
    const [people, videos] = await Promise.all([lineFinderPeopleCollection(), lineFinderVideosCollection()]);
    const stop = (status: LineFinderPersonDoc['status'], stopReason: string | null) =>
        people.updateOne({ _id: personId }, { $set: { status, stopReason, leaseUntil: null } });

    if (!person.discoveredAt) {
        const found = await apiClient.post<LINE_FINDER_DISCOVER_RESPONSE>(API_ENDPOINTS.LINE_FINDER.DISCOVER.full, {
            name: person.name,
            spellings: person.spellings,
            handle: person.handle,
        });
        if (!found.success || !found.data) {
            await stop(LINE_FINDER_PERSON_STATUS.PAUSED, LINE_FINDER_STOP_REASONS.REFUSED);
            return;
        }
        await saveDiscoveredVideos(personId, found.data.videos);
        await people.updateOne({ _id: personId }, { $set: { discoveredAt: new Date() } });
    }

    let failuresInARow = 0;
    while (Date.now() < deadline) {
        const batch = await videos
            .find({ personIds: personId, status: LINE_FINDER_VIDEO_STATUS.PENDING }, { projection: { videoId: 1 } })
            .sort({ views: -1 })
            .limit(LINE_FINDER_LIMITS.CAPTION_CONCURRENCY)
            .toArray();
        if (batch.length === 0) {
            await stop(LINE_FINDER_PERSON_STATUS.DONE, null);
            return;
        }

        const results = await Promise.all(batch.map((video) => collectVideo(video.videoId)));
        if (results.includes('budget')) {
            await stop(LINE_FINDER_PERSON_STATUS.PAUSED, LINE_FINDER_STOP_REASONS.BUDGET);
            return;
        }
        for (const result of results) failuresInARow = result === 'ok' ? 0 : failuresInARow + 1;
        if (failuresInARow >= LINE_FINDER_LIMITS.STOP_AFTER_FAILURES) {
            await stop(LINE_FINDER_PERSON_STATUS.PAUSED, LINE_FINDER_STOP_REASONS.REFUSED);
            return;
        }
    }

    // Out of time, not finished: free them for the next call.
    await people.updateOne({ _id: personId }, { $set: { leaseUntil: null } });
}

export async function runDueCollection({ budgetMs }: { budgetMs: number }): Promise<{ collected: string | null }> {
    const person = await claimNextPerson();
    if (!person) return { collected: null };
    await collectPerson(person, Date.now() + budgetMs);
    return { collected: person.name };
}
