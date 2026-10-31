'use server';

import {
    getCollection,
    MongoCollections,
    MongoObjectId,
    VOICE_AGENT_SUB_MODULES,
    VoiceCallChannel,
    VoiceCallDirection,
    type VoiceAgentDoc,
    type VoiceCall,
    type VoiceCallDoc,
} from '@aixellabs/backend/db';
import { ALApiResponse } from '@aixellabs/backend/api/types';
import { assertValidObjectId, runAuthenticatedAction, toObjectId } from '@/helpers/server-action-helpers';
import { parseCallRange, rangeStart, type VoiceCallRange } from '@/helpers/voice-call-ranges';
import { agentIdMatch } from '@/server/voice-agent/agent-match';
import { ensureVoiceAgentIndexes } from '@/server/voice-agent/indexes';
import { requireVoiceOwner, type VoiceOwnerScope } from '@/server/voice-agent/owner-scope';
import { findCallRecording, withoutCredentials, type CallRecordingResult } from '@/server/voice-agent/recordings';

export type VoiceCallListItem = VoiceCall & {
    agentName: string | null;
};

/** Calls whose analysis judged them successful ('yes') or not ('no'); unanalysed calls match neither. */
export type CallSuccessFilter = 'yes' | 'no';

/** Real calls in or out, playground sessions, or the owner's tests over the internet (`VoiceCallDoc.test`). */
export type CallKindFilter = 'inbound' | 'outbound' | 'playground' | 'test';

export type ListMyCallsInput = {
    agentId?: string | null;
    success?: CallSuccessFilter | null;
    /** Also calls of agents that were deleted since (without an agent picked). */
    includeDeleted?: boolean;
    kind?: CallKindFilter | null;
    range?: VoiceCallRange | null;
    /** Words in the summary or transcript, or digits of either number. */
    search?: string | null;
    limit?: number;
};

/** What one agent's calls cost, over every call with a cost (the engine has priced calls since 2026-10-21). */
export type VoiceAgentCostTotals = {
    agentId: string;
    calls: number;
    durationSec: number;
    totalUsd: number;
    geminiUsd: number;
    providerUsd: number;
    /** Some calls' phone part is still minutes × the provider's list rate. */
    estimated: boolean;
};

export type { CallRecordingResult } from '@/server/voice-agent/recordings';

const KIND_MATCH: Record<CallKindFilter, object> = {
    inbound: { direction: VoiceCallDirection.INBOUND, test: null },
    outbound: { direction: VoiceCallDirection.OUTBOUND, test: null },
    playground: { channel: VoiceCallChannel.PLAYGROUND },
    test: { test: { $type: 'string' } },
};
const SEARCH_MAX = 100;

/** Calls whose numbers (digits only, for a phone-like query), summary or transcript contain the query. */
function searchMatch(search: string) {
    const phoneLike = /^[\d\s()+-]+$/.test(search);
    const digits = search.replace(/\D/g, '');
    if (phoneLike && digits) return { $or: [{ from: { $regex: digits } }, { to: { $regex: digits } }] };
    const text = { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
    return { $or: [{ from: text }, { to: text }, { 'analysis.summary': text }, { 'turns.text': text }] };
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const SUB_MODULE = VOICE_AGENT_SUB_MODULES.CALL_LOGS;

function mapVoiceCallDoc(doc: VoiceCallDoc, agentName: string | null): VoiceCallListItem {
    return {
        _id: doc._id?.toString(),
        tenantId: doc.tenantId.toString(),
        userId: doc.userId.toString(),
        agentId: doc.agentId.toString(),
        numberId: doc.numberId ? doc.numberId.toString() : null,
        channel: doc.channel,
        direction: doc.direction,
        from: doc.from,
        to: doc.to,
        test: doc.test ?? null,
        voice: doc.voice,
        startedAt: doc.startedAt.toISOString(),
        endedAt: doc.endedAt.toISOString(),
        durationSec: doc.durationSec,
        endedBy: doc.endedBy,
        flags: (doc.flags ?? []).map(({ flag, quote }) => ({ flag, quote })),
        turns: (doc.turns ?? []).map(({ role, text }) => ({ role, text })),
        gapsMs: doc.gapsMs ?? [],
        providerCallId: doc.providerCallId,
        hasRecording: !!doc.recordingUrl,
        toolCalls: (doc.toolCalls ?? []).map((tool) => ({
            name: tool.name,
            arguments: tool.arguments ?? {},
            result: tool.result ?? '',
            ok: !!tool.ok,
            afterTurn: tool.afterTurn ?? 0,
            durationMs: tool.durationMs ?? 0,
            bookingId: tool.bookingId ? String(tool.bookingId) : null,
        })),
        variables: doc.variables ?? undefined,
        analysis: doc.analysis
            ? {
                  summary: doc.analysis.summary ?? null,
                  sentiment: doc.analysis.sentiment ?? null,
                  successful: typeof doc.analysis.successful === 'boolean' ? doc.analysis.successful : null,
                  fields: doc.analysis.fields ?? {},
                  model: doc.analysis.model,
                  error: doc.analysis.error ?? null,
              }
            : null,
        voicemailMessage: doc.voicemailMessage ?? null,
        memoryUsed: doc.memoryUsed
            ? { brief: doc.memoryUsed.brief, lastCallAt: new Date(doc.memoryUsed.lastCallAt).toISOString() }
            : null,
        cost: doc.cost ?? null,
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

async function findOwnedCall(owner: VoiceOwnerScope, callId: string): Promise<VoiceCallDoc> {
    const calls = await getCollection<VoiceCallDoc>(MongoCollections.VOICE_CALLS);
    const doc = await calls.findOne({ _id: toObjectId(callId, 'Call ID'), userId: owner.userId });
    if (!doc) throw new Error('Call not found');
    return doc;
}

/** The caller's calls, newest first: their current agents' (or every agent's) or one agent's, narrowed by the filters. */
export const listMyCalls = async (input: ListMyCallsInput = {}): Promise<ALApiResponse<VoiceCallListItem[]>> => {
    const agentId = input.agentId || null;
    if (agentId) assertValidObjectId(agentId, 'Agent ID');
    const success = input.success === 'yes' ? true : input.success === 'no' ? false : null;
    const kind = input.kind && Object.hasOwn(KIND_MATCH, input.kind) ? input.kind : null;
    const from = rangeStart(parseCallRange(input.range) ?? 'all');
    const search = String(input.search ?? '')
        .trim()
        .slice(0, SEARCH_MAX);
    const requested = Number(input.limit ?? DEFAULT_LIMIT);
    const limit = Number.isFinite(requested) ? Math.min(Math.max(Math.trunc(requested), 1), MAX_LIMIT) : DEFAULT_LIMIT;

    return runAuthenticatedAction(async function listMyCalls(userId) {
        const owner = await requireVoiceOwner(userId, SUB_MODULE);
        await ensureVoiceAgentIndexes();
        const calls = await getCollection<VoiceCallDoc>(MongoCollections.VOICE_CALLS);
        const filter = {
            userId: owner.userId,
            // WhatsApp chats live in the WhatsApp inbox; WhatsApp calls are calls and stay here.
            channel: { $ne: VoiceCallChannel.WHATSAPP },
            ...(await agentIdMatch(owner.userId, agentId, !!input.includeDeleted)),
            ...(success !== null ? { 'analysis.successful': success } : {}),
            ...(kind ? KIND_MATCH[kind] : {}),
            ...(from ? { startedAt: { $gte: from } } : {}),
            ...(search ? searchMatch(search) : {}),
        };
        const docs = await calls.find(filter).sort({ startedAt: -1 }).limit(limit).toArray();
        const names = await agentNamesById(docs.map((doc) => doc.agentId));
        return docs.map((doc) => mapVoiceCallDoc(doc, names.get(doc.agentId.toString()) ?? null));
    });
};

/** Each agent's call costs (or one agent's), most expensive first. */
export const getAgentCostTotals = async (agentId: string | null = null): Promise<ALApiResponse<VoiceAgentCostTotals[]>> => {
    if (agentId) assertValidObjectId(agentId, 'Agent ID');

    return runAuthenticatedAction(async function getAgentCostTotals(userId) {
        const owner = await requireVoiceOwner(userId, SUB_MODULE);
        const calls = await getCollection<VoiceCallDoc>(MongoCollections.VOICE_CALLS);
        const rows = await calls
            .aggregate<Omit<VoiceAgentCostTotals, 'agentId' | 'estimated'> & { _id: MongoObjectId; estimated: number }>([
                {
                    $match: {
                        userId: owner.userId,
                        ...(agentId ? { agentId: new MongoObjectId(agentId) } : {}),
                        cost: { $type: 'object' },
                    },
                },
                {
                    $group: {
                        _id: '$agentId',
                        calls: { $sum: 1 },
                        durationSec: { $sum: '$durationSec' },
                        totalUsd: { $sum: '$cost.totalUsd' },
                        geminiUsd: { $sum: '$cost.geminiUsd' },
                        providerUsd: { $sum: '$cost.providerUsd' },
                        estimated: {
                            $max: { $cond: [{ $and: ['$cost.provider', { $not: ['$cost.providerExact'] }] }, 1, 0] },
                        },
                    },
                },
                { $sort: { totalUsd: -1 } },
            ])
            .toArray();
        return rows.map(({ _id, estimated, ...totals }) => ({
            agentId: _id.toString(),
            ...totals,
            estimated: estimated === 1,
        }));
    });
};

/** One call with its transcript, flags and gaps. */
export const getCall = async (callId: string): Promise<ALApiResponse<VoiceCallListItem>> => {
    assertValidObjectId(callId, 'Call ID');

    return runAuthenticatedAction(async function getCall(userId) {
        const owner = await requireVoiceOwner(userId, SUB_MODULE);
        const doc = await findOwnedCall(owner, callId);
        const names = await agentNamesById([doc.agentId]);
        return mapVoiceCallDoc(doc, names.get(doc.agentId.toString()) ?? null);
    });
};

/**
 * The call's recording, as the page may see it (where it is kept, its format and length; no
 * credentials). The audio itself streams through `app/api/voice-agent/calls/[callId]/recording`,
 * which looks it up the same way, so the browser never holds an expiring or credentialed link.
 * See `findCallRecording` for each provider.
 */
export const getCallRecordingUrl = async (callId: string): Promise<ALApiResponse<CallRecordingResult>> => {
    assertValidObjectId(callId, 'Call ID');

    return runAuthenticatedAction(async function getCallRecordingUrl(userId): Promise<CallRecordingResult> {
        const owner = await requireVoiceOwner(userId, SUB_MODULE);
        const call = await findOwnedCall(owner, callId);
        return withoutCredentials(await findCallRecording(owner, call));
    });
};
