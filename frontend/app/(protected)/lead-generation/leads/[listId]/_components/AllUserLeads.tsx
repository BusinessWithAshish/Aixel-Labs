'use client';

import { ListFilter } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { usePage } from '@/contexts/PageStore';
import { TableExportPreviewDialog } from '@/components/common/table-export-preview/TableExportPreviewDialog';
import type { TUseAllLeadsPageReturn } from '../../_hooks/use-list-leads';
import { exportLeads, flattenLeadForExport, type LeadExportFormat } from '../../_utils/export-leads';
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
    const [exportPreviewOpen, setExportPreviewOpen] = useState(false);
    const [exportPreviewRows, setExportPreviewRows] = useState<Record<string, unknown>[]>([]);

    const {
        listId,
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
    const exportFileName = `leads-${listId}-${new Date().toISOString().slice(0, 10)}`;

    const selectedLeads = useMemo(
        () =>
            filteredLeads.filter(
                (lead) => typeof lead._id === 'string' && selectedLeadIds.has(lead._id),
            ),
        [filteredLeads, selectedLeadIds],
    );

    const allFilteredSelected = useMemo(() => {
        const ids = filteredLeads
            .map((l) => l._id)
            .filter((id): id is string => typeof id === 'string' && id.length > 0);
        return ids.length > 0 && ids.every((id) => selectedLeadIds.has(id));
    }, [filteredLeads, selectedLeadIds]);

    const handleExport = useCallback(
        (format: LeadExportFormat) => {
            if (selectedLeads.length === 0) {
                toast.error('No leads selected to export');
                return;
            }
            try {
                exportLeads(selectedLeads, format, exportFileName);
                toast.success(`Exported ${selectedLeads.length} lead(s)`);
            } catch (error) {
                toast.error(error instanceof Error ? error.message : 'Failed to export leads');
            }
        },
        [selectedLeads, exportFileName],
    );

    const handlePreviewExport = useCallback(() => {
        if (selectedLeads.length === 0) {
            toast.error('No leads selected to export');
            return;
        }
        setExportPreviewRows(selectedLeads.map(flattenLeadForExport));
        setExportPreviewOpen(true);
    }, [selectedLeads]);

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
                        onExport={handleExport}
                        onPreviewExport={handlePreviewExport}
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
                            variant="ghost"
                            size="icon"
                            className="relative"
                            onClick={() => setFilterSheetOpen(true)}
                            aria-label="Filter leads"
                        >
                            <ListFilter className="size-4" />
                            {filterPanel.filtersActive ? (
                                <span
                                    className="absolute top-1 right-1 size-2 rounded-full bg-primary"
                                    aria-hidden
                                />
                            ) : null}
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

            <TableExportPreviewDialog
                open={exportPreviewOpen}
                onOpenChange={setExportPreviewOpen}
                rows={exportPreviewRows}
                fileName={exportFileName}
                sheetName="Leads"
            />
        </Card>
    );
};
