'use client';

import { useState, useMemo, useCallback } from 'react';
import { LeadSource, type Lead } from '@aixellabs/shared/mongodb';
import type { GMAPS_SCRAPE_LEAD_INFO } from '@aixellabs/shared/common';
import { sortLeads, type SortKey, type SortDirection } from '@/components/common/lead-utils';
import { filterLeadsBySearch } from '@/helpers/lead-operations';
import { useNLQuery } from '@/hooks/use-nl-query';
import { toNumber } from '@/helpers/normalize-helpers';

export type FilterMode = 'manual' | 'ai';

/**
 * Hook for managing all leads page state and interactions
 * Supports two filter modes: manual (traditional) and AI (natural language)
 */
export const useAllLeadsPage = (leads: Lead[]) => {
    // Filter mode - determines which filtering logic to use
    const [filterMode, setFilterMode] = useState<FilterMode>('manual');

    // Source filter (applies to both modes)
    const [selectedSource, setSelectedSource] = useState<'all' | LeadSource>('all');

    // Manual filter state
    const [searchQuery, setSearchQuery] = useState('');
    const [sortKey, setSortKey] = useState<SortKey | null>(null);
    const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

    // Clean leads data (replace N/A with null)
    const cleanedLeads = useMemo(() => {
        return leads.map((lead) => ({
            ...lead,
            data: Object.fromEntries(Object.entries(lead.data).map(([key, value]) => [key, value === 'N/A' ? null : value])),
        })) as Lead[];
    }, [leads]);

    // Source filtered leads (base for both manual and AI filtering)
    const sourceFilteredLeads = useMemo(() => {
        if (selectedSource === 'all') return cleanedLeads;
        return cleanedLeads.filter((lead) => lead.source === selectedSource);
    }, [selectedSource, cleanedLeads]);

    // AI Query hook - always initialized with source-filtered leads

    const normalizedLeads = useMemo(() => {
        return sourceFilteredLeads.map((lead) => ({
            ...lead,
            data: {
                ...lead.data,
                numberOfReviews: toNumber((lead.data as GMAPS_SCRAPE_LEAD_INFO).numberOfReviews),
                overAllRating: toNumber((lead.data as GMAPS_SCRAPE_LEAD_INFO).overAllRating),
            } 
        }));
    }, [sourceFilteredLeads]);

    const nlQuery = useNLQuery({
        data: normalizedLeads,
        enableCache: true,
        debug: false,
    });

    // Manual filtered leads (search + sort)
    const manualFilteredLeads = useMemo(() => {
        // Apply search filter
        let result = filterLeadsBySearch(sourceFilteredLeads, searchQuery);

        // Apply sorting (only for Google Maps leads)
        if (sortKey) {
            const gmapsLeads = result.filter((lead) => lead.source === LeadSource.GOOGLE_MAPS);
            const otherLeads = result.filter((lead) => lead.source !== LeadSource.GOOGLE_MAPS);

            const leadsData = gmapsLeads.map((lead) => lead.data as GMAPS_SCRAPE_LEAD_INFO);
            const sortedData = sortLeads(leadsData, sortKey, sortDirection);

            const sortedGmapsLeads = sortedData
                .map((data) => gmapsLeads.find((l) => (l.data as GMAPS_SCRAPE_LEAD_INFO).placeId === data.placeId))
                .filter((lead): lead is Lead => lead !== undefined);

            result = [...sortedGmapsLeads, ...otherLeads];
        }

        return result;
    }, [sourceFilteredLeads, searchQuery, sortKey, sortDirection]);

    // Get filtered leads based on the current mode
    const filteredLeads = useMemo(() => {
        if (filterMode === 'ai') {
            return nlQuery.filteredData as Lead[];
        }
        return manualFilteredLeads;
    }, [filterMode, nlQuery.filteredData, manualFilteredLeads]);

    // Switch filter mode with reset
    const switchFilterMode = useCallback(
        (mode: FilterMode) => {
            if (mode === filterMode) return;

            // Reset the other mode's state when switching
            if (mode === 'manual') {
                nlQuery.clear();
            } else {
                setSearchQuery('');
                setSortKey(null);
            }

            setFilterMode(mode);
        },
        [filterMode, nlQuery],
    );

    // Reset all filters
    const resetFilters = useCallback(() => {
        setSearchQuery('');
        setSortKey(null);
        nlQuery.clear();
    }, [nlQuery]);

    return {
        // Data
        leads: cleanedLeads,
        filteredLeads,
        sourceFilteredLeads,

        // Filter mode
        filterMode,
        switchFilterMode,

        // Source filter
        selectedSource,
        setSelectedSource,

        // Manual filter controls
        searchQuery,
        setSearchQuery,
        sortKey,
        setSortKey,
        sortDirection,
        setSortDirection,

        // AI filter controls (exposed from nlQuery hook)
        nlQuery: nlQuery.query,
        setNlQuery: nlQuery.setQuery,
        executeNlSearch: nlQuery.executeSearch,
        isNlQueryLoading: nlQuery.isLoading,
        nlQueryError: nlQuery.error,
        clearNlQuery: nlQuery.clear,

        // Utilities
        resetFilters,
    };
};

export type TUseAllLeadsPageReturn = ReturnType<typeof useAllLeadsPage>;
