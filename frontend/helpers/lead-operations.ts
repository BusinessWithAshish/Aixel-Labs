import type { GMAPS_SCRAPE_LEAD_INFO, INSTAGRAM_SCRAPE_LEAD_INFO } from '@aixellabs/shared/common';
import { LeadSource, type Lead } from '@aixellabs/shared/mongodb';

/**
 * Format lead statistics for display
 */
export const formatLeadStats = (stats: {
    totalLeads: number;
    newLeads: number;
    newUserLeads: number;
    skippedLeads: number;
}) => {
    const messages: string[] = [];

    if (stats.newUserLeads > 0) {
        messages.push(`${stats.newUserLeads} new lead${stats.newUserLeads > 1 ? 's' : ''} saved to your collection`);
    }

    if (stats.skippedLeads > 0) {
        messages.push(`${stats.skippedLeads} lead${stats.skippedLeads > 1 ? 's were' : ' was'} already in your collection`);
    }

    if (stats.newLeads > 0 && stats.newLeads !== stats.newUserLeads) {
        messages.push(`${stats.newLeads} new lead${stats.newLeads > 1 ? 's' : ''} added to global database`);
    }

    return messages.join('. ');
};

/**
 * Extract source-specific data from a Lead
 */
export const extractLeadData = (lead: Lead): GMAPS_SCRAPE_LEAD_INFO | INSTAGRAM_SCRAPE_LEAD_INFO => {
    return lead.data;
};

/**
 * Check if a lead has minimum required information
 */
export const isValidLead = (lead: GMAPS_SCRAPE_LEAD_INFO, source: LeadSource): boolean => {
    if (source === LeadSource.GOOGLE_MAPS) {
        return !!(lead.placeId && (lead.name || lead.phoneNumber || lead.website));
    }
    // Add validation for other sources
    return false;
};

/**
 * Filter leads by validity
 */
export const filterValidLeads = (leads: GMAPS_SCRAPE_LEAD_INFO[], source: LeadSource): GMAPS_SCRAPE_LEAD_INFO[] => {
    return leads.filter((lead) => isValidLead(lead, source));
};

/**
 * Get lead display name
 */
export const getLeadDisplayName = (lead: GMAPS_SCRAPE_LEAD_INFO): string => {
    return lead.name || lead.phoneNumber || lead.website || 'Unknown Lead';
};

/**
 * Search leads by query string based on their source type
 * Returns true if the lead matches the search query
 */
export const searchLead = (lead: Lead, query: string): boolean => {
    const lowerQuery = query.toLowerCase().trim();
    
    if (lead.source === LeadSource.GOOGLE_MAPS) {
        const data = lead.data as GMAPS_SCRAPE_LEAD_INFO;
        const searchableFields = [
            data.name,
            data.website,
            data.phoneNumber,
        ];
        return searchableFields.some((field) => field?.toLowerCase().includes(lowerQuery));
    }
    
    if (lead.source === LeadSource.INSTAGRAM) {
        const data = lead.data as INSTAGRAM_SCRAPE_LEAD_INFO;
        const searchableFields = [
            data.username,
            data.bio,
            data.email,
            data.phoneNumber,
            data.website,
        ];
        return searchableFields.some((field) => field?.toLowerCase().includes(lowerQuery));
    }
    
    return false;
};

/**
 * Filter leads by search query
 */
export const filterLeadsBySearch = (leads: Lead[], query: string): Lead[] => {
    if (!query.trim()) return leads;
    return leads.filter((lead) => searchLead(lead, query));
};
