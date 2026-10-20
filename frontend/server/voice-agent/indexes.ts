import 'server-only';

import {
    getCollection,
    MongoCollections,
    VoiceBookingStatus,
    type VoiceAgentDoc,
    type VoiceBookingDoc,
    type VoiceCallDoc,
    type VoiceCallerMemoryDoc,
    type VoiceCampaignContactDoc,
    type VoiceCampaignDoc,
    type VoiceNumberDoc,
    type VoiceSettingsDoc,
} from '@aixellabs/backend/db';

let indexesEnsured = false;

/**
 * Owner listings, one number per provider number, the engine's number lookup, bookings, one
 * settings doc per owner, outbound campaigns, and caller memory.
 * The engine creates the bookings' partial unique index too (same spec, default name
 * `agentId_1_start_1`), so a slot can never be booked twice whichever side starts first.
 */
export async function ensureVoiceAgentIndexes(): Promise<void> {
    if (indexesEnsured) return;

    const agents = await getCollection<VoiceAgentDoc>(MongoCollections.VOICE_AGENTS);
    const numbers = await getCollection<VoiceNumberDoc>(MongoCollections.VOICE_NUMBERS);
    const calls = await getCollection<VoiceCallDoc>(MongoCollections.VOICE_CALLS);
    const bookings = await getCollection<VoiceBookingDoc>(MongoCollections.VOICE_BOOKINGS);
    const settings = await getCollection<VoiceSettingsDoc>(MongoCollections.VOICE_SETTINGS);
    const campaigns = await getCollection<VoiceCampaignDoc>(MongoCollections.VOICE_CAMPAIGNS);
    const contacts = await getCollection<VoiceCampaignContactDoc>(MongoCollections.VOICE_CAMPAIGN_CONTACTS);
    const memories = await getCollection<VoiceCallerMemoryDoc>(MongoCollections.VOICE_CALLER_MEMORIES);

    await Promise.all([
        agents.createIndex({ userId: 1, updatedAt: -1 }),
        numbers.createIndex({ userId: 1, createdAt: -1 }),
        numbers.createIndex({ provider: 1, phoneNumber: 1 }, { unique: true }),
        calls.createIndex({ userId: 1, startedAt: -1 }),
        calls.createIndex({ agentId: 1, startedAt: -1 }),
        bookings.createIndex({ userId: 1, start: 1 }),
        // Named: the default name belongs to the unique index below, which the engine makes the same way.
        bookings.createIndex({ agentId: 1, start: 1 }, { name: 'agentId_1_start_1_all' }),
        bookings.createIndex(
            { agentId: 1, start: 1 },
            { unique: true, partialFilterExpression: { status: VoiceBookingStatus.BOOKED } },
        ),
        settings.createIndex({ userId: 1 }, { unique: true }),
        // Campaigns: owner listing, the engine's RUNNING scan, one contact per phone per campaign,
        // the engine's claim (due PENDING in row order), lost-call sweep and per-number limit, and
        // a campaign call's log by contact (`campaigns.py`).
        campaigns.createIndex({ userId: 1, createdAt: -1 }),
        campaigns.createIndex({ status: 1 }),
        contacts.createIndex({ campaignId: 1, phone: 1 }, { unique: true }),
        contacts.createIndex({ campaignId: 1, status: 1, nextAttemptAt: 1, row: 1 }),
        contacts.createIndex({ status: 1, 'lease.until': 1 }),
        contacts.createIndex({ numberId: 1, status: 1 }),
        calls.createIndex(
            { campaignContactId: 1, endedAt: 1 },
            { partialFilterExpression: { campaignContactId: { $type: 'objectId' } } },
        ),
        calls.createIndex({ numberId: 1, endedAt: -1 }),
        // Call logs filtered by the analysis' success verdict.
        calls.createIndex({ userId: 1, 'analysis.successful': 1, startedAt: -1 }),
        // Caller memory: one per owner + agent + number (the engine upserts on it), an agent's list.
        memories.createIndex({ userId: 1, agentId: 1, phone: 1 }, { unique: true }),
        memories.createIndex({ agentId: 1, lastCallAt: -1 }),
    ]);

    indexesEnsured = true;
}
