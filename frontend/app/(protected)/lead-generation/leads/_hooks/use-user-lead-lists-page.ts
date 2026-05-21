'use client';

import type { UserLeadList } from '@aixellabs/backend/db/types';
import { createUserLeadList, deleteUserLeadListById, updateUserLeadListById } from '@/app/actions/user-lead-lists-actions';
import { isValidObjectId } from '@/helpers/object-id';
import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';

export function useUserLeadListsPage(apiLeadLists: UserLeadList[]) {
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

    const selectedCount = selectedIds.size;
    const editDialogOpen = editListId !== null;

    const filteredLists = useMemo(() => {
        const q = listSearchQuery.trim().toLowerCase();
        if (!q) return lists;
        return lists.filter((l) => l.name.toLowerCase().includes(q) || (l.description?.toLowerCase().includes(q) ?? false));
    }, [lists, listSearchQuery]);

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
            setLists((prev) => [...prev, createdList]);
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
            toast.message('No lists to archive');
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
                toast.success(n === 1 ? 'List archived' : `${n} lists archived`);
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

    const requireSelection = useCallback(() => {
        if (selectedIds.size === 0) {
            toast.message('Select at least one list');
            return false;
        }
        return true;
    }, [selectedIds]);

    const sendToCrm = useCallback(() => {
        if (!requireSelection()) return;
        toast.success(`Send to CRM queued for ${selectedCount} list(s)`);
    }, [requireSelection, selectedCount]);

    const moveToSequence = useCallback(() => {
        if (!requireSelection()) return;
        toast.success(`Move to sequence queued for ${selectedCount} list(s)`);
    }, [requireSelection, selectedCount]);

    const enrich = useCallback(() => {
        if (!requireSelection()) return;
        toast.success(`Enrich queued for ${selectedCount} list(s)`);
    }, [requireSelection, selectedCount]);

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
        sendToCrm,
        moveToSequence,
        enrich,
    };
}

export type TUseUserLeadListsPageReturn = ReturnType<typeof useUserLeadListsPage>;
