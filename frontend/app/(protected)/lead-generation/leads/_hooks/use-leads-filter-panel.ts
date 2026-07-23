'use client';

import { LeadSource, type Lead } from '@aixellabs/backend/db/types';
import useLocalStorageState from 'use-local-storage-state';
import { useCallback, useMemo } from 'react';
import { generateLocalStorageKey } from '@/helpers/generate-local-storage-key';
import {
    LEAD_FILTER_DEFAULTS,
    normalizeLeadFilterState,
    type FilterSource,
    type GoogleMapsFilters,
    type InstagramFilters,
    type LeadFilterState,
    type LinkedInFilters,
} from '../_utils/lead-filter-constants';
import { matchGoogleMaps, matchInstagram, matchLinkedIn } from '../_utils/lead-filter-matchers';
import type { LeadSortState } from '../_utils/lead-sort-constants';

export function useLeadsFilterPanel() {
    const [rawFilters, setFilters] = useLocalStorageState<LeadFilterState>(
        generateLocalStorageKey('leads-filters'),
        { defaultValue: LEAD_FILTER_DEFAULTS },
    );

    const filters = useMemo(() => normalizeLeadFilterState(rawFilters), [rawFilters]);

    // ─── Patch helpers ──────────────────────────────────────────────────────

    const setSources = (sources: FilterSource[]) => setFilters((prev) => ({ ...prev, sources }));

    const patchGoogleMaps = (patch: Partial<GoogleMapsFilters>) =>
        setFilters((prev) => ({
            ...prev,
            googleMaps: { ...normalizeLeadFilterState(prev).googleMaps, ...patch },
        }));

    const patchInstagram = (patch: Partial<InstagramFilters>) =>
        setFilters((prev) => ({ ...prev, instagram: { ...prev.instagram, ...patch } }));

    const patchLinkedIn = (patch: Partial<LinkedInFilters>) =>
        setFilters((prev) => ({ ...prev, linkedin: { ...prev.linkedin, ...patch } }));

    const patchSort = (patch: {
        googleMaps?: Partial<LeadSortState['googleMaps']>;
        instagram?: Partial<LeadSortState['instagram']>;
        linkedin?: Partial<LeadSortState['linkedin']>;
    }) =>
        setFilters((prev) => {
            const sort = normalizeLeadFilterState(prev).sort;
            return {
                ...prev,
                sort: {
                    googleMaps: { ...sort.googleMaps, ...patch.googleMaps },
                    instagram: { ...sort.instagram, ...patch.instagram },
                    linkedin: { ...sort.linkedin, ...patch.linkedin },
                },
            };
        });

    // ─── Match function ─────────────────────────────────────────────────────

    const matchesLead = useCallback(
        (lead: Lead) => {
            const { sources, googleMaps, instagram, linkedin } = filters;

            if (sources.length > 0 && !sources.includes(lead.source as FilterSource)) return false;

            switch (lead.source) {
                case LeadSource.GOOGLE_MAPS:
                case LeadSource.GOOGLE_MAPS_ADVANCED:
                    return matchGoogleMaps(lead.data, googleMaps);
                case LeadSource.INSTAGRAM:
                    return matchInstagram(lead.data, instagram);
                case LeadSource.LINKEDIN:
                    return matchLinkedIn(lead.data, linkedin);
                default:
                    return true;
            }
        },
        [filters],
    );

    // ─── Active state ───────────────────────────────────────────────────────

    const filtersActive = useMemo(
        () => JSON.stringify(filters) !== JSON.stringify(LEAD_FILTER_DEFAULTS),
        [filters],
    );

    const resetFilters = () => setFilters(LEAD_FILTER_DEFAULTS);

    return {
        filters,
        setSources,
        patchGoogleMaps,
        patchInstagram,
        patchLinkedIn,
        patchSort,
        matchesLead,
        filtersActive,
        resetFilters,
    };
}

export type UseLeadsFilterPanelReturn = ReturnType<typeof useLeadsFilterPanel>;
