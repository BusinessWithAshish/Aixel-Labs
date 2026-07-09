'use client';

import { createUserLeadListFromLeadIds, deleteUserLeads } from '@/app/actions/user-lead-actions';
import type { Lead } from '@aixellabs/backend/db/types';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useLeadsFilterPanel } from './use-leads-filter-panel';

function leadMatchesSearchQuery(lead: Lead, rawQuery: string): boolean {
    const q = rawQuery.trim().toLowerCase();
    if (!q) return true;
    const blob = `${JSON.stringify(lead.data)} ${lead.sourceId}`.toLowerCase();
    return blob.includes(q);
}

function buildFilteredListName(): string {
    const now = new Date();
    const weekday = now.toLocaleDateString(undefined, { weekday: 'long' });
    const time = now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true });
    return `Filtered leads ${weekday} ${time} ${now.getFullYear()}`;
}

export const useAllLeadsPage = (leads: Lead[]) => {
    const router = useRouter();
    const [searchQuery, setSearchQuery] = useState('');
    const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
    const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(new Set());
    const [isDeleting, setIsDeleting] = useState(false);
    const [isCreatingList, setIsCreatingList] = useState(false);

    const filterPanel = useLeadsFilterPanel();

    const filteredLeads = useMemo(
        () => leads.filter((lead) => leadMatchesSearchQuery(lead, searchQuery) && filterPanel.matchesLead(lead)),
        [leads, searchQuery, filterPanel.matchesLead],
    );

    useEffect(() => setSelectedLeadIds(new Set()), [leads]);

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
            new Set(filteredLeads.map((l) => l._id).filter((id): id is string => typeof id === 'string' && id.length > 0)),
        );
    }, [filteredLeads]);

    const confirmBulkDelete = useCallback(async () => {
        const ids = [...selectedLeadIds];
        if (ids.length === 0) return;

        setIsDeleting(true);
        try {
            const result = await deleteUserLeads(ids);
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
    }, [selectedLeadIds, router]);

    const createListFromSelection = useCallback(async () => {
        const ids = [...selectedLeadIds];
        if (!ids.length || !filterPanel.filtersActive || isCreatingList) return;

        setIsCreatingList(true);
        try {
            const result = await createUserLeadListFromLeadIds({ name: buildFilteredListName(), leadIds: ids });
            if (!result.success || !result.data) {
                toast.error(result.error ?? 'Failed to create list');
                return;
            }
            toast.success(`Created list with ${result.data.movedCount} lead(s)`);
            setSelectedLeadIds(new Set());
            router.push(`/lead-generation/leads/${result.data.listId}`);
        } finally {
            setIsCreatingList(false);
        }
    }, [selectedLeadIds, filterPanel.filtersActive, isCreatingList, router]);

    return {
        leads,
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
    };
};

export type TUseAllLeadsPageReturn = ReturnType<typeof useAllLeadsPage>;
