import 'server-only';

import {
    getCollection,
    MongoCollections,
    VoiceBookingStatus,
    type VoiceAccountDoc,
    type VoiceAgentDoc,
    type VoiceBookingDoc,
    type VoiceCallDoc,
    type VoiceCampaignContactDoc,
    type VoiceCampaignDoc,
} from '@aixellabs/backend/db';

let indexesEnsured = false;

/**
 * One account doc per owner (its numbers and connected apps unique across owners, and found by id),
 * owner listings, bookings, outbound campaigns, and caller memory on calls.
 * The engine creates the bookings' partial unique index too (same spec, default name
 * `agentId_1_start_1`), so a slot can never be booked twice whichever side starts first.
 */
export async function ensureVoiceAgentIndexes(): Promise<void> {
    if (indexesEnsured) return;

    const accounts = await getCollection<VoiceAccountDoc>(MongoCollections.VOICE_ACCOUNTS);
    const agents = await getCollection<VoiceAgentDoc>(MongoCollections.VOICE_AGENTS);
    const calls = await getCollection<VoiceCallDoc>(MongoCollections.VOICE_CALLS);
    const bookings = await getCollection<VoiceBookingDoc>(MongoCollections.VOICE_BOOKINGS);
    const campaigns = await getCollection<VoiceCampaignDoc>(MongoCollections.VOICE_CAMPAIGNS);
    const contacts = await getCollection<VoiceCampaignContactDoc>(MongoCollections.VOICE_CAMPAIGN_CONTACTS);

    await Promise.all([
        accounts.createIndex({ userId: 1 }, { unique: true }),
        // A number or a connected app belongs to one account. Partial: accounts without any would
        // all index the missing value and collide.
        accounts.createIndex(
            { 'numbers.phoneNumber': 1 },
            { unique: true, partialFilterExpression: { 'numbers.phoneNumber': { $exists: true } } },
        ),
        accounts.createIndex(
            { 'calendars.connectedAccountId': 1 },
            { unique: true, partialFilterExpression: { 'calendars.connectedAccountId': { $exists: true } } },
        ),
        // The engine finds a call's number (and so its owner and key) by the number's id.
        accounts.createIndex({ 'numbers._id': 1 }),
        // A WhatsApp webhook names its Meta app: the engine finds the app's numbers (and its secret) by it.
        accounts.createIndex(
            { 'numbers.whatsapp.appId': 1 },
            { partialFilterExpression: { 'numbers.whatsapp.appId': { $exists: true } } },
        ),
        // Linphone's one-time setup link finds its softphone by the link's token.
        accounts.createIndex(
            { 'softphone.provisioning.tokenHash': 1 },
            { partialFilterExpression: { 'softphone.provisioning.tokenHash': { $exists: true } } },
        ),
        agents.createIndex({ userId: 1, updatedAt: -1 }),
        calls.createIndex({ userId: 1, startedAt: -1 }),
        calls.createIndex({ agentId: 1, startedAt: -1 }),
        bookings.createIndex({ userId: 1, start: 1 }),
        // Named: the default name belongs to the unique index below, which the engine makes the same way.
        bookings.createIndex({ agentId: 1, start: 1 }, { name: 'agentId_1_start_1_all' }),
        bookings.createIndex(
            { agentId: 1, start: 1 },
            { unique: true, partialFilterExpression: { status: VoiceBookingStatus.BOOKED } },
        ),
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
        // Caller memory: one current brief per agent + number (what the engine reads at a call's
        // start), and an agent's remembered callers, latest first.
        calls.createIndex(
            { agentId: 1, callerPhone: 1 },
            { unique: true, name: 'memory_current', partialFilterExpression: { 'memory.current': true } },
        ),
        calls.createIndex(
            { agentId: 1, startedAt: -1 },
            { name: 'memory_list', partialFilterExpression: { 'memory.current': true } },
        ),
    ]);

    indexesEnsured = true;
}
