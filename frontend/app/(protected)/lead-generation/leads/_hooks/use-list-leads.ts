'use client';

import { createUserLeadListFromLeadIds, deleteUserLeads } from '@/app/actions/user-lead-actions';
import type { Lead, LeadSource } from '@aixellabs/backend/db/types';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useLeadsFilterPanel } from './use-leads-filter-panel';
import { sortLeads } from '../_utils/lead-sort';
import { runLeadEnrichment } from '../_utils/run-lead-enrichment';
import { setCreditsBadgeCache } from '@/components/common/credits/CreditsBadge';

function leadMatchesSearchQuery(lead: Lead, rawQuery: string): boolean {
    const q = rawQuery.trim().toLowerCase();
    if (!q) return true;
    const blob = `${JSON.stringify(lead.data)} ${lead.sourceId} ${JSON.stringify(lead.enriched ?? {})}`.toLowerCase();
    return blob.includes(q);
}

function buildFilteredListName(): string {
    const now = new Date();
    const weekday = now.toLocaleDateString(undefined, { weekday: 'long' });
    const time = now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true });
    return `Filtered leads ${weekday} ${time} ${now.getFullYear()}`;
}

export type AllLeadsPageData = {
    listId: string;
    leads: Lead[];
    /** Distinct lead sources actually present in this list (drives which filter sections show). */
    listSources: LeadSource[];
};

export const useAllLeadsPage = ({ listId, leads, listSources }: AllLeadsPageData) => {
    const router = useRouter();
    const [searchQuery, setSearchQuery] = useState('');
    const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
    const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(new Set());
    const [isDeleting, setIsDeleting] = useState(false);
    const [isCreatingList, setIsCreatingList] = useState(false);
    const [isEnriching, setIsEnriching] = useState(false);
    const enrichAbortRef = useRef<AbortController | null>(null);

    const filterPanel = useLeadsFilterPanel();

    const filteredLeads = useMemo(() => {
        const matched = leads.filter(
            (lead) => leadMatchesSearchQuery(lead, searchQuery) && filterPanel.matchesLead(lead),
        );
        return sortLeads(matched, filterPanel.filters.sort);
    }, [leads, filterPanel, searchQuery]);

    useEffect(() => setSelectedLeadIds(new Set()), [leads]);

    useEffect(() => {
        return () => {
            enrichAbortRef.current?.abort();
        };
    }, []);

    const selectLead = useCallback((leadId: string, selected: boolean) => {
        setSelectedLeadIds((prev) => {
            const next = new Set(prev);
            if (selected) next.add(leadId);
            else next.delete(leadId);
            return next;
        });
    }, []);

    const deselectAll = useCallback(() => {
        setSelectedLeadIds(new Set());
    }, []);

    const selectAllFiltered = useCallback(() => {
        setSelectedLeadIds(
            new Set(
                filteredLeads
                    .map((l) => l._id)
                    .filter((id): id is string => typeof id === 'string' && id.length > 0),
            ),
        );
    }, [filteredLeads]);

    const confirmBulkDelete = useCallback(async () => {
        const ids = [...selectedLeadIds];
        if (ids.length === 0) return;

        setIsDeleting(true);
        try {
            const result = await deleteUserLeads(listId, ids);
            if (result.success && result.data) {
                toast.success(`${ids.length} lead(s) deleted successfully`);
                setBulkDeleteOpen(false);
                setSelectedLeadIds(new Set());
                router.refresh();
            } else {
                toast.error(result.error ?? 'Failed to delete leads');
            }
        } finally {
            setIsDeleting(false);
        }
    }, [selectedLeadIds, listId, router]);

    const createListFromSelection = useCallback(async () => {
        const ids = [...selectedLeadIds];
        if (!ids.length || !filterPanel.filtersActive || isCreatingList) return;

        setIsCreatingList(true);
        try {
            const result = await createUserLeadListFromLeadIds({
                name: buildFilteredListName(),
                leadIds: ids,
            });
            if (!result.success || !result.data) {
                toast.error(result.error ?? 'Failed to create list');
                return;
            }
            toast.success(`Created list with ${result.data.copiedCount} lead(s)`);
            setSelectedLeadIds(new Set());
            router.push(`/lead-generation/leads/${result.data.listId}`);
        } finally {
            setIsCreatingList(false);
        }
    }, [selectedLeadIds, filterPanel.filtersActive, isCreatingList, router]);

    const enrichLeads = useCallback(async () => {
        if (isEnriching) return;
        const leadIds = [...selectedLeadIds];
        if (!leadIds.length) {
            toast.message('Select leads to enrich');
            return;
        }

        enrichAbortRef.current?.abort();
        const controller = new AbortController();
        enrichAbortRef.current = controller;
        setIsEnriching(true);
        try {
            const result = await runLeadEnrichment({
                leadIds,
                mode: 'selected',
                signal: controller.signal,
            });
            if (result && result.patched > 0) {
                if (!result.creditsExempt && result.remainingCredits != null) {
                    setCreditsBadgeCache(result.remainingCredits);
                }
                router.refresh();
            }
        } finally {
            if (enrichAbortRef.current === controller) {
                enrichAbortRef.current = null;
            }
            setIsEnriching(false);
        }
    }, [isEnriching, selectedLeadIds, router]);

    return {
        listId,
        leads,
        listSources,
        filteredLeads,
        searchQuery,
        setSearchQuery,
        selectedLeadIds,
        selectLead,
        deselectAll,
        selectAllFiltered,
        bulkDeleteOpen,
        setBulkDeleteOpen,
        confirmBulkDelete,
        isDeleting,
        filterPanel,
        createListFromSelection,
        isCreatingList,
        enrichLeads,
        isEnriching,
    };
};

export type TUseAllLeadsPageReturn = ReturnType<typeof useAllLeadsPage>;
