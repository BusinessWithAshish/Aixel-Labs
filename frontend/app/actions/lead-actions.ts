'use server';

import { auth } from '@/auth';
import { saveLeadsForUser, getUserLeads, MongoObjectId, LeadSource, type Lead, type UserLeadDoc, type LeadDoc } from '@aixellabs/shared/mongodb';
import type { GMAPS_SCRAPE_LEAD_INFO } from '@aixellabs/shared/common';

export type SaveLeadsResult = {
    success: boolean;
    error?: string;
    data?: {
        totalLeads: number;
        newLeads: number;
        newUserLeads: number;
        skippedLeads: number;
    };
};

export type GetUserLeadsResult = {
    success: boolean;
    error?: string;
    data?: Lead[];
};

/**
 * Server action to save leads for the current authenticated user
 */
export async function saveLeadsAction(
    leads: GMAPS_SCRAPE_LEAD_INFO[],
    source: LeadSource = LeadSource.GOOGLE_MAPS,
): Promise<SaveLeadsResult> {
    try {
        // Get current user session
        const session = await auth();

        if (!session?.user?.id) {
            return {
                success: false,
                error: 'You must be logged in to save leads',
            };
        }

        const userId = new MongoObjectId(session.user.id);

        // Transform leads to the format expected by saveLeadsForUser
        const leadsToSave = leads
            .filter((lead) => {
                // Filter out leads without sourceId
                if (source === LeadSource.GOOGLE_MAPS) {
                    return lead.placeId !== null && lead.placeId !== undefined;
                }
                // Add more source validations as needed
                return false;
            })
            .map((lead) => ({
                source,
                sourceId: lead.placeId!, // For Google Maps, use placeId
                data: lead,
            }));

        if (leadsToSave.length === 0) {
            return {
                success: false,
                error: 'No valid leads to save. Leads must have a placeId.',
            };
        }

        // Save leads using the MongoDB helper function
        const results = await saveLeadsForUser(userId, leadsToSave);

        // Calculate statistics
        const newLeads = results.filter((r) => r.isNewLead).length;
        const newUserLeads = results.filter((r) => r.isNewUserLead).length;
        const skippedLeads = results.filter((r) => !r.isNewUserLead).length;

        return {
            success: true,
            data: {
                totalLeads: results.length,
                newLeads,
                newUserLeads,
                skippedLeads,
            },
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

/**
 * Server action to get all saved leads for the current authenticated user
 */
export async function getUserLeadsAction(source?: LeadSource): Promise<GetUserLeadsResult> {
    try {
        // Get current user session
        const session = await auth();

        if (!session?.user?.id) {
            return {
                success: false,
                error: 'You must be logged in to view saved leads',
            };
        }

        const userId = new MongoObjectId(session.user.id);

        // Fetch user's leads
        const leadsDoc = await getUserLeads(userId, source);

        // Convert to frontend format (ObjectId to string)
        const leads: Lead[] = leadsDoc.map((lead) => ({
            _id: lead._id.toString(),
            source: lead.source,
            sourceId: lead.sourceId,
            data: lead.data,
        }));

        return {
            success: true,
            data: leads,
        };
    } catch (error) {
        console.error('Error fetching user leads:', error);
        const errorMessage = error instanceof Error ? error.message : 'Failed to fetch leads';
        return {
            success: false,
            error: errorMessage,
        };
    }
}

export type DeleteLeadResult = {
    success: boolean;
    error?: string;
};

export async function deleteLeadAction(leadId: string): Promise<DeleteLeadResult> {
    try {
        const session = await auth();

        if (!session?.user?.id) {
            return {
                success: false,
                error: 'You must be logged in to delete leads',
            };
        }

        const userId = new MongoObjectId(session.user.id);
        const leadObjectId = new MongoObjectId(leadId);

        const { getCollection, MongoCollections } = await import('@aixellabs/shared/mongodb');
        const userLeadsCollection = await getCollection(MongoCollections.USER_LEADS);

        const result = await userLeadsCollection.deleteOne({ userId, leadId: leadObjectId });

        if (result.deletedCount === 0) {
            return {
                success: false,
                error: 'Lead not found or already deleted',
            };
        }

        return { success: true };
    } catch (error) {
        console.error('Error deleting lead:', error);
        const errorMessage = error instanceof Error ? error.message : 'Failed to delete lead';
        return {
            success: false,
            error: errorMessage,
        };
    }
}

export async function deleteLeadsAction(leadIds: string[]): Promise<DeleteLeadResult> {
    try {
        const session = await auth();

        if (!session?.user?.id) {
            return {
                success: false,
                error: 'You must be logged in to delete leads',
            };
        }

        const userId = new MongoObjectId(session.user.id);
        const leadObjectIds = leadIds.map((id) => new MongoObjectId(id));

        const { getCollection, MongoCollections } = await import('@aixellabs/shared/mongodb');
        const userLeadsCollection = await getCollection(MongoCollections.USER_LEADS);

        await userLeadsCollection.deleteMany({
            userId,
            leadId: { $in: leadObjectIds },
        });

        return { success: true };
    } catch (error) {
        console.error('Error deleting leads:', error);
        const errorMessage = error instanceof Error ? error.message : 'Failed to delete leads';
        return {
            success: false,
            error: errorMessage,
        };
    }
}

export async function deleteLeadsBySourceAction(source?: LeadSource): Promise<DeleteLeadResult> {
    try {
        const session = await auth();

        if (!session?.user?.id) {
            return {
                success: false,
                error: 'You must be logged in to delete leads',
            };
        }

        const userId = new MongoObjectId(session.user.id);

        const { getCollection, MongoCollections } = await import('@aixellabs/shared/mongodb');
        const userLeadsCollection = await getCollection(MongoCollections.USER_LEADS);
        const leadsCollection = await getCollection(MongoCollections.LEADS);

        const userLeads = (await userLeadsCollection.find({ userId }).toArray()) as UserLeadDoc[];
        const leadIds = userLeads.map((ul) => ul.leadId);

        if (leadIds.length === 0) {
            return { success: true };
        }

        const query: { _id: { $in: typeof leadIds }; source?: LeadSource } = { _id: { $in: leadIds } };
        if (source) {
            query.source = source;
        }

        const leadsToDelete = (await leadsCollection.find(query).toArray()) as LeadDoc[];
        const leadIdsToDelete = leadsToDelete.map((lead) => lead._id);

        if (leadIdsToDelete.length === 0) {
            return { success: true };
        }

        await userLeadsCollection.deleteMany({
            userId,
            leadId: { $in: leadIdsToDelete },
        });

        return { success: true };
    } catch (error) {
        console.error('Error deleting leads:', error);
        const errorMessage = error instanceof Error ? error.message : 'Failed to delete leads';
        return {
            success: false,
            error: errorMessage,
        };
    }
}

export type UpdateLeadNotesResult = {
    success: boolean;
    error?: string;
};

export async function updateLeadNotesAction(leadId: string, notes: string): Promise<UpdateLeadNotesResult> {
    try {
        const session = await auth();

        if (!session?.user?.id) {
            return {
                success: false,
                error: 'You must be logged in to update notes',
            };
        }

        const userId = new MongoObjectId(session.user.id);
        const leadObjectId = new MongoObjectId(leadId);

        const { getCollection, MongoCollections } = await import('@aixellabs/shared/mongodb');
        const userLeadsCollection = await getCollection(MongoCollections.USER_LEADS);

        const result = await userLeadsCollection.updateOne(
            { userId, leadId: leadObjectId },
            { $set: { notes, updatedAt: new Date() } }
        );

        if (result.modifiedCount === 0) {
            return {
                success: false,
                error: 'Lead not found',
            };
        }

        return { success: true };
    } catch (error) {
        console.error('Error updating notes:', error);
        const errorMessage = error instanceof Error ? error.message : 'Failed to update notes';
        return {
            success: false,
            error: errorMessage,
        };
    }
}

export async function updateLeadsNotesAction(leadIds: string[], notes: string): Promise<UpdateLeadNotesResult> {
    try {
        const session = await auth();

        if (!session?.user?.id) {
            return {
                success: false,
                error: 'You must be logged in to update notes',
            };
        }

        const userId = new MongoObjectId(session.user.id);
        const leadObjectIds = leadIds.map((id) => new MongoObjectId(id));

        const { getCollection, MongoCollections } = await import('@aixellabs/shared/mongodb');
        const userLeadsCollection = await getCollection(MongoCollections.USER_LEADS);

        await userLeadsCollection.updateMany(
            { userId, leadId: { $in: leadObjectIds } },
            { $set: { notes, updatedAt: new Date() } }
        );

        return { success: true };
    } catch (error) {
        console.error('Error updating notes:', error);
        const errorMessage = error instanceof Error ? error.message : 'Failed to update notes';
        return {
            success: false,
            error: errorMessage,
        };
    }
}
