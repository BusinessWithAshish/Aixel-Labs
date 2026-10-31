import 'server-only';

import { API_ENDPOINTS } from '@aixellabs/backend/config';
import type { LineFinderLineDoc, LineFinderPersonDoc, LineFinderVideoDoc, MongoObjectId } from '@aixellabs/backend/db';
import { matchWindow, playerTimes, type WindowMatch } from '@aixellabs/backend/line-finder/compute/match';
import { skeleton, soundsOf } from '@aixellabs/backend/line-finder/compute/sound';
import {
    LINE_FINDER_EVERYDAY_WORDS,
    LINE_FINDER_LIMITS,
    LINE_FINDER_MATCH_KIND,
    LINE_FINDER_SEARCH_STATE,
    LINE_FINDER_SPEAKER,
    LINE_FINDER_VIDEO_STATUS,
} from '@aixellabs/backend/line-finder/constants';
import type {
    LINE_FINDER_CHECK_SPEAKER_RESPONSE,
    LINE_FINDER_MATCH_KIND_VALUE,
    LINE_FINDER_RESULT,
    LINE_FINDER_SEARCH_RESPONSE,
    LINE_FINDER_SPEAKER_VALUE,
} from '@aixellabs/backend/line-finder/types';
import apiClient from '@/lib/api-client';
import {
    lineFinderLinesCollection,
    lineFinderSpeakerLabelsCollection,
    lineFinderVideosCollection,
} from '@/server/line-finder/collections';
import { toPerson, videoCountsFor } from '@/server/line-finder/people';

const KIND_RANK: Record<LINE_FINDER_MATCH_KIND_VALUE, number> = {
    [LINE_FINDER_MATCH_KIND.EXACT]: 0,
    [LINE_FINDER_MATCH_KIND.CLOSE]: 1,
    [LINE_FINDER_MATCH_KIND.SIMILAR]: 2,
};

const CHECK_TO_LABEL: Record<LINE_FINDER_CHECK_SPEAKER_RESPONSE['speaker'], LINE_FINDER_SPEAKER_VALUE> = {
    likely: LINE_FINDER_SPEAKER.LIKELY,
    someone_else: LINE_FINDER_SPEAKER.SOMEONE_ELSE,
    unsure: LINE_FINDER_SPEAKER.UNSURE,
};

/** What to look up: the query's skeletons, leaving out everyday words unless that's all it has. */
function queryKeys(query: string[]): string[] {
    const strong = query.filter((word) => !LINE_FINDER_EVERYDAY_WORDS.has(word));
    return [...new Set((strong.length > 0 ? strong : query).map(skeleton))];
}

/** Lines in these videos sharing the query's keys, those sharing the most first. */
async function findCandidates(videoIds: string[], keys: string[]): Promise<LineFinderLineDoc[]> {
    const lines = await lineFinderLinesCollection();
    return lines
        .aggregate<LineFinderLineDoc>([
            { $match: { keys: { $in: keys }, videoId: { $in: videoIds } } },
            { $addFields: { shared: { $size: { $setIntersection: ['$keys', keys] } } } },
            { $sort: { shared: -1 } },
            { $limit: LINE_FINDER_LIMITS.CANDIDATES },
            { $project: { keys: 0, shared: 0 } },
        ])
        .toArray();
}

const lineKey = (videoId: string, idx: number) => `${videoId}:${idx}`;

/** The lines around each candidate, in one query. */
async function loadNeighbours(candidates: LineFinderLineDoc[]): Promise<Map<string, LineFinderLineDoc>> {
    if (candidates.length === 0) return new Map();
    const wanted = new Map<string, Set<number>>();
    for (const { videoId, idx } of candidates) {
        const set = wanted.get(videoId) ?? new Set<number>();
        for (const near of [idx - 1, idx, idx + 1, idx + 2]) set.add(near);
        wanted.set(videoId, set);
    }
    const lines = await lineFinderLinesCollection();
    const rows = await lines
        .find({ $or: [...wanted].map(([videoId, idxs]) => ({ videoId, idx: { $in: [...idxs] } })) }, { projection: { keys: 0 } })
        .toArray();
    return new Map(rows.map((row) => [lineKey(row.videoId, row.idx), row]));
}

/** When a word of the window (this line plus the next) is said. Falls back to the line's own start. */
function wordTimeMs(line: LineFinderLineDoc, next: LineFinderLineDoc | undefined, position: number): number {
    const own = soundsOf(line.text).length;
    const holder = position < own ? line : (next ?? line);
    const offset = position < own ? position : position - own;
    return holder.wordMs?.[offset] ?? holder.startMs;
}

function toResult(
    video: LineFinderVideoDoc,
    line: LineFinderLineDoc,
    near: Map<string, LineFinderLineDoc>,
    match: WindowMatch,
): LINE_FINDER_RESULT {
    const next = near.get(lineKey(line.videoId, line.idx + 1));
    const { startSeconds, endSeconds } = playerTimes(wordTimeMs(line, next, match.firstWord), wordTimeMs(line, next, match.lastWord));
    return {
        videoId: line.videoId,
        title: video.title,
        channelName: video.channelName,
        channelUrl: video.channelUrl,
        views: video.views,
        startSeconds,
        endSeconds,
        startMs: line.startMs,
        matchKind: match.kind,
        score: match.score,
        saysNo: match.saysNo,
        speaker: LINE_FINDER_SPEAKER.NOT_CHECKED,
        before: near.get(lineKey(line.videoId, line.idx - 1))?.text ?? null,
        text: next ? `${line.text} ${next.text}` : line.text,
        after: near.get(lineKey(line.videoId, line.idx + 2))?.text ?? null,
    };
}

function byBestFirst(a: LINE_FINDER_RESULT, b: LINE_FINDER_RESULT): number {
    return KIND_RANK[a.matchKind] - KIND_RANK[b.matchKind] || b.score - a.score || (b.views ?? 0) - (a.views ?? 0);
}

/** Windows close together in one video are the same moment: keep the best (spec §4.3). */
function keepBestPerMoment(results: LINE_FINDER_RESULT[]): LINE_FINDER_RESULT[] {
    const kept: LINE_FINDER_RESULT[] = [];
    for (const result of [...results].sort(byBestFirst)) {
        const taken = kept.some(
            (k) =>
                k.videoId === result.videoId &&
                Math.abs(k.startSeconds - result.startSeconds) * 1000 < LINE_FINDER_LIMITS.SAME_MOMENT_MS,
        );
        if (!taken) kept.push(result);
    }
    return kept;
}

/** Runs the check on one result and saves the answer. A failure leaves it Not checked, and a later search tries again. */
async function checkSpeaker(personId: MongoObjectId, person: string, result: LINE_FINDER_RESULT): Promise<void> {
    const [lines, labels] = await Promise.all([lineFinderLinesCollection(), lineFinderSpeakerLabelsCollection()]);
    const around = await lines
        .find(
            {
                videoId: result.videoId,
                startMs: {
                    $gte: result.startMs - LINE_FINDER_LIMITS.SPEAKER_CONTEXT_MS,
                    $lte: result.startMs + LINE_FINDER_LIMITS.SPEAKER_CONTEXT_MS,
                },
            },
            { projection: { startMs: 1, text: 1 } },
        )
        .sort({ idx: 1 })
        .toArray();
    const context = around
        .map((line) => `${line.startMs === result.startMs ? '>>> ' : ''}${line.text}`)
        .join('\n')
        .slice(0, LINE_FINDER_LIMITS.SPEAKER_CONTEXT_MAX_LENGTH);

    const answer = await apiClient.post<LINE_FINDER_CHECK_SPEAKER_RESPONSE>(API_ENDPOINTS.LINE_FINDER.CHECK_SPEAKER.full, {
        person,
        title: result.title,
        channelName: result.channelName,
        context,
    });
    if (!answer.success || !answer.data) return;

    // A mark always wins, so the check only fills in a moment no one has labelled.
    await labels.updateOne(
        { personId, videoId: result.videoId, startMs: result.startMs },
        { $setOnInsert: { label: CHECK_TO_LABEL[answer.data.speaker], source: 'check', createdAt: new Date() } },
        { upsert: true },
    );
}

/**
 * Fills in `speaker` on the results: saved labels first, then the check for the best few still unknown. Waits only up
 * to a budget, and whatever isn't back by then shows Not checked and is tried again by a later search.
 */
async function applySpeakerLabels(personId: MongoObjectId, person: string, results: LINE_FINDER_RESULT[]): Promise<void> {
    if (results.length === 0) return;
    const labels = await lineFinderSpeakerLabelsCollection();
    const moment = (videoId: string, startMs: number) => `${videoId}:${startMs}`;
    const read = async () => {
        const rows = await labels
            .find({ personId, $or: results.map(({ videoId, startMs }) => ({ videoId, startMs })) })
            .toArray();
        return new Map(rows.map((row) => [moment(row.videoId, row.startMs), row.label]));
    };

    const saved = await read();
    const unknown = results
        .filter((r) => !saved.has(moment(r.videoId, r.startMs)))
        .slice(0, LINE_FINDER_LIMITS.SPEAKER_CHECKS_PER_SEARCH);
    if (unknown.length > 0) {
        await Promise.race([
            Promise.allSettled(unknown.map((r) => checkSpeaker(personId, person, r))),
            new Promise((resolve) => setTimeout(resolve, LINE_FINDER_LIMITS.SPEAKER_CHECK_BUDGET_MS)),
        ]);
    }

    const final = unknown.length > 0 ? await read() : saved;
    for (const result of results) {
        const label = final.get(moment(result.videoId, result.startMs));
        result.speaker = !label || label === LINE_FINDER_SPEAKER.UNSURE ? LINE_FINDER_SPEAKER.NOT_CHECKED : label;
    }
}

export async function searchLine(person: LineFinderPersonDoc, line: string): Promise<LINE_FINDER_SEARCH_RESPONSE> {
    const personId = person._id as MongoObjectId;
    const counts = await videoCountsFor([personId]);
    const { id, name, status, videos: videoCounts } = toPerson(person, counts.get(personId.toString())!);
    const summary = { id, name, status, videos: videoCounts };
    if (videoCounts.searched === 0) {
        return { state: LINE_FINDER_SEARCH_STATE.NOT_COLLECTED, person: summary, results: [] };
    }

    const videos = await lineFinderVideosCollection();
    const searchable = await videos.find({ personIds: personId, status: LINE_FINDER_VIDEO_STATUS.DONE }).toArray();
    const videoById = new Map(searchable.map((video) => [video.videoId, video]));

    const query = soundsOf(line);
    const candidates = await findCandidates([...videoById.keys()], queryKeys(query));
    const near = await loadNeighbours(candidates);

    const scored: LINE_FINDER_RESULT[] = [];
    for (const candidate of candidates) {
        const next = near.get(lineKey(candidate.videoId, candidate.idx + 1));
        const window = [...soundsOf(candidate.text), ...(next ? soundsOf(next.text) : [])];
        const match = matchWindow(query, window);
        const video = videoById.get(candidate.videoId);
        if (match && video) scored.push(toResult(video, candidate, near, match));
    }

    const results = keepBestPerMoment(scored).slice(0, LINE_FINDER_LIMITS.RESULTS);
    await applySpeakerLabels(personId, person.name, results);

    const state =
        results.length === 0
            ? LINE_FINDER_SEARCH_STATE.NOT_FOUND
            : results[0].matchKind === LINE_FINDER_MATCH_KIND.EXACT
              ? LINE_FINDER_SEARCH_STATE.FOUND
              : LINE_FINDER_SEARCH_STATE.CLOSEST;

    return { state, person: summary, results };
}
