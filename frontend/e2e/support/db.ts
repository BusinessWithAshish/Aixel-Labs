import { MongoClient, type Db, type ObjectId } from 'mongodb';
import {
    MongoCollections,
    type ModuleAccess,
    type TenantDoc,
    type UserDoc,
    type UserLeadDoc,
    type UserLeadListDoc,
} from '@aixellabs/backend/db/types';
import { getDefaultModuleAccess } from '@/helpers/module-access-helpers';
import { E2E_DB_NAME, E2E_GEMINI_API_KEY, E2E_MONGODB_URI, E2E_TENANT } from './env';
import { DEFAULT_USER_CREDITS, E2E_ADMIN, E2E_USER, type E2eUser } from './users';
// Voice agents (e2e/voice-agent/agents + playground specs).
import { VoiceAgentCallType, type VoiceAgentDoc, type VoiceAgentVoice } from '@aixellabs/backend/db/types';
import { ObjectId as MongoObjectId } from 'mongodb';
// Voice numbers + call logs (e2e/voice-agent/phone-numbers + call-logs specs).
import { VoiceProvider, type VoiceCallDoc, type VoiceNumberDoc } from '@aixellabs/backend/db/types';
// Bookings (e2e/voice-agent/bookings spec).
import { type VoiceBookingDoc } from '@aixellabs/backend/db/types';
// Connected apps (e2e/voice-agent/connected-apps spec).
import { VoiceCalendarConnectionStatus, type VoiceCalendarConnectionDoc } from '@aixellabs/backend/db/types';
// Campaigns (e2e/voice-agent/campaigns spec).
import {
    VoiceCampaignContactStatus,
    VoiceCampaignStatus,
    VoiceGeminiKeyStatus,
    type VoiceCampaignContactDoc,
    type VoiceCampaignDoc,
    type VoiceSettingsDoc,
} from '@aixellabs/backend/db/types';
// Gemini API key (e2e/voice-agent/gemini-key spec; the seeded user has one so calls can run).
import { type VoiceGeminiKey } from '@aixellabs/backend/db/types';
// Agent features: call settings, caller memory (e2e/voice-agent/agent-features spec).
import { type VoiceCallerMemoryDoc } from '@aixellabs/backend/db/types';
import { sealForE2e } from '../voice-agent/fake-telephony';

/** Direct Mongo access for seeding and for asserting what the server actions persisted. */
export class E2eDb {
    private constructor(
        private readonly client: MongoClient,
        private readonly db: Db,
    ) {}

    static async connect(): Promise<E2eDb> {
        const client = new MongoClient(E2E_MONGODB_URI, { serverSelectionTimeoutMS: 3000 });
        try {
            await client.connect();
        } catch (error) {
            throw new Error(
                `E2E Mongo is not reachable at ${E2E_MONGODB_URI}. Start the services first: pnpm e2e:services:up`,
                { cause: error },
            );
        }
        return new E2eDb(client, client.db(E2E_DB_NAME));
    }

    close(): Promise<void> {
        return this.client.close();
    }

    private get users() {
        return this.db.collection<UserDoc>(MongoCollections.USERS);
    }

    /** Wipes the database and creates the `e2e` tenant with one normal user and one admin. */
    async seed(tenantLabel: string): Promise<void> {
        await this.db.dropDatabase();
        // An existing deployment already has this collection; `ensureUserLeadIndexes` fails without it.
        await this.db.createCollection(MongoCollections.USER_LEADS);

        const tenant: TenantDoc = {
            name: E2E_TENANT,
            label: tenantLabel,
            defaultModuleAccess: getDefaultModuleAccess(),
            defaultCredits: DEFAULT_USER_CREDITS,
        };
        const { insertedId: tenantId } = await this.db.collection<TenantDoc>(MongoCollections.TENANTS).insertOne(tenant);

        await this.users.insertMany([
            this.membership(E2E_USER, tenantId, {
                moduleAccess: getDefaultModuleAccess(),
                credits: DEFAULT_USER_CREDITS,
                creditsRefilledAt: new Date(),
            }),
            // Admins store `moduleAccess: {}` and are outside the credits system.
            this.membership(E2E_ADMIN, tenantId, { moduleAccess: {} }),
        ]);
        // Voice agents run on the owner's own Gemini key: the user starts with one, as a set-up customer.
        await this.setVoiceGeminiKey(E2E_USER, E2E_GEMINI_API_KEY);
    }

    private membership(user: E2eUser, tenantId: ObjectId, extra: Partial<UserDoc>): UserDoc {
        return {
            firebaseUid: user.firebaseUid,
            email: user.email,
            name: user.name,
            deviceFingerprint: `${user.firebaseUid}-device`,
            isAdmin: user.isAdmin,
            tenantId,
            tenantName: E2E_TENANT,
            ...extra,
        };
    }

    /**
     * Puts a user back to a known balance / access and removes the lead lists they own.
     * The daily refill is marked as just done unless `refilledHoursAgo` says otherwise,
     * so a test's starting balance is not topped up underneath it.
     */
    async resetUser(
        user: E2eUser,
        overrides: { credits?: number; moduleAccess?: ModuleAccess; refilledHoursAgo?: number } = {},
    ): Promise<void> {
        const doc = await this.getUser(user);
        await this.db.collection<UserLeadDoc>(MongoCollections.USER_LEADS).deleteMany({ userId: doc._id });
        await this.db.collection<UserLeadListDoc>(MongoCollections.LEAD_LISTS).deleteMany({ userId: doc._id });

        if (user.isAdmin) return;
        await this.users.updateOne(
            { _id: doc._id },
            {
                $set: {
                    credits: overrides.credits ?? DEFAULT_USER_CREDITS,
                    creditsRefilledAt: new Date(Date.now() - (overrides.refilledHoursAgo ?? 0) * 60 * 60 * 1000),
                    moduleAccess: overrides.moduleAccess ?? getDefaultModuleAccess(),
                },
            },
        );
    }

    async getUser(user: E2eUser) {
        const doc = await this.users.findOne({ firebaseUid: user.firebaseUid, tenantName: E2E_TENANT });
        if (!doc) throw new Error(`E2E user ${user.firebaseUid} is not seeded`);
        return doc;
    }

    async getCredits(user: E2eUser): Promise<number | undefined> {
        return (await this.getUser(user)).credits;
    }

    /** Lead lists owned by the user, each with the number of leads saved into it. */
    async getLeadLists(user: E2eUser): Promise<{ name: string; leadCount: number }[]> {
        const { _id: userId } = await this.getUser(user);
        const lists = await this.db.collection<UserLeadListDoc>(MongoCollections.LEAD_LISTS).find({ userId }).toArray();
        const userLeads = this.db.collection<UserLeadDoc>(MongoCollections.USER_LEADS);

        return Promise.all(
            lists.map(async (list) => ({
                name: list.name,
                leadCount: await userLeads.countDocuments({ userId, listId: list._id }),
            })),
        );
    }

    // -----------------------------------------------------------------------
    // Voice agents (e2e/voice-agent/agents.spec.ts, playground.spec.ts)
    // -----------------------------------------------------------------------

    private get voiceAgents() {
        return this.db.collection<VoiceAgentDoc>(MongoCollections.VOICE_AGENTS);
    }

    /** Removes every voice agent the user owns. */
    async resetVoiceAgents(user: E2eUser): Promise<void> {
        const { _id: userId } = await this.getUser(user);
        await this.voiceAgents.deleteMany({ userId });
    }

    /** The user's voice agents as stored, oldest first. */
    async getVoiceAgents(user: E2eUser) {
        const { _id: userId } = await this.getUser(user);
        return this.voiceAgents.find({ userId }).sort({ createdAt: 1 }).toArray();
    }

    /** Inserts an agent straight into Mongo and returns its id. `callType` defaults to OUTBOUND. */
    async insertVoiceAgent(
        user: E2eUser,
        fields: {
            name: string;
            callType?: VoiceAgentCallType;
            voice?: VoiceAgentVoice;
            prompt?: string;
            callNotes?: string;
        },
    ): Promise<string> {
        const { _id: userId, tenantId } = await this.getUser(user);
        const now = new Date();
        const { insertedId } = await this.voiceAgents.insertOne({
            tenantId,
            userId,
            name: fields.name,
            callType: fields.callType ?? VoiceAgentCallType.OUTBOUND,
            voice: fields.voice ?? 'sulafat',
            prompt: fields.prompt ?? 'You are a test agent.',
            callNotes: fields.callNotes ?? 'Website: none found.',
            createdAt: now,
            updatedAt: now,
        });
        return insertedId.toString();
    }

    /** An agent as saved before call types existed (no `callType` field); returns its id. */
    async insertLegacyVoiceAgent(user: E2eUser, name: string): Promise<string> {
        const id = await this.insertVoiceAgent(user, { name });
        await this.voiceAgents.updateOne({ _id: new MongoObjectId(id) }, { $unset: { callType: '' } });
        return id;
    }

    /** Points a number's incoming and/or outgoing calls at agents (by id; null clears). */
    async setVoiceNumberAgents(
        numberId: string,
        agents: { inboundAgentId?: string | null; outboundAgentId?: string | null },
    ): Promise<void> {
        const toId = (id: string | null) => (id ? new MongoObjectId(id) : null);
        const $set: { inboundAgentId?: MongoObjectId | null; outboundAgentId?: MongoObjectId | null } = {};
        if (agents.inboundAgentId !== undefined) $set.inboundAgentId = toId(agents.inboundAgentId);
        if (agents.outboundAgentId !== undefined) $set.outboundAgentId = toId(agents.outboundAgentId);
        await this.db.collection(MongoCollections.VOICE_NUMBERS).updateOne({ _id: new MongoObjectId(numberId) }, { $set });
    }

    // -----------------------------------------------------------------------
    // Voice numbers + call logs (e2e/voice-agent/phone-numbers.spec.ts, call-logs.spec.ts)
    // -----------------------------------------------------------------------

    private get voiceNumbers() {
        return this.db.collection<VoiceNumberDoc>(MongoCollections.VOICE_NUMBERS);
    }

    private get voiceCalls() {
        return this.db.collection<VoiceCallDoc>(MongoCollections.VOICE_CALLS);
    }

    /** Removes the user's numbers and call logs. */
    async resetVoiceTelephony(user: E2eUser): Promise<void> {
        const { _id: userId } = await this.getUser(user);
        await Promise.all([this.voiceNumbers.deleteMany({ userId }), this.voiceCalls.deleteMany({ userId })]);
    }

    /** The user's numbers as stored (sealed key included), oldest first. */
    async getVoiceNumbers(user: E2eUser) {
        const { _id: userId } = await this.getUser(user);
        return this.voiceNumbers.find({ userId }).sort({ createdAt: 1 }).toArray();
    }

    /**
     * Inserts a number straight into Mongo and returns its id (Telnyx unless `provider` says
     * otherwise). `apiKeySealed` must already be sealed.
     */
    async insertVoiceNumber(
        user: E2eUser,
        fields: Pick<VoiceNumberDoc, 'phoneNumber' | 'providerNumberId' | 'apiKeySealed'> &
            Partial<
                Pick<
                    VoiceNumberDoc,
                    | 'provider'
                    | 'texmlAppId'
                    | 'callControlAppId'
                    | 'inboundAgentId'
                    | 'outboundAgentId'
                    | 'previousConnectionId'
                    | 'voicelink'
                    | 'twilio'
                >
            >,
    ): Promise<string> {
        const { _id: userId, tenantId } = await this.getUser(user);
        const now = new Date();
        const { insertedId } = await this.voiceNumbers.insertOne({
            tenantId,
            userId,
            provider: VoiceProvider.TELNYX,
            inboundAgentId: null,
            outboundAgentId: null,
            previousConnectionId: null,
            ...fields,
            createdAt: now,
            updatedAt: now,
        });
        return insertedId.toString();
    }

    /** The user's call logs as stored, oldest first. */
    async getVoiceCalls(user: E2eUser) {
        const { _id: userId } = await this.getUser(user);
        return this.voiceCalls.find({ userId }).sort({ startedAt: 1 }).toArray();
    }

    /** Inserts call logs the way the voice engine writes them; returns their ids in order. */
    async insertVoiceCalls(user: E2eUser, calls: Omit<VoiceCallDoc, '_id' | 'tenantId' | 'userId'>[]): Promise<string[]> {
        const { _id: userId, tenantId } = await this.getUser(user);
        const { insertedIds } = await this.voiceCalls.insertMany(calls.map((call) => ({ ...call, tenantId, userId })));
        return calls.map((_, index) => insertedIds[index].toString());
    }

    // -----------------------------------------------------------------------
    // Bookings (e2e/voice-agent/bookings.spec.ts)
    // -----------------------------------------------------------------------

    private get voiceBookings() {
        return this.db.collection<VoiceBookingDoc>(MongoCollections.VOICE_BOOKINGS);
    }

    /** Removes the user's bookings. */
    async resetVoiceBookings(user: E2eUser): Promise<void> {
        const { _id: userId } = await this.getUser(user);
        await this.voiceBookings.deleteMany({ userId });
    }

    /** The user's bookings as stored, earliest start first. */
    async getVoiceBookings(user: E2eUser) {
        const { _id: userId } = await this.getUser(user);
        return this.voiceBookings.find({ userId }).sort({ start: 1 }).toArray();
    }

    /** Inserts bookings the way the engine's book_appointment writes them; returns their ids in order. */
    async insertVoiceBookings(
        user: E2eUser,
        bookings: Omit<VoiceBookingDoc, '_id' | 'tenantId' | 'userId' | 'createdAt' | 'updatedAt'>[],
    ): Promise<string[]> {
        const { _id: userId, tenantId } = await this.getUser(user);
        const now = new Date();
        const { insertedIds } = await this.voiceBookings.insertMany(
            bookings.map((booking) => ({ ...booking, tenantId, userId, createdAt: now, updatedAt: now })),
        );
        return bookings.map((_, index) => insertedIds[index].toString());
    }

    // -----------------------------------------------------------------------
    // Voice agent tools (e2e/voice-agent/tools.spec.ts)
    // -----------------------------------------------------------------------

    /** One agent as stored (sealed webhook secrets included). */
    async getVoiceAgentDoc(agentId: string) {
        const doc = await this.voiceAgents.findOne({ _id: new MongoObjectId(agentId) });
        if (!doc) throw new Error(`Voice agent ${agentId} is not in the e2e DB`);
        return doc;
    }

    /** Replaces an agent's tools as stored (secrets must already be sealed). */
    async setVoiceAgentTools(agentId: string, tools: VoiceAgentDoc['tools']): Promise<void> {
        await this.voiceAgents.updateOne({ _id: new MongoObjectId(agentId) }, { $set: { tools } });
    }

    // -----------------------------------------------------------------------
    // Connected apps (e2e/voice-agent/connected-apps.spec.ts)
    // -----------------------------------------------------------------------

    private get calendarConnections() {
        return this.db.collection<VoiceCalendarConnectionDoc>(MongoCollections.VOICE_CALENDAR_CONNECTIONS);
    }

    /** Removes the user's connected apps. */
    async resetVoiceCalendarConnections(user: E2eUser): Promise<void> {
        const { _id: userId } = await this.getUser(user);
        await this.calendarConnections.deleteMany({ userId });
    }

    /** The user's connected apps as stored, oldest first. */
    async getVoiceCalendarConnections(user: E2eUser) {
        const { _id: userId } = await this.getUser(user);
        return this.calendarConnections.find({ userId }).sort({ createdAt: 1 }).toArray();
    }

    /** Inserts a connected app as the callback leaves it; returns its id. */
    async insertVoiceCalendarConnection(
        user: E2eUser,
        fields: Pick<VoiceCalendarConnectionDoc, 'provider' | 'connectedAccountId'> &
            Partial<Pick<VoiceCalendarConnectionDoc, 'status' | 'label' | 'authConfigId' | 'composioSessionId'>>,
    ): Promise<string> {
        const { _id: userId, tenantId } = await this.getUser(user);
        const now = new Date();
        const { insertedId } = await this.calendarConnections.insertOne({
            tenantId,
            userId,
            authConfigId: 'ac_e2e_seeded',
            status: VoiceCalendarConnectionStatus.ACTIVE,
            label: null,
            statusReason: null,
            createdAt: now,
            updatedAt: now,
            ...fields,
        });
        return insertedId.toString();
    }

    // -----------------------------------------------------------------------
    // Campaigns (e2e/voice-agent/campaigns.spec.ts)
    // -----------------------------------------------------------------------

    private get voiceCampaigns() {
        return this.db.collection<VoiceCampaignDoc>(MongoCollections.VOICE_CAMPAIGNS);
    }

    private get voiceCampaignContacts() {
        return this.db.collection<VoiceCampaignContactDoc>(MongoCollections.VOICE_CAMPAIGN_CONTACTS);
    }

    /** Removes the user's campaigns and their contacts. */
    async resetVoiceCampaigns(user: E2eUser): Promise<void> {
        const { _id: userId } = await this.getUser(user);
        await Promise.all([this.voiceCampaigns.deleteMany({ userId }), this.voiceCampaignContacts.deleteMany({ userId })]);
    }

    /** The user's campaigns as stored, oldest first. */
    async getVoiceCampaigns(user: E2eUser) {
        const { _id: userId } = await this.getUser(user);
        return this.voiceCampaigns.find({ userId }).sort({ createdAt: 1 }).toArray();
    }

    /** A campaign's contacts as stored, in CSV row order. */
    async getVoiceCampaignContacts(campaignId: string) {
        return this.voiceCampaignContacts
            .find({ campaignId: new MongoObjectId(campaignId) })
            .sort({ row: 1 })
            .toArray();
    }

    /** Inserts a campaign and its contacts the way the app and the engine leave them; returns the ids. */
    async insertVoiceCampaign(
        user: E2eUser,
        fields: Pick<VoiceCampaignDoc, 'name' | 'agentId' | 'numberId'> &
            Partial<Omit<VoiceCampaignDoc, '_id' | 'tenantId' | 'userId'>>,
        contacts: (Pick<VoiceCampaignContactDoc, 'phone'> &
            Partial<Omit<VoiceCampaignContactDoc, '_id' | 'tenantId' | 'userId' | 'campaignId'>>)[],
    ): Promise<{ campaignId: string; contactIds: string[] }> {
        const { _id: userId, tenantId } = await this.getUser(user);
        const now = new Date();
        const { insertedId } = await this.voiceCampaigns.insertOne({
            tenantId,
            userId,
            status: VoiceCampaignStatus.DRAFT,
            window: { days: ['mon', 'tue', 'wed', 'thu', 'fri'], start: '09:00', end: '18:00', timezone: 'Asia/Kolkata' },
            maxConcurrent: 2,
            retry: { maxRetries: 1, delayMinutes: 60, on: [] },
            defaultCountry: 'IN',
            variableKeys: [],
            lastError: null,
            createdAt: now,
            updatedAt: now,
            ...fields,
        });
        if (contacts.length === 0) return { campaignId: insertedId.toString(), contactIds: [] };
        const { insertedIds } = await this.voiceCampaignContacts.insertMany(
            contacts.map((contact, index) => ({
                tenantId,
                userId,
                campaignId: insertedId,
                name: null,
                variables: {},
                row: index + 2,
                status: VoiceCampaignContactStatus.PENDING,
                attempts: 0,
                nextAttemptAt: null,
                callIds: [],
                booked: false,
                createdAt: now,
                updatedAt: now,
                ...contact,
            })),
        );
        return { campaignId: insertedId.toString(), contactIds: contacts.map((_, i) => insertedIds[i].toString()) };
    }

    /** Updates one contact as the engine would (status, attempts, outcome). */
    async updateVoiceCampaignContact(contactId: string, set: Partial<VoiceCampaignContactDoc>): Promise<void> {
        await this.voiceCampaignContacts.updateOne({ _id: new MongoObjectId(contactId) }, { $set: set });
    }

    /** Gives the user a Gemini key (sealed placeholder): starting a campaign needs one. `null` removes it. */
    async setCampaignGeminiKey(user: E2eUser, keySealed: string | null): Promise<void> {
        const { _id: userId, tenantId } = await this.getUser(user);
        const settings = this.db.collection<VoiceSettingsDoc>(MongoCollections.VOICE_SETTINGS);
        const now = new Date();
        const gemini = keySealed
            ? {
                  keySealed,
                  last4: 'e2e0',
                  status: VoiceGeminiKeyStatus.OK,
                  statusMessage: null,
                  checkedAt: now,
                  savedAt: now,
              }
            : null;
        await settings.updateOne(
            { userId },
            { $set: { gemini, updatedAt: now }, $setOnInsert: { tenantId, userId, createdAt: now } },
            { upsert: true },
        );
    }

    // -----------------------------------------------------------------------
    // Gemini API key (e2e/voice-agent/gemini-key.spec.ts)
    // -----------------------------------------------------------------------

    /** Saves `key` as the user's Gemini key the way the app does (sealed), `fields` on top; `null` removes it. */
    async setVoiceGeminiKey(user: E2eUser, key: string | null, fields: Partial<VoiceGeminiKey> = {}): Promise<void> {
        const { _id: userId, tenantId } = await this.getUser(user);
        const now = new Date();
        const gemini: VoiceGeminiKey | null = key
            ? {
                  keySealed: sealForE2e(key),
                  last4: key.slice(-4),
                  status: VoiceGeminiKeyStatus.OK,
                  statusMessage: null,
                  checkedAt: now,
                  savedAt: now,
                  ...fields,
              }
            : null;
        await this.db
            .collection<VoiceSettingsDoc>(MongoCollections.VOICE_SETTINGS)
            .updateOne(
                { userId },
                { $set: { gemini, updatedAt: now }, $setOnInsert: { tenantId, userId, createdAt: now } },
                { upsert: true },
            );
    }

    /** The user's voice settings as stored (sealed key included). */
    async getVoiceSettings(user: E2eUser) {
        const { _id: userId } = await this.getUser(user);
        return this.db.collection<VoiceSettingsDoc>(MongoCollections.VOICE_SETTINGS).findOne({ userId });
    }

    // -----------------------------------------------------------------------
    // Agent features: variables, call settings, caller memory (e2e/voice-agent/agent-features.spec.ts)
    // -----------------------------------------------------------------------

    private get voiceCallerMemories() {
        return this.db.collection<VoiceCallerMemoryDoc>(MongoCollections.VOICE_CALLER_MEMORIES);
    }

    /** Sets fields on an agent the editor would otherwise save (variables, voicemail, analysis, memory). */
    async setVoiceAgentFields(
        agentId: string,
        fields: Partial<Pick<VoiceAgentDoc, 'variables' | 'voicemail' | 'analysis' | 'memory'>>,
    ): Promise<void> {
        await this.voiceAgents.updateOne({ _id: new MongoObjectId(agentId) }, { $set: fields });
    }

    async resetVoiceCallerMemories(user: E2eUser): Promise<void> {
        const { _id: userId } = await this.getUser(user);
        await this.voiceCallerMemories.deleteMany({ userId });
    }

    /** Inserts what an agent remembers about a number, the way the engine writes it; returns its id. */
    async insertVoiceCallerMemory(
        user: E2eUser,
        fields: Pick<VoiceCallerMemoryDoc, 'agentId' | 'phone' | 'brief' | 'lastCallId' | 'lastCallAt'> &
            Partial<Pick<VoiceCallerMemoryDoc, 'calls'>>,
    ): Promise<string> {
        const { _id: userId, tenantId } = await this.getUser(user);
        const now = new Date();
        const { insertedId } = await this.voiceCallerMemories.insertOne({
            tenantId,
            userId,
            calls: 1,
            ...fields,
            createdAt: now,
            updatedAt: now,
        });
        return insertedId.toString();
    }

    async getVoiceCallerMemories(user: E2eUser) {
        const { _id: userId } = await this.getUser(user);
        return this.voiceCallerMemories.find({ userId }).sort({ lastCallAt: -1 }).toArray();
    }
}
