'use client';

import { useState, useMemo } from 'react';
import { LeadSource, type Lead } from '@aixellabs/shared/mongodb';
import type { GMAPS_SCRAPE_LEAD_INFO } from '@aixellabs/shared/common';
import { useNLQuery } from '@/hooks/use-nl-query';
import { toNumber } from '@/helpers/normalize-helpers';

export const useAllLeadsPage = (leads: Lead[]) => {
    const [selectedSource, setSelectedSource] = useState<'all' | LeadSource>('all');

    const cleanedLeads = useMemo(() => {
        return leads.map((lead) => ({
            ...lead,
            data: Object.fromEntries(Object.entries(lead.data).map(([key, value]) => [key, value === 'N/A' ? null : value])),
        })) as Lead[];
    }, [leads]);

    const sourceFilteredLeads = useMemo(() => {
        if (selectedSource === 'all') return cleanedLeads;
        return cleanedLeads.filter((lead) => lead.source === selectedSource);
    }, [selectedSource, cleanedLeads]);

    const normalizedLeads = useMemo(() => {
        return sourceFilteredLeads.map((lead) => ({
            ...lead,
            data: {
                ...lead.data,
                numberOfReviews: toNumber((lead.data as GMAPS_SCRAPE_LEAD_INFO).numberOfReviews),
                overAllRating: toNumber((lead.data as GMAPS_SCRAPE_LEAD_INFO).overAllRating),
            },
        }));
    }, [sourceFilteredLeads]);

    const nlQuery = useNLQuery({
        data: normalizedLeads,
        enableCache: true,
        debug: false,
    });

    const filteredLeads = nlQuery.filteredData as Lead[];

    return {
        leads: cleanedLeads,
        filteredLeads,
        sourceFilteredLeads,
        selectedSource,
        setSelectedSource,
        nlQuery: nlQuery.query,
        setNlQuery: nlQuery.setQuery,
        executeNlSearch: nlQuery.executeSearch,
        isNlQueryLoading: nlQuery.isLoading,
        nlQueryError: nlQuery.error,
        clearNlQuery: nlQuery.clear,
    };
};

export type TUseAllLeadsPageReturn = ReturnType<typeof useAllLeadsPage>;
