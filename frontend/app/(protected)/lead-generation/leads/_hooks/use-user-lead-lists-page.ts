'use client';

import type { UserLeadList } from '@aixellabs/backend/db/types';
import { LEAD_GENERATION_SUB_MODULES } from '@aixellabs/backend/db/types';
import { createUserLeadList, deleteUserLeadListById, updateUserLeadListById } from '@/app/actions/user-lead-lists-actions';
import { resolveEnrichmentTargets } from '@/app/actions/user-lead-actions';
import { isValidObjectId } from '@/helpers/object-id';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { getCreditCostPerItem } from '@/helpers/credits';
import { runLeadEnrichment } from '../_utils/run-lead-enrichment';
import { setCreditsBadgeCache } from '@/components/common/credits/CreditsBadge';
import { websiteDedupeKey } from '@/helpers/lead-website';

export function useUserLeadListsPage(apiLeadLists: UserLeadList[]) {
    const router = useRouter();
    const [lists, setLists] = useState<UserLeadList[]>(() => [...apiLeadLists]);
    const [listSearchQuery, setListSearchQuery] = useState('');
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [addDialogOpen, setAddDialogOpen] = useState(false);
    const [newName, setNewName] = useState('');
    const [newDescription, setNewDescription] = useState('');
    const [deleteTargetIds, setDeleteTargetIds] = useState<string[] | null>(null);
    const [deleteIntent, setDeleteIntent] = useState<'selected' | 'all' | null>(null);
    const [editListId, setEditListId] = useState<string | null>(null);
    const [editName, setEditName] = useState('');
    const [editDescription, setEditDescription] = useState('');
    const [editSubmitting, setEditSubmitting] = useState(false);
    const [addSubmitting, setAddSubmitting] = useState(false);
    const [deleteSubmitting, setDeleteSubmitting] = useState(false);
    const [enrichConfirmOpen, setEnrichConfirmOpen] = useState(false);
    const [enrichPreviewCount, setEnrichPreviewCount] = useState(0);
    const [enrichPreviewCost, setEnrichPreviewCost] = useState(0);
    const [isEnriching, setIsEnriching] = useState(false);
    const enrichAbortRef = useRef<AbortController | null>(null);

    const selectedCount = selectedIds.size;
    const editDialogOpen = editListId !== null;

    const filteredLists = useMemo(() => {
        const q = listSearchQuery.trim().toLowerCase();
        if (!q) return lists;
        return lists.filter((l) => l.name.toLowerCase().includes(q) || (l.description?.toLowerCase().includes(q) ?? false));
    }, [lists, listSearchQuery]);

    useEffect(() => {
        return () => {
            enrichAbortRef.current?.abort();
        };
    }, []);

    const toggleSelect = useCallback((id: string, checked: boolean) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (checked) next.add(id);
            else next.delete(id);
            return next;
        });
    }, []);

    const deselectAll = useCallback(() => {
        setSelectedIds(new Set());
    }, []);

    const selectAllFiltered = useCallback(() => {
        setSelectedIds(
            new Set(filteredLists.map((l) => l._id).filter((id): id is string => typeof id === 'string' && id.length > 0)),
        );
    }, [filteredLists]);

    const openAddDialog = useCallback(() => {
        setNewName('');
        setNewDescription('');
        setAddDialogOpen(true);
    }, []);

    const closeAddDialog = useCallback(
        (open: boolean) => {
            if (!open && addSubmitting) return;
            setAddDialogOpen(open);
        },
        [addSubmitting],
    );

    const submitNewList = useCallback(async () => {
        if (addSubmitting) return;
        const name = newName.trim();
        if (!name) {
            toast.error('Name is required');
            return;
        }
        const descTrimmed = newDescription.trim();
        const input: { name: string; description?: string } = { name };
        if (descTrimmed.length > 0) {
            input.description = descTrimmed;
        }

        setAddSubmitting(true);
        try {
            const res = await createUserLeadList(input);
            if (!res.success || !res.data) {
                toast.error(res.error ?? 'Failed to create lead list');
                return;
            }
            const createdList = res.data;
            setLists((prev) => [createdList, ...prev]);
            setAddDialogOpen(false);
            setNewName('');
            setNewDescription('');
            toast.success('Lead list added');
        } finally {
            setAddSubmitting(false);
        }
    }, [newName, newDescription, addSubmitting]);

    const openEditDialog = useCallback((list: UserLeadList) => {
        setEditListId(list._id?.toString() ?? null);
        setEditName(list.name);
        setEditDescription(list.description ?? '');
    }, []);

    const closeEditDialog = useCallback(
        (open: boolean) => {
            if (!open && editSubmitting) return;
            if (!open) {
                setEditListId(null);
                setEditName('');
                setEditDescription('');
            }
        },
        [editSubmitting],
    );

    const submitEditList = useCallback(async () => {
        if (editListId === null || editSubmitting) return;
        const name = editName.trim();
        const description = editDescription.trim();

        const closeAndReset = () => {
            setEditListId(null);
            setEditName('');
            setEditDescription('');
        };

        if (!isValidObjectId(editListId)) {
            setLists((prev) =>
                prev.map((l) => (l._id?.toString() === editListId ? { ...l, name, description, updatedAt: new Date() } : l)),
            );
            closeAndReset();
            toast.success('Lead list updated');
            return;
        }

        setEditSubmitting(true);
        try {
            const res = await updateUserLeadListById({
                listId: editListId,
                patch: { name, description },
            });

            if (!res.success || !res.data) {
                toast.error(res.error ?? 'Failed to update lead list');
                return;
            }

            const updated = res.data;
            setLists((prev) => prev.map((l) => (l._id?.toString() === editListId ? updated : l)));
            closeAndReset();
            toast.success('Lead list updated');
        } finally {
            setEditSubmitting(false);
        }
    }, [editListId, editName, editDescription, editSubmitting]);

    const requestDeleteFromMenu = useCallback(() => {
        if (lists.length === 0) {
            toast.message('No lists to delete');
            return;
        }
        if (selectedIds.size > 0) {
            setDeleteTargetIds([...selectedIds]);
            setDeleteIntent('selected');
        } else {
            setDeleteTargetIds(lists.map((l) => l._id).filter((id): id is string => Boolean(id)));
            setDeleteIntent('all');
        }
    }, [lists, selectedIds]);

    const confirmDelete = useCallback(async () => {
        if (!deleteTargetIds?.length || deleteSubmitting) return;
        const targetIds = deleteTargetIds;
        const localOnlyIds = targetIds.filter((id) => !isValidObjectId(id));
        const mongoIds = targetIds.filter((id) => isValidObjectId(id));

        setDeleteSubmitting(true);
        try {
            const outcomes =
                mongoIds.length > 0
                    ? await Promise.all(
                          mongoIds.map(async (listId) => {
                              const res = await deleteUserLeadListById(listId);
                              return { listId, ok: res.success };
                          }),
                      )
                    : [];
            const failedMongoIds = outcomes.filter((o) => !o.ok).map((o) => o.listId);
            const removedIds = new Set<string>([...localOnlyIds, ...mongoIds.filter((id) => !failedMongoIds.includes(id))]);

            if (removedIds.size > 0) {
                setLists((prev) => prev.filter((l) => !removedIds.has(l._id ?? '')));
                setSelectedIds((prev) => {
                    const next = new Set(prev);
                    for (const id of removedIds) next.delete(id);
                    return next;
                });
                const n = removedIds.size;
                toast.success(n === 1 ? 'List deleted' : `${n} lists deleted`);
            }

            if (failedMongoIds.length > 0) {
                toast.error(
                    failedMongoIds.length === 1
                        ? 'One list could not be deleted.'
                        : `${failedMongoIds.length} lists could not be deleted.`,
                );
            }

            if (removedIds.size > 0 || failedMongoIds.length === 0) {
                setDeleteTargetIds(null);
                setDeleteIntent(null);
            }
        } finally {
            setDeleteSubmitting(false);
        }
    }, [deleteTargetIds, deleteSubmitting]);

    const cancelDelete = useCallback(() => {
        if (deleteSubmitting) return;
        setDeleteTargetIds(null);
        setDeleteIntent(null);
    }, [deleteSubmitting]);

    const requestEnrichSelectedLists = useCallback(async () => {
        if (isEnriching || selectedIds.size === 0) return;
        const listIds = [...selectedIds].filter((id) => isValidObjectId(id));
        if (!listIds.length) {
            toast.error('Select saved lists to enrich');
            return;
        }
        const res = await resolveEnrichmentTargets({ listIds });
        if (!res.success || !res.data) {
            toast.error(res.error ?? 'Failed to resolve enrichment targets');
            return;
        }
        const uniqueDomains = new Set(res.data.map((t) => websiteDedupeKey(t.domain)).filter(Boolean));
        if (!uniqueDomains.size) {
            toast.message('Nothing to enrich', {
                description: 'No eligible websites in the selected lists.',
            });
            return;
        }
        const costPer = getCreditCostPerItem(LEAD_GENERATION_SUB_MODULES.CRAWL);
        setEnrichPreviewCount(uniqueDomains.size);
        setEnrichPreviewCost(uniqueDomains.size * costPer);
        setEnrichConfirmOpen(true);
    }, [isEnriching, selectedIds]);

    const confirmEnrichSelectedLists = useCallback(async () => {
        if (isEnriching) return;
        const listIds = [...selectedIds].filter((id) => isValidObjectId(id));
        if (!listIds.length) return;

        setEnrichConfirmOpen(false);
        enrichAbortRef.current?.abort();
        const controller = new AbortController();
        enrichAbortRef.current = controller;
        setIsEnriching(true);
        try {
            const result = await runLeadEnrichment({
                listIds,
                mode: 'bulk',
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
    }, [isEnriching, selectedIds, router]);

    const deleteDialogOpen = deleteTargetIds !== null;

    return {
        lists,
        filteredLists,
        listSearchQuery,
        setListSearchQuery,
        selectedIds,
        selectedCount,
        toggleSelect,
        deselectAll,
        selectAllFiltered,
        addDialogOpen,
        setAddDialogOpen: closeAddDialog,
        openAddDialog,
        newName,
        setNewName,
        newDescription,
        setNewDescription,
        submitNewList,
        addSubmitting,
        editDialogOpen,
        setEditDialogOpen: closeEditDialog,
        openEditDialog,
        editName,
        setEditName,
        editDescription,
        setEditDescription,
        submitEditList,
        editSubmitting,
        deleteDialogOpen,
        deleteTargetIds,
        deleteIntent,
        requestDeleteFromMenu,
        confirmDelete,
        cancelDelete,
        deleteSubmitting,
        requestEnrichSelectedLists,
        confirmEnrichSelectedLists,
        enrichConfirmOpen,
        setEnrichConfirmOpen,
        enrichPreviewCount,
        enrichPreviewCost,
        isEnriching,
    };
}

export type TUseUserLeadListsPageReturn = ReturnType<typeof useUserLeadListsPage>;
