'use server';

import type { ALApiResponse } from '@aixellabs/backend/api/types';
import { LINE_FINDER_SUB_MODULES, Modules, type MongoObjectId } from '@aixellabs/backend/db';
import {
    LINE_FINDER_ERROR_MESSAGES,
    LINE_FINDER_PERSON_STATUS,
    LINE_FINDER_VIDEO_STATUS,
} from '@aixellabs/backend/line-finder/constants';
import {
    LINE_FINDER_ADD_PERSON_REQUEST_SCHEMA,
    LINE_FINDER_MARK_REQUEST_SCHEMA,
    LINE_FINDER_SEARCH_REQUEST_SCHEMA,
} from '@aixellabs/backend/line-finder/schemas';
import type {
    LINE_FINDER_ADD_PERSON_REQUEST,
    LINE_FINDER_MARK_REQUEST,
    LINE_FINDER_PERSON,
    LINE_FINDER_SEARCH_REQUEST,
    LINE_FINDER_SEARCH_RESPONSE,
} from '@aixellabs/backend/line-finder/types';
import { hasSubModuleAccess } from '@/helpers/module-access-helpers';
import { assertValidObjectId, runAuthenticatedAction, toObjectId } from '@/helpers/server-action-helpers';
import { assertCallerIsAdmin, getAppSession } from '@/server/auth';
import {
    lineFinderLinesCollection,
    lineFinderPeopleCollection,
    lineFinderSpeakerLabelsCollection,
    lineFinderVideosCollection,
} from '@/server/line-finder/collections';
import { toPerson, videoCountsFor } from '@/server/line-finder/people';
import { searchLine } from '@/server/line-finder/search';

/** Search and the people list: an admin, or anyone granted the Search page. Every other action is for admins. */
async function assertCanSearch(): Promise<void> {
    const session = await getAppSession();
    const granted =
        session?.user?.isAdmin ||
        hasSubModuleAccess(session?.user?.moduleAccess, Modules.LINE_FINDER, LINE_FINDER_SUB_MODULES.SEARCH);
    if (!granted) throw new Error(LINE_FINDER_ERROR_MESSAGES.NO_ACCESS);
}

async function loadPeople(): Promise<LINE_FINDER_PERSON[]> {
    const people = await lineFinderPeopleCollection();
    const docs = await people.find().sort({ name: 1 }).toArray();
    const counts = await videoCountsFor(docs.map((doc) => doc._id as MongoObjectId));
    return docs.map((doc) => toPerson(doc, counts.get(String(doc._id))!));
}

export const listLineFinderPeople = async (): Promise<ALApiResponse<LINE_FINDER_PERSON[]>> =>
    runAuthenticatedAction(async function listLineFinderPeople() {
        await assertCanSearch();
        return loadPeople();
    });

export const searchLineFinder = async (
    input: LINE_FINDER_SEARCH_REQUEST,
): Promise<ALApiResponse<LINE_FINDER_SEARCH_RESPONSE>> =>
    runAuthenticatedAction(async function searchLineFinder() {
        await assertCanSearch();
        const parsed = LINE_FINDER_SEARCH_REQUEST_SCHEMA.safeParse(input);
        if (!parsed.success) throw new Error(LINE_FINDER_ERROR_MESSAGES.INVALID_PARAMS);
        assertValidObjectId(parsed.data.personId, 'Person');

        const people = await lineFinderPeopleCollection();
        const person = await people.findOne({ _id: toObjectId(parsed.data.personId) });
        if (!person) throw new Error(LINE_FINDER_ERROR_MESSAGES.PERSON_NOT_FOUND);
        return searchLine(person, parsed.data.line);
    });

/** Adds a person. The next tick starts collecting their videos. */
export const addLineFinderPerson = async (
    input: LINE_FINDER_ADD_PERSON_REQUEST,
): Promise<ALApiResponse<LINE_FINDER_PERSON[]>> =>
    runAuthenticatedAction(async function addLineFinderPerson() {
        await assertCallerIsAdmin();
        const parsed = LINE_FINDER_ADD_PERSON_REQUEST_SCHEMA.safeParse(input);
        if (!parsed.success) throw new Error(LINE_FINDER_ERROR_MESSAGES.INVALID_PARAMS);

        const people = await lineFinderPeopleCollection();
        await people.insertOne({
            name: parsed.data.name,
            spellings: parsed.data.spellings,
            handle: parsed.data.handle || null,
            status: LINE_FINDER_PERSON_STATUS.COLLECTING,
            stopReason: null,
            discoveredAt: null,
            leaseUntil: null,
            createdAt: new Date(),
        });
        return loadPeople();
    });

/** Resumes collecting. Videos that failed get another try. */
export const resumeLineFinderPerson = async (personId: string): Promise<ALApiResponse<LINE_FINDER_PERSON[]>> =>
    runAuthenticatedAction(async function resumeLineFinderPerson() {
        await assertCallerIsAdmin();
        assertValidObjectId(personId, 'Person');
        const id = toObjectId(personId);

        const [people, videos] = await Promise.all([lineFinderPeopleCollection(), lineFinderVideosCollection()]);
        await videos.updateMany(
            { personIds: id, status: LINE_FINDER_VIDEO_STATUS.FAILED },
            { $set: { status: LINE_FINDER_VIDEO_STATUS.PENDING, error: null } },
        );
        await people.updateOne(
            { _id: id },
            { $set: { status: LINE_FINDER_PERSON_STATUS.COLLECTING, stopReason: null } },
        );
        return loadPeople();
    });

/** Removes the person, their labels, and any video no one else is using. */
export const removeLineFinderPerson = async (personId: string): Promise<ALApiResponse<LINE_FINDER_PERSON[]>> =>
    runAuthenticatedAction(async function removeLineFinderPerson() {
        await assertCallerIsAdmin();
        assertValidObjectId(personId, 'Person');
        const id = toObjectId(personId);

        const [people, videos, lines, labels] = await Promise.all([
            lineFinderPeopleCollection(),
            lineFinderVideosCollection(),
            lineFinderLinesCollection(),
            lineFinderSpeakerLabelsCollection(),
        ]);
        await people.deleteOne({ _id: id });
        await labels.deleteMany({ personId: id });
        await videos.updateMany({ personIds: id }, { $pull: { personIds: id } });
        const orphans = await videos.find({ personIds: { $size: 0 } }, { projection: { videoId: 1 } }).toArray();
        const orphanIds = orphans.map((video) => video.videoId);
        if (orphanIds.length > 0) {
            await lines.deleteMany({ videoId: { $in: orphanIds } });
            await videos.deleteMany({ videoId: { $in: orphanIds } });
        }
        return loadPeople();
    });

export const markLineFinderSpeaker = async (input: LINE_FINDER_MARK_REQUEST): Promise<ALApiResponse<{ saved: true }>> =>
    runAuthenticatedAction(async function markLineFinderSpeaker() {
        await assertCallerIsAdmin();
        const parsed = LINE_FINDER_MARK_REQUEST_SCHEMA.safeParse(input);
        if (!parsed.success) throw new Error(LINE_FINDER_ERROR_MESSAGES.INVALID_PARAMS);
        assertValidObjectId(parsed.data.personId, 'Person');

        const labels = await lineFinderSpeakerLabelsCollection();
        await labels.updateOne(
            { personId: toObjectId(parsed.data.personId), videoId: parsed.data.videoId, startMs: parsed.data.startMs },
            { $set: { label: parsed.data.label, source: 'mark' }, $setOnInsert: { createdAt: new Date() } },
            { upsert: true },
        );
        return { saved: true };
    });
