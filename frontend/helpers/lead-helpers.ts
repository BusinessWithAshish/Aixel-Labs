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