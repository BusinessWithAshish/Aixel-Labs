'use server';

import { createHmac, randomBytes } from 'node:crypto';
import { lookup as dnsLookup } from 'node:dns/promises';
import { request as httpRequest, type IncomingMessage } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isIP, type LookupFunction } from 'node:net';
import { z } from 'zod';
import {
    getCollection,
    MongoCollections,
    MongoObjectId,
    type UserDoc,
    type VoiceAgent,
    type VoiceAgentDoc,
    type VoiceCallerMemoryDoc,
    type VoiceNumberDoc,
} from '@aixellabs/backend/db';
import {
    VOICE_AGENT_FEATURE_LIMITS,
    VOICE_AGENT_VOICES,
    VoiceAgentCallType,
    VoiceCallChannel,
    VoiceCallDirection,
    VoiceCalendarProvider,
    VoiceVoicemailAction,
    type VoiceAgentAnalysis,
    type VoiceAgentBookingTool,
    type VoiceAgentTools,
    type VoiceAgentToolsView,
    type VoiceAgentVoice,
    type VoiceAgentVoicemail,
    type VoiceAgentWebhookTool,
    type VoiceBookingHours,
    type VoiceWebhookParam,
} from '@aixellabs/backend/db/types';
import { ALApiResponse } from '@aixellabs/backend/api/types';
import { requireUserObjectId, runAuthenticatedAction, toObjectId } from '@/helpers/server-action-helpers';
import {
    DEFAULT_VOICE_AGENT_NAME,
    DEFAULT_VOICE_AGENT_VOICE,
    VOICE_BOOKING_DAYS,
    VOICE_BOOKING_LIMITS,
    VOICE_BOOKING_TIME_PATTERN,
    VOICE_RESERVED_TOOL_NAMES,
    VOICE_TOOL_NAME_PATTERN,
    VOICE_TOOL_PARAM_NAME_PATTERN,
    VOICE_WEBHOOK_LIMITS,
    voiceAgentDefaults,
    voiceBookingMinutes,
} from '@/helpers/voice-agent-defaults';
import { customVariableNames, isBuiltinVariable, VOICE_VARIABLE_NAME_PATTERN } from '@/helpers/voice-agent-features';
import { openSecret, playgroundSocketUrl, sealSecret } from '@/server/voice-agent/engine';
import { assertGeminiKeySet } from '@/server/voice-agent/gemini-key';
import { ensureVoiceAgentIndexes } from '@/server/voice-agent/indexes';
import { assertUsableDestination } from '@/server/voice-agent/calendar-connections';

export type VoiceAgentInput = {
    name: string;
    callType: VoiceAgentCallType;
    voice: VoiceAgentVoice;
    prompt: string;
    callNotes: string;
    /** Default values for the prompt's `{{variables}}` (empty ones are not kept). */
    variables: Record<string, string>;
};

/** How the agent behaves around a call: on voicemail, after it (analysis), and from one call to the next (memory). */
export type VoiceAgentCallSettingsInput = {
    voicemail: VoiceAgentVoicemail;
    analysis: VoiceAgentAnalysis;
    memory: boolean;
};

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

const VOICE_KEYS = Object.keys(VOICE_AGENT_VOICES) as [VoiceAgentVoice, ...VoiceAgentVoice[]];

const LIMITS = VOICE_AGENT_FEATURE_LIMITS;

/** Variable values by name: well-formed names, not a built-in, empty values dropped. */
const variableValuesSchema = z
    .record(
        z
            .string()
            .regex(
                VOICE_VARIABLE_NAME_PATTERN,
                'Variable names are lowercase letters, numbers and _, starting with a letter',
            )
            .refine((name) => !isBuiltinVariable(name), 'Built-in variables get their value on each call'),
        z.string().max(LIMITS.maxVariableLength, `Variable values are up to ${LIMITS.maxVariableLength} characters`),
    )
    .optional()
    .transform((values = {}): Record<string, string> =>
        Object.fromEntries(Object.entries(values).flatMap(([k, v]) => (v?.trim() ? [[k, v.trim()]] : []))),
    )
    .refine(
        (values) => Object.keys(values).length <= LIMITS.maxVariables,
        `Up to ${LIMITS.maxVariables} variables have default values`,
    );

const voiceAgentInputSchema = z.object({
    name: z.string().trim().min(1, 'Name is required').max(80, 'Name must be 80 characters or fewer'),
    callType: z.nativeEnum(VoiceAgentCallType, { errorMap: () => ({ message: 'Pick inbound or outbound' }) }),
    voice: z.enum(VOICE_KEYS, { errorMap: () => ({ message: 'Pick one of the listed voices' }) }),
    prompt: z.string().trim().min(1, 'Prompt is required').max(50_000, 'Prompt must be 50,000 characters or fewer'),
    callNotes: z.string().trim().max(4_000, 'Call notes must be 4,000 characters or fewer'),
    variables: variableValuesSchema,
});

function parseInput(input: unknown): VoiceAgentInput {
    const parsed = voiceAgentInputSchema.safeParse(input);
    if (!parsed.success) {
        throw new Error(parsed.error.issues[0]?.message ?? 'Invalid agent');
    }
    return parsed.data;
}

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

/** The caller's tenant, from their membership (the session only carries the tenant slug). */
async function getUserTenantObjectId(uid: MongoObjectId): Promise<MongoObjectId> {
    const users = await getCollection<UserDoc>(MongoCollections.USERS);
    const user = await users.findOne({ _id: uid }, { projection: { tenantId: 1 } });
    if (!user?.tenantId) {
        throw new Error('Your account has no workspace');
    }
    return user.tenantId;
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
        const uid = requireUserObjectId(userId);
        const defaults = voiceAgentDefaults(input.callType);
        const fields = parseInput({
            name: input.name ?? DEFAULT_VOICE_AGENT_NAME,
            callType: input.callType,
            voice: input.voice ?? DEFAULT_VOICE_AGENT_VOICE,
            prompt: input.prompt ?? defaults.prompt,
            callNotes: input.callNotes ?? defaults.callNotes,
            variables: input.variables ?? {},
        });
        const tenantId = await getUserTenantObjectId(uid);

        const now = new Date();
        const doc: VoiceAgentDoc = { tenantId, userId: uid, ...fields, createdAt: now, updatedAt: now };
        const agents = await agentsCollection();
        const { insertedId } = await agents.insertOne(doc);
        return mapVoiceAgentDocToVoiceAgent({ ...doc, _id: insertedId });
    });

export const updateVoiceAgent = async (agentId: string, input: VoiceAgentInput): Promise<ALApiResponse<VoiceAgent>> =>
    runAuthenticatedAction(async function updateVoiceAgent(userId) {
        const uid = requireUserObjectId(userId);
        const id = toObjectId(agentId, 'Agent ID');
        const fields = parseInput(input);

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
        const uid = requireUserObjectId(userId);
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
        const uid = requireUserObjectId(userId);
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

const voicemailSchema = z
    .object({
        action: z.nativeEnum(VoiceVoicemailAction, { errorMap: () => ({ message: 'Pick what to do on a voicemail' }) }),
        message: z
            .string()
            .trim()
            .max(
                LIMITS.voicemailMessageMax,
                `The voicemail message is up to ${LIMITS.voicemailMessageMax} characters (about 30 seconds)`,
            ),
    })
    .strict()
    .refine((vm) => vm.action !== VoiceVoicemailAction.MESSAGE || vm.message.length > 0, 'Write the message to leave');

const analysisFieldSchema = z
    .object({
        name: z
            .string()
            .trim()
            .regex(
                VOICE_VARIABLE_NAME_PATTERN,
                'Field names are lowercase letters, numbers and _, starting with a letter (like budget)',
            ),
        type: z.enum(['boolean', 'text', 'number', 'choice'], { errorMap: () => ({ message: 'Pick a field type' }) }),
        description: z
            .string()
            .trim()
            .min(1, 'Say what each field means')
            .max(LIMITS.analysisDescriptionMax, `Field descriptions are up to ${LIMITS.analysisDescriptionMax} characters`),
        options: z
            .array(
                z
                    .string()
                    .trim()
                    .min(1, 'Choices cannot be empty')
                    .max(LIMITS.choiceOptionMax, `Choices are up to ${LIMITS.choiceOptionMax} characters`),
            )
            .max(LIMITS.maxChoiceOptions, `A choice field has up to ${LIMITS.maxChoiceOptions} answers`)
            .optional(),
    })
    .strict()
    .superRefine((field, ctx) => {
        const options = field.options ?? [];
        if (field.type === 'choice' && options.length < 2) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Give ${field.name} at least two answers to choose from` });
        }
        if (new Set(options.map((o) => o.toLowerCase())).size !== options.length) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${field.name} lists the same answer twice` });
        }
    })
    .transform(({ options, ...field }) => (field.type === 'choice' ? { ...field, options } : field));

const analysisSchema = z
    .object({
        summary: z.boolean(),
        sentiment: z.boolean(),
        success: z.boolean(),
        successDefinition: z
            .string()
            .trim()
            .max(
                LIMITS.successDefinitionMax,
                `The definition of success is up to ${LIMITS.successDefinitionMax} characters`,
            ),
        fields: z
            .array(analysisFieldSchema)
            .max(LIMITS.maxAnalysisFields, `Up to ${LIMITS.maxAnalysisFields} custom fields`),
    })
    .strict()
    .superRefine((analysis, ctx) => {
        if (analysis.success && !analysis.successDefinition) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Say what makes a call successful' });
        }
        const names = analysis.fields.map((f) => f.name);
        const twice = names.find((name, i) => names.indexOf(name) !== i);
        if (twice) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `There are two fields called ${twice}` });
    });

const callSettingsSchema = z.object({ voicemail: voicemailSchema, analysis: analysisSchema, memory: z.boolean() }).strict();

/** Saves what the agent does on a voicemail, what is worked out after each call, and whether it remembers callers. */
export const saveVoiceAgentCallSettings = async (
    agentId: string,
    input: VoiceAgentCallSettingsInput,
): Promise<ALApiResponse<VoiceAgent>> =>
    runAuthenticatedAction(async function saveVoiceAgentCallSettings(userId) {
        const uid = requireUserObjectId(userId);
        const parsed = callSettingsSchema.safeParse(input);
        if (!parsed.success) throw new Error(firstIssue(parsed.error, 'Check the call settings'));
        const agents = await agentsCollection();
        const doc = await agents.findOneAndUpdate(
            { _id: toObjectId(agentId, 'Agent ID'), userId: uid },
            { $set: { ...parsed.data, updatedAt: new Date() } },
            { returnDocument: 'after' },
        );
        if (!doc) throw new Error('Agent not found');
        return mapVoiceAgentDocToVoiceAgent(doc);
    });

// ---------------------------------------------------------------------------
// Tools: appointment booking and custom webhook tools. The engine reads them from the agent
// doc on every call, so a save here applies from the next call on.
// ---------------------------------------------------------------------------

/** What the editor sends for a custom tool's signing secret. It is never sent back. */
export type VoiceWebhookSecretInput = { action: 'keep' } | { action: 'set'; value: string } | { action: 'clear' };

export type VoiceWebhookToolInput = {
    name: string;
    description: string;
    url: string;
    parameters: VoiceWebhookParam[];
    enabled: boolean;
    secret: VoiceWebhookSecretInput;
};

/** A test request as the engine would send it, and what came back. */
export type VoiceWebhookTestResult = {
    /** A 2xx answer: the agent would read `body`. */
    ok: boolean;
    /** HTTP status, or null when no answer came (see `error`). */
    status: number | null;
    /** First 1000 characters of the answer. */
    body: string;
    contentType: string | null;
    durationMs: number;
    /** Why there was no answer, in plain words. */
    error: string | null;
    /** The JSON body that was posted, pretty-printed. */
    sent: string;
    signed: boolean;
};

const isProduction = () => process.env.NODE_ENV === 'production';

function isIanaTimezone(zone: string): boolean {
    // Names only ("Asia/Kolkata", "UTC"): Intl also takes offsets like "+05:30", the engine does not.
    if (!/^[A-Za-z][A-Za-z0-9_+-]*(\/[A-Za-z0-9_+-]+){0,2}$/.test(zone)) return false;
    try {
        new Intl.DateTimeFormat('en-US', { timeZone: zone });
        return true;
    } catch {
        return false;
    }
}

const bookingTimeSchema = z.string().regex(VOICE_BOOKING_TIME_PATTERN, 'Times are 24-hour HH:MM, like 09:00');
const bookingDaySchema = z.object({ open: bookingTimeSchema, close: bookingTimeSchema }).strict();

const bookingToolSchema = z
    .object({
        enabled: z.boolean(),
        timezone: z.string().trim().min(1, 'Pick a timezone').refine(isIanaTimezone, 'Pick a timezone from the list'),
        slotMinutes: z
            .number({ invalid_type_error: 'Pick an appointment length' })
            .int('Appointment length is a whole number of minutes')
            .min(
                VOICE_BOOKING_LIMITS.slotMinutesMin,
                `Appointments are at least ${VOICE_BOOKING_LIMITS.slotMinutesMin} minutes`,
            )
            .max(
                VOICE_BOOKING_LIMITS.slotMinutesMax,
                `Appointments are at most ${VOICE_BOOKING_LIMITS.slotMinutesMax} minutes`,
            )
            .multipleOf(
                VOICE_BOOKING_LIMITS.slotMinutesStep,
                `Appointment length goes in steps of ${VOICE_BOOKING_LIMITS.slotMinutesStep} minutes`,
            ),
        maxDaysAhead: z
            .number({ invalid_type_error: 'Enter how many days ahead callers can book' })
            .int('Days ahead is a whole number')
            .min(
                VOICE_BOOKING_LIMITS.maxDaysAheadMin,
                `Callers can book at least ${VOICE_BOOKING_LIMITS.maxDaysAheadMin} day ahead`,
            )
            .max(
                VOICE_BOOKING_LIMITS.maxDaysAheadMax,
                `Callers can book at most ${VOICE_BOOKING_LIMITS.maxDaysAheadMax} days ahead`,
            ),
        hours: z
            .object(
                Object.fromEntries(VOICE_BOOKING_DAYS.map((d) => [d.key, bookingDaySchema.optional()])) as Record<
                    keyof VoiceBookingHours,
                    z.ZodOptional<typeof bookingDaySchema>
                >,
            )
            .strict(),
        /** Null = the built-in calendar. Ownership is checked against voice_calendar_connections on save. */
        destination: z
            .object({
                provider: z.nativeEnum(VoiceCalendarProvider, {
                    errorMap: () => ({ message: 'Pick one of the connected apps' }),
                }),
                connectedAccountId: z
                    .string()
                    .trim()
                    .regex(/^[A-Za-z0-9_-]{3,100}$/, 'Pick one of the connected apps'),
                calendarId: z.string().trim().min(1, 'Pick a calendar').max(500, 'Pick a calendar from the list'),
                calendarName: z.string().trim().min(1, 'Pick a calendar').max(200, 'Pick a calendar from the list'),
            })
            .strict()
            .nullable()
            .optional(),
    })
    .strict()
    .superRefine((booking, ctx) => {
        for (const day of VOICE_BOOKING_DAYS) {
            const hours = booking.hours[day.key];
            if (!hours) continue;
            const open = voiceBookingMinutes(hours.open);
            const close = voiceBookingMinutes(hours.close);
            if (close <= open) {
                ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${day.label} has to close after it opens` });
            } else if (close - open < booking.slotMinutes) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: `${day.label}'s hours are shorter than one ${booking.slotMinutes}-minute appointment`,
                });
            }
        }
        if (booking.enabled && VOICE_BOOKING_DAYS.every((d) => !booking.hours[d.key])) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Open at least one day so callers can book' });
        }
    });

const webhookParamSchema = z
    .object({
        name: z
            .string()
            .trim()
            .regex(
                VOICE_TOOL_PARAM_NAME_PATTERN,
                'Parameter names are lowercase letters, numbers and _, starting with a letter (like order_id)',
            ),
        type: z.enum(['string', 'number', 'boolean'], { errorMap: () => ({ message: 'Pick a parameter type' }) }),
        description: z
            .string()
            .trim()
            .max(
                VOICE_WEBHOOK_LIMITS.paramDescriptionMax,
                `Parameter descriptions are up to ${VOICE_WEBHOOK_LIMITS.paramDescriptionMax} characters`,
            ),
        required: z.boolean(),
    })
    .strict();

const webhookSecretSchema = z.discriminatedUnion('action', [
    z.object({ action: z.literal('keep') }),
    z.object({ action: z.literal('clear') }),
    z.object({
        action: z.literal('set'),
        value: z
            .string()
            .trim()
            .min(1, 'Enter the secret, or leave it unset')
            .max(VOICE_WEBHOOK_LIMITS.secretMax, `The secret is up to ${VOICE_WEBHOOK_LIMITS.secretMax} characters`),
    }),
]);

const webhookToolFields = z.object({
    name: z
        .string()
        .trim()
        .regex(
            VOICE_TOOL_NAME_PATTERN,
            'Tool names are 2 to 40 lowercase letters, numbers and _, starting with a letter (like check_order)',
        )
        .refine(
            (name) => !(VOICE_RESERVED_TOOL_NAMES as readonly string[]).includes(name),
            'That name belongs to a built-in tool. Pick another one.',
        ),
    description: z
        .string()
        .trim()
        .min(1, 'Say when the agent should use this tool')
        .max(
            VOICE_WEBHOOK_LIMITS.descriptionMax,
            `The description is up to ${VOICE_WEBHOOK_LIMITS.descriptionMax} characters`,
        ),
    url: z.string().trim().min(1, 'Enter the URL to call').max(VOICE_WEBHOOK_LIMITS.urlMax, 'That URL is too long'),
    parameters: z
        .array(webhookParamSchema)
        .max(VOICE_WEBHOOK_LIMITS.maxParams, `A tool has up to ${VOICE_WEBHOOK_LIMITS.maxParams} parameters`),
    enabled: z.boolean(),
    secret: webhookSecretSchema,
});

function uniqueParamNames(tool: { parameters: VoiceWebhookParam[] }, ctx: z.RefinementCtx) {
    const seen = new Set<string>();
    for (const p of tool.parameters) {
        if (seen.has(p.name)) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: `There are two parameters called ${p.name}` });
            return;
        }
        seen.add(p.name);
    }
}

const webhookToolSchema = webhookToolFields.superRefine(uniqueParamNames);
/** A test needs a working URL and parameters, not the description yet. */
const webhookTestSchema = webhookToolFields.omit({ description: true, enabled: true }).superRefine(uniqueParamNames);

function firstIssue(error: z.ZodError, fallback: string): string {
    return error.issues[0]?.message ?? fallback;
}

/** Loopback, private, link-local (cloud metadata), CGNAT, multicast and reserved addresses. */
function isPrivateAddress(address: string): boolean {
    const version = isIP(address);
    if (version === 4) {
        const [a, b] = address.split('.').map(Number);
        return (
            a === 0 ||
            a === 10 ||
            a === 127 ||
            (a === 100 && b >= 64 && b <= 127) ||
            (a === 169 && b === 254) ||
            (a === 172 && b >= 16 && b <= 31) ||
            (a === 192 && b === 168) ||
            (a === 192 && b === 0) ||
            (a === 198 && (b === 18 || b === 19)) ||
            a >= 224
        );
    }
    if (version === 6) {
        const lower = address.toLowerCase();
        const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
        if (mapped) return isPrivateAddress(mapped[1]);
        return (
            lower === '::' ||
            lower === '::1' ||
            /^f[cd]/.test(lower) ||
            /^fe[89ab]/.test(lower) ||
            lower.startsWith('ff') ||
            lower.startsWith('64:ff9b:')
        );
    }
    return false;
}

function isLocalHostname(hostname: string): boolean {
    const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();
    return host === 'localhost' || host.endsWith('.localhost') || isPrivateAddress(host);
}

/** https only; plain http to this machine is fine outside production, for local testing. */
function parseWebhookUrl(raw: string): URL {
    let url: URL;
    try {
        url = new URL(raw);
    } catch {
        throw new Error('Enter a full URL, starting with https://');
    }
    if (url.username || url.password) throw new Error('Leave the login out of the URL. Use the secret to sign requests.');
    const host = url.hostname.replace(/^\[|\]$/g, '');
    const loopback = host === 'localhost' || host === '127.0.0.1' || host === '::1';
    if (url.protocol === 'http:' && loopback && !isProduction()) return url;
    if (url.protocol !== 'https:') throw new Error('The URL has to start with https://');
    if (isProduction() && isLocalHostname(url.hostname)) {
        throw new Error('That URL points at a private network address. Use a public https URL.');
    }
    return url;
}

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
    input: VoiceAgentBookingTool,
): Promise<ALApiResponse<VoiceAgent>> =>
    runAuthenticatedAction(async function saveVoiceAgentBooking(userId) {
        const uid = requireUserObjectId(userId);
        const parsed = bookingToolSchema.safeParse(input);
        if (!parsed.success) throw new Error(firstIssue(parsed.error, 'Check the booking settings'));
        const { destination, ...rules } = parsed.data;
        const booking: VoiceAgentBookingTool = {
            ...rules,
            hours: Object.fromEntries(
                VOICE_BOOKING_DAYS.flatMap((d) => (parsed.data.hours[d.key] ? [[d.key, parsed.data.hours[d.key]]] : [])),
            ) as VoiceBookingHours,
            // Absent = the built-in calendar, as before destinations existed.
            ...(destination ? { destination } : {}),
        };
        if (booking.destination) await assertUsableDestination(uid, booking.destination);
        const doc = await findOwnedAgent(uid, agentId);
        return saveTools(doc, { ...currentTools(doc), booking });
    });

function parseWebhookTool(input: unknown, others: VoiceAgentWebhookTool[]) {
    const parsed = webhookToolSchema.safeParse(input);
    if (!parsed.success) throw new Error(firstIssue(parsed.error, 'Check the tool'));
    const url = parseWebhookUrl(parsed.data.url).toString();
    if (others.some((t) => t.name === parsed.data.name)) {
        throw new Error(`This agent already has a tool called ${parsed.data.name}`);
    }
    return { ...parsed.data, url };
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
        const uid = requireUserObjectId(userId);
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
        const uid = requireUserObjectId(userId);
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
        const uid = requireUserObjectId(userId);
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
        const uid = requireUserObjectId(userId);
        const doc = await findOwnedAgent(uid, agentId);
        const tools = currentTools(doc);
        if (!tools.webhooks.some((t) => t.id === toolId)) throw new Error('That tool was deleted. Reload the page.');
        return saveTools(doc, {
            ...tools,
            webhooks: tools.webhooks.map((t) => (t.id === toolId ? { ...t, enabled } : t)),
        });
    });

/** Example arguments for a test: one per parameter, by type. */
function sampleArguments(parameters: VoiceWebhookParam[]): Record<string, string | number | boolean> {
    return Object.fromEntries(
        parameters.map((p) => [p.name, p.type === 'number' ? 1 : p.type === 'boolean' ? true : 'example']),
    );
}

type RawAnswer = { status: number; contentType: string | null; body: string };

const TEST_BODY_READ_LIMIT = 64 * 1024;

/**
 * POSTs `body` to `url` without following redirects. The host is resolved once, checked (in production:
 * no private or metadata addresses) and the connection is pinned to that address.
 */
async function postOnce(url: URL, body: string, headers: Record<string, string>): Promise<RawAnswer> {
    const hostname = url.hostname.replace(/^\[|\]$/g, '');
    const addresses = isIP(hostname)
        ? [{ address: hostname, family: isIP(hostname) }]
        : await dnsLookup(hostname, { all: true });
    if (addresses.length === 0) throw Object.assign(new Error('not found'), { code: 'ENOTFOUND' });
    if (isProduction() && addresses.some((a) => isPrivateAddress(a.address))) {
        throw Object.assign(new Error('private address'), { code: 'AIXEL_PRIVATE' });
    }
    const [{ address, family }] = addresses;
    const pinned: LookupFunction = (_host, options, callback) => {
        if (options.all)
            (callback as (e: null, a: { address: string; family: number }[]) => void)(null, [{ address, family }]);
        else callback(null, address, family);
    };

    const send = url.protocol === 'https:' ? httpsRequest : httpRequest;
    return new Promise<RawAnswer>((resolve, reject) => {
        const req = send(
            url,
            {
                method: 'POST',
                headers: { ...headers, 'Content-Length': String(Buffer.byteLength(body)) },
                lookup: pinned,
                timeout: VOICE_WEBHOOK_LIMITS.timeoutMs,
            },
            (res: IncomingMessage) => {
                const chunks: Buffer[] = [];
                let size = 0;
                res.on('data', (chunk: Buffer) => {
                    if (size < TEST_BODY_READ_LIMIT) chunks.push(chunk);
                    size += chunk.length;
                    if (size >= TEST_BODY_READ_LIMIT) res.destroy();
                });
                const finish = () =>
                    resolve({
                        status: res.statusCode ?? 0,
                        contentType: res.headers['content-type'] ?? null,
                        body: Buffer.concat(chunks).toString('utf8'),
                    });
                res.on('end', finish);
                res.on('close', finish);
                res.on('error', finish);
            },
        );
        const timer = setTimeout(
            () => req.destroy(Object.assign(new Error('timeout'), { code: 'AIXEL_TIMEOUT' })),
            VOICE_WEBHOOK_LIMITS.timeoutMs,
        );
        req.on('timeout', () => req.destroy(Object.assign(new Error('timeout'), { code: 'AIXEL_TIMEOUT' })));
        req.on('error', (error) => {
            clearTimeout(timer);
            reject(error);
        });
        req.on('close', () => clearTimeout(timer));
        req.end(body);
    });
}

function testFailureMessage(error: unknown, host: string): string {
    const code = (error as { code?: string } | null)?.code ?? '';
    if (code === 'AIXEL_TIMEOUT') return `No answer from ${host} within ${VOICE_WEBHOOK_LIMITS.timeoutMs / 1000} seconds.`;
    if (code === 'AIXEL_PRIVATE') return 'That URL points at a private network address, which tools cannot call.';
    if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return `Could not find ${host}. Check the URL.`;
    if (code === 'ECONNREFUSED') return `${host} refused the connection. Is the server running?`;
    if (code === 'ECONNRESET' || code === 'EPIPE') return `${host} closed the connection before answering.`;
    if (code === 'EHOSTUNREACH' || code === 'ENETUNREACH') return `${host} cannot be reached from here.`;
    if (/CERT|TLS|SSL|SELF_SIGNED|UNABLE_TO_VERIFY/.test(code)) return `${host}'s security certificate is not valid.`;
    return `Could not reach ${host}.`;
}

/**
 * Sends one request the way the engine calls the tool mid-call: the same JSON body shape, headers,
 * signature and 8 s limit, with example arguments and a made-up call id. Tests what is in the dialog,
 * saved or not; `toolId` lets an unchanged secret be used without the browser ever seeing it.
 */
export const sendVoiceAgentWebhookTest = async (
    agentId: string,
    input: { toolId: string | null; tool: VoiceWebhookToolInput },
): Promise<ALApiResponse<VoiceWebhookTestResult>> =>
    runAuthenticatedAction(async function sendVoiceAgentWebhookTest(userId) {
        const uid = requireUserObjectId(userId);
        const parsed = webhookTestSchema.safeParse(input?.tool);
        if (!parsed.success) throw new Error(firstIssue(parsed.error, 'Check the tool'));
        const url = parseWebhookUrl(parsed.data.url);
        const doc = await findOwnedAgent(uid, agentId);

        let secret: string | null = null;
        if (parsed.data.secret.action === 'set') {
            secret = parsed.data.secret.value.trim();
        } else if (parsed.data.secret.action === 'keep' && input.toolId) {
            const sealed = currentTools(doc).webhooks.find((t) => t.id === input.toolId)?.secretSealed;
            secret = sealed ? openSecret(sealed) : null;
        }

        const payload = {
            tool: parsed.data.name,
            arguments: sampleArguments(parsed.data.parameters),
            call: {
                id: new MongoObjectId().toString(),
                agentId: doc._id.toString(),
                channel: VoiceCallChannel.PLAYGROUND,
                direction: VoiceCallDirection.PLAYGROUND,
                from: null,
                to: null,
            },
        };
        const body = JSON.stringify(payload);
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'User-Agent': 'AixelLabs-VoiceAgent/1',
        };
        if (secret) headers['X-Aixel-Signature'] = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;

        const started = Date.now();
        const base = { sent: JSON.stringify(payload, null, 2), signed: !!secret };
        try {
            const answer = await postOnce(url, body, headers);
            return {
                ...base,
                ok: answer.status >= 200 && answer.status < 300,
                status: answer.status,
                body: answer.body.slice(0, 1000),
                contentType: answer.contentType,
                durationMs: Date.now() - started,
                error: null,
            };
        } catch (error) {
            return {
                ...base,
                ok: false,
                status: null,
                body: '',
                contentType: null,
                durationMs: Date.now() - started,
                error: testFailureMessage(error, url.host),
            };
        }
    });
