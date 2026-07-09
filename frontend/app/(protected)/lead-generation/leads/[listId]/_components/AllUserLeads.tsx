'use client';

import { ListFilter } from 'lucide-react';
import { useMemo, useState } from 'react';
import { usePage } from '@/contexts/PageStore';
import type { TUseAllLeadsPageReturn } from '../../_hooks/use-list-leads';
import { DeleteLeadsDialog } from './DeleteLeadsDialog';
import { LeadsFilterSheet } from './LeadsFilterSheet';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardAction } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { LeadBulkActionsDropdown } from '../../_components/LeadBulkActionsDropdown';
import { VirtualizedLeadGrid } from './VirtualizedLeadGrid';
import { NoDataFound } from '@/components/common/NoDataFound';

export const AllUserLeads = () => {
    const [filterSheetOpen, setFilterSheetOpen] = useState(false);

    const {
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
    } = usePage<TUseAllLeadsPageReturn>();

    const hasLeads = leads.length > 0;
    const showGrid = hasLeads && filteredLeads.length > 0;

    const allFilteredSelected = useMemo(() => {
        const ids = filteredLeads
            .map((l) => l._id)
            .filter((id): id is string => typeof id === 'string' && id.length > 0);
        return ids.length > 0 && ids.every((id) => selectedLeadIds.has(id));
    }, [filteredLeads, selectedLeadIds]);
    const emptyCopy = hasLeads
        ? { title: 'No matching leads', subtitle: 'Try a different search term or adjust the filters' }
        : { title: 'No leads found', subtitle: 'Start scraping and save leads to see them here' };

    return (
        <Card className="h-full w-full gap-2">
            <CardHeader>
                <CardTitle>
                    Leads ({filteredLeads.length})
                </CardTitle>
                <CardDescription>Manage your leads</CardDescription>
                <CardAction className="flex flex-wrap items-center justify-end gap-2 self-end">
                    <LeadBulkActionsDropdown
                        selectedCount={selectedLeadIds.size}
                        onSelectAll={selectAllFiltered}
                        selectAllDisabled={allFilteredSelected}
                        onDeselectAll={deselectAll}
                        onDelete={() => setBulkDeleteOpen(true)}
                        onCreateListFromFilters={filterPanel.filtersActive ? createListFromSelection : undefined}
                        createListFromFiltersDisabled={isCreatingList}
                        deleteLabel="Delete selected"
                    />
                </CardAction>
            </CardHeader>

            <CardContent className="flex flex-1 flex-col gap-2 overflow-hidden">
                {hasLeads ? (
                    <div className="flex items-center gap-2 my-1 shrink-0">
                        <Input
                            placeholder="Search leads..."
                            className="flex-1"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            aria-label="Search leads"
                        />
                        <Button
                            variant={filterPanel.filtersActive ? 'default' : 'outline'}
                            size="icon"
                            onClick={() => setFilterSheetOpen(true)}
                            aria-label="Filter leads"
                        >
                            <ListFilter className="size-4" />
                        </Button>
                    </div>
                ) : null}

                {showGrid ? (
                    <VirtualizedLeadGrid
                        leads={filteredLeads}
                        selectedLeadIds={selectedLeadIds}
                        onToggleSelect={selectLead}
                    />
                ) : (
                    <div className="flex min-h-48 flex-1" aria-live="polite">
                        <NoDataFound
                            showBackButton={false}
                            message={`${emptyCopy.title}. ${emptyCopy.subtitle}`}
                        />
                    </div>
                )}
            </CardContent>

            <DeleteLeadsDialog
                open={bulkDeleteOpen}
                onOpenChange={setBulkDeleteOpen}
                count={selectedLeadIds.size}
                onConfirm={confirmBulkDelete}
                isDeleting={isDeleting}
            />

            <LeadsFilterSheet
                open={filterSheetOpen}
                onOpenChange={setFilterSheetOpen}
                filterPanel={filterPanel}
            />
        </Card>
    );
};
