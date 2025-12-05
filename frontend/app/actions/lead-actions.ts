'use server';

import { auth } from '@/auth';
import { saveLeadsForUser, getUserLeads, MongoObjectId, LeadSource, type Lead } from '@aixellabs/shared/mongodb';
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
