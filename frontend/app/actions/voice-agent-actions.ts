'use server';

import { randomBytes } from 'node:crypto';
import {
    getCollection,
    MongoCollections,
    MongoObjectId,
    type VoiceAgent,
    type VoiceAgentDoc,
    type VoiceCallerMemoryDoc,
    type VoiceNumberDoc,
} from '@aixellabs/backend/db';
import {
    VOICE_AGENT_SUB_MODULES,
    VOICE_WEBHOOK_LIMITS,
    type VoiceAgentBookingTool,
    VoiceAgentCallType,
    type VoiceAgentTools,
    type VoiceAgentToolsView,
    type VoiceAgentWebhookTool,
    VoiceCallChannel,
    VoiceCallDirection,
} from '@aixellabs/backend/db/types';
import { ALApiResponse } from '@aixellabs/backend/api/types';
import { requireUserObjectId, runAuthenticatedAction, toObjectId } from '@/helpers/server-action-helpers';
import { DEFAULT_VOICE_AGENT_NAME, DEFAULT_VOICE_AGENT_VOICE, voiceAgentDefaults } from '@/helpers/voice-agent-defaults';
import { customVariableNames } from '@/helpers/voice-agent-features';
import {
    bookingToolSchema,
    callSettingsSchema,
    parseOrThrow,
    type VoiceAgentBookingInput,
    type VoiceAgentCallSettingsInput,
    type VoiceAgentInput,
    voiceAgentSchema,
    type VoiceWebhookSecretInput,
    type VoiceWebhookTestInput,
    type VoiceWebhookToolInput,
    webhookTestSchema,
    webhookToolSchema,
} from '@/helpers/voice-schemas';
import { openSecret, playgroundSocketUrl, sealSecret } from '@/server/voice-agent/engine';
import { assertGeminiKeySet } from '@/server/voice-agent/gemini-key';
import { ensureVoiceAgentIndexes } from '@/server/voice-agent/indexes';
import { assertUsableDestination } from '@/server/voice-agent/calendar-connections';
import { requireVoiceOwner } from '@/server/voice-agent/owner-scope';
import { parseWebhookUrl } from '@/server/voice-agent/public-url';
import { sampleArguments, sendWebhookTest, type VoiceWebhookTestResult } from '@/server/voice-agent/webhook-test';

export type { VoiceWebhookTestResult };

/** A `{{variable}}` an agent uses (prompt, call notes, voicemail message) and its default value ('' = none). */
export type VoiceAgentVariableOption = { name: string; value: string };

export type VoiceAgentOption = {
    id: string;
    name: string;
    callType: VoiceAgentCallType;
    /** Its custom variables, for a test call to fill in. */
    variables: VoiceAgentVariableOption[];
};

/** A number that uses the agent, for the editor's "Used on" list. */
export type VoiceAgentNumberUse = { id: string; phoneNumber: string };

/** The user's numbers that send incoming calls to the agent, and those that place calls with it. */
export type VoiceAgentUsage = { inbound: VoiceAgentNumberUse[]; outbound: VoiceAgentNumberUse[] };

/** The signed-in owner, after checking they were granted the Agents page (writes only; reads filter by owner). */
const agentOwner = (userId: string) => requireVoiceOwner(userId, VOICE_AGENT_SUB_MODULES.AGENTS);

/** Agents saved before call types existed were all cold-callers. */
function callTypeOf(doc: Pick<VoiceAgentDoc, 'callType'>): VoiceAgentCallType {
    return doc.callType ?? VoiceAgentCallType.OUTBOUND;
}

/** The client view of an agent's tools: secrets become `hasSecret`, field by field so nothing else slips through. */
function mapVoiceAgentTools(tools: VoiceAgentTools | null | undefined): VoiceAgentToolsView {
    const booking = tools?.booking;
    return {
        booking: booking
            ? {
                  enabled: booking.enabled,
                  timezone: booking.timezone,
                  slotMinutes: booking.slotMinutes,
                  maxDaysAhead: booking.maxDaysAhead,
                  hours: booking.hours ?? {},
                  destination: booking.destination
                      ? {
                            provider: booking.destination.provider,
                            connectedAccountId: booking.destination.connectedAccountId,
                            calendarId: booking.destination.calendarId,
                            calendarName: booking.destination.calendarName,
                        }
                      : null,
              }
            : null,
        webhooks: (tools?.webhooks ?? []).map((tool) => ({
            id: tool.id,
            name: tool.name,
            description: tool.description,
            parameters: (tool.parameters ?? []).map((p) => ({
                name: p.name,
                type: p.type,
                description: p.description,
                required: p.required,
            })),
            url: tool.url,
            enabled: tool.enabled,
            hasSecret: !!tool.secretSealed,
        })),
    };
}

function mapVoiceAgentDocToVoiceAgent(doc: VoiceAgentDoc): VoiceAgent {
    return {
        _id: doc._id?.toString(),
        tenantId: doc.tenantId.toString(),
        userId: doc.userId.toString(),
        name: doc.name,
        callType: callTypeOf(doc),
        voice: doc.voice,
        prompt: doc.prompt,
        callNotes: doc.callNotes,
        tools: mapVoiceAgentTools(doc.tools),
        variables: doc.variables ?? {},
        voicemail: doc.voicemail ?? null,
        analysis: doc.analysis ?? null,
        memory: doc.memory === true,
        createdAt: doc.createdAt.toISOString(),
        updatedAt: doc.updatedAt.toISOString(),
    };
}

async function agentsCollection() {
    await ensureVoiceAgentIndexes();
    return getCollection<VoiceAgentDoc>(MongoCollections.VOICE_AGENTS);
}

/** Agents the signed-in user owns, most recently edited first. */
export const listVoiceAgents = async (): Promise<ALApiResponse<VoiceAgent[]>> =>
    runAuthenticatedAction(async function listVoiceAgents(userId) {
        const uid = requireUserObjectId(userId);
        const agents = await agentsCollection();
        const docs = await agents.find({ userId: uid }).sort({ updatedAt: -1 }).toArray();
        return docs.map(mapVoiceAgentDocToVoiceAgent);
    });

/**
 * `{ id, name, callType, variables }` for every agent the user owns, for pickers (Phone Numbers filters
 * by type; its test call fills in the variables).
 */
export const getVoiceAgentOptions = async (): Promise<ALApiResponse<VoiceAgentOption[]>> =>
    runAuthenticatedAction(async function getVoiceAgentOptions(userId) {
        const uid = requireUserObjectId(userId);
        const agents = await agentsCollection();
        const docs = await agents
            .find(
                { userId: uid },
                { projection: { name: 1, callType: 1, prompt: 1, callNotes: 1, variables: 1, 'voicemail.message': 1 } },
            )
            .sort({ name: 1 })
            .toArray();
        return docs.map((doc) => ({
            id: doc._id.toString(),
            name: doc.name,
            callType: callTypeOf(doc),
            variables: customVariableNames(doc.prompt ?? '', doc.callNotes ?? '', doc.voicemail?.message ?? '').map(
                (name) => ({ name, value: doc.variables?.[name] ?? '' }),
            ),
        }));
    });

export const getVoiceAgent = async (agentId: string): Promise<ALApiResponse<VoiceAgent>> =>
    runAuthenticatedAction(async function getVoiceAgent(userId) {
        const uid = requireUserObjectId(userId);
        const agents = await agentsCollection();
        const doc = await agents.findOne({ _id: toObjectId(agentId, 'Agent ID'), userId: uid });
        if (!doc) throw new Error('Agent not found');
        return mapVoiceAgentDocToVoiceAgent(doc);
    });

export type CreateVoiceAgentInput = Partial<Omit<VoiceAgentInput, 'callType'>> & { callType: VoiceAgentCallType };

/**
 * Creates an agent of the given call type; anything not given starts from that type's defaults
 * (inbound: the receptionist prompt; outbound: the call-tested cold-call prompt).
 */
export const createVoiceAgent = async (input: CreateVoiceAgentInput): Promise<ALApiResponse<VoiceAgent>> =>
    runAuthenticatedAction(async function createVoiceAgent(userId) {
        const { userId: uid, tenantId } = await agentOwner(userId);
        const defaults = voiceAgentDefaults(input.callType);
        const fields = parseOrThrow(
            voiceAgentSchema,
            {
                name: input.name ?? DEFAULT_VOICE_AGENT_NAME,
                callType: input.callType,
                voice: input.voice ?? DEFAULT_VOICE_AGENT_VOICE,
                prompt: input.prompt ?? defaults.prompt,
                callNotes: input.callNotes ?? defaults.callNotes,
                variables: input.variables ?? {},
            },
            'Invalid agent',
        );

        const now = new Date();
        const doc: VoiceAgentDoc = { tenantId, userId: uid, ...fields, createdAt: now, updatedAt: now };
        const agents = await agentsCollection();
        const { insertedId } = await agents.insertOne(doc);
        return mapVoiceAgentDocToVoiceAgent({ ...doc, _id: insertedId });
    });

export const updateVoiceAgent = async (agentId: string, input: VoiceAgentInput): Promise<ALApiResponse<VoiceAgent>> =>
    runAuthenticatedAction(async function updateVoiceAgent(userId) {
        const { userId: uid } = await agentOwner(userId);
        const id = toObjectId(agentId, 'Agent ID');
        const fields = parseOrThrow(voiceAgentSchema, input, 'Invalid agent');

        const agents = await agentsCollection();
        const doc = await agents.findOneAndUpdate(
            { _id: id, userId: uid },
            { $set: { ...fields, updatedAt: new Date() } },
            { returnDocument: 'after' },
        );
        if (!doc) throw new Error('Agent not found');
        return mapVoiceAgentDocToVoiceAgent(doc);
    });

/**
 * The user's numbers that use this agent: for calls coming in (`inboundAgentId`) and for calls
 * placed from them (`outboundAgentId`). A number can appear in both lists.
 */
export const getVoiceAgentUsage = async (agentId: string): Promise<ALApiResponse<VoiceAgentUsage>> =>
    runAuthenticatedAction(async function getVoiceAgentUsage(userId) {
        const uid = requireUserObjectId(userId);
        const id = toObjectId(agentId, 'Agent ID');
        const numbers = await getCollection<VoiceNumberDoc>(MongoCollections.VOICE_NUMBERS);
        const docs = await numbers
            .find(
                { userId: uid, $or: [{ inboundAgentId: id }, { outboundAgentId: id }] },
                { projection: { phoneNumber: 1, inboundAgentId: 1, outboundAgentId: 1 } },
            )
            .sort({ phoneNumber: 1 })
            .toArray();
        const use = (doc: (typeof docs)[number]): VoiceAgentNumberUse => ({
            id: doc._id.toString(),
            phoneNumber: doc.phoneNumber,
        });
        return {
            inbound: docs.filter((doc) => doc.inboundAgentId?.equals(id)).map(use),
            outbound: docs.filter((doc) => doc.outboundAgentId?.equals(id)).map(use),
        };
    });

/** Deletes the agent and takes it off the user's numbers, both directions. Past call logs keep their `agentId`. */
export const deleteVoiceAgent = async (agentId: string): Promise<ALApiResponse<{ id: string }>> =>
    runAuthenticatedAction(async function deleteVoiceAgent(userId) {
        const { userId: uid } = await agentOwner(userId);
        const id = toObjectId(agentId, 'Agent ID');

        const agents = await agentsCollection();
        const numbers = await getCollection<VoiceNumberDoc>(MongoCollections.VOICE_NUMBERS);

        // A number answered by this agent is pointed at the engine in its provider account (Telnyx:
        // our TeXML app; VoiceLink: our bot; Twilio: its Voice URL). Dropping the agent here would
        // leave its callers ringing into nothing, so AI answering must be turned off first (that also
        // puts the number's own routing back).
        const answering = await numbers
            .find({ userId: uid, inboundAgentId: id }, { projection: { phoneNumber: 1 } })
            .toArray();
        if (answering.length > 0) {
            const list = answering.map((n) => n.phoneNumber).join(', ');
            throw new Error(`This agent answers calls on ${list}. Turn AI answering off there first, then delete it.`);
        }

        const { deletedCount } = await agents.deleteOne({ _id: id, userId: uid });
        if (deletedCount === 0) throw new Error('Agent not found');

        await numbers.updateMany(
            { userId: uid, outboundAgentId: id },
            { $set: { outboundAgentId: null, updatedAt: new Date() } },
        );
        // What it remembered about callers goes with it (call logs stay).
        const memories = await getCollection<VoiceCallerMemoryDoc>(MongoCollections.VOICE_CALLER_MEMORIES);
        await memories.deleteMany({ userId: uid, agentId: id });

        return { id: agentId };
    });

/**
 * A signed `wss://…/play` URL for talking to the agent's saved version in the browser.
 * The token lives 120 s, so fetch it right before opening the socket. The call runs on the
 * owner's own Gemini key, so there is no URL without one.
 */
export const getPlaygroundSocketUrl = async (agentId: string): Promise<ALApiResponse<{ url: string }>> =>
    runAuthenticatedAction(async function getPlaygroundSocketUrl(userId) {
        const { userId: uid } = await agentOwner(userId);
        const id = toObjectId(agentId, 'Agent ID');
        const agents = await agentsCollection();
        const owned = await agents.countDocuments({ _id: id, userId: uid }, { limit: 1 });
        if (!owned) throw new Error('Agent not found');
        await assertGeminiKeySet(uid);
        return { url: playgroundSocketUrl(id.toString(), uid.toString()) };
    });

// ---------------------------------------------------------------------------
// Call settings: voicemail message, post-call analysis, caller memory. Read by the engine per call.
// ---------------------------------------------------------------------------

/** Saves what the agent does on a voicemail, what is worked out after each call, and whether it remembers callers. */
export const saveVoiceAgentCallSettings = async (
    agentId: string,
    input: VoiceAgentCallSettingsInput,
): Promise<ALApiResponse<VoiceAgent>> =>
    runAuthenticatedAction(async function saveVoiceAgentCallSettings(userId) {
        const { userId: uid } = await agentOwner(userId);
        const settings = parseOrThrow(callSettingsSchema, input, 'Check the call settings');
        const agents = await agentsCollection();
        const doc = await agents.findOneAndUpdate(
            { _id: toObjectId(agentId, 'Agent ID'), userId: uid },
            { $set: { ...settings, updatedAt: new Date() } },
            { returnDocument: 'after' },
        );
        if (!doc) throw new Error('Agent not found');
        return mapVoiceAgentDocToVoiceAgent(doc);
    });

// ---------------------------------------------------------------------------
// Tools: appointment booking and custom webhook tools. The engine reads them from the agent
// doc on every call, so a save here applies from the next call on.
// ---------------------------------------------------------------------------

function newToolId(): string {
    return randomBytes(8).toString('hex');
}

type OwnedAgentDoc = VoiceAgentDoc & { _id: MongoObjectId };

async function findOwnedAgent(uid: MongoObjectId, agentId: string): Promise<OwnedAgentDoc> {
    const agents = await agentsCollection();
    const doc = await agents.findOne({ _id: toObjectId(agentId, 'Agent ID'), userId: uid });
    if (!doc) throw new Error('Agent not found');
    return doc as OwnedAgentDoc;
}

/** Writes the whole `tools` object (a legacy `tools: null` cannot take a dotted $set). */
async function saveTools(doc: OwnedAgentDoc, tools: VoiceAgentTools): Promise<VoiceAgent> {
    const agents = await agentsCollection();
    const updated = await agents.findOneAndUpdate(
        { _id: doc._id, userId: doc.userId },
        { $set: { tools, updatedAt: new Date() } },
        { returnDocument: 'after' },
    );
    if (!updated) throw new Error('Agent not found');
    return mapVoiceAgentDocToVoiceAgent(updated);
}

function currentTools(doc: VoiceAgentDoc): Required<VoiceAgentTools> {
    return { booking: doc.tools?.booking ?? null, webhooks: doc.tools?.webhooks ?? [] };
}

/** Turns booking on or off and saves its hours, timezone, appointment length and how far ahead. */
export const saveVoiceAgentBooking = async (
    agentId: string,
    input: VoiceAgentBookingInput,
): Promise<ALApiResponse<VoiceAgent>> =>
    runAuthenticatedAction(async function saveVoiceAgentBooking(userId) {
        const { userId: uid } = await agentOwner(userId);
        const { destination, hours, ...rules } = parseOrThrow(bookingToolSchema, input, 'Check the booking settings');
        const booking: VoiceAgentBookingTool = {
            ...rules,
            // Open days only (a closed day is absent).
            hours: Object.fromEntries(Object.entries(hours).filter(([, day]) => day)),
            // Absent = the built-in calendar, as before destinations existed.
            ...(destination ? { destination } : {}),
        };
        if (booking.destination) await assertUsableDestination(uid, booking.destination);
        const doc = await findOwnedAgent(uid, agentId);
        return saveTools(doc, { ...currentTools(doc), booking });
    });

function parseWebhookTool(input: unknown, others: VoiceAgentWebhookTool[]) {
    const tool = parseOrThrow(webhookToolSchema, input, 'Check the tool');
    const url = parseWebhookUrl(tool.url).toString();
    if (others.some((t) => t.name === tool.name)) {
        throw new Error(`This agent already has a tool called ${tool.name}`);
    }
    return { ...tool, url };
}

function sealedSecretFor(secret: VoiceWebhookSecretInput, existing: string | null | undefined): string | null {
    if (secret.action === 'set') return sealSecret(secret.value.trim());
    if (secret.action === 'clear') return null;
    return existing ?? null;
}

export const createVoiceAgentWebhookTool = async (
    agentId: string,
    input: VoiceWebhookToolInput,
): Promise<ALApiResponse<VoiceAgent>> =>
    runAuthenticatedAction(async function createVoiceAgentWebhookTool(userId) {
        const { userId: uid } = await agentOwner(userId);
        const doc = await findOwnedAgent(uid, agentId);
        const tools = currentTools(doc);
        if (tools.webhooks.length >= VOICE_WEBHOOK_LIMITS.maxTools) {
            throw new Error(`An agent can have up to ${VOICE_WEBHOOK_LIMITS.maxTools} custom tools`);
        }
        const fields = parseWebhookTool(input, tools.webhooks);
        const tool: VoiceAgentWebhookTool = {
            id: newToolId(),
            name: fields.name,
            description: fields.description,
            parameters: fields.parameters,
            url: fields.url,
            secretSealed: sealedSecretFor(fields.secret, null),
            enabled: fields.enabled,
        };
        return saveTools(doc, { ...tools, webhooks: [...tools.webhooks, tool] });
    });

export const updateVoiceAgentWebhookTool = async (
    agentId: string,
    toolId: string,
    input: VoiceWebhookToolInput,
): Promise<ALApiResponse<VoiceAgent>> =>
    runAuthenticatedAction(async function updateVoiceAgentWebhookTool(userId) {
        const { userId: uid } = await agentOwner(userId);
        const doc = await findOwnedAgent(uid, agentId);
        const tools = currentTools(doc);
        const existing = tools.webhooks.find((t) => t.id === toolId);
        if (!existing) throw new Error('That tool was deleted. Reload the page.');
        const fields = parseWebhookTool(
            input,
            tools.webhooks.filter((t) => t.id !== toolId),
        );
        const tool: VoiceAgentWebhookTool = {
            id: existing.id,
            name: fields.name,
            description: fields.description,
            parameters: fields.parameters,
            url: fields.url,
            secretSealed: sealedSecretFor(fields.secret, existing.secretSealed),
            enabled: fields.enabled,
        };
        return saveTools(doc, { ...tools, webhooks: tools.webhooks.map((t) => (t.id === toolId ? tool : t)) });
    });

export const deleteVoiceAgentWebhookTool = async (agentId: string, toolId: string): Promise<ALApiResponse<VoiceAgent>> =>
    runAuthenticatedAction(async function deleteVoiceAgentWebhookTool(userId) {
        const { userId: uid } = await agentOwner(userId);
        const doc = await findOwnedAgent(uid, agentId);
        const tools = currentTools(doc);
        if (!tools.webhooks.some((t) => t.id === toolId)) throw new Error('That tool was already deleted');
        return saveTools(doc, { ...tools, webhooks: tools.webhooks.filter((t) => t.id !== toolId) });
    });

export const setVoiceAgentWebhookToolEnabled = async (
    agentId: string,
    toolId: string,
    enabled: boolean,
): Promise<ALApiResponse<VoiceAgent>> =>
    runAuthenticatedAction(async function setVoiceAgentWebhookToolEnabled(userId) {
        if (typeof enabled !== 'boolean') throw new Error('Turn the tool on or off');
        const { userId: uid } = await agentOwner(userId);
        const doc = await findOwnedAgent(uid, agentId);
        const tools = currentTools(doc);
        if (!tools.webhooks.some((t) => t.id === toolId)) throw new Error('That tool was deleted. Reload the page.');
        return saveTools(doc, {
            ...tools,
            webhooks: tools.webhooks.map((t) => (t.id === toolId ? { ...t, enabled } : t)),
        });
    });

/**
 * Sends one request the way the engine calls the tool mid-call: the same JSON body shape, headers,
 * signature and 8 s limit, with example arguments and a made-up call id. Tests what is in the dialog,
 * saved or not; `toolId` lets an unchanged secret be used without the browser ever seeing it.
 */
export const sendVoiceAgentWebhookTest = async (
    agentId: string,
    input: { toolId: string | null; tool: VoiceWebhookTestInput },
): Promise<ALApiResponse<VoiceWebhookTestResult>> =>
    runAuthenticatedAction(async function sendVoiceAgentWebhookTest(userId) {
        const { userId: uid } = await agentOwner(userId);
        const tool = parseOrThrow(webhookTestSchema, input?.tool, 'Check the tool');
        const url = parseWebhookUrl(tool.url);
        const doc = await findOwnedAgent(uid, agentId);

        let secret: string | null = null;
        if (tool.secret.action === 'set') {
            secret = tool.secret.value.trim();
        } else if (tool.secret.action === 'keep' && input.toolId) {
            const sealed = currentTools(doc).webhooks.find((t) => t.id === input.toolId)?.secretSealed;
            secret = sealed ? openSecret(sealed) : null;
        }

        return sendWebhookTest(
            url,
            {
                tool: tool.name,
                arguments: sampleArguments(tool.parameters),
                call: {
                    id: new MongoObjectId().toString(),
                    agentId: doc._id.toString(),
                    channel: VoiceCallChannel.PLAYGROUND,
                    direction: VoiceCallDirection.PLAYGROUND,
                    from: null,
                    to: null,
                },
            },
            secret,
        );
    });
