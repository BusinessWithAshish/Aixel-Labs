'use server';

import {
    getCollection,
    LeadSource,
    MongoCollections,
    type UserLeadDoc,
    type UserLeadListDoc,
} from '@aixellabs/backend/db';
import { ALApiResponse } from '@aixellabs/backend/api/types';
import { requireUserObjectId, runAuthenticatedAction } from '@/helpers/server-action-helpers';
import { getUserCreditsState } from '@/app/actions/credit-db';
import {
    DASHBOARD_LEAD_SOURCES,
    type LeadDayCount,
    type LeadGenerationDashboardStats,
    type LeadSourceCount,
    type RecentLeadListSummary,
} from '@/app/(protected)/_constants';

const TREND_DAYS = 14;

function emptyBySource(): LeadSourceCount[] {
    return DASHBOARD_LEAD_SOURCES.map((source) => ({ source, count: 0 }));
}

function buildTrendBuckets(from: Date, to: Date, rows: { date: string; count: number }[]): LeadDayCount[] {
    const byDate = new Map(rows.map((row) => [row.date, row.count]));
    const trend: LeadDayCount[] = [];
    const cursor = new Date(from);
    cursor.setUTCHours(0, 0, 0, 0);
    const end = new Date(to);
    end.setUTCHours(0, 0, 0, 0);

    while (cursor <= end) {
        const key = cursor.toISOString().slice(0, 10);
        trend.push({ date: key, count: byDate.get(key) ?? 0 });
        cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return trend;
}

export async function getLeadGenerationDashboardStats(): Promise<ALApiResponse<LeadGenerationDashboardStats>> {
    return runAuthenticatedAction(async function getLeadGenerationDashboardStats(userId) {
        const uid = requireUserObjectId(userId);
        const now = new Date();
        const trendStart = new Date(now);
        trendStart.setUTCDate(trendStart.getUTCDate() - (TREND_DAYS - 1));
        trendStart.setUTCHours(0, 0, 0, 0);

        const weekStart = new Date(now);
        weekStart.setUTCDate(weekStart.getUTCDate() - 6);
        weekStart.setUTCHours(0, 0, 0, 0);

        const userLeadsCollection = await getCollection<UserLeadDoc>(MongoCollections.USER_LEADS);
        const listsCollection = await getCollection<UserLeadListDoc>(MongoCollections.LEAD_LISTS);

        const [creditsState, totalLists, aggregation, recentListDocs] = await Promise.all([
            getUserCreditsState(uid),
            listsCollection.countDocuments({ userId: uid }),
            userLeadsCollection
                .aggregate<{
                    bySource: { _id: LeadSource; count: number }[];
                    trend: { _id: string; count: number }[];
                    total: { n: number }[];
                    thisWeek: { n: number }[];
                }>([
                    { $match: { userId: uid } },
                    {
                        $lookup: {
                            from: MongoCollections.LEADS,
                            localField: 'leadId',
                            foreignField: '_id',
                            as: 'lead',
                        },
                    },
                    { $unwind: '$lead' },
                    {
                        $match: {
                            'lead.source': { $in: [...DASHBOARD_LEAD_SOURCES] },
                        },
                    },
                    {
                        $facet: {
                            bySource: [{ $group: { _id: '$lead.source', count: { $sum: 1 } } }],
                            trend: [
                                { $match: { createdAt: { $gte: trendStart } } },
                                {
                                    $group: {
                                        _id: {
                                            $dateToString: {
                                                format: '%Y-%m-%d',
                                                date: '$createdAt',
                                            },
                                        },
                                        count: { $sum: 1 },
                                    },
                                },
                                { $sort: { _id: 1 } },
                            ],
                            total: [{ $count: 'n' }],
                            thisWeek: [
                                { $match: { createdAt: { $gte: weekStart } } },
                                { $count: 'n' },
                            ],
                        },
                    },
                ])
                .toArray(),
            listsCollection.find({ userId: uid }).sort({ createdAt: -1 }).limit(5).toArray(),
        ]);

        const facet = aggregation[0];
        const countBySource = new Map(
            (facet?.bySource ?? []).map((row) => [row._id, row.count] as const),
        );
        const bySource = emptyBySource().map((row) => ({
            ...row,
            count: countBySource.get(row.source) ?? 0,
        }));

        const totalLeads = facet?.total?.[0]?.n ?? 0;
        const leadsThisWeek = facet?.thisWeek?.[0]?.n ?? 0;
        const trend = buildTrendBuckets(
            trendStart,
            now,
            (facet?.trend ?? []).map((row) => ({ date: row._id, count: row.count })),
        );

        const recentListIds = recentListDocs
            .map((doc) => doc._id)
            .filter((id): id is NonNullable<typeof id> => id != null);

        const recentCountRows =
            recentListIds.length === 0
                ? []
                : await userLeadsCollection
                      .aggregate<{ _id: (typeof recentListIds)[number]; n: number }>([
                          { $match: { userId: uid, listId: { $in: recentListIds } } },
                          { $group: { _id: '$listId', n: { $sum: 1 } } },
                      ])
                      .toArray();
        const recentCountByListId = new Map(recentCountRows.map((row) => [row._id.toString(), row.n]));

        const recentLists: RecentLeadListSummary[] = recentListDocs
            .filter((doc) => doc._id != null)
            .map((doc) => ({
                id: doc._id!.toString(),
                name: doc.name,
                leadCount: recentCountByListId.get(doc._id!.toString()) ?? 0,
                createdAt: doc.createdAt.toISOString(),
            }));

        return {
            totalLeads,
            totalLists,
            leadsThisWeek,
            averageLeadsPerList: totalLists === 0 ? 0 : Math.round((totalLeads / totalLists) * 10) / 10,
            bySource,
            trend,
            recentLists,
            credits: creditsState.exempt ? null : creditsState.credits,
            creditsExempt: creditsState.exempt,
        };
    });
}
