'use server';

import {
    getCollection,
    MongoCollections,
    MongoObjectId,
    VOICE_AGENT_SUB_MODULES,
    VOICE_CAMPAIGN_LIMITS,
    VoiceAgentCallType,
    VoiceCampaignContactStatus,
    VoiceCampaignRetryOutcome,
    VoiceCampaignStatus,
    VoiceProvider,
    type VoiceAgentDoc,
    type VoiceCampaignContactDoc,
    type VoiceCampaignDay,
    type VoiceCampaignDoc,
    type VoiceCampaignRetry,
    type VoiceCampaignWindow,
    type VoiceNumberDoc,
} from '@aixellabs/backend/db';
import { ALApiResponse } from '@aixellabs/backend/api/types';
import { assertValidObjectId, runAuthenticatedAction, toObjectId } from '@/helpers/server-action-helpers';
import {
    campaignCountry,
    checkContacts,
    VARIABLE_KEY_PATTERN,
    type CampaignContactInput,
} from '@/helpers/voice-campaign-contacts';
import { isMongoDuplicateKeyError } from '@/server/auth/membership/duplicate-key';
import { assertGeminiKeySet } from '@/server/voice-agent/gemini-key';
import { ensureVoiceAgentIndexes } from '@/server/voice-agent/indexes';
import type { NumberProvider, OwnedNumberDoc } from '@/server/voice-agent/number-provider';
import { requireVoiceOwner, type VoiceOwnerScope } from '@/server/voice-agent/owner-scope';
import { telnyxNumbers } from '@/server/voice-agent/telnyx-numbers';
import { twilioNumbers } from '@/server/voice-agent/twilio-numbers';
import { voicelinkNumbers } from '@/server/voice-agent/voicelink-numbers';

const SUB_MODULE = VOICE_AGENT_SUB_MODULES.CAMPAIGNS;
const DAYS: VoiceCampaignDay[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$|^24:00$/;
/** Contacts per addVoiceCampaignContacts call: keeps each request well under the 1 MB action body limit. */
const CONTACTS_PER_REQUEST = 500;
const CONTACTS_SHOWN = 500;

const PROVIDERS: Record<VoiceProvider, NumberProvider> = {
    [VoiceProvider.TELNYX]: telnyxNumbers,
    [VoiceProvider.VOICELINK]: voicelinkNumbers,
    [VoiceProvider.TWILIO]: twilioNumbers,
};

// ---------------------------------------------------------------------------
// Client shapes
// ---------------------------------------------------------------------------

export type VoiceCampaignStats = {
    total: number;
    pending: number;
    calling: number;
    /** Contacts called at least once. */
    called: number;
    answered: number;
    booked: number;
    unreached: number;
    failed: number;
    skipped: number;
    cancelled: number;
};

export type VoiceCampaignListItem = {
    id: string;
    name: string;
    status: VoiceCampaignStatus;
    agentId: string;
    agentName: string | null;
    numberId: string;
    phoneNumber: string | null;
    window: VoiceCampaignWindow;
    maxConcurrent: number;
    retry: VoiceCampaignRetry;
    defaultCountry: string;
    variableKeys: string[];
    lastError: string | null;
    stats: VoiceCampaignStats;
    createdAt: string;
    startedAt: string | null;
    completedAt: string | null;
};

export type VoiceCampaignContactItem = {
    id: string;
    row: number;
    phone: string;
    name: string | null;
    variables: Record<string, string>;
    status: VoiceCampaignContactStatus;
    attempts: number;
    nextAttemptAt: string | null;
    lastOutcome: string | null;
    lastError: string | null;
    lastCallId: string | null;
    booked: boolean;
};

export type VoiceCampaignContactFilter = 'all' | 'booked' | VoiceCampaignContactStatus;

export type VoiceCampaignDetail = {
    campaign: VoiceCampaignListItem;
    contacts: VoiceCampaignContactItem[];
    /** Contacts matching the filter (only the first CONTACTS_SHOWN are sent). */
    matching: number;
};

export type VoiceCampaignSetup = {
    agents: { id: string; name: string }[];
    numbers: { id: string; phoneNumber: string; provider: VoiceProvider }[];
};

export type VoiceCampaignSettingsInput = {
    name: string;
    agentId: string;
    numberId: string;
    window: VoiceCampaignWindow;
    maxConcurrent: number;
    retry: VoiceCampaignRetry;
    defaultCountry: string;
    variableKeys: string[];
};

export type AddCampaignContactsResult = {
    added: number;
    duplicates: number;
    invalid: { row: number; value: string; reason: string }[];
    total: number;
};

export type VoiceCampaignAction = 'start' | 'pause' | 'resume' | 'cancel';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function campaignsCollection() {
    return getCollection<VoiceCampaignDoc>(MongoCollections.VOICE_CAMPAIGNS);
}

async function contactsCollection() {
    return getCollection<VoiceCampaignContactDoc>(MongoCollections.VOICE_CAMPAIGN_CONTACTS);
}

const EMPTY_STATS: VoiceCampaignStats = {
    total: 0,
    pending: 0,
    calling: 0,
    called: 0,
    answered: 0,
    booked: 0,
    unreached: 0,
    failed: 0,
    skipped: 0,
    cancelled: 0,
};

const STATUS_STAT: Record<VoiceCampaignContactStatus, keyof VoiceCampaignStats> = {
    [VoiceCampaignContactStatus.PENDING]: 'pending',
    [VoiceCampaignContactStatus.CALLING]: 'calling',
    [VoiceCampaignContactStatus.ANSWERED]: 'answered',
    [VoiceCampaignContactStatus.UNREACHED]: 'unreached',
    [VoiceCampaignContactStatus.FAILED]: 'failed',
    [VoiceCampaignContactStatus.SKIPPED_DNC]: 'skipped',
    [VoiceCampaignContactStatus.CANCELLED]: 'cancelled',
};

/** Per campaign: contacts by status, called at least once, booked. */
async function statsByCampaign(ids: MongoObjectId[]): Promise<Map<string, VoiceCampaignStats>> {
    const out = new Map<string, VoiceCampaignStats>();
    if (ids.length === 0) return out;
    const contacts = await contactsCollection();
    const rows = await contacts
        .aggregate<{ _id: { campaignId: MongoObjectId; status: VoiceCampaignContactStatus }; n: number; called: number; booked: number }>([
            { $match: { campaignId: { $in: ids } } },
            {
                $group: {
                    _id: { campaignId: '$campaignId', status: '$status' },
                    n: { $sum: 1 },
                    called: { $sum: { $cond: [{ $gt: ['$attempts', 0] }, 1, 0] } },
                    booked: { $sum: { $cond: ['$booked', 1, 0] } },
                },
            },
        ])
        .toArray();
    for (const row of rows) {
        const key = row._id.campaignId.toString();
        const stats = out.get(key) ?? { ...EMPTY_STATS };
        stats.total += row.n;
        stats.called += row.called;
        stats.booked += row.booked;
        const field = STATUS_STAT[row._id.status];
        if (field) stats[field] += row.n;
        out.set(key, stats);
    }
    return out;
}

async function namesFor(docs: VoiceCampaignDoc[]) {
    const agents = await getCollection<VoiceAgentDoc>(MongoCollections.VOICE_AGENTS);
    const numbers = await getCollection<VoiceNumberDoc>(MongoCollections.VOICE_NUMBERS);
    const [agentDocs, numberDocs] = await Promise.all([
        agents.find({ _id: { $in: docs.map((d) => d.agentId) } }, { projection: { name: 1 } }).toArray(),
        numbers.find({ _id: { $in: docs.map((d) => d.numberId) } }, { projection: { phoneNumber: 1 } }).toArray(),
    ]);
    return {
        agent: new Map(agentDocs.map((d) => [d._id.toString(), d.name])),
        number: new Map(numberDocs.map((d) => [d._id.toString(), d.phoneNumber])),
    };
}

function mapCampaign(
    doc: VoiceCampaignDoc,
    stats: VoiceCampaignStats | undefined,
    names: Awaited<ReturnType<typeof namesFor>>,
): VoiceCampaignListItem {
    return {
        id: String(doc._id),
        name: doc.name,
        status: doc.status,
        agentId: doc.agentId.toString(),
        agentName: names.agent.get(doc.agentId.toString()) ?? null,
        numberId: doc.numberId.toString(),
        phoneNumber: names.number.get(doc.numberId.toString()) ?? null,
        window: doc.window,
        maxConcurrent: doc.maxConcurrent,
        retry: doc.retry,
        defaultCountry: doc.defaultCountry,
        variableKeys: doc.variableKeys ?? [],
        lastError: doc.lastError ?? null,
        stats: stats ?? { ...EMPTY_STATS },
        createdAt: doc.createdAt.toISOString(),
        startedAt: doc.startedAt ? doc.startedAt.toISOString() : null,
        completedAt: doc.completedAt ? doc.completedAt.toISOString() : null,
    };
}

function mapContact(doc: VoiceCampaignContactDoc): VoiceCampaignContactItem {
    return {
        id: String(doc._id),
        row: doc.row,
        phone: doc.phone,
        name: doc.name ?? null,
        variables: doc.variables ?? {},
        status: doc.status,
        attempts: doc.attempts ?? 0,
        nextAttemptAt: doc.nextAttemptAt ? doc.nextAttemptAt.toISOString() : null,
        lastOutcome: doc.lastOutcome ?? null,
        lastError: doc.lastError ?? null,
        lastCallId: doc.lastCallId ? doc.lastCallId.toString() : null,
        booked: !!doc.booked,
    };
}

async function findOwnedCampaign(owner: VoiceOwnerScope, campaignId: string): Promise<VoiceCampaignDoc & { _id: MongoObjectId }> {
    const campaigns = await campaignsCollection();
    const doc = await campaigns.findOne({ _id: toObjectId(campaignId, 'Campaign ID'), userId: owner.userId });
    if (!doc?._id) throw new Error('Campaign not found');
    return doc as VoiceCampaignDoc & { _id: MongoObjectId };
}

async function loadCampaignItem(owner: VoiceOwnerScope, doc: VoiceCampaignDoc & { _id: MongoObjectId }) {
    const [stats, names] = await Promise.all([statsByCampaign([doc._id]), namesFor([doc])]);
    return mapCampaign(doc, stats.get(doc._id.toString()), names);
}

function validTimezone(zone: string): boolean {
    try {
        new Intl.DateTimeFormat('en-US', { timeZone: zone });
        return true;
    } catch {
        return false;
    }
}

const minutesOf = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));

function parseSettings(input: VoiceCampaignSettingsInput) {
    const name = typeof input?.name === 'string' ? input.name.trim() : '';
    if (!name) throw new Error('Give the campaign a name');
    if (name.length > 80) throw new Error('Keep the name under 80 characters');
    assertValidObjectId(input.agentId, 'Agent ID');
    assertValidObjectId(input.numberId, 'Number ID');

    const w = input.window ?? ({} as VoiceCampaignWindow);
    const days = DAYS.filter((d) => Array.isArray(w.days) && w.days.includes(d));
    if (days.length === 0) throw new Error('Pick at least one calling day');
    if (!HHMM.test(w.start ?? '') || !HHMM.test(w.end ?? '') || w.start === '24:00')
        throw new Error('Calling hours must be times like 09:00');
    if (minutesOf(w.start) >= minutesOf(w.end)) throw new Error('Calling hours must end after they start');
    if (typeof w.timezone !== 'string' || !validTimezone(w.timezone)) throw new Error('Pick a valid timezone');

    const maxConcurrent = Math.trunc(Number(input.maxConcurrent));
    if (!(maxConcurrent >= 1 && maxConcurrent <= VOICE_CAMPAIGN_LIMITS.maxConcurrent))
        throw new Error(`Calls at once must be 1 to ${VOICE_CAMPAIGN_LIMITS.maxConcurrent}`);

    const r = input.retry ?? ({} as VoiceCampaignRetry);
    const maxRetries = Math.trunc(Number(r.maxRetries));
    if (!(maxRetries >= 0 && maxRetries <= VOICE_CAMPAIGN_LIMITS.maxRetries))
        throw new Error(`Retries must be 0 to ${VOICE_CAMPAIGN_LIMITS.maxRetries}`);
    const delayMinutes = Math.trunc(Number(r.delayMinutes));
    if (!(delayMinutes >= VOICE_CAMPAIGN_LIMITS.minRetryDelayMinutes && delayMinutes <= VOICE_CAMPAIGN_LIMITS.maxRetryDelayMinutes))
        throw new Error('Pick a delay between retries');
    const outcomes = Object.values(VoiceCampaignRetryOutcome);
    const on = outcomes.filter((o) => Array.isArray(r.on) && r.on.includes(o));
    if (maxRetries > 0 && on.length === 0) throw new Error('Pick what to retry: no answer, busy or voicemail');

    if (!campaignCountry(input.defaultCountry)) throw new Error('Pick the country for numbers without a +');
    const variableKeys = Array.isArray(input.variableKeys)
        ? [...new Set(input.variableKeys.filter((k) => typeof k === 'string' && VARIABLE_KEY_PATTERN.test(k)))].slice(
              0,
              VOICE_CAMPAIGN_LIMITS.maxVariables,
          )
        : [];

    return {
        name,
        window: { days, start: w.start, end: w.end, timezone: w.timezone },
        maxConcurrent,
        retry: { maxRetries, delayMinutes, on },
        defaultCountry: input.defaultCountry,
        variableKeys,
    };
}

async function findOutboundAgent(owner: VoiceOwnerScope, agentId: string) {
    const agents = await getCollection<VoiceAgentDoc>(MongoCollections.VOICE_AGENTS);
    const agent = await agents.findOne(
        { _id: toObjectId(agentId, 'Agent ID'), userId: owner.userId },
        { projection: { name: 1, callType: 1 } },
    );
    if (!agent) throw new Error('Agent not found');
    if ((agent.callType ?? VoiceAgentCallType.OUTBOUND) !== VoiceAgentCallType.OUTBOUND)
        throw new Error(`${agent.name} is an inbound agent. Pick an outbound agent to place the calls.`);
    return agent;
}

async function findOwnedNumber(owner: VoiceOwnerScope, numberId: string): Promise<OwnedNumberDoc> {
    const numbers = await getCollection<VoiceNumberDoc>(MongoCollections.VOICE_NUMBERS);
    const doc = await numbers.findOne({ _id: toObjectId(numberId, 'Number ID'), userId: owner.userId });
    if (!doc?._id) throw new Error('That number is no longer connected');
    return doc as OwnedNumberDoc;
}

/** Everything a running campaign needs before the engine may dial: the agent, the number ready at its provider, a Gemini key. */
async function assertReadyToCall(owner: VoiceOwnerScope, campaign: VoiceCampaignDoc) {
    await findOutboundAgent(owner, campaign.agentId.toString());
    const number = await findOwnedNumber(owner, campaign.numberId.toString());
    await assertGeminiKeySet(owner.userId);
    await (PROVIDERS[number.provider] ?? telnyxNumbers).prepareCall(number);
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/** The owner's outbound agents and numbers, for the create wizard. */
export const getVoiceCampaignSetup = async (): Promise<ALApiResponse<VoiceCampaignSetup>> =>
    runAuthenticatedAction(async function getVoiceCampaignSetup(userId) {
        const owner = await requireVoiceOwner(userId, SUB_MODULE);
        const agents = await getCollection<VoiceAgentDoc>(MongoCollections.VOICE_AGENTS);
        const numbers = await getCollection<VoiceNumberDoc>(MongoCollections.VOICE_NUMBERS);
        const [agentDocs, numberDocs] = await Promise.all([
            agents
                .find({ userId: owner.userId, callType: { $ne: VoiceAgentCallType.INBOUND } }, { projection: { name: 1 } })
                .sort({ name: 1 })
                .toArray(),
            numbers
                .find({ userId: owner.userId }, { projection: { phoneNumber: 1, provider: 1 } })
                .sort({ createdAt: -1 })
                .toArray(),
        ]);
        return {
            agents: agentDocs.map((d) => ({ id: d._id.toString(), name: d.name })),
            numbers: numberDocs.map((d) => ({ id: d._id.toString(), phoneNumber: d.phoneNumber, provider: d.provider })),
        };
    });

/** The owner's campaigns, newest first, with their progress. */
export const listMyCampaigns = async (): Promise<ALApiResponse<VoiceCampaignListItem[]>> =>
    runAuthenticatedAction(async function listMyCampaigns(userId) {
        const owner = await requireVoiceOwner(userId, SUB_MODULE);
        await ensureVoiceAgentIndexes();
        const campaigns = await campaignsCollection();
        const docs = await campaigns.find({ userId: owner.userId }).sort({ createdAt: -1 }).limit(200).toArray();
        const ids = docs.flatMap((d) => (d._id ? [d._id] : []));
        const [stats, names] = await Promise.all([statsByCampaign(ids), namesFor(docs)]);
        return docs.map((doc) => mapCampaign(doc, stats.get(String(doc._id)), names));
    });

/** One campaign, its progress, and its contacts (first CONTACTS_SHOWN matching `filter`, in CSV order). */
export const getVoiceCampaign = async (
    campaignId: string,
    filter: VoiceCampaignContactFilter = 'all',
): Promise<ALApiResponse<VoiceCampaignDetail>> => {
    assertValidObjectId(campaignId, 'Campaign ID');

    return runAuthenticatedAction(async function getVoiceCampaign(userId) {
        const owner = await requireVoiceOwner(userId, SUB_MODULE);
        const doc = await findOwnedCampaign(owner, campaignId);
        const contacts = await contactsCollection();
        const query =
            filter === 'booked'
                ? { campaignId: doc._id, booked: true }
                : filter !== 'all' && Object.values(VoiceCampaignContactStatus).includes(filter)
                  ? { campaignId: doc._id, status: filter }
                  : { campaignId: doc._id };
        const [campaign, rows, matching] = await Promise.all([
            loadCampaignItem(owner, doc),
            contacts.find(query).sort({ row: 1 }).limit(CONTACTS_SHOWN).toArray(),
            contacts.countDocuments(query),
        ]);
        return { campaign, contacts: rows.map(mapContact), matching };
    });
};

/** Saves a new campaign as a draft; its contacts follow with addVoiceCampaignContacts. */
export const createVoiceCampaign = async (input: VoiceCampaignSettingsInput): Promise<ALApiResponse<{ id: string }>> =>
    runAuthenticatedAction(async function createVoiceCampaign(userId) {
        const owner = await requireVoiceOwner(userId, SUB_MODULE);
        const settings = parseSettings(input);
        const agent = await findOutboundAgent(owner, input.agentId);
        const number = await findOwnedNumber(owner, input.numberId);
        await ensureVoiceAgentIndexes();
        const now = new Date();
        const campaigns = await campaignsCollection();
        const { insertedId } = await campaigns.insertOne({
            tenantId: owner.tenantId,
            userId: owner.userId,
            ...settings,
            agentId: agent._id,
            numberId: number._id,
            status: VoiceCampaignStatus.DRAFT,
            lastError: null,
            runner: null,
            startedAt: null,
            completedAt: null,
            createdAt: now,
            updatedAt: now,
        });
        return { id: insertedId.toString() };
    });

/**
 * Adds contacts to a draft (the wizard sends them CONTACTS_PER_REQUEST at a time). Phones are read
 * in the campaign's default country; repeats of a number already in the campaign are skipped.
 */
export const addVoiceCampaignContacts = async (
    campaignId: string,
    inputs: CampaignContactInput[],
): Promise<ALApiResponse<AddCampaignContactsResult>> => {
    assertValidObjectId(campaignId, 'Campaign ID');
    if (!Array.isArray(inputs) || inputs.length > CONTACTS_PER_REQUEST)
        throw new Error(`Send at most ${CONTACTS_PER_REQUEST} contacts at a time`);

    return runAuthenticatedAction(async function addVoiceCampaignContacts(userId) {
        const owner = await requireVoiceOwner(userId, SUB_MODULE);
        const doc = await findOwnedCampaign(owner, campaignId);
        if (doc.status !== VoiceCampaignStatus.DRAFT) throw new Error('Contacts can only be added before the campaign starts');
        const country = campaignCountry(doc.defaultCountry);
        if (!country) throw new Error('The campaign has no default country');

        const contacts = await contactsCollection();
        const existing = await contacts.countDocuments({ campaignId: doc._id });
        const clean = inputs.map((i) => ({
            row: Math.trunc(Number(i?.row)) || 0,
            phone: typeof i?.phone === 'string' ? i.phone.slice(0, 64) : '',
            name: typeof i?.name === 'string' ? i.name : null,
            variables:
                i?.variables && typeof i.variables === 'object'
                    ? Object.fromEntries(
                          Object.entries(i.variables).filter(([k]) => doc.variableKeys.includes(k)) as [string, string][],
                      )
                    : {},
        }));
        const checked = checkContacts(clean, country);
        if (existing + checked.contacts.length > VOICE_CAMPAIGN_LIMITS.maxContacts)
            throw new Error(`A campaign holds at most ${VOICE_CAMPAIGN_LIMITS.maxContacts.toLocaleString('en-US')} contacts`);

        const now = new Date();
        let added = 0;
        if (checked.contacts.length > 0) {
            try {
                const res = await contacts.insertMany(
                    checked.contacts.map((c) => ({
                        tenantId: owner.tenantId,
                        userId: owner.userId,
                        campaignId: doc._id,
                        phone: c.phone,
                        name: c.name,
                        variables: c.variables,
                        row: c.row,
                        status: VoiceCampaignContactStatus.PENDING,
                        attempts: 0,
                        nextAttemptAt: null,
                        lastOutcome: null,
                        lastError: null,
                        lastCallId: null,
                        callIds: [],
                        booked: false,
                        createdAt: now,
                        updatedAt: now,
                    })),
                    { ordered: false },
                );
                added = res.insertedCount;
            } catch (error) {
                // A number already in the campaign (an earlier batch): the rest still went in.
                if (!isMongoDuplicateKeyError(error)) throw error;
                added = (await contacts.countDocuments({ campaignId: doc._id })) - existing;
            }
        }
        await (await campaignsCollection()).updateOne({ _id: doc._id }, { $set: { updatedAt: now } });
        return {
            added,
            duplicates: checked.duplicates.length + (checked.contacts.length - added),
            invalid: checked.invalid,
            total: existing + added,
        };
    });
};

/**
 * start (DRAFT), pause (RUNNING), resume (PAUSED), cancel (DRAFT/RUNNING/PAUSED). Start and resume
 * check the agent, the number (its provider gets ready to place calls) and the Gemini key first.
 * The engine picks a RUNNING campaign up within seconds; pausing stops new calls at once, calls
 * already ringing finish.
 */
export const setVoiceCampaignStatus = async (
    campaignId: string,
    action: VoiceCampaignAction,
): Promise<ALApiResponse<VoiceCampaignListItem>> => {
    assertValidObjectId(campaignId, 'Campaign ID');

    return runAuthenticatedAction(async function setVoiceCampaignStatus(userId) {
        const owner = await requireVoiceOwner(userId, SUB_MODULE);
        const doc = await findOwnedCampaign(owner, campaignId);
        const campaigns = await campaignsCollection();
        const contacts = await contactsCollection();
        const now = new Date();
        const from: Record<VoiceCampaignAction, VoiceCampaignStatus[]> = {
            start: [VoiceCampaignStatus.DRAFT],
            pause: [VoiceCampaignStatus.RUNNING],
            resume: [VoiceCampaignStatus.PAUSED],
            cancel: [VoiceCampaignStatus.DRAFT, VoiceCampaignStatus.RUNNING, VoiceCampaignStatus.PAUSED],
        };
        if (!from[action]?.includes(doc.status)) throw new Error(`A ${doc.status.toLowerCase()} campaign cannot ${action}`);

        if (action === 'start' || action === 'resume') {
            if (action === 'start' && !(await contacts.countDocuments({ campaignId: doc._id }, { limit: 1 })))
                throw new Error('Add contacts before starting');
            await assertReadyToCall(owner, doc);
        }
        const set: Partial<VoiceCampaignDoc> = { updatedAt: now };
        if (action === 'start') Object.assign(set, { status: VoiceCampaignStatus.RUNNING, startedAt: now, lastError: null });
        if (action === 'resume') Object.assign(set, { status: VoiceCampaignStatus.RUNNING, lastError: null });
        if (action === 'pause') Object.assign(set, { status: VoiceCampaignStatus.PAUSED });
        if (action === 'cancel') Object.assign(set, { status: VoiceCampaignStatus.CANCELLED, completedAt: now, runner: null });

        const updated = await campaigns.findOneAndUpdate(
            { _id: doc._id, userId: owner.userId, status: doc.status },
            { $set: set },
            { returnDocument: 'after' },
        );
        if (!updated?._id) throw new Error('The campaign changed meanwhile. Reload and try again.');
        if (action === 'cancel') {
            await contacts.updateMany(
                { campaignId: doc._id, status: VoiceCampaignContactStatus.PENDING },
                { $set: { status: VoiceCampaignContactStatus.CANCELLED, nextAttemptAt: null, finishedAt: now, updatedAt: now } },
            );
        }
        return loadCampaignItem(owner, updated as VoiceCampaignDoc & { _id: MongoObjectId });
    });
};

/** Deletes a campaign that is not running (draft, completed, cancelled) and its contacts. Its call logs stay. */
export const deleteVoiceCampaign = async (campaignId: string): Promise<ALApiResponse<{ id: string }>> => {
    assertValidObjectId(campaignId, 'Campaign ID');

    return runAuthenticatedAction(async function deleteVoiceCampaign(userId) {
        const owner = await requireVoiceOwner(userId, SUB_MODULE);
        const doc = await findOwnedCampaign(owner, campaignId);
        if (doc.status === VoiceCampaignStatus.RUNNING || doc.status === VoiceCampaignStatus.PAUSED)
            throw new Error('Cancel the campaign before deleting it');
        const contacts = await contactsCollection();
        if (await contacts.countDocuments({ campaignId: doc._id, status: VoiceCampaignContactStatus.CALLING }, { limit: 1 }))
            throw new Error('A call is still in progress. Try again when it ends.');
        await contacts.deleteMany({ campaignId: doc._id });
        await (await campaignsCollection()).deleteOne({ _id: doc._id, userId: owner.userId });
        return { id: campaignId };
    });
};
