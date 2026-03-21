'use client';

import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Database, Trash2, CheckSquare, Square } from 'lucide-react';
import { LeadSource, type Lead } from '@aixellabs/backend/db/types';
import type { GMAPS_INTERNAL_RESPONSE } from '@aixellabs/backend/gmaps/internal/types';
import { usePage } from '@/contexts/PageStore';
import type { TUseAllLeadsPageReturn } from '../_hooks';
import { DeleteAllLeadsDialog } from './DeleteAllLeadsDialog';
import { NLQueryInput } from '@/components/common/NLQueryInput';
import { useState, useEffect, useCallback } from 'react';
import { deleteUserLeads, deleteUserLeadsBySource } from '@/app/actions/user-lead-actions';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { motion } from 'motion/react';
import { GoogleMapLead } from '@/components/common/lead-card/GoogleMapLead';

export const AllUserLeads = () => {
    const router = useRouter();
    const {
        leads,
        filteredLeads,
        selectedSource,
        setSelectedSource,
        nlQuery,
        setNlQuery,
        executeNlSearch,
        isNlQueryLoading,
        nlQueryError,
        clearNlQuery,
    } = usePage<TUseAllLeadsPageReturn>();

    const [deleteAllDialogOpen, setDeleteAllDialogOpen] = useState(false);
    const [deleteBulkDialogOpen, setDeleteBulkDialogOpen] = useState(false);
    const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(new Set());
    const [isDeleting, setIsDeleting] = useState(false);

    const hasSelectedLeads = selectedLeadIds.size > 0;

    // Derive current leads for the active tab (used by select-all and list)
    const getLeadCountForSource = (source: 'all' | LeadSource) => {
        if (source === 'all') return leads.length;
        return leads.filter((lead) => lead.source === source).length;
    };
    const getLeadsForSource = (source: 'all' | LeadSource) => {
        if (source === 'all') return filteredLeads;
        return filteredLeads.filter((lead) => lead.source === source);
    };
    const currentLeads = getLeadsForSource(selectedSource);
    const currentLeadsCount = currentLeads.length;

    useEffect(() => {
        setSelectedLeadIds(new Set());
    }, [selectedSource]);

    const handleSelectLead = useCallback((leadId: string, selected: boolean) => {
        setSelectedLeadIds((prev) => {
            const next = new Set(prev);
            if (selected) next.add(leadId); else next.delete(leadId);
            return next;
        });
    }, []);

    const handleSelectAll = useCallback(() => {
        setSelectedLeadIds(new Set(currentLeads.map((lead) => lead._id as string)));
    }, [currentLeads]);

    const handleDeselectAll = useCallback(() => {
        setSelectedLeadIds(new Set());
    }, []);

    const isAllSelected = currentLeadsCount > 0 && selectedLeadIds.size === currentLeadsCount;
    const handleToggleSelectAll = useCallback(() => {
        if (isAllSelected) handleDeselectAll();
        else handleSelectAll();
    }, [isAllSelected, handleSelectAll, handleDeselectAll]);

    const handleConfirmDeleteAll = async () => {
        setIsDeleting(true);
        try {
            const result = await deleteUserLeadsBySource(selectedSource === 'all' ? undefined : selectedSource);
            if (result.success) {
                toast.success('Leads deleted successfully');
                setSelectedLeadIds(new Set());
                setDeleteAllDialogOpen(false);
                router.refresh();
            } else {
                toast.error(result.error || 'Failed to delete leads');
            }
        } finally {
            setIsDeleting(false);
        }
    };

    const handleConfirmDeleteSelected = async () => {
        setIsDeleting(true);
        try {
            const result = await deleteUserLeads(Array.from(selectedLeadIds));
            if (result.success) {
                toast.success(`${selectedLeadIds.size} lead(s) deleted successfully`);
                setDeleteBulkDialogOpen(false);
                setSelectedLeadIds(new Set());
                router.refresh();
            } else {
                toast.error(result.error || 'Failed to delete leads');
            }
        } finally {
            setIsDeleting(false);
        }
    };

    const getCategoryName = () => {
        if (selectedSource === 'all') return 'All';
        if (selectedSource === LeadSource.GOOGLE_MAPS) return 'Google Maps';
        if (selectedSource === LeadSource.INSTAGRAM) return 'Instagram';
        return 'All';
    };

    const getLeadCard = (lead: Lead) => {
        if (lead.source === LeadSource.GOOGLE_MAPS)
            return (
                <GoogleMapLead
                    key={lead._id as string}
                    data={lead.data as GMAPS_INTERNAL_RESPONSE}
                    showCheckbox
                    isSelected={selectedLeadIds.has(lead._id as string)}
                    onSelect={(checked) => handleSelectLead(lead._id as string, checked === true)}
                />
            );
        if (lead.source === LeadSource.INSTAGRAM) return null;
        return null;
    };

    // Render leads grid
    const renderLeadsList = (leadsToRender: Lead[]) => {
        if (leadsToRender.length === 0) {
            return (
                <div className="flex h-full flex-col items-center justify-center py-12 text-gray-500">
                    <Database className="w-12 h-12 mb-3 opacity-50" />
                    <p className="text-lg font-medium">No leads found</p>
                    <p className="text-sm mt-1 text-center px-4">
                        {nlQuery ? 'Try a different AI query' : 'Start scraping and save leads to see them here'}
                    </p>
                </div>
            );
        }

        return (
            <ScrollArea className="h-full">
                <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 p-1">
                    {leadsToRender.map((lead) => (
                        getLeadCard(lead)
                    ))}
                </div>
            </ScrollArea>
        );
    };

    return (
        <div className="h-full w-full flex flex-col gap-3 p-2 relative">
            {/* Action Bar */}
            <div className="flex items-center gap-2 flex-wrap">
                {currentLeadsCount > 0 && (
                    <Button
                        variant={isAllSelected ? 'default' : 'outline'}
                        size="sm"
                        onClick={handleToggleSelectAll}
                        className="gap-2"
                        aria-label={
                            isAllSelected
                                ? `Deselect all ${currentLeadsCount} leads`
                                : `Select all ${currentLeadsCount} leads`
                        }
                    >
                        {isAllSelected ? (
                            <CheckSquare className="w-4 h-4" />
                        ) : (
                            <Square className="w-4 h-4" />
                        )}
                        <span className="hidden sm:inline">
                            {isAllSelected ? 'Deselect All' : 'Select All'}
                        </span>
                        <span className="sm:hidden">
                            {isAllSelected ? 'None selected' : 'Select all'}
                        </span>
                        <span className="font-semibold">
                            ({selectedLeadIds.size}/{currentLeadsCount})
                        </span>
                    </Button>
                )}
                {hasSelectedLeads && (
                    <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => setDeleteBulkDialogOpen(true)}
                        className="gap-2"
                    >
                        <Trash2 className="w-4 h-4" />
                        <span className="hidden sm:inline">Delete Selected</span>
                        <span className="sm:hidden">Delete</span>
                        <span className="font-semibold">({selectedLeadIds.size})</span>
                    </Button>
                )}
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setDeleteAllDialogOpen(true)}
                    disabled={currentLeadsCount === 0}
                    className="gap-2 ml-auto"
                >
                    <Trash2 className="w-4 h-4" />
                    <span className="hidden sm:inline">Delete All</span>
                    <span className="sm:hidden">All</span>
                </Button>
                <span className="text-sm text-muted-foreground">
                    {currentLeadsCount} {currentLeadsCount === 1 ? 'lead' : 'leads'}
                </span>
            </div>

            {/* Source Tabs & Leads Grid */}
            <Tabs
                value={selectedSource}
                onValueChange={(value) => setSelectedSource(value as 'all' | LeadSource)}
                className="flex-1 flex flex-col min-h-0"
            >
                <TabsList className="grid w-full grid-cols-3 shrink-0">
                    <TabsTrigger value="all" className="text-xs sm:text-sm">
                        All ({getLeadCountForSource('all')})
                    </TabsTrigger>
                    <TabsTrigger value={LeadSource.GOOGLE_MAPS} className="text-xs sm:text-sm">
                        <span className="hidden sm:inline">Google Maps</span>
                        <span className="sm:hidden">GMaps</span>
                        <span className="ml-1">({getLeadCountForSource(LeadSource.GOOGLE_MAPS)})</span>
                    </TabsTrigger>
                    <TabsTrigger value={LeadSource.INSTAGRAM} className="text-xs sm:text-sm">
                        <span className="hidden sm:inline">Instagram</span>
                        <span className="sm:hidden">IG</span>
                        <span className="ml-1">({getLeadCountForSource(LeadSource.INSTAGRAM)})</span>
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="all" className="flex-1 min-h-0 mt-3">
                    {renderLeadsList(getLeadsForSource('all'))}
                </TabsContent>
                <TabsContent value={LeadSource.GOOGLE_MAPS} className="flex-1 min-h-0 mt-3">
                    {renderLeadsList(getLeadsForSource(LeadSource.GOOGLE_MAPS))}
                </TabsContent>
                <TabsContent value={LeadSource.INSTAGRAM} className="flex-1 min-h-0 mt-3">
                    {renderLeadsList(getLeadsForSource(LeadSource.INSTAGRAM))}
                </TabsContent>
            </Tabs>

            {/* Floating AI Filter */}
            <motion.div
                initial={{ opacity: 0, y: 100 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease: 'easeOut', delay: 0.1 }}
                className="absolute bottom-4 left-1/2 transform -translate-x-1/2 w-[80%] z-50 p-2"
            >
                <NLQueryInput
                    query={nlQuery}
                    setQuery={setNlQuery}
                    executeSearch={executeNlSearch}
                    isLoading={isNlQueryLoading}
                    error={nlQueryError}
                    clear={clearNlQuery}
                    placeholder="Talk to your leads... (e.g. 'What are the best restaurants in Mumbai?')"
                    resultCount={filteredLeads.length}
                    totalCount={leads.length}
                    showStatus={true}
                />
            </motion.div>

            {/* Dialogs */}
            <DeleteAllLeadsDialog
                open={deleteAllDialogOpen}
                onOpenChange={setDeleteAllDialogOpen}
                category={getCategoryName()}
                count={currentLeadsCount}
                onConfirm={handleConfirmDeleteAll}
                isDeleting={isDeleting}
            />
            <DeleteAllLeadsDialog
                open={deleteBulkDialogOpen}
                onOpenChange={setDeleteBulkDialogOpen}
                category="Selected"
                count={selectedLeadIds.size}
                onConfirm={handleConfirmDeleteSelected}
                isDeleting={isDeleting}
            />
        </div>
    );
};
