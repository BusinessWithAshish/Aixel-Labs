'use server';

import {
    getCollection,
    MongoCollections,
    MongoObjectId,
    VOICE_AGENT_SUB_MODULES,
    VoiceBookingStatus,
    VoiceCampaignContactStatus,
    VoiceCampaignStatus,
    type VoiceBookingDoc,
    type VoiceCallDoc,
    type VoiceCallSentiment,
    type VoiceCampaignContactDoc,
    type VoiceCampaignDoc,
} from '@aixellabs/backend/db';
import { ALApiResponse } from '@aixellabs/backend/api/types';
import { assertValidObjectId, runAuthenticatedAction } from '@/helpers/server-action-helpers';
import {
    DAY_MS,
    DEFAULT_ANALYTICS_RANGE,
    parseCallRange,
    rangeStart,
    type VoiceCallRange,
} from '@/helpers/voice-call-ranges';
import { agentIdMatch } from '@/server/voice-agent/agent-match';
import { ensureVoiceAgentIndexes } from '@/server/voice-agent/indexes';
import { requireVoiceOwner } from '@/server/voice-agent/owner-scope';

export type VoiceAnalyticsInput = {
    agentId?: string | null;
    range?: VoiceCallRange;
    /** Also count agents that were deleted since (without an agent picked). */
    includeDeleted?: boolean;
};

/** A campaign's contacts by where they ended up. */
export type VoiceCampaignResult = {
    id: string;
    name: string;
    status: VoiceCampaignStatus;
    contacts: number;
    answered: number;
    unreached: number;
    failed: number;
    /** Not called yet, or being called now. */
    waiting: number;
    /** Never dialled: on the do-not-call list, or the campaign was cancelled first. */
    skipped: number;
    booked: number;
};

export type VoiceAgentCost = {
    agentId: string;
    agentName: string | null;
    calls: number;
    durationSec: number;
    totalUsd: number;
};

export type VoiceAnalytics = {
    /** Calls over time are counted per day, or per month over a year or more. */
    period: 'day' | 'month';
    calls: number;
    /** The other side spoke (a caller turn in the transcript). */
    answered: number;
    /** Talk time of the answered calls. */
    answeredSec: number;
    /** Calls the analysis gave a success verdict, and how many it judged successful. */
    judged: number;
    successful: number;
    /** Oldest first; every day in the range, also the quiet ones (months: only those with calls). */
    overTime: { period: string; answered: number; unanswered: number }[];
    /** `endedBy` reasons, commonest first. */
    endedBy: { reason: string; calls: number }[];
    sentiment: { sentiment: VoiceCallSentiment; calls: number }[];
    bookings: { booked: number; cancelled: number };
    /** Calls with a cost (the engine has priced calls since 2026-10-21). */
    cost: {
        calls: number;
        durationSec: number;
        totalUsd: number;
        /** Every `<part>Usd` of `VoiceCallCost` but the total (Gemini, the phone provider, analysis, …), dearest first. */
        parts: { part: string; usd: number }[];
        /** Some calls' phone part is still minutes × the provider's list rate. */
        estimated: boolean;
    };
    /** Dearest first. */
    costByAgent: VoiceAgentCost[];
    /** How long the caller waited for the agent to answer each time they stopped talking. */
    replies: {
        count: number;
        averageMs: number | null;
        /** `upToMs: null` = slower than the last bucket. */
        buckets: { upToMs: number | null; replies: number }[];
    };
    /** Campaigns of the agent that ran in the range, newest first. */
    campaigns: VoiceCampaignResult[];
};

const SUB_MODULE = VOICE_AGENT_SUB_MODULES.CUSTOM_AGENT_ANALYTICS;
// shortcut: every owner is counted in Indian time for now; take the owner's zone once accounts keep one.
const ANALYTICS_TIMEZONE = 'Asia/Kolkata';
const REPLY_BUCKETS_MS = [0, 500, 1000, 1500, 2000, 3000];
const CAMPAIGNS_SHOWN = 10;
const SENTIMENTS: VoiceCallSentiment[] = ['positive', 'neutral', 'negative'];

type CallFacets = {
    totals: { calls: number; answered: number; answeredSec: number; judged: number; successful: number }[];
    overTime: { _id: string; answered: number; unanswered: number }[];
    endedBy: { _id: string | null; calls: number }[];
    sentiment: { _id: VoiceCallSentiment; calls: number }[];
    costByAgent: (Omit<VoiceAgentCost, 'agentId'> & { _id: MongoObjectId; estimated: number })[];
    costParts: { _id: string; usd: number }[];
    replies: { _id: number | 'slower'; replies: number; totalMs: number }[];
};

const countIf = (condition: unknown) => ({ $sum: { $cond: [condition, 1, 0] } });

/** "2026-10-22" for each day from `from` to today, on the analytics clock. */
function daysSince(from: Date): string[] {
    const format = new Intl.DateTimeFormat('en-CA', { timeZone: ANALYTICS_TIMEZONE });
    const days = new Set<string>();
    for (let t = from.getTime(); t <= Date.now(); t += DAY_MS) days.add(format.format(t));
    days.add(format.format(Date.now()));
    return [...days];
}

/** Everything the owner's calls, bookings and campaigns add up to over a range: their current agents', every agent's or one agent's. */
export const getVoiceAnalytics = async (input: VoiceAnalyticsInput = {}): Promise<ALApiResponse<VoiceAnalytics>> => {
    const agentId = input.agentId || null;
    if (agentId) assertValidObjectId(agentId, 'Agent ID');
    const range = parseCallRange(input.range) ?? DEFAULT_ANALYTICS_RANGE;
    const from = rangeStart(range);
    const period = range === 'all' || range === '365' ? 'month' : 'day';

    return runAuthenticatedAction(async function getVoiceAnalytics(userId): Promise<VoiceAnalytics> {
        const owner = await requireVoiceOwner(userId, SUB_MODULE);
        await ensureVoiceAgentIndexes();
        const agentMatch = await agentIdMatch(owner.userId, agentId, !!input.includeDeleted);
        const answered = { $in: ['caller', { $ifNull: ['$turns.role', []] }] };

        const callsCol = await getCollection<VoiceCallDoc>(MongoCollections.VOICE_CALLS);
        const bookingsCol = await getCollection<VoiceBookingDoc>(MongoCollections.VOICE_BOOKINGS);
        const campaignsCol = await getCollection<VoiceCampaignDoc>(MongoCollections.VOICE_CAMPAIGNS);

        const [[facets], bookingRows, campaignDocs] = await Promise.all([
            callsCol
                .aggregate<CallFacets>([
                    { $match: { userId: owner.userId, ...agentMatch, ...(from ? { startedAt: { $gte: from } } : {}) } },
                    { $set: { answered } },
                    {
                        $facet: {
                            totals: [
                                {
                                    $group: {
                                        _id: null,
                                        calls: { $sum: 1 },
                                        answered: countIf('$answered'),
                                        answeredSec: { $sum: { $cond: ['$answered', '$durationSec', 0] } },
                                        judged: countIf({ $eq: [{ $type: '$analysis.successful' }, 'bool'] }),
                                        successful: countIf({ $eq: ['$analysis.successful', true] }),
                                    },
                                },
                                { $project: { _id: 0 } },
                            ],
                            overTime: [
                                {
                                    $group: {
                                        _id: {
                                            $dateToString: {
                                                date: '$startedAt',
                                                format: period === 'day' ? '%Y-%m-%d' : '%Y-%m',
                                                timezone: ANALYTICS_TIMEZONE,
                                            },
                                        },
                                        answered: countIf('$answered'),
                                        unanswered: countIf({ $not: ['$answered'] }),
                                    },
                                },
                                { $sort: { _id: 1 } },
                            ],
                            endedBy: [{ $group: { _id: '$endedBy', calls: { $sum: 1 } } }, { $sort: { calls: -1 } }],
                            sentiment: [
                                { $match: { 'analysis.sentiment': { $in: SENTIMENTS } } },
                                { $group: { _id: '$analysis.sentiment', calls: { $sum: 1 } } },
                            ],
                            costByAgent: [
                                { $match: { cost: { $type: 'object' } } },
                                {
                                    $group: {
                                        _id: '$agentId',
                                        calls: { $sum: 1 },
                                        durationSec: { $sum: '$durationSec' },
                                        totalUsd: { $sum: '$cost.totalUsd' },
                                        estimated: {
                                            $max: {
                                                $cond: [
                                                    { $and: ['$cost.provider', { $not: ['$cost.providerExact'] }] },
                                                    1,
                                                    0,
                                                ],
                                            },
                                        },
                                    },
                                },
                                { $sort: { totalUsd: -1 } },
                                {
                                    $lookup: {
                                        from: MongoCollections.VOICE_AGENTS,
                                        localField: '_id',
                                        foreignField: '_id',
                                        as: 'agent',
                                    },
                                },
                                { $set: { agentName: { $ifNull: [{ $arrayElemAt: ['$agent.name', 0] }, null] } } },
                                { $unset: 'agent' },
                            ],
                            costParts: [
                                { $match: { cost: { $type: 'object' } } },
                                { $project: { part: { $objectToArray: '$cost' } } },
                                { $unwind: '$part' },
                                { $match: { 'part.k': { $regex: /Usd$/, $ne: 'totalUsd' } } },
                                { $group: { _id: '$part.k', usd: { $sum: '$part.v' } } },
                                { $sort: { usd: -1 } },
                            ],
                            replies: [
                                { $unwind: '$gapsMs' },
                                {
                                    $bucket: {
                                        groupBy: '$gapsMs',
                                        boundaries: REPLY_BUCKETS_MS,
                                        default: 'slower',
                                        output: { replies: { $sum: 1 }, totalMs: { $sum: '$gapsMs' } },
                                    },
                                },
                            ],
                        },
                    },
                ])
                .toArray(),
            bookingsCol
                .aggregate<{ _id: VoiceBookingStatus; n: number }>([
                    { $match: { userId: owner.userId, ...agentMatch, ...(from ? { createdAt: { $gte: from } } : {}) } },
                    { $group: { _id: '$status', n: { $sum: 1 } } },
                ])
                .toArray(),
            // Campaigns that were started and still running, or finished inside the range.
            campaignsCol
                .find(
                    {
                        userId: owner.userId,
                        ...agentMatch,
                        startedAt: { $type: 'date' },
                        ...(from ? { $or: [{ completedAt: null }, { completedAt: { $gte: from } }] } : {}),
                    },
                    { projection: { name: 1, status: 1 } },
                )
                .sort({ createdAt: -1 })
                .limit(CAMPAIGNS_SHOWN)
                .toArray(),
        ]);

        const contactRows = campaignDocs.length
            ? await (
                  await getCollection<VoiceCampaignContactDoc>(MongoCollections.VOICE_CAMPAIGN_CONTACTS)
              )
                  .aggregate<{
                      _id: { campaignId: MongoObjectId; status: VoiceCampaignContactStatus };
                      n: number;
                      booked: number;
                  }>([
                      { $match: { userId: owner.userId, campaignId: { $in: campaignDocs.map((c) => c._id) } } },
                      {
                          $group: {
                              _id: { campaignId: '$campaignId', status: '$status' },
                              n: { $sum: 1 },
                              booked: countIf('$booked'),
                          },
                      },
                  ])
                  .toArray()
            : [];

        const totals = facets.totals[0] ?? { calls: 0, answered: 0, answeredSec: 0, judged: 0, successful: 0 };
        const overTimeByKey = new Map(facets.overTime.map(({ _id, ...row }) => [_id, row]));
        const overTime =
            period === 'day' && from
                ? daysSince(from).map((day) => ({
                      period: day,
                      ...(overTimeByKey.get(day) ?? { answered: 0, unanswered: 0 }),
                  }))
                : facets.overTime.map(({ _id, ...row }) => ({ period: _id, ...row }));

        const costByAgent = facets.costByAgent;
        const cost = costByAgent.reduce(
            (sum, row) => ({
                calls: sum.calls + row.calls,
                durationSec: sum.durationSec + row.durationSec,
                totalUsd: sum.totalUsd + row.totalUsd,
                estimated: sum.estimated || row.estimated === 1,
            }),
            { calls: 0, durationSec: 0, totalUsd: 0, estimated: false },
        );

        const replyCount = facets.replies.reduce((sum, b) => sum + b.replies, 0);
        const replyMs = facets.replies.reduce((sum, b) => sum + b.totalMs, 0);
        const bucketReplies = (id: number | 'slower') => facets.replies.find((b) => b._id === id)?.replies ?? 0;

        const status = (s: VoiceBookingStatus) => bookingRows.find((row) => row._id === s)?.n ?? 0;

        return {
            period,
            ...totals,
            overTime,
            endedBy: facets.endedBy.map(({ _id, calls }) => ({ reason: _id ?? '', calls })),
            sentiment: SENTIMENTS.map((sentiment) => ({
                sentiment,
                calls: facets.sentiment.find((row) => row._id === sentiment)?.calls ?? 0,
            })),
            bookings: { booked: status(VoiceBookingStatus.BOOKED), cancelled: status(VoiceBookingStatus.CANCELLED) },
            cost: { ...cost, parts: facets.costParts.map(({ _id, usd }) => ({ part: _id, usd })) },
            costByAgent: costByAgent.map(({ _id, agentName, calls, durationSec, totalUsd }) => ({
                agentId: _id.toString(),
                agentName,
                calls,
                durationSec,
                totalUsd,
            })),
            replies: {
                count: replyCount,
                averageMs: replyCount ? replyMs / replyCount : null,
                buckets: [
                    ...REPLY_BUCKETS_MS.slice(0, -1).map((start, i) => ({
                        upToMs: REPLY_BUCKETS_MS[i + 1],
                        replies: bucketReplies(start),
                    })),
                    { upToMs: null, replies: bucketReplies('slower') },
                ],
            },
            campaigns: campaignDocs.map((campaign) => {
                const rows = contactRows.filter((row) => row._id.campaignId.equals(campaign._id));
                const count = (...statuses: VoiceCampaignContactStatus[]) =>
                    rows.filter((row) => statuses.includes(row._id.status)).reduce((sum, row) => sum + row.n, 0);
                return {
                    id: campaign._id.toString(),
                    name: campaign.name,
                    status: campaign.status,
                    contacts: rows.reduce((sum, row) => sum + row.n, 0),
                    answered: count(VoiceCampaignContactStatus.ANSWERED),
                    unreached: count(VoiceCampaignContactStatus.UNREACHED),
                    failed: count(VoiceCampaignContactStatus.FAILED),
                    waiting: count(VoiceCampaignContactStatus.PENDING, VoiceCampaignContactStatus.CALLING),
                    skipped: count(VoiceCampaignContactStatus.SKIPPED_DNC, VoiceCampaignContactStatus.CANCELLED),
                    booked: rows.reduce((sum, row) => sum + row.booked, 0),
                };
            }),
        };
    });
};
