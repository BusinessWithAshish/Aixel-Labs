'use client';

import { Button } from '@/components/ui/button';
import { CardHeader, CardTitle, CardAction, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { usePage } from '@/contexts/PageStore';
import { Plus } from 'lucide-react';
import { useMemo } from 'react';
import type { TUseUserLeadListsPageReturn } from '../_hooks/use-user-lead-lists-page';
import { LeadBulkActionsDropdown } from './LeadBulkActionsDropdown';

export function LeadListsToolbar() {
    const {
        listSearchQuery,
        setListSearchQuery,
        filteredLists,
        selectedIds,
        openAddDialog,
        selectedCount,
        selectAllFiltered,
        deselectAll,
        requestDeleteFromMenu,
    } = usePage<TUseUserLeadListsPageReturn>();

    const allFilteredSelected = useMemo(() => {
        const ids = filteredLists.map((l) => l._id).filter((id): id is string => typeof id === 'string' && id.length > 0);
        return ids.length > 0 && ids.every((id) => selectedIds.has(id));
    }, [filteredLists, selectedIds]);

    return (
        <CardHeader>
            <CardTitle>User Lead List</CardTitle>
            <CardDescription className="flex flex-col gap-2">
                Manage your lead lists
                <Input
                    id="leadListSearch"
                    name="leadListSearch"
                    value={listSearchQuery}
                    onChange={(e) => setListSearchQuery(e.target.value)}
                    placeholder="Search lead lists…"
                    aria-label="Search lead lists"
                />
            </CardDescription>
            <CardAction className="flex flex-wrap items-center justify-end gap-2 self-end">
                {selectedCount === 0 ? (
                    <Button className="gap-2" onClick={openAddDialog}>
                        Add
                        <Plus className="size-4" />
                    </Button>
                ) : (
                    <LeadBulkActionsDropdown
                        selectedCount={selectedCount}
                        onSelectAll={selectAllFiltered}
                        selectAllDisabled={allFilteredSelected}
                        onDeselectAll={deselectAll}
                        onDelete={requestDeleteFromMenu}
                    />
                )}
            </CardAction>
        </CardHeader>
    );
}
