'use server';

import { Lead, LeadDoc, LeadSource, MongoCollections, MongoObjectId, getCollection, LeadData} from '@aixellabs/backend/db';
import type { ObjectId, UserLeadDoc } from '@aixellabs/backend/db';
import { withAuthentication } from './auth-actions';
import { ALApiResponse } from '@aixellabs/backend/api/types';

export const getAllUserLeads = async (): Promise<ALApiResponse<Lead[]>> => {
    try {
        const userLeadsResponse = await withAuthentication(async (userId) => {
            const userLeadsCollection = await getCollection<UserLeadDoc>(MongoCollections.USER_LEADS);
            const userLeads = await userLeadsCollection.find({ userId: new MongoObjectId(userId) }).toArray();
            if (!userLeads.length) return [];
            const leadIds = userLeads.map((ul) => ul.leadId);
            if (!leadIds.length) return [];
            const leadsCollection = await getCollection<LeadDoc>(MongoCollections.LEADS);
            const userDefinedLeads = await leadsCollection.find({ _id: { $in: leadIds } }).toArray();
            if (!userDefinedLeads.length) return [];

            const leads: Lead[] = userDefinedLeads.map((lead) => ({
                _id: lead._id.toString(),
                source: lead.source,
                sourceId: lead.sourceId,
                data: lead.data,
            }));
            return leads;
        });

        if (!userLeadsResponse?.success)
            return {
                success: false,
                error: userLeadsResponse.error,
            };
        return {
            success: true,
            data: userLeadsResponse.data ?? [],
        };
    } catch (error) {
        console.error('Error fetching user leads:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to fetch leads',
        };
    }
};

type SaveUserLeadsBySourceResult = {
    success: boolean;
    error?: string;
    data?: {
        totalLeads: number;
        newLeads: number;
        newUserLeads: number;
        skippedLeads: number;
    };
};

// TODO: Change the return type to be more BE type.
export async function saveUserLeadsBySource(leads: LeadData[], source: LeadSource): Promise<SaveUserLeadsBySourceResult> {
    try {
        const saveUserLeadsResponse = await withAuthentication(async (userId) => {
            const leadsCollection = await getCollection<LeadDoc>(MongoCollections.LEADS);
            const userLeadsCollection = await getCollection<UserLeadDoc>(MongoCollections.USER_LEADS);
            const userIdObj = new MongoObjectId(userId);

            let newLeads = 0;
            let newUserLeads = 0;
            let skippedLeads = 0;

            for (const lead of leads) {
                // 1. Ensure lead exists in leads collection: update if exists, insert if not
                const existingLead = await leadsCollection.findOne({
                    source: source,
                    sourceId: lead.id as string,
                });

                let leadId: ObjectId;

                if (existingLead) {
                    leadId = existingLead._id as ObjectId;
                    await leadsCollection.updateOne({ _id: leadId }, { $set: { data: lead } });
                } else {
                    leadId = new MongoObjectId();
                    await leadsCollection.insertOne({
                        _id: leadId,
                        source: source,
                        sourceId: lead.id as string,
                        data: lead,
                    });
                    newLeads += 1;
                }

                // 2. Link to user via user_leads if not already saved for this user
                const existingUserLead = await userLeadsCollection.findOne({
                    userId: userIdObj,
                    leadId,
                });

                if (existingUserLead) {
                    skippedLeads += 1;
                } else {
                    const now = new Date();
                    await userLeadsCollection.insertOne({
                        userId: userIdObj,
                        leadId,
                        createdAt: now,
                        updatedAt: now,
                    } as UserLeadDoc);
                    newUserLeads += 1;
                }
            }

            return {
                totalLeads: leads.length,
                newLeads,
                newUserLeads,
                skippedLeads,
            };
        });

        if (!saveUserLeadsResponse.success) {
            return {
                success: false,
                error: saveUserLeadsResponse.error,
            };
        }

        return {
            success: true,
            data: saveUserLeadsResponse.data,
        };
    } catch (error) {
        console.error('Error saving leads:', error);
        const errorMessage = error instanceof Error ? error.message : 'Failed to save leads';
        return {
            success: false,
            error: errorMessage,
        };
    }
}

type DeleteResult = { success: boolean; error?: string };
type UpdateNotesResult = { success: boolean; error?: string };

export async function deleteUserLead(leadId: string): Promise<DeleteResult> {
    try {
        const deletedLeadResponse = await withAuthentication(async (userId) => {
            const userLeadsCollection = await getCollection<UserLeadDoc>(MongoCollections.USER_LEADS);

            const deletedLeadResponse = await userLeadsCollection.deleteOne({
                userId: new MongoObjectId(userId),
                leadId: new MongoObjectId(leadId),
            });

            if (deletedLeadResponse.deletedCount === 0) throw new Error('Lead not found or already deleted');
        });
        if (!deletedLeadResponse?.success)
            return {
                success: false,
                error: deletedLeadResponse.error,
            };
        return {
            success: true,
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to delete lead',
        };
    }
}

export async function deleteUserLeads(leadIds: string[]): Promise<DeleteResult> {
    try {
        const deletedLeadsResponse = await withAuthentication(async (userId) => {
            const userLeadsCollection = await getCollection<UserLeadDoc>(MongoCollections.USER_LEADS);
            await userLeadsCollection.deleteMany({
                userId: new MongoObjectId(userId),
                leadId: { $in: leadIds.map((id) => new MongoObjectId(id)) },
            });
        });
        if (!deletedLeadsResponse?.success)
            return {
                success: false,
                error: deletedLeadsResponse.error,
            };
        return {
            success: true,
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to delete leads',
        };
    }
}

export async function deleteUserLeadsBySource(source?: LeadSource): Promise<DeleteResult> {
    try {
        const deletedLeadsBySourceResponse = await withAuthentication(async (userId) => {
            const uid = new MongoObjectId(userId);

            const userLeadsCollection = await getCollection(MongoCollections.USER_LEADS);

            const leadsCollection = await getCollection(MongoCollections.LEADS);

            const userLeads = (await userLeadsCollection.find({ userId: uid }).toArray()) as UserLeadDoc[];

            const leadIds = userLeads.map((ul) => ul.leadId);

            if (leadIds.length === 0) return;
            const query: { _id: { $in: typeof leadIds }; source?: LeadSource } = { _id: { $in: leadIds } };
            if (source) query.source = source;
            const leadsToDelete = (await leadsCollection.find(query).toArray()) as LeadDoc[];
            const leadIdsToDelete = leadsToDelete.map((lead) => lead._id);
            if (leadIdsToDelete.length === 0) return;
            await userLeadsCollection.deleteMany({ userId: uid, leadId: { $in: leadIdsToDelete } });
        });
        if (!deletedLeadsBySourceResponse.success)
            return {
                success: false,
                error: deletedLeadsBySourceResponse.error,
            };
        return {
            success: true,
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to delete leads by source',
        };
    }
}

export async function updateUserLeadNotes(leadId: string, notes: string): Promise<UpdateNotesResult> {
    try {
        const updatedNotesResponse = await withAuthentication(async (userId) => {
            const userLeadsCollection = await getCollection<UserLeadDoc>(MongoCollections.USER_LEADS);
            const updatedNotesResponse = await userLeadsCollection.updateOne(
                { userId: new MongoObjectId(userId), leadId: new MongoObjectId(leadId) },
                { $set: { notes, updatedAt: new Date() } },
            );
            if (updatedNotesResponse.modifiedCount === 0) throw new Error('Lead not found');
        });
        if (!updatedNotesResponse.success)
            return {
                success: false,
                error: updatedNotesResponse.error,
            };
        return {
            success: true,
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to update notes',
        };
    }
}

export async function updateUserLeadsNotes(leadIds: string[], notes: string): Promise<UpdateNotesResult> {
    try {
        await withAuthentication(async (userId) => {
            const userLeadsCollection = await getCollection<UserLeadDoc>(MongoCollections.USER_LEADS);
            await userLeadsCollection.updateMany(
                { userId: new MongoObjectId(userId), leadId: { $in: leadIds.map((id) => new MongoObjectId(id)) } },
                { $set: { notes, updatedAt: new Date() } },
            );
        });
        return {
            success: true,
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to update notes',
        };
    }
}
