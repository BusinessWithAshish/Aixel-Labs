'use client';

import { useState, useMemo } from 'react';
import { LeadSource, type Lead } from '@aixellabs/shared/mongodb';
import type { GMAPS_SCRAPE_LEAD_INFO } from '@aixellabs/shared/common';
import { sortLeads, type SortKey, type SortDirection } from '../../google-maps-scraper/_utils/lead-operations';

export type UseAllLeadsPageReturn = {
    leads: Lead[];
    filteredLeads: Lead[];
    selectedSource: 'all' | LeadSource;
    setSelectedSource: (source: 'all' | LeadSource) => void;
    searchQuery: string;
    setSearchQuery: (query: string) => void;
    sortKey: SortKey | null;
    setSortKey: (key: SortKey | null) => void;
    sortDirection: SortDirection;
    setSortDirection: (direction: SortDirection) => void;
    gmapsLeads: Lead[];
    instagramLeads: Lead[];
};

/**
 * Hook for managing all leads page state and interactions
 * Accepts server-fetched leads as initial data
 */
export const useAllLeadsPage = (leads: Lead[]): UseAllLeadsPageReturn => {
    const [selectedSource, setSelectedSource] = useState<'all' | LeadSource>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [sortKey, setSortKey] = useState<SortKey | null>(null);
    const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

    // Filter leads by source
    const gmapsLeads = useMemo(() => leads.filter((lead) => lead.source === LeadSource.GOOGLE_MAPS), [leads]);
    const instagramLeads = useMemo(() => leads.filter((lead) => lead.source === LeadSource.INSTAGRAM), [leads]);

    // Get leads based on selected source
    const sourceFilteredLeads = useMemo(() => {
        if (selectedSource === 'all') return leads;
        if (selectedSource === LeadSource.GOOGLE_MAPS) return gmapsLeads;
        if (selectedSource === LeadSource.INSTAGRAM) return instagramLeads;
        return leads;
    }, [selectedSource, leads, gmapsLeads, instagramLeads]);

    // Apply search filter
    const searchFilteredLeads = useMemo(() => {
        if (!searchQuery.trim()) return sourceFilteredLeads;

        const query = searchQuery.toLowerCase().trim();
        return sourceFilteredLeads.filter((lead) => {
            const leadData = lead.data as GMAPS_SCRAPE_LEAD_INFO;
            const name = leadData.name?.toLowerCase() || '';
            const website = leadData.website?.toLowerCase() || '';
            const phoneNumber = leadData.phoneNumber?.toLowerCase() || '';

            return name.includes(query) || website.includes(query) || phoneNumber.includes(query);
        });
    }, [sourceFilteredLeads, searchQuery]);

    // Apply sorting
    const filteredLeads = useMemo(() => {
        if (!sortKey) return searchFilteredLeads;

        // Extract GMAPS_SCRAPE_LEAD_INFO from Lead objects
        const leadsData = searchFilteredLeads.map((lead) => lead.data as GMAPS_SCRAPE_LEAD_INFO);

        // Sort the data
        const sortedData = sortLeads(leadsData, sortKey, sortDirection);

        // Map back to Lead objects maintaining the original structure
        return sortedData.map((data) => {
            const originalLead = searchFilteredLeads.find(
                (lead) => (lead.data as GMAPS_SCRAPE_LEAD_INFO).placeId === data.placeId,
            );
            return originalLead!;
        });
    }, [searchFilteredLeads, sortKey, sortDirection]);

    return {
        leads,
        filteredLeads,
        selectedSource,
        setSelectedSource,
        searchQuery,
        setSearchQuery,
        sortKey,
        setSortKey,
        sortDirection,
        setSortDirection,
        gmapsLeads,
        instagramLeads,
    };
};
