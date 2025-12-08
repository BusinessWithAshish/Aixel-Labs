'use client';

import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Database, Search, ArrowUpDown, X, Trash2, StickyNote } from 'lucide-react';
import { LeadSource, type Lead } from '@aixellabs/shared/mongodb';
import type { GMAPS_SCRAPE_LEAD_INFO } from '@aixellabs/shared/common';
import { LeadCard } from '@/components/common/LeadCard';
import { usePage } from '@/contexts/PageStore';
import type { UseAllLeadsPageReturn } from '../_hooks';
import type { SortKey } from '../../google-maps-scraper/_utils/lead-operations';
import { DeleteAllLeadsDialog } from './DeleteAllLeadsDialog';
import { AddNotesDialog } from './AddNotesDialog';
import { useState, useMemo } from 'react';
import {
    deleteLeadAction,
    deleteLeadsAction,
    deleteLeadsBySourceAction,
    updateLeadNotesAction,
    updateLeadsNotesAction,
} from '@/app/actions/lead-actions';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

export const AllUserLeads = () => {
    const router = useRouter();
    const {
        leads,
        filteredLeads,
        selectedSource,
        setSelectedSource,
        searchQuery,
        setSearchQuery,
        sortKey,
        setSortKey,
        sortDirection,
        setSortDirection,
        gmapsLeads,
        instagramLeads,
    } = usePage<UseAllLeadsPageReturn>();

    const [deleteAllDialogOpen, setDeleteAllDialogOpen] = useState(false);
    const [deleteBulkDialogOpen, setDeleteBulkDialogOpen] = useState(false);
    const [notesDialogOpen, setNotesDialogOpen] = useState(false);
    const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(new Set());
    const [isDeleting, setIsDeleting] = useState(false);
    const [isSavingNotes, setIsSavingNotes] = useState(false);

    const hasSelectedLeads = selectedLeadIds.size > 0;

    const handleSortChange = (value: string) => {
        if (value === 'none') {
            setSortKey(null);
        } else {
            setSortKey(value as SortKey);
        }
    };

    const toggleSortDirection = () => {
        setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    };

    const clearSearch = () => {
        setSearchQuery('');
    };

    const handleSelectLead = (leadId: string, selected: boolean) => {
        setSelectedLeadIds((prev) => {
            const newSet = new Set(prev);
            if (selected) {
                newSet.add(leadId);
            } else {
                newSet.delete(leadId);
            }
            return newSet;
        });
    };

    const handleSelectAll = (leadsToSelect: Lead[]) => {
        const allIds = new Set(leadsToSelect.map((lead) => lead._id));
        setSelectedLeadIds(allIds);
    };

    const handleDeselectAll = () => {
        setSelectedLeadIds(new Set());
    };

    const handleDeleteAll = () => {
        setDeleteAllDialogOpen(true);
    };

    const handleConfirmDeleteAll = async () => {
        setIsDeleting(true);
        const sourceToDelete = selectedSource === 'all' ? undefined : selectedSource;
        const result = await deleteLeadsBySourceAction(sourceToDelete);

        if (result.success) {
            toast.success('Leads deleted successfully');
            setDeleteAllDialogOpen(false);
            router.refresh();
        } else {
            toast.error(result.error || 'Failed to delete leads');
        }
        setIsDeleting(false);
    };

    const handleDeleteSelected = () => {
        setDeleteBulkDialogOpen(true);
    };

    const handleConfirmDeleteSelected = async () => {
        setIsDeleting(true);
        const result = await deleteLeadsAction(Array.from(selectedLeadIds));

        if (result.success) {
            toast.success(`${selectedLeadIds.size} lead(s) deleted successfully`);
            setDeleteBulkDialogOpen(false);
            setSelectedLeadIds(new Set());
            router.refresh();
        } else {
            toast.error(result.error || 'Failed to delete leads');
        }
        setIsDeleting(false);
    };

    const handleAddNotesSelected = () => {
        setNotesDialogOpen(true);
    };

    const handleConfirmNotes = async (notes: string) => {
        if (selectedLeadIds.size === 0) return;

        setIsSavingNotes(true);
        const result = await updateLeadsNotesAction(Array.from(selectedLeadIds), notes);

        if (result.success) {
            toast.success(`Notes saved for ${selectedLeadIds.size} lead(s)`);
            setNotesDialogOpen(false);
            setSelectedLeadIds(new Set());
            router.refresh();
        } else {
            toast.error(result.error || 'Failed to save notes');
        }
        setIsSavingNotes(false);
    };

    const getCategoryName = () => {
        if (selectedSource === 'all') return 'All';
        if (selectedSource === LeadSource.GOOGLE_MAPS) return 'Google Maps';
        if (selectedSource === LeadSource.INSTAGRAM) return 'Instagram';
        return 'All';
    };

    const renderLeadsList = (leadsToRender: Lead[]) => {
        if (leadsToRender.length === 0) {
            return (
                <div className="flex flex-col items-center justify-center h-full text-gray-500">
                    <Database className="w-12 h-12 mb-3 opacity-50" />
                    <p className="text-lg font-medium">No saved leads found</p>
                    <p className="text-sm mt-1">
                        {searchQuery
                            ? 'Try adjusting your search or filters'
                            : 'Start scraping and save leads to see them here'}
                    </p>
                </div>
            );
        }

        return (
            <ScrollArea className="h-full">
                <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                    {leadsToRender.map((lead) => {
                        const leadData = lead.data as GMAPS_SCRAPE_LEAD_INFO;
                        return (
                            <LeadCard
                                key={lead._id}
                                lead={leadData}
                                showCheckbox={true}
                                isSelected={selectedLeadIds.has(lead._id)}
                                onSelect={(selected) => handleSelectLead(lead._id, selected)}
                            />
                        );
                    })}
                </div>
            </ScrollArea>
        );
    };

    const getLeadsForTab = () => {
        if (selectedSource === 'all') return filteredLeads;
        if (selectedSource === LeadSource.GOOGLE_MAPS) {
            return filteredLeads.filter((lead) => lead.source === LeadSource.GOOGLE_MAPS);
        }
        if (selectedSource === LeadSource.INSTAGRAM) {
            return filteredLeads.filter((lead) => lead.source === LeadSource.INSTAGRAM);
        }
        return filteredLeads;
    };

    const currentLeadsCount = getLeadsForTab().length;
    const currentLeads = getLeadsForTab();

    return (
        <div className="h-full w-full flex flex-col gap-4 p-2">
            {hasSelectedLeads && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center justify-between">
                    <span className="text-sm font-medium text-blue-900">
                        {selectedLeadIds.size} lead(s) selected
                    </span>
                    <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={handleAddNotesSelected}>
                            <StickyNote className="w-4 h-4 mr-1" />
                            Add Notes
                        </Button>
                        <Button variant="destructive" size="sm" onClick={handleDeleteSelected}>
                            <Trash2 className="w-4 h-4 mr-1" />
                            Delete Selected
                        </Button>
                        <Button variant="ghost" size="sm" onClick={handleDeselectAll}>
                            Clear
                        </Button>
                    </div>
                </div>
            )}

            <div className="flex py-2 flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <Input
                        placeholder="Search leads by name, website, or phone..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10 pr-10"
                    />
                    {searchQuery && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={clearSearch}
                            className="absolute right-1 top-1/2 transform -translate-y-1/2 h-7 w-7 p-0"
                        >
                            <X className="w-4 h-4" />
                        </Button>
                    )}
                </div>

                <div className="flex justify-start items-center gap-2 flex-wrap">
                    {currentLeadsCount > 0 && (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                                selectedLeadIds.size === currentLeadsCount
                                    ? handleDeselectAll()
                                    : handleSelectAll(currentLeads)
                            }
                        >
                            {selectedLeadIds.size === currentLeadsCount ? 'Deselect All' : 'Select All'}
                        </Button>
                    )}

                    <Select value={sortKey || 'none'} onValueChange={handleSortChange}>
                        <SelectTrigger className="w-[180px]">
                            <SelectValue placeholder="Sort by..." />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="none">No sorting</SelectItem>
                            <SelectItem value="rating">Rating</SelectItem>
                            <SelectItem value="reviews">Reviews</SelectItem>
                        </SelectContent>
                    </Select>

                    {sortKey && (
                        <Button
                            variant="outline"
                            size="icon"
                            onClick={toggleSortDirection}
                            title={sortDirection === 'asc' ? 'Ascending' : 'Descending'}
                        >
                            <ArrowUpDown className="w-4 h-4" />
                            <span className="sr-only">
                                {sortDirection === 'asc' ? 'Sort Ascending' : 'Sort Descending'}
                            </span>
                        </Button>
                    )}

                    <Button variant="destructive" size="sm" onClick={handleDeleteAll} disabled={currentLeadsCount === 0}>
                        <Trash2 className="w-4 h-4 mr-1" />
                        Delete All
                    </Button>
                </div>
            </div>

            <Tabs
                value={selectedSource}
                onValueChange={(value) => setSelectedSource(value as 'all' | LeadSource)}
                className="w-full h-full"
            >
                <TabsList className="grid w-full min-h-fit grid-cols-1 md:grid-cols-3">
                    <TabsTrigger value="all">All Leads ({leads.length})</TabsTrigger>
                    <TabsTrigger value={LeadSource.GOOGLE_MAPS}>Google Maps ({gmapsLeads.length})</TabsTrigger>
                    <TabsTrigger value={LeadSource.INSTAGRAM}>Instagram ({instagramLeads.length})</TabsTrigger>
                </TabsList>

                <TabsContent value="all" className="h-full">
                    {renderLeadsList(getLeadsForTab())}
                </TabsContent>

                <TabsContent value={LeadSource.GOOGLE_MAPS} className="">
                    {renderLeadsList(getLeadsForTab())}
                </TabsContent>

                <TabsContent value={LeadSource.INSTAGRAM} className="h-full w-full">
                    {renderLeadsList(getLeadsForTab())}
                </TabsContent>
            </Tabs>

            <AddNotesDialog
                open={notesDialogOpen}
                onOpenChange={setNotesDialogOpen}
                onConfirm={handleConfirmNotes}
                isLoading={isSavingNotes}
            />

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
