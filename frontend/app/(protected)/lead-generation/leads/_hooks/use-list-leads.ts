'use client';

import { deleteUserLeads } from '@/app/actions/user-lead-actions';
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

export const useAllLeadsPage = (leads: Lead[]) => {
    const router = useRouter();
    const [searchQuery, setSearchQuery] = useState('');
    const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
    const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(new Set());
    const [isDeleting, setIsDeleting] = useState(false);

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
    };
};

export type TUseAllLeadsPageReturn = ReturnType<typeof useAllLeadsPage>;
