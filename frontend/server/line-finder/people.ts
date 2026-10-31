import 'server-only';

import { LINE_FINDER_VIDEO_STATUS } from '@aixellabs/backend/line-finder/constants';
import type { LINE_FINDER_PERSON } from '@aixellabs/backend/line-finder/types';
import type { LineFinderPersonDoc, MongoObjectId } from '@aixellabs/backend/db';
import { lineFinderVideosCollection } from '@/server/line-finder/collections';

/** How many of each status a person's videos are in. */
export async function videoCountsFor(personIds: MongoObjectId[]): Promise<Map<string, LINE_FINDER_PERSON['videos']>> {
    const videos = await lineFinderVideosCollection();
    const rows = await videos
        .aggregate<{ _id: { personId: MongoObjectId; status: string }; n: number }>([
            { $match: { personIds: { $in: personIds } } },
            { $unwind: '$personIds' },
            { $match: { personIds: { $in: personIds } } },
            { $group: { _id: { personId: '$personIds', status: '$status' }, n: { $sum: 1 } } },
        ])
        .toArray();

    const counts = new Map<string, LINE_FINDER_PERSON['videos']>();
    for (const id of personIds) counts.set(id.toString(), { total: 0, searched: 0, noCaptions: 0, failed: 0, pending: 0 });
    for (const { _id, n } of rows) {
        const count = counts.get(_id.personId.toString());
        if (!count) continue;
        count.total += n;
        if (_id.status === LINE_FINDER_VIDEO_STATUS.DONE) count.searched = n;
        else if (_id.status === LINE_FINDER_VIDEO_STATUS.NO_CAPTIONS) count.noCaptions = n;
        else if (_id.status === LINE_FINDER_VIDEO_STATUS.FAILED) count.failed = n;
        else if (_id.status === LINE_FINDER_VIDEO_STATUS.PENDING) count.pending = n;
    }
    return counts;
}

export function toPerson(doc: LineFinderPersonDoc, videos: LINE_FINDER_PERSON['videos']): LINE_FINDER_PERSON {
    return {
        id: String(doc._id),
        name: doc.name,
        spellings: doc.spellings,
        handle: doc.handle,
        status: doc.status,
        stopReason: doc.stopReason,
        videos,
    };
}
