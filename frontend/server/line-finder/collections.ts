import 'server-only';

import {
    getCollection,
    MongoCollections,
    type LineFinderLineDoc,
    type LineFinderPersonDoc,
    type LineFinderSpeakerLabelDoc,
    type LineFinderVideoDoc,
} from '@aixellabs/backend/db';

let indexesEnsured = false;

/**
 * One video per id, a person's videos by status, a video's lines in order, lines found by key within a set of videos,
 * one label per moment, people due for collection.
 */
async function ensureLineFinderIndexes(): Promise<void> {
    if (indexesEnsured) return;

    const [people, videos, lines, labels] = await Promise.all([
        getCollection<LineFinderPersonDoc>(MongoCollections.LINE_FINDER_PEOPLE),
        getCollection<LineFinderVideoDoc>(MongoCollections.LINE_FINDER_VIDEOS),
        getCollection<LineFinderLineDoc>(MongoCollections.LINE_FINDER_LINES),
        getCollection<LineFinderSpeakerLabelDoc>(MongoCollections.LINE_FINDER_SPEAKER_LABELS),
    ]);
    await Promise.all([
        people.createIndex({ status: 1, leaseUntil: 1 }),
        videos.createIndex({ videoId: 1 }, { unique: true }),
        videos.createIndex({ personIds: 1, status: 1, views: -1 }),
        lines.createIndex({ videoId: 1, idx: 1 }, { unique: true }),
        lines.createIndex({ keys: 1, videoId: 1 }),
        labels.createIndex({ personId: 1, videoId: 1, startMs: 1 }, { unique: true }),
    ]);

    indexesEnsured = true;
}

export async function lineFinderPeopleCollection() {
    await ensureLineFinderIndexes();
    return getCollection<LineFinderPersonDoc>(MongoCollections.LINE_FINDER_PEOPLE);
}

export async function lineFinderVideosCollection() {
    await ensureLineFinderIndexes();
    return getCollection<LineFinderVideoDoc>(MongoCollections.LINE_FINDER_VIDEOS);
}

export async function lineFinderLinesCollection() {
    await ensureLineFinderIndexes();
    return getCollection<LineFinderLineDoc>(MongoCollections.LINE_FINDER_LINES);
}

export async function lineFinderSpeakerLabelsCollection() {
    await ensureLineFinderIndexes();
    return getCollection<LineFinderSpeakerLabelDoc>(MongoCollections.LINE_FINDER_SPEAKER_LABELS);
}
