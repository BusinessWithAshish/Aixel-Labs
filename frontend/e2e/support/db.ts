import { MongoClient, type Db, type ObjectId } from 'mongodb';
import {
    MongoCollections,
    type ContentLabProfileDoc,
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
import { VoiceAgentCallType, type VoiceAgentChannel, type VoiceAgentDoc, type VoiceAgentVoice } from '@aixellabs/backend/db/types';
import { ObjectId as MongoObjectId } from 'mongodb';
// Voice numbers + call logs (e2e/voice-agent/phone-numbers + call-logs specs).
import {
    VoiceCallChannel,
    VoiceCallDirection,
    VoiceProvider,
    type VoiceAccountDoc,
    type VoiceCallDoc,
    type VoiceNumberDoc,
} from '@aixellabs/backend/db/types';
// Bookings (e2e/voice-agent/bookings spec).
import { type VoiceBookingDoc } from '@aixellabs/backend/db/types';
// Connected apps (e2e/voice-agent/connected-apps spec).
import { VoiceCalendarConnectionStatus, type VoiceCalendarConnectionDoc } from '@aixellabs/backend/db/types';
// Campaigns (e2e/voice-agent/campaigns spec).
import {
    VoiceCampaignContactStatus,
    VoiceCampaignStatus,
    VoiceKeyProvider,
    VoiceKeyStatus,
    type VoiceProviderKeyDoc,
    type VoiceCampaignContactDoc,
    type VoiceCampaignDoc,
} from '@aixellabs/backend/db/types';
// Gemini API key (e2e/voice-agent/gemini-key spec; the seeded user has one so calls can run).
import { sealForE2e } from '../voice-agent/fake-telephony';

/** Direct Mongo access for seeding and for asserting what the server actions persisted. */
export class E2eDb {
    private constructor(
        private readonly client: MongoClient,
        private readonly db: Db,
    ) {}

    static async connect(dbName = E2E_DB_NAME): Promise<E2eDb> {
        const client = new MongoClient(E2E_MONGODB_URI, { serverSelectionTimeoutMS: 10_000 });
        try {
            await client.connect();
        } catch (error) {
            throw new Error(
                `E2E Mongo is not reachable at ${E2E_MONGODB_URI}. Start the services first: pnpm e2e:services:up`,
                { cause: error },
            );
        }
        return new E2eDb(client, client.db(dbName));
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

    /** Adds `user` as another member of the e2e tenant (for specs that delete one); returns its id. */
    async insertMember(user: E2eUser): Promise<ObjectId> {
        const { tenantId } = await this.getUser(E2E_USER);
        await this.users.deleteMany({ firebaseUid: user.firebaseUid });
        const { insertedId } = await this.users.insertOne(
            this.membership(user, tenantId, { moduleAccess: getDefaultModuleAccess(), credits: DEFAULT_USER_CREDITS }),
        );
        return insertedId;
    }

    /** How many docs each voice collection holds for one owner (by id, so it works after they are deleted). */
    async countVoiceDocs(userId: ObjectId): Promise<Record<string, number>> {
        const names = Object.values(MongoCollections).filter((name) => name.startsWith('voice_'));
        const counts = await Promise.all(names.map((name) => this.db.collection(name).countDocuments({ userId })));
        return Object.fromEntries(names.map((name, index) => [name, counts[index]]));
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
            channel?: VoiceAgentChannel;
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
            ...(fields.channel ? { channel: fields.channel } : {}),
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
        const $set: Record<string, MongoObjectId | null> = {};
        if (agents.inboundAgentId !== undefined) $set['numbers.$.inboundAgentId'] = toId(agents.inboundAgentId);
        if (agents.outboundAgentId !== undefined) $set['numbers.$.outboundAgentId'] = toId(agents.outboundAgentId);
        await this.voiceAccounts.updateOne({ 'numbers._id': new MongoObjectId(numberId) }, { $set });
    }

    // -----------------------------------------------------------------------
    // Voice numbers + call logs (e2e/voice-agent/phone-numbers.spec.ts, call-logs.spec.ts)
    // -----------------------------------------------------------------------

    /** One per owner: the Gemini key, `numbers` and `calendars` (connected apps). */
    private get voiceAccounts() {
        return this.db.collection<VoiceAccountDoc>(MongoCollections.VOICE_ACCOUNTS);
    }

    /** The user's account doc, made when missing (as the app does on first use). */
    private async voiceAccount(user: E2eUser): Promise<{ userId: ObjectId; tenantId: ObjectId }> {
        const { _id: userId, tenantId } = await this.getUser(user);
        const now = new Date();
        await this.voiceAccounts.updateOne(
            { userId },
            { $setOnInsert: { tenantId, userId, createdAt: now, updatedAt: now } },
            { upsert: true },
        );
        return { userId, tenantId };
    }

    /** Items of one of the user's account lists, oldest first, with the owner's ids on each. */
    private async accountItems<K extends 'numbers' | 'calendars'>(
        user: E2eUser,
        key: K,
    ): Promise<(NonNullable<VoiceAccountDoc[K]>[number] & { tenantId: ObjectId; userId: ObjectId })[]> {
        const { _id: userId } = await this.getUser(user);
        const doc = await this.voiceAccounts.findOne({ userId });
        const items: { createdAt: Date }[] = doc?.[key] ?? [];
        return items
            .map((item) => ({ ...item, tenantId: doc!.tenantId, userId }))
            .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()) as never;
    }

    private get voiceCalls() {
        return this.db.collection<VoiceCallDoc>(MongoCollections.VOICE_CALLS);
    }

    /** Removes the user's numbers, softphone and call logs. */
    async resetVoiceTelephony(user: E2eUser): Promise<void> {
        const { _id: userId } = await this.getUser(user);
        await Promise.all([
            this.voiceAccounts.updateOne({ userId }, { $unset: { numbers: '', softphone: '' } }),
            this.voiceCalls.deleteMany({ userId }),
        ]);
    }

    /** The user's numbers as stored (sealed key included), oldest first. */
    async getVoiceNumbers(user: E2eUser) {
        return this.accountItems(user, 'numbers');
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
                    | 'whatsapp'
                >
            >,
    ): Promise<string> {
        const { userId } = await this.voiceAccount(user);
        const now = new Date();
        const number: VoiceNumberDoc = {
            _id: new MongoObjectId(),
            provider: VoiceProvider.TELNYX,
            inboundAgentId: null,
            outboundAgentId: null,
            previousConnectionId: null,
            ...fields,
            createdAt: now,
            updatedAt: now,
        };
        await this.voiceAccounts.updateOne({ userId }, { $push: { numbers: number } });
        return number._id.toString();
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

    /** Sets fields on an agent as stored (caller memory, WhatsApp settings). */
    async updateVoiceAgent(agentId: string, fields: Partial<VoiceAgentDoc>): Promise<void> {
        await this.voiceAgents.updateOne({ _id: new MongoObjectId(agentId) }, { $set: fields });
    }

    /** Moves a WhatsApp chat's last message `minutes` back, as if the person had gone quiet that long ago. */
    async ageVoiceChat(callId: string, minutes: number): Promise<void> {
        await this.voiceCalls.updateOne(
            { _id: new MongoObjectId(callId) },
            { $set: { 'chat.lastMessageAt': new Date(Date.now() - minutes * 60_000) } },
        );
    }

    // -----------------------------------------------------------------------
    // Connected apps (e2e/voice-agent/connected-apps.spec.ts)
    // -----------------------------------------------------------------------

    /** Removes the user's connected apps. */
    async resetVoiceCalendarConnections(user: E2eUser): Promise<void> {
        const { _id: userId } = await this.getUser(user);
        await this.voiceAccounts.updateOne({ userId }, { $unset: { calendars: '' } });
    }

    /** The user's connected apps as stored, oldest first. */
    async getVoiceCalendarConnections(user: E2eUser) {
        return this.accountItems(user, 'calendars');
    }

    /** Inserts a connected app as the callback leaves it; returns its id. */
    async insertVoiceCalendarConnection(
        user: E2eUser,
        fields: Pick<VoiceCalendarConnectionDoc, 'provider' | 'connectedAccountId'> &
            Partial<Pick<VoiceCalendarConnectionDoc, 'status' | 'label' | 'authConfigId' | 'composioSessionId'>>,
    ): Promise<string> {
        const { userId } = await this.voiceAccount(user);
        const now = new Date();
        const connection: VoiceCalendarConnectionDoc = {
            _id: new MongoObjectId(),
            authConfigId: 'ac_e2e_seeded',
            status: VoiceCalendarConnectionStatus.ACTIVE,
            label: null,
            statusReason: null,
            createdAt: now,
            updatedAt: now,
            ...fields,
        };
        await this.voiceAccounts.updateOne({ userId }, { $push: { calendars: connection } });
        return connection._id.toString();
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
        await this.setVoiceKeys(user, keySealed ? [{ keySealed, last4: 'e2e0' }] : []);
    }

    // -----------------------------------------------------------------------
    // API keys (e2e/voice-agent/gemini-key.spec.ts)
    // -----------------------------------------------------------------------

    /**
     * Replaces the user's keys: each key a Gemini key unless it says, OK, `fields` on top. Returns their ids,
     * in order (the first of a provider is its default).
     */
    async setVoiceKeys(user: E2eUser, keys: Partial<VoiceProviderKeyDoc>[]): Promise<string[]> {
        const { userId } = await this.voiceAccount(user);
        const now = new Date();
        const docs: VoiceProviderKeyDoc[] = keys.map((fields, i) => ({
            _id: new MongoObjectId(),
            provider: VoiceKeyProvider.GEMINI,
            label: `Key ${i + 1}`,
            keySealed: '',
            last4: '',
            status: VoiceKeyStatus.OK,
            statusMessage: null,
            checkedAt: now,
            savedAt: now,
            ...fields,
        }));
        await this.voiceAccounts.updateOne(
            { userId },
            { $set: { keys: docs, updatedAt: now }, $unset: { gemini: '', stack: '' } },
        );
        return docs.map((d) => d._id.toString());
    }

    /** Saves `key` as the user's one Gemini key the way the app does (sealed), `fields` on top; `null` removes every key. */
    async setVoiceGeminiKey(user: E2eUser, key: string | null, fields: Partial<VoiceProviderKeyDoc> = {}): Promise<void> {
        await this.setVoiceKeys(
            user,
            key ? [{ keySealed: sealForE2e(key), last4: key.slice(-4), label: 'Main', ...fields }] : [],
        );
    }

    /**
     * Saves `key` as the user's Content Lab Gemini key the way Content Lab > Settings does (sealed, checked
     * OK), separate from the voice keys; `null` removes it.
     */
    async setContentLabGeminiKey(user: E2eUser, key: string | null): Promise<void> {
        const { _id: userId } = await this.getUser(user);
        const profiles = this.db.collection<ContentLabProfileDoc>(MongoCollections.CONTENT_LAB_PROFILES);
        const now = new Date();
        if (!key) {
            await profiles.updateOne({ userId }, { $unset: { 'aiKeys.gemini': '' } });
            return;
        }
        await profiles.updateOne(
            { userId },
            {
                $set: {
                    'aiKeys.gemini': {
                        keySealed: sealForE2e(key),
                        last4: key.slice(-4),
                        status: VoiceKeyStatus.OK,
                        statusMessage: null,
                        checkedAt: now,
                        savedAt: now,
                    },
                },
                $setOnInsert: { handles: {}, country: 'IN', language: 'English', updatedAt: now },
            },
            { upsert: true },
        );
    }

    /** The user's voice account as stored (sealed key included). */
    async getVoiceAccount(user: E2eUser) {
        const { _id: userId } = await this.getUser(user);
        return this.voiceAccounts.findOne({ userId });
    }

    // -----------------------------------------------------------------------
    // Agent features: variables, call settings, caller memory (e2e/voice-agent/agent-features.spec.ts)
    // -----------------------------------------------------------------------

    /** Sets fields on an agent the editor would otherwise save (prompt, variables, voicemail, analysis, memory). */
    async setVoiceAgentFields(
        agentId: string,
        fields: Partial<Pick<VoiceAgentDoc, 'prompt' | 'variables' | 'voicemail' | 'analysis' | 'memory' | 'stack'>>,
    ): Promise<void> {
        await this.voiceAgents.updateOne({ _id: new MongoObjectId(agentId) }, { $set: fields });
    }

    async resetVoiceCallerMemories(user: E2eUser): Promise<void> {
        const { _id: userId } = await this.getUser(user);
        await this.voiceCalls.updateMany({ userId, memory: { $exists: true } }, { $unset: { memory: '' } });
    }

    /**
     * Stores what an agent remembers about a number the way the engine writes it: as the current
     * memory on the call `lastCallId` (a minimal inbound call from `phone` is inserted when there
     * is no such call yet). Returns the call's id, which is the memory's id.
     */
    async insertVoiceCallerMemory(
        user: E2eUser,
        fields: { agentId: ObjectId; phone: string; brief: string; lastCallId: ObjectId; lastCallAt: Date; calls?: number },
    ): Promise<string> {
        const { _id: userId, tenantId } = await this.getUser(user);
        const memory = { brief: fields.brief, calls: fields.calls ?? 1, since: fields.lastCallAt, current: true as const };
        const existing = await this.voiceCalls.updateOne(
            { _id: fields.lastCallId, userId },
            { $set: { callerPhone: fields.phone, memory } },
        );
        if (existing.matchedCount === 0) {
            await this.voiceCalls.insertOne({
                _id: fields.lastCallId,
                tenantId,
                userId,
                agentId: fields.agentId,
                numberId: null,
                channel: VoiceCallChannel.PHONE,
                direction: VoiceCallDirection.INBOUND,
                from: fields.phone,
                to: '+15550000000',
                voice: 'sulafat',
                startedAt: fields.lastCallAt,
                endedAt: fields.lastCallAt,
                durationSec: 60,
                endedBy: 'goodbye',
                flags: [],
                turns: [],
                gapsMs: [],
                callerPhone: fields.phone,
                memory,
            });
        }
        return fields.lastCallId.toString();
    }

    /** What the user's agents remember now, one entry per agent + caller, latest call first. */
    async getVoiceCallerMemories(user: E2eUser) {
        const { _id: userId } = await this.getUser(user);
        const calls = await this.voiceCalls.find({ userId, 'memory.current': true }).sort({ startedAt: -1 }).toArray();
        return calls.map((call) => ({
            _id: call._id,
            agentId: call.agentId,
            phone: call.callerPhone ?? '',
            brief: call.memory?.brief ?? '',
            calls: call.memory?.calls ?? 1,
            lastCallAt: call.startedAt,
        }));
    }
}
