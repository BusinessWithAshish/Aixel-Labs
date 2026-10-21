'use server';

import {
    getCollection,
    MongoCollections,
    MongoObjectId,
    VOICE_AGENT_SUB_MODULES,
    VoiceBookingStatus,
    type VoiceAgentDoc,
    type VoiceBooking,
    type VoiceBookingDoc,
} from '@aixellabs/backend/db';
import { ALApiResponse } from '@aixellabs/backend/api/types';
import { assertValidObjectId, runAuthenticatedAction, toObjectId } from '@/helpers/server-action-helpers';
import { findItem } from '@/server/voice-agent/accounts';
import { connectionToolRunner } from '@/server/voice-agent/calendar-connections';
import { cancelExternalBooking } from '@/server/voice-agent/composio';
import { ensureVoiceAgentIndexes } from '@/server/voice-agent/indexes';
import { requireVoiceOwner } from '@/server/voice-agent/owner-scope';
import { voiceCalendarProviderLabel } from '@/helpers/voice-calendar-providers';

export type VoiceBookingListItem = VoiceBooking & {
    agentName: string | null;
};

export type MyBookings = {
    /** Starting now or later, soonest first. */
    upcoming: VoiceBookingListItem[];
    /** Already started, most recent first. */
    past: VoiceBookingListItem[];
};

export type ListMyBookingsInput = {
    agentId?: string | null;
};

/** Per half of the list; a booking calendar this busy belongs in a real calendar app. */
const MAX_PER_SECTION = 200;
const SUB_MODULE = VOICE_AGENT_SUB_MODULES.INQUIRY_BOOKINGS;

function mapVoiceBookingDoc(doc: VoiceBookingDoc, agentName: string | null): VoiceBookingListItem {
    return {
        _id: doc._id?.toString(),
        tenantId: doc.tenantId.toString(),
        userId: doc.userId.toString(),
        agentId: doc.agentId.toString(),
        callId: doc.callId ? doc.callId.toString() : null,
        channel: doc.channel,
        start: doc.start.toISOString(),
        end: doc.end.toISOString(),
        timezone: doc.timezone,
        customerName: doc.customerName,
        customerPhone: doc.customerPhone ?? null,
        notes: doc.notes ?? null,
        status: doc.status,
        external: doc.external
            ? {
                  provider: doc.external.provider,
                  eventId: doc.external.eventId,
                  connectedAccountId: doc.external.connectedAccountId,
                  calendarId: doc.external.calendarId,
                  meetingUrl: doc.external.meetingUrl ?? null,
              }
            : null,
        createdAt: doc.createdAt.toISOString(),
        updatedAt: doc.updatedAt.toISOString(),
        agentName,
    };
}

async function agentNamesById(ids: MongoObjectId[]): Promise<Map<string, string>> {
    const unique = [...new Set(ids.map((id) => id.toString()))];
    if (unique.length === 0) return new Map();
    const agents = await getCollection<VoiceAgentDoc>(MongoCollections.VOICE_AGENTS);
    const docs = await agents
        .find({ _id: { $in: unique.map((id) => new MongoObjectId(id)) } }, { projection: { name: 1 } })
        .toArray();
    return new Map(docs.map((doc) => [String(doc._id), doc.name]));
}

/** The caller's bookings (booked and cancelled), optionally for one agent, split around now. */
export const listMyBookings = async (input: ListMyBookingsInput = {}): Promise<ALApiResponse<MyBookings>> => {
    const agentId = input.agentId || null;
    if (agentId) assertValidObjectId(agentId, 'Agent ID');

    return runAuthenticatedAction(async function listMyBookings(userId): Promise<MyBookings> {
        const owner = await requireVoiceOwner(userId, SUB_MODULE);
        await ensureVoiceAgentIndexes();
        const bookings = await getCollection<VoiceBookingDoc>(MongoCollections.VOICE_BOOKINGS);
        const scope = agentId ? { userId: owner.userId, agentId: new MongoObjectId(agentId) } : { userId: owner.userId };
        const now = new Date();
        const [upcoming, past] = await Promise.all([
            bookings
                .find({ ...scope, start: { $gte: now } })
                .sort({ start: 1 })
                .limit(MAX_PER_SECTION)
                .toArray(),
            bookings
                .find({ ...scope, start: { $lt: now } })
                .sort({ start: -1 })
                .limit(MAX_PER_SECTION)
                .toArray(),
        ]);
        const names = await agentNamesById([...upcoming, ...past].map((doc) => doc.agentId));
        const map = (doc: VoiceBookingDoc) => mapVoiceBookingDoc(doc, names.get(doc.agentId.toString()) ?? null);
        return { upcoming: upcoming.map(map), past: past.map(map) };
    });
};

/**
 * Cancels one of the caller's bookings. The slot becomes free for the agent to offer again.
 * A booking the agent made in the owner's own app (Google Calendar, Outlook, Cal.com, Calendly)
 * is cancelled there first; if that fails, nothing changes here and the error says why.
 */
export const cancelBooking = async (bookingId: string): Promise<ALApiResponse<VoiceBookingListItem>> => {
    assertValidObjectId(bookingId, 'Booking ID');

    return runAuthenticatedAction(async function cancelBooking(userId) {
        const owner = await requireVoiceOwner(userId, SUB_MODULE);
        const bookings = await getCollection<VoiceBookingDoc>(MongoCollections.VOICE_BOOKINGS);
        const _id = toObjectId(bookingId, 'Booking ID');
        const current = await bookings.findOne({ _id, userId: owner.userId, status: VoiceBookingStatus.BOOKED });
        // Disconnected since: nothing left to cancel it through (Composio deleted that account).
        const connection = current?.external
            ? await findItem('calendars', { connectedAccountId: current.external.connectedAccountId }, owner.userId)
            : null;
        if (current?.external && connection) {
            try {
                await cancelExternalBooking(current.external, connectionToolRunner(connection));
            } catch (error) {
                const why = error instanceof Error ? error.message : 'unknown error';
                throw new Error(`Could not cancel it in ${voiceCalendarProviderLabel(current.external.provider)} (${why}). Nothing was changed.`);
            }
        }
        const doc = await bookings.findOneAndUpdate(
            { _id, userId: owner.userId, status: VoiceBookingStatus.BOOKED },
            { $set: { status: VoiceBookingStatus.CANCELLED, updatedAt: new Date() } },
            { returnDocument: 'after' },
        );
        if (!doc) {
            const existing = await bookings.findOne({ _id, userId: owner.userId }, { projection: { status: 1 } });
            throw new Error(existing ? 'This booking is already cancelled' : 'Booking not found');
        }
        const names = await agentNamesById([doc.agentId]);
        return mapVoiceBookingDoc(doc, names.get(doc.agentId.toString()) ?? null);
    });
};
