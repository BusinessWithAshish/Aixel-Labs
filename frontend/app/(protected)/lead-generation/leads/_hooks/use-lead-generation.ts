'use client';

import { useState, useMemo } from 'react';
import { LeadSource, type Lead } from '@aixellabs/backend/db/types';
import type { GMAPS_INTERNAL_RESPONSE } from '@aixellabs/backend/gmaps/internal/types';
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
                reviewCount: toNumber((lead.data as GMAPS_INTERNAL_RESPONSE).reviewCount),
                rating: toNumber((lead.data as GMAPS_INTERNAL_RESPONSE).rating),
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
