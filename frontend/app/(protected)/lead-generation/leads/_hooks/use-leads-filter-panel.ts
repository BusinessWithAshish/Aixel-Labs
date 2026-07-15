'use client';

import { LeadSource, type Lead } from '@aixellabs/backend/db/types';
import { matchGmapsPlace, toGmapsPlace } from '@aixellabs/backend/gmaps/filters';
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
import { matchInstagram, matchLinkedIn } from '../_utils/lead-filter-matchers';

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

    // ─── Match function ─────────────────────────────────────────────────────

    const matchesLead = useCallback(
        (lead: Lead) => {
            const { sources, googleMaps, instagram, linkedin } = filters;

            if (sources.length > 0 && !sources.includes(lead.source as FilterSource)) return false;

            switch (lead.source) {
                case LeadSource.GOOGLE_MAPS:
                    return matchGmapsPlace(toGmapsPlace(lead.data), googleMaps);
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
        matchesLead,
        filtersActive,
        resetFilters,
    };
}

export type TUseLeadsFilterPanelReturn = ReturnType<typeof useLeadsFilterPanel>;
