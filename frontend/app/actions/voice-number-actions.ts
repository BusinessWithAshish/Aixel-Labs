'use server';

import {
    getCollection,
    MongoCollections,
    MongoObjectId,
    VOICE_AGENT_SUB_MODULES,
    VoiceAgentCallType,
    VOICE_NUMBER_LIMITS,
    VoiceProvider,
    type VoiceAgentDoc,
    type VoiceNumber,
    type VoiceNumberDoc,
} from '@aixellabs/backend/db';
import { ALApiResponse } from '@aixellabs/backend/api/types';
import { assertValidObjectId, runAuthenticatedAction, toObjectId } from '@/helpers/server-action-helpers';
import { isMongoDuplicateKeyError } from '@/server/auth/membership/duplicate-key';
import { VOICE_AGENT_NO_PROMPT_MESSAGE } from '@/helpers/voice-agent-defaults';
import { cleanCallVariables } from '@/helpers/voice-agent-features';
import { engineFetch, sealSecret } from '@/server/voice-agent/engine';
import { assertRateLimit } from '@/server/rate-limit';
import { assertGeminiKeySet, GEMINI_KEY_MISSING_MESSAGE } from '@/server/voice-agent/gemini-key';
import { assertCallReady } from '@/server/voice-agent/call-readiness';
import {
    countNumbers,
    findItem,
    findItemsAnywhere,
    listItems,
    pullItems,
    pushItem,
    updateItem,
} from '@/server/voice-agent/accounts';
import { providerOf, type OwnedNumberDoc, type ProviderAccountNumber } from '@/server/voice-agent/number-provider';
import { requireVoiceOwner, type VoiceOwnerScope } from '@/server/voice-agent/owner-scope';
import {
    BROWSER_TARGET,
    browserUri,
    getSoftphone,
    inSoftphoneAccount,
    removeSoftphone,
    SOFTPHONE_TARGET,
    softphoneUri,
} from '@/server/voice-agent/softphone';
import { listTelnyxAccountNumbers, telnyxNumbers } from '@/server/voice-agent/telnyx-numbers';
import type { TwilioAuth } from '@/server/voice-agent/twilio';
import { listTwilioAccountNumbers, twilioNumberProblem, twilioNumbers } from '@/server/voice-agent/twilio-numbers';
import type { VoiceLinkAuth } from '@/server/voice-agent/voicelink';
import { listVoiceLinkAccountNumbers, voicelinkNumbers } from '@/server/voice-agent/voicelink-numbers';
import type { WhatsAppAuth } from '@/server/voice-agent/whatsapp';
import {
    listWhatsAppAccountNumbers,
    whatsappNumberProblem,
    whatsappNumbers,
    type WhatsAppAccountNumber,
} from '@/server/voice-agent/whatsapp-numbers';

/** A number in the customer's provider account (Telnyx, VoiceLink or Twilio), as offered for import. */
export type AccountNumber = ProviderAccountNumber & {
    /** Already imported into this workspace by the caller. */
    importedByYou: boolean;
    /** Already connected to Aixel Labs by someone else; it cannot be imported twice. */
    importedElsewhere: boolean;
    /** Why the number cannot be imported at all (a Twilio number without voice), else absent. */
    cannotImport?: string | null;
};

/** What the Connect dialog sends for a VoiceLink account. */
export type VoiceLinkCredentials = {
    apiToken: string;
    /** Reseller accounts only: the client the numbers belong to. Empty for a direct account. */
    clientId?: string | null;
};

/**
 * What the Connect dialog sends for a Twilio account: the Account SID, and either an API key
 * (`apiKeySid` SK… + its secret, recommended) or the account's Auth Token (`apiKeySid` empty).
 */
export type TwilioCredentials = {
    accountSid: string;
    apiKeySid?: string | null;
    /** The API key's secret, or the Auth Token. */
    secret: string;
};

/** What the Connect dialog sends for WhatsApp: the customer's own Meta app and a system user's access token. */
export type WhatsAppCredentials = {
    appId: string;
    appSecret: string;
    token: string;
};

export type VoiceNumberListItem = VoiceNumber & {
    /** Name of the agent that answers calls in; null when the AI does not answer this number. */
    inboundAgentName: string | null;
    /** Name of the agent that places calls from this number. */
    outboundAgentName: string | null;
    /** WhatsApp numbers: whether Meta turned calling on (chats never depend on it); null until AI answering is on. */
    whatsappCalling: { on: boolean; problem?: string | null } | null;
};

export type PlaceTestCallResult = {
    callId: string;
};

type EngineCallResponse = { ok: boolean; callId?: string; error?: string };

const E164_PATTERN = /^\+[1-9]\d{7,14}$/;
const SUB_MODULE = VOICE_AGENT_SUB_MODULES.PHONE_NUMBERS;

function assertApiKey(apiKey: string): string {
    const key = typeof apiKey === 'string' ? apiKey.trim() : '';
    if (!key) throw new Error('Paste your Telnyx API key');
    if (key.length > 512 || /\s/.test(key)) throw new Error('That does not look like a Telnyx API key');
    return key;
}

function assertVoiceLinkCredentials(credentials: VoiceLinkCredentials): VoiceLinkAuth {
    const token = typeof credentials?.apiToken === 'string' ? credentials.apiToken.trim() : '';
    if (!token) throw new Error('Paste your VoiceLink API token');
    if (token.length > 2048 || /\s/.test(token)) throw new Error('That does not look like a VoiceLink API token');

    const rawClientId = typeof credentials.clientId === 'string' ? credentials.clientId.trim() : '';
    if (!rawClientId) return { token, clientId: null };
    if (!/^\d{1,12}$/.test(rawClientId) || Number(rawClientId) === 0) {
        throw new Error('The client ID is a number, shown on the client in your VoiceLink reseller panel');
    }
    return { token, clientId: Number(rawClientId) };
}

const TWILIO_SID = (prefix: 'AC' | 'SK') => new RegExp(`^${prefix}[0-9a-f]{32}$`, 'i');

function assertTwilioCredentials(credentials: TwilioCredentials): TwilioAuth {
    const accountSid = typeof credentials?.accountSid === 'string' ? credentials.accountSid.trim() : '';
    const apiKeySid = typeof credentials?.apiKeySid === 'string' ? credentials.apiKeySid.trim() : '';
    const secret = typeof credentials?.secret === 'string' ? credentials.secret.trim() : '';
    if (!accountSid) throw new Error('Paste your Twilio Account SID');
    if (TWILIO_SID('SK').test(accountSid)) {
        throw new Error(
            'That is an API key SID (SK…). The Account SID starts with AC: it is on the Twilio Console home page.',
        );
    }
    if (!TWILIO_SID('AC').test(accountSid)) {
        throw new Error('The Account SID is AC followed by 32 letters and digits, on the Twilio Console home page');
    }
    if (apiKeySid && !TWILIO_SID('SK').test(apiKeySid)) {
        throw new Error('The API key SID is SK followed by 32 letters and digits, shown when you create the key');
    }
    if (!secret) throw new Error(apiKeySid ? 'Paste the API key secret' : 'Paste your Twilio Auth Token');
    if (secret.length > 256 || /\s/.test(secret)) {
        throw new Error(
            apiKeySid ? 'That does not look like an API key secret' : 'That does not look like a Twilio Auth Token',
        );
    }
    return { accountSid, apiKeySid: apiKeySid || null, secret };
}

function assertWhatsAppCredentials(credentials: WhatsAppCredentials): WhatsAppAuth {
    const appId = typeof credentials?.appId === 'string' ? credentials.appId.trim() : '';
    const appSecret = typeof credentials?.appSecret === 'string' ? credentials.appSecret.trim() : '';
    const token = typeof credentials?.token === 'string' ? credentials.token.trim() : '';
    if (!/^\d{5,20}$/.test(appId)) {
        throw new Error('The App ID is a number, at the top of your Meta app (App settings, Basic)');
    }
    if (!/^[0-9a-f]{32}$/i.test(appSecret)) {
        throw new Error('The App secret is 32 letters and digits: App settings, Basic, App secret, Show');
    }
    if (!token) throw new Error('Paste the access token you generated for the system user');
    if (token.length > 1024 || /\s/.test(token) || !token.startsWith('EA')) {
        throw new Error('That does not look like a Meta access token (it starts with EA)');
    }
    return { appId, appSecret, token };
}

/**
 * A plain message for the engine's `POST /calls` refusals. `engineFetch` throws
 * `Voice engine /calls: HTTP <status> <body, first 200 chars>`; the body is `{ "error": "...", "code"?: "..." }`.
 */
function testCallFailureMessage(error: unknown, providerLabel: string): string {
    const message = error instanceof Error ? error.message : '';
    const match = /HTTP (\d{3}) ([\s\S]*)$/.exec(message);
    const status = match ? Number(match[1]) : 0;
    let reason: string | null = null;
    let code: string | null = null;
    if (match) {
        try {
            const body = JSON.parse(match[2]) as { error?: unknown; code?: unknown };
            reason = typeof body.error === 'string' && body.error ? body.error : null;
            code = typeof body.code === 'string' ? body.code : null;
        } catch {
            // Cut at 200 chars: pull the error string out by hand.
            reason = /"error"\s*:\s*"((?:[^"\\]|\\.)*)/.exec(match[2])?.[1] ?? null;
        }
    }

    // The call runs on the owner's Gemini key: none saved, or Google refused it.
    if (code === 'gemini_key_missing') return GEMINI_KEY_MISSING_MESSAGE;
    if (code === 'gemini_key_invalid') {
        return `Google refused your Gemini API key, so the call was not placed${reason ? `: ${reason}` : '.'} Check the key under Voice agent > Settings.`;
    }

    switch (status) {
        case 400:
            return reason ? `The voice engine refused that number: ${reason}` : 'That number is not valid.';
        case 404:
            return 'The voice engine does not know this number. Remove it and import it again.';
        case 409:
            return reason ?? 'This number cannot place calls right now.';
        case 424: // the engine's "the phone provider refused / was unreachable"
        case 502:
            if (!reason) return `${providerLabel} could not be reached. Try again in a minute.`;
            // The engine already says who refused ("Telnyx refused the call: …"); don't say it twice.
            return reason.startsWith(providerLabel) ? reason : `${providerLabel} refused the call: ${reason}`;
        case 503:
            return 'The voice engine is busy right now. Try again in a minute.';
        case 401:
            return 'The voice engine is not configured for this app. Contact support.';
        default:
            return 'The voice engine could not start the call. Try again in a minute.';
    }
}

function idString(id: MongoObjectId | null | undefined): string | null {
    return id ? id.toString() : null;
}

function mapVoiceNumberDoc(doc: OwnedNumberDoc, names: Map<string, string>): VoiceNumberListItem {
    const inboundAgentId = idString(doc.inboundAgentId);
    const outboundAgentId = idString(doc.outboundAgentId);
    return {
        _id: doc._id.toString(),
        tenantId: doc.tenantId.toString(),
        userId: doc.userId.toString(),
        provider: doc.provider,
        phoneNumber: doc.phoneNumber,
        providerNumberId: doc.providerNumberId,
        texmlAppId: doc.texmlAppId,
        callControlAppId: doc.callControlAppId,
        inboundAgentId,
        outboundAgentId,
        previousConnectionId: doc.previousConnectionId ?? null,
        createdAt: doc.createdAt.toISOString(),
        updatedAt: doc.updatedAt.toISOString(),
        inboundAgentName: inboundAgentId ? (names.get(inboundAgentId) ?? null) : null,
        outboundAgentName: outboundAgentId ? (names.get(outboundAgentId) ?? null) : null,
        whatsappCalling: doc.whatsapp?.calling ?? null,
    };
}

async function agentNamesById(ids: (MongoObjectId | null | undefined)[]): Promise<Map<string, string>> {
    const unique = [...new Set(ids.filter((id): id is MongoObjectId => !!id).map((id) => id.toString()))];
    if (unique.length === 0) return new Map();
    const agents = await getCollection<VoiceAgentDoc>(MongoCollections.VOICE_AGENTS);
    const docs = await agents
        .find({ _id: { $in: unique.map((id) => new MongoObjectId(id)) } }, { projection: { name: 1 } })
        .toArray();
    return new Map(docs.map((doc) => [String(doc._id), doc.name]));
}

async function findOwnedNumber(owner: VoiceOwnerScope, numberId: string): Promise<OwnedNumberDoc> {
    const doc = await findItem('numbers', { _id: toObjectId(numberId, 'Number ID') }, owner.userId);
    if (!doc) throw new Error('Number not found');
    return doc;
}

type OwnedAgent = { _id: MongoObjectId; name: string; callType: VoiceAgentCallType };

/** The caller's agent and the calls it is for (agents saved before types make calls), refused when it has no prompt yet. */
async function findOwnedAgent(owner: VoiceOwnerScope, agentId: string): Promise<OwnedAgent> {
    const agents = await getCollection<VoiceAgentDoc>(MongoCollections.VOICE_AGENTS);
    const agent = await agents.findOne(
        { _id: toObjectId(agentId, 'Agent ID'), userId: owner.userId },
        { projection: { name: 1, callType: 1, prompt: 1 } },
    );
    if (!agent?._id) throw new Error('Agent not found');
    if (!agent.prompt?.trim()) throw new Error(VOICE_AGENT_NO_PROMPT_MESSAGE);
    return { _id: agent._id, name: agent.name, callType: agent.callType ?? VoiceAgentCallType.OUTBOUND };
}

async function listItemFor(owner: VoiceOwnerScope, numberId: MongoObjectId): Promise<VoiceNumberListItem> {
    const doc = await findItem('numbers', { _id: numberId }, owner.userId);
    if (!doc) throw new Error('Number not found');
    const names = await agentNamesById([doc.inboundAgentId, doc.outboundAgentId]);
    return mapVoiceNumberDoc(doc, names);
}

/** Marks which of the provider's numbers are already connected, by the caller or by someone else. */
async function withImportState(
    owner: VoiceOwnerScope,
    provider: VoiceProvider,
    accountNumbers: ProviderAccountNumber[],
): Promise<AccountNumber[]> {
    const wanted = new Set(accountNumbers.map((n) => n.phoneNumber));
    const existing = await findItemsAnywhere('numbers', { phoneNumber: { $in: [...wanted] } });
    const ownerOf = new Map(
        existing.filter((doc) => wanted.has(doc.phoneNumber)).map((doc) => [doc.phoneNumber, doc.userId.toString()]),
    );
    const me = owner.userId.toString();

    return accountNumbers.map((n) => {
        const importedBy = ownerOf.get(n.phoneNumber);
        return { ...n, importedByYou: importedBy === me, importedElsewhere: importedBy !== undefined && importedBy !== me };
    });
}

type ImportInput = {
    provider: VoiceProvider;
    accountNumbers: ProviderAccountNumber[];
    wantedIds: string[];
    apiKeySealed: string;
    providerName: string;
    /** Provider fields stored with each new number (and refreshed on a re-import); per number when they differ. */
    extra?:
        | Pick<VoiceNumberDoc, 'voicelink' | 'twilio' | 'whatsapp'>
        | ((n: ProviderAccountNumber) => Pick<VoiceNumberDoc, 'whatsapp'>);
    /** Why a chosen number cannot be imported, or null. */
    problemWith?: (n: ProviderAccountNumber) => string | null;
};

/**
 * Stores the chosen numbers with the key sealed. Numbers come from the provider (re-read by the
 * caller), not from the browser. A number another account already connected is refused.
 */
async function importNumbers(owner: VoiceOwnerScope, input: ImportInput): Promise<VoiceNumberListItem[]> {
    const wanted = new Set(Array.isArray(input.wantedIds) ? input.wantedIds.filter((id) => typeof id === 'string') : []);
    if (wanted.size === 0) throw new Error('Choose at least one number to import');
    const chosen = input.accountNumbers.filter((n) => wanted.has(n.providerNumberId));
    if (chosen.length !== wanted.size) {
        throw new Error(`Some of those numbers are not in this ${input.providerName} account`);
    }
    for (const n of chosen) {
        const problem = input.problemWith?.(n);
        if (problem) throw new Error(problem);
    }

    if ((await countNumbers(owner.userId)) + chosen.length > VOICE_NUMBER_LIMITS.maxPerOwner) {
        throw new Error(`One account can connect up to ${VOICE_NUMBER_LIMITS.maxPerOwner} numbers`);
    }
    const imported: VoiceNumberListItem[] = [];

    for (const n of chosen) {
        const now = new Date();
        const extra: Pick<VoiceNumberDoc, 'voicelink' | 'twilio' | 'whatsapp'> | undefined =
            typeof input.extra === 'function' ? input.extra(n) : input.extra;
        const doc: VoiceNumberDoc = {
            _id: new MongoObjectId(),
            provider: input.provider,
            phoneNumber: n.phoneNumber,
            providerNumberId: n.providerNumberId,
            apiKeySealed: input.apiKeySealed,
            inboundAgentId: null,
            outboundAgentId: null,
            previousConnectionId: null,
            ...extra,
            createdAt: now,
            updatedAt: now,
        };
        let added: boolean;
        try {
            added = await pushItem('numbers', owner, doc, { phoneNumber: n.phoneNumber });
        } catch (error) {
            if (!isMongoDuplicateKeyError(error)) throw error;
            throw new Error(`${n.phoneNumber} is already connected to another Aixel Labs account`);
        }
        if (added) {
            imported.push(mapVoiceNumberDoc({ ...doc, tenantId: owner.tenantId, userId: owner.userId }, new Map()));
        } else {
            // Re-import of a number we already have: refresh the key (it may have been rotated).
            const refresh: Record<string, unknown> = { apiKeySealed: input.apiKeySealed };
            if (extra?.voicelink) refresh['voicelink.clientId'] = extra.voicelink.clientId ?? null;
            // The routing saved before AI answering (twilio.previousRouting, whatsapp.previousCalling) is kept.
            if (extra?.twilio) {
                refresh['twilio.accountSid'] = extra.twilio.accountSid;
                refresh['twilio.apiKeySid'] = extra.twilio.apiKeySid;
            }
            if (extra?.whatsapp) {
                refresh['whatsapp.appId'] = extra.whatsapp.appId;
                refresh['whatsapp.appSecretSealed'] = extra.whatsapp.appSecretSealed;
                refresh['whatsapp.wabaId'] = extra.whatsapp.wabaId;
            }
            const same = await updateItem(
                'numbers',
                { phoneNumber: n.phoneNumber, provider: input.provider },
                { set: refresh },
            );
            if (!same)
                throw new Error(`${n.phoneNumber} is already connected through another provider. Remove it there first.`);
        }
    }

    return imported;
}

/** Checks the key by listing the account's numbers. Nothing is stored yet. */
export const connectTelnyx = async (apiKey: string): Promise<ALApiResponse<AccountNumber[]>> =>
    runAuthenticatedAction(async function connectTelnyx(userId) {
        const owner = await requireVoiceOwner(userId, SUB_MODULE);
        assertRateLimit(`voice-check:${owner.userId}`, 30);
        const key = assertApiKey(apiKey);
        return withImportState(owner, VoiceProvider.TELNYX, await listTelnyxAccountNumbers(key));
    });

/** Stores the chosen Telnyx numbers. Nothing changes in Telnyx: each number keeps ringing wherever it did. */
export const importTelnyxNumbers = async (
    apiKey: string,
    providerNumberIds: string[],
): Promise<ALApiResponse<VoiceNumberListItem[]>> =>
    runAuthenticatedAction(async function importTelnyxNumbers(userId) {
        const owner = await requireVoiceOwner(userId, SUB_MODULE);
        const key = assertApiKey(apiKey);
        return importNumbers(owner, {
            provider: VoiceProvider.TELNYX,
            accountNumbers: await listTelnyxAccountNumbers(key),
            wantedIds: providerNumberIds,
            apiKeySealed: sealSecret(key),
            providerName: telnyxNumbers.label,
        });
    });

/** Checks the token by listing the account's DIDs (Indian numbers). Nothing is stored yet. */
export const connectVoiceLink = async (credentials: VoiceLinkCredentials): Promise<ALApiResponse<AccountNumber[]>> =>
    runAuthenticatedAction(async function connectVoiceLink(userId) {
        const owner = await requireVoiceOwner(userId, SUB_MODULE);
        assertRateLimit(`voice-check:${owner.userId}`, 30);
        const auth = assertVoiceLinkCredentials(credentials);
        return withImportState(owner, VoiceProvider.VOICELINK, await listVoiceLinkAccountNumbers(auth));
    });

/**
 * Stores the chosen VoiceLink DIDs with the token sealed. Nothing changes in VoiceLink: no bot is
 * made and the routing is not touched until AI answering or an outbound agent is turned on.
 */
export const importVoiceLinkNumbers = async (
    credentials: VoiceLinkCredentials,
    providerNumberIds: string[],
): Promise<ALApiResponse<VoiceNumberListItem[]>> =>
    runAuthenticatedAction(async function importVoiceLinkNumbers(userId) {
        const owner = await requireVoiceOwner(userId, SUB_MODULE);
        const auth = assertVoiceLinkCredentials(credentials);
        return importNumbers(owner, {
            provider: VoiceProvider.VOICELINK,
            accountNumbers: await listVoiceLinkAccountNumbers(auth),
            wantedIds: providerNumberIds,
            apiKeySealed: sealSecret(auth.token),
            providerName: voicelinkNumbers.label,
            extra: { voicelink: { clientId: auth.clientId, botId: null, routingId: null } },
        });
    });

/** Checks the credentials and lists the Twilio account's numbers. Nothing is stored yet. */
export const connectTwilio = async (credentials: TwilioCredentials): Promise<ALApiResponse<AccountNumber[]>> =>
    runAuthenticatedAction(async function connectTwilio(userId) {
        const owner = await requireVoiceOwner(userId, SUB_MODULE);
        assertRateLimit(`voice-check:${owner.userId}`, 30);
        const auth = assertTwilioCredentials(credentials);
        const numbers = await withImportState(owner, VoiceProvider.TWILIO, await listTwilioAccountNumbers(auth));
        return numbers.map((n) => ({ ...n, cannotImport: twilioNumberProblem(n) }));
    });

/**
 * Stores the chosen Twilio numbers with the secret sealed (the Account SID and API key SID are
 * kept in the clear: they name the account and the key, they open nothing). Nothing changes in
 * Twilio: each number keeps its voice settings until AI answering is turned on.
 */
export const importTwilioNumbers = async (
    credentials: TwilioCredentials,
    providerNumberIds: string[],
): Promise<ALApiResponse<VoiceNumberListItem[]>> =>
    runAuthenticatedAction(async function importTwilioNumbers(userId) {
        const owner = await requireVoiceOwner(userId, SUB_MODULE);
        const auth = assertTwilioCredentials(credentials);
        return importNumbers(owner, {
            provider: VoiceProvider.TWILIO,
            accountNumbers: await listTwilioAccountNumbers(auth),
            wantedIds: providerNumberIds,
            apiKeySealed: sealSecret(auth.secret),
            providerName: twilioNumbers.label,
            extra: { twilio: { accountSid: auth.accountSid, apiKeySid: auth.apiKeySid } },
            problemWith: twilioNumberProblem,
        });
    });

/** Checks the Meta app and token, then lists the numbers in the WhatsApp accounts the token reaches. Nothing is stored. */
export const connectWhatsApp = async (credentials: WhatsAppCredentials): Promise<ALApiResponse<AccountNumber[]>> =>
    runAuthenticatedAction(async function connectWhatsApp(userId) {
        const owner = await requireVoiceOwner(userId, SUB_MODULE);
        assertRateLimit(`voice-check:${owner.userId}`, 30);
        const auth = assertWhatsAppCredentials(credentials);
        const numbers = await withImportState(owner, VoiceProvider.WHATSAPP, await listWhatsAppAccountNumbers(auth));
        return numbers.map((n) => ({ ...n, cannotImport: whatsappNumberProblem(n) }));
    });

/**
 * Stores the chosen WhatsApp numbers with the token and the app secret sealed (the App ID and the
 * WhatsApp account id are kept in the clear: they name things, they open nothing). Nothing changes at
 * Meta until AI answering is turned on.
 */
export const importWhatsAppNumbers = async (
    credentials: WhatsAppCredentials,
    providerNumberIds: string[],
): Promise<ALApiResponse<VoiceNumberListItem[]>> =>
    runAuthenticatedAction(async function importWhatsAppNumbers(userId) {
        const owner = await requireVoiceOwner(userId, SUB_MODULE);
        const auth = assertWhatsAppCredentials(credentials);
        const appSecretSealed = sealSecret(auth.appSecret);
        return importNumbers(owner, {
            provider: VoiceProvider.WHATSAPP,
            accountNumbers: await listWhatsAppAccountNumbers(auth),
            wantedIds: providerNumberIds,
            apiKeySealed: sealSecret(auth.token),
            providerName: whatsappNumbers.label,
            extra: (n) => ({
                whatsapp: { appId: auth.appId, appSecretSealed, wabaId: (n as WhatsAppAccountNumber).wabaId },
            }),
            problemWith: whatsappNumberProblem,
        });
    });

/** The caller's numbers, newest first, with their agents' names. */
export const listMyNumbers = async (): Promise<ALApiResponse<VoiceNumberListItem[]>> =>
    runAuthenticatedAction(async function listMyNumbers(userId) {
        const owner = await requireVoiceOwner(userId, SUB_MODULE);
        const docs = await listItems('numbers', owner.userId);
        const names = await agentNamesById(docs.flatMap((doc) => [doc.inboundAgentId, doc.outboundAgentId]));
        return docs.map((doc) => mapVoiceNumberDoc(doc, names));
    });

/**
 * A number has a slot per direction: an inbound agent answers its calls, an outbound one places calls
 * from it, and both can be set at once. Linking puts the agent in the slot of its own type (replacing the
 * agent there, with no routing change) and, after a type change, takes it out of the other one. Routing
 * is set up when a slot fills (Telnyx: our TeXML app, or the Call Control app; Twilio: its Voice URL;
 * VoiceLink: that half on our bot) and undone when it empties (Telnyx: back on its own connection; Twilio:
 * its voice settings put back exactly; VoiceLink: that half of the DID's routing put back).
 */
function saveSlots(doc: OwnedNumberDoc, fields: Partial<Pick<VoiceNumberDoc, 'inboundAgentId' | 'outboundAgentId'>>) {
    Object.assign(doc, fields);
    return updateItem('numbers', { _id: doc._id }, { set: fields });
}

/** Empties the slots `agentId` holds (null: every slot), undoing their routing. */
async function clearSlots(doc: OwnedNumberDoc, agentId: string | null): Promise<void> {
    const provider = providerOf(doc);
    const holds = (id: MongoObjectId | null | undefined) => !!id && (agentId === null || id.toString() === agentId);
    if (holds(doc.inboundAgentId)) {
        await provider.stopAnswering(doc);
        await saveSlots(doc, { inboundAgentId: null });
    }
    if (holds(doc.outboundAgentId)) {
        await provider.stopPlacingCalls(doc);
        await saveSlots(doc, { outboundAgentId: null });
    }
}

async function linkAgent(owner: VoiceOwnerScope, doc: OwnedNumberDoc, agent: OwnedAgent): Promise<VoiceNumberListItem> {
    const provider = providerOf(doc);
    const id = agent._id.toString();
    if (agent.callType === VoiceAgentCallType.INBOUND) {
        if (doc.outboundAgentId?.toString() === id) {
            await provider.stopPlacingCalls(doc);
            await saveSlots(doc, { outboundAgentId: null });
        }
        if (!doc.inboundAgentId) await provider.startAnswering(doc);
        await saveSlots(doc, { inboundAgentId: agent._id });
    } else {
        if (doc.inboundAgentId?.toString() === id) {
            await provider.stopAnswering(doc);
            await saveSlots(doc, { inboundAgentId: null });
        }
        if (!doc.outboundAgentId) await provider.startPlacingCalls(doc);
        await saveSlots(doc, { outboundAgentId: agent._id });
    }
    return listItemFor(owner, doc._id);
}

/**
 * Links the number to `agentId` in the slot of the agent's own type (see `linkAgent`), or empties both
 * slots (null). Linking needs the owner's Gemini API key; unlinking never does.
 */
export const setNumberAgent = async (
    numberId: string,
    agentId: string | null,
): Promise<ALApiResponse<VoiceNumberListItem>> => {
    assertValidObjectId(numberId, 'Number ID');
    if (agentId !== null) assertValidObjectId(agentId, 'Agent ID');

    return runAuthenticatedAction(async function setNumberAgent(userId) {
        const owner = await requireVoiceOwner(userId, SUB_MODULE);
        const doc = await findOwnedNumber(owner, numberId);
        if (!agentId) {
            await clearSlots(doc, null);
            return listItemFor(owner, doc._id);
        }
        const agent = await findOwnedAgent(owner, agentId);
        await assertGeminiKeySet(owner.userId);
        return linkAgent(owner, doc, agent);
    });
};

/** Unlinks the number from this agent; another agent in the other slot keeps it. */
export const unlinkAgentNumber = async (agentId: string, numberId: string): Promise<ALApiResponse<VoiceNumberListItem>> => {
    assertValidObjectId(agentId, 'Agent ID');
    assertValidObjectId(numberId, 'Number ID');

    return runAuthenticatedAction(async function unlinkAgentNumber(userId) {
        const owner = await requireVoiceOwner(userId, SUB_MODULE);
        const doc = await findOwnedNumber(owner, numberId);
        await clearSlots(doc, agentId);
        return listItemFor(owner, doc._id);
    });
};

/**
 * Undoes what we changed in the provider account (Telnyx: the number's connection, then our apps;
 * VoiceLink: the DID's routing, then our bot is switched off; Twilio: the number's voice settings)
 * and forgets the number. The number stays in their account.
 */
export const removeNumber = async (numberId: string): Promise<ALApiResponse<{ removed: true }>> => {
    assertValidObjectId(numberId, 'Number ID');

    return runAuthenticatedAction(async function removeNumber(userId) {
        const owner = await requireVoiceOwner(userId, SUB_MODULE);
        const doc = await findOwnedNumber(owner, numberId);
        // The softphone signs in through this number's key: it goes with it.
        if ((await getSoftphone(owner.userId))?.numberId.equals(doc._id)) await removeSoftphone(owner.userId, doc);
        await providerOf(doc).release(doc);

        await pullItems('numbers', owner.userId, { _id: doc._id });
        return { removed: true as const };
    });
};

/** The owner's softphone, as `doc` can ring it: a Telnyx number in the softphone's own Telnyx account. */
async function softphoneTarget(owner: VoiceOwnerScope, doc: OwnedNumberDoc): Promise<string> {
    const softphone = await getSoftphone(owner.userId);
    if (!softphone) throw new Error('Set up your softphone first');
    const home = await findItem('numbers', { _id: softphone.numberId }, owner.userId);
    if (!home || !inSoftphoneAccount(doc, home)) {
        throw new Error(`${doc.phoneNumber} cannot call your softphone: it is not in the same Telnyx account.`);
    }
    return softphoneUri(softphone.userName);
}

/**
 * Asks the voice engine to call `to` from this number with `agentId` (either kind: an inbound agent
 * rings the owner and talks as if they had called in, booking tool and all), or with the number's
 * own agent when none is given. The provider gets ready first (Telnyx: the Call Control app;
 * VoiceLink: the number must be set to make calls). Needs the owner's Gemini API key; the engine
 * refuses too when it is missing or Google refuses it. `variables` fill the agent's `{{variables}}`
 * on this call (empty ones fall back to the agent's defaults). `to` = SOFTPHONE_TARGET rings the owner's softphone,
 * BROWSER_TARGET the browser signed in with this number's telephony credential.
 */
export const placeTestCall = async (
    numberId: string,
    to: string,
    agentId: string | null,
    variables: Record<string, string> = {},
): Promise<ALApiResponse<PlaceTestCallResult>> => {
    assertValidObjectId(numberId, 'Number ID');
    if (agentId !== null) assertValidObjectId(agentId, 'Agent ID');
    const callVariables = cleanCallVariables(variables);

    return runAuthenticatedAction(async function placeTestCall(userId) {
        const owner = await requireVoiceOwner(userId, SUB_MODULE);
        assertRateLimit(`voice-call:${owner.userId}`, 10);
        const doc = await findOwnedNumber(owner, numberId);
        const sip = to === SOFTPHONE_TARGET || to === BROWSER_TARGET;
        const target =
            to === SOFTPHONE_TARGET
                ? await softphoneTarget(owner, doc)
                : to === BROWSER_TARGET
                  ? await browserUri(doc)
                  : typeof to === 'string'
                    ? to.replace(/[\s()-]/g, '')
                    : '';
        if (!sip && !E164_PATTERN.test(target)) {
            const example = doc.provider === VoiceProvider.VOICELINK ? '+919876543210' : '+14155550123';
            throw new Error(`Enter the number in international format, e.g. ${example}`);
        }
        if (target === doc.phoneNumber) throw new Error('A number cannot call itself');

        let callerAgentId: string;
        if (agentId !== null) {
            callerAgentId = (await findOwnedAgent(owner, agentId))._id.toString();
        } else if (doc.outboundAgentId ?? doc.inboundAgentId) {
            callerAgentId = String(doc.outboundAgentId ?? doc.inboundAgentId);
        } else {
            throw new Error('Choose the agent that calls');
        }
        await assertCallReady(owner.userId, toObjectId(callerAgentId, 'Agent ID'));
        const provider = providerOf(doc);
        await provider.prepareCall(doc);

        let res: EngineCallResponse;
        try {
            res = await engineFetch<EngineCallResponse>('/calls', {
                numberId,
                to: target,
                agentId: callerAgentId,
                ...(Object.keys(callVariables).length ? { variables: callVariables } : {}),
            });
        } catch (error) {
            console.error('[voice] placeTestCall: engine error', error);
            throw new Error(testCallFailureMessage(error, provider.label));
        }
        if (!res.ok || !res.callId) throw new Error(res.error ?? 'The voice engine could not start the call');
        return { callId: res.callId };
    });
};
