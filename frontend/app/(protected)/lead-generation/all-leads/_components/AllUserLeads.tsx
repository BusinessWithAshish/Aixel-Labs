'use client';

import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Database, Search, ArrowUpDown, X, Trash2, StickyNote, Sparkles, Filter } from 'lucide-react';
import { LeadSource, type Lead } from '@aixellabs/shared/mongodb';
import type { GMAPS_SCRAPE_LEAD_INFO } from '@aixellabs/shared/common';
import { CommonLeadCard } from '@/components/common/CommonLeadCard';
import { usePage } from '@/contexts/PageStore';
import type { TUseAllLeadsPageReturn, FilterMode } from '../_hooks';
import type { SortKey } from '@/components/common/lead-utils';
import { DeleteAllLeadsDialog } from './DeleteAllLeadsDialog';
import { AddNotesDialog } from './AddNotesDialog';
import { NLQueryInput } from '@/components/common/NLQueryInput';
import { useState, useEffect } from 'react';
import { deleteLeadsAction, deleteLeadsBySourceAction, updateLeadsNotesAction } from '@/app/actions/lead-actions';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

export const AllUserLeads = () => {
    const router = useRouter();
    const {
        leads,
        filteredLeads,
        filterMode,
        switchFilterMode,
        selectedSource,
        setSelectedSource,
        // Manual filter
        searchQuery,
        setSearchQuery,
        sortKey,
        setSortKey,
        sortDirection,
        setSortDirection,
        // AI filter
        nlQuery,
        setNlQuery,
        executeNlSearch,
        isNlQueryLoading,
        nlQueryError,
        clearNlQuery,
    } = usePage<TUseAllLeadsPageReturn>();

    const [deleteAllDialogOpen, setDeleteAllDialogOpen] = useState(false);
    const [deleteBulkDialogOpen, setDeleteBulkDialogOpen] = useState(false);
    const [notesDialogOpen, setNotesDialogOpen] = useState(false);
    const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(new Set());
    const [isDeleting, setIsDeleting] = useState(false);
    const [isSavingNotes, setIsSavingNotes] = useState(false);

    const hasSelectedLeads = selectedLeadIds.size > 0;

    // Reset selection when source changes
    useEffect(() => {
        setSelectedLeadIds(new Set());
    }, [selectedSource, filterMode]);

    // Handlers
    const handleSortChange = (value: string) => {
        setSortKey(value === 'none' ? null : (value as SortKey));
    };

    const toggleSortDirection = () => {
        setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    };

    const handleSelectLead = (leadId: string, selected: boolean) => {
        setSelectedLeadIds((prev) => {
            const newSet = new Set(prev);
            selected ? newSet.add(leadId) : newSet.delete(leadId);
            return newSet;
        });
    };

    const handleSelectAll = () => {
        setSelectedLeadIds(new Set(currentLeads.map((lead) => lead._id)));
    };

    const handleDeselectAll = () => {
        setSelectedLeadIds(new Set());
    };

    const handleConfirmDeleteAll = async () => {
        setIsDeleting(true);
        try {
            const result = await deleteLeadsBySourceAction(selectedSource === 'all' ? undefined : selectedSource);
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
            const result = await deleteLeadsAction(Array.from(selectedLeadIds));
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

    const handleConfirmNotes = async (notes: string) => {
        if (selectedLeadIds.size === 0) return;
        setIsSavingNotes(true);
        try {
            const result = await updateLeadsNotesAction(Array.from(selectedLeadIds), notes);
            if (result.success) {
                toast.success(`Notes saved for ${selectedLeadIds.size} lead(s)`);
                setNotesDialogOpen(false);
                setSelectedLeadIds(new Set());
                router.refresh();
            } else {
                toast.error(result.error || 'Failed to save notes');
            }
        } finally {
            setIsSavingNotes(false);
        }
    };

    // Get leads for current source tab
    const getLeadsForSource = (source: 'all' | LeadSource) => {
        if (source === 'all') return filteredLeads;
        return filteredLeads.filter((lead) => lead.source === source);
    };

    const currentLeads = getLeadsForSource(selectedSource);
    const currentLeadsCount = currentLeads.length;

    const getCategoryName = () => {
        if (selectedSource === 'all') return 'All';
        if (selectedSource === LeadSource.GOOGLE_MAPS) return 'Google Maps';
        if (selectedSource === LeadSource.INSTAGRAM) return 'Instagram';
        return 'All';
    };

    // Render leads grid
    const renderLeadsList = (leadsToRender: Lead[]) => {
        if (leadsToRender.length === 0) {
            return (
                <div className="flex flex-col items-center justify-center py-12 text-gray-500">
                    <Database className="w-12 h-12 mb-3 opacity-50" />
                    <p className="text-lg font-medium">No leads found</p>
                    <p className="text-sm mt-1 text-center px-4">
                        {filterMode === 'manual' && searchQuery
                            ? 'Try adjusting your search query'
                            : filterMode === 'ai' && nlQuery
                            ? 'Try a different AI query'
                            : 'Start scraping and save leads to see them here'}
                    </p>
                </div>
            );
        }

        return (
            <ScrollArea className="h-full">
                <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 p-1">
                    {leadsToRender.map((lead) => (
                        <CommonLeadCard
                            key={lead._id}
                            lead={lead.data as GMAPS_SCRAPE_LEAD_INFO}
                            showCheckbox={true}
                            isSelected={selectedLeadIds.has(lead._id)}
                            onSelect={(selected) => handleSelectLead(lead._id, selected)}
                        />
                    ))}
                </div>
            </ScrollArea>
        );
    };

    return (
        <div className="h-full w-full flex flex-col gap-3 p-2 sm:p-4">
            {/* Selection Bar */}
            {hasSelectedLeads && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                    <span className="text-sm font-medium text-blue-900">{selectedLeadIds.size} lead(s) selected</span>
                    <div className="flex gap-2 flex-wrap">
                        <Button variant="outline" size="sm" onClick={() => setNotesDialogOpen(true)}>
                            <StickyNote className="w-4 h-4 mr-1" />
                            Add Notes
                        </Button>
                        <Button variant="destructive" size="sm" onClick={() => setDeleteBulkDialogOpen(true)}>
                            <Trash2 className="w-4 h-4 mr-1" />
                            Delete
                        </Button>
                        <Button variant="ghost" size="sm" onClick={handleDeselectAll}>
                            Clear
                        </Button>
                    </div>
                </div>
            )}

            {/* Filter Mode Tabs */}
            <Tabs value={filterMode} onValueChange={(value) => switchFilterMode(value as FilterMode)} className="w-full">
                <TabsList className="grid w-full grid-cols-2 mb-3">
                    <TabsTrigger value="manual" className="gap-2">
                        <Filter className="w-4 h-4" />
                        <span className="hidden sm:inline">Manual Filters</span>
                        <span className="sm:hidden">Manual</span>
                    </TabsTrigger>
                    <TabsTrigger value="ai" className="gap-2">
                        <Sparkles className="w-4 h-4" />
                        <span className="hidden sm:inline">AI Filters</span>
                        <span className="sm:hidden">AI</span>
                    </TabsTrigger>
                </TabsList>

                {/* Manual Filter Content */}
                <TabsContent value="manual" className="space-y-3 mt-0">
                    <div className="flex flex-col sm:flex-row gap-2">
                        {/* Search Input */}
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <Input
                                placeholder="Search by name, website, or phone..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-10 pr-10"
                            />
                            {searchQuery && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setSearchQuery('')}
                                    className="absolute right-1 top-1/2 transform -translate-y-1/2 h-7 w-7 p-0"
                                >
                                    <X className="w-4 h-4" />
                                </Button>
                            )}
                        </div>

                        {/* Sort Controls */}
                        <div className="flex gap-2">
                            <Select value={sortKey || 'none'} onValueChange={handleSortChange}>
                                <SelectTrigger className="w-full sm:w-[140px]">
                                    <SelectValue placeholder="Sort by..." />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">No sorting</SelectItem>
                                    <SelectItem value="rating">Rating</SelectItem>
                                    <SelectItem value="reviews">Reviews</SelectItem>
                                </SelectContent>
                            </Select>
                            {sortKey && (
                                <Button variant="outline" size="icon" onClick={toggleSortDirection}>
                                    <ArrowUpDown className="w-4 h-4" />
                                </Button>
                            )}
                        </div>
                    </div>
                </TabsContent>

                {/* AI Filter Content */}
                <TabsContent value="ai" className="space-y-3 mt-0">
                    <NLQueryInput
                        query={nlQuery}
                        setQuery={setNlQuery}
                        executeSearch={executeNlSearch}
                        isLoading={isNlQueryLoading}
                        error={nlQueryError}
                        clear={clearNlQuery}
                        placeholder="Describe what you're looking for..."
                        resultCount={filteredLeads.length}
                        totalCount={leads.length}
                        showStatus={true}
                    />
                </TabsContent>
            </Tabs>

            {/* Action Bar */}
            <div className="flex items-center gap-2 flex-wrap">
                {currentLeadsCount > 0 && (
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={selectedLeadIds.size === currentLeadsCount ? handleDeselectAll : handleSelectAll}
                    >
                        {selectedLeadIds.size === currentLeadsCount ? 'Deselect All' : 'Select All'}
                    </Button>
                )}
                <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setDeleteAllDialogOpen(true)}
                    disabled={currentLeadsCount === 0}
                >
                    <Trash2 className="w-4 h-4 mr-1" />
                    <span className="hidden sm:inline">Delete All</span>
                    <span className="sm:hidden">Delete</span>
                </Button>
                <span className="text-sm text-muted-foreground ml-auto">
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
                        All ({leads.length})
                    </TabsTrigger>
                    <TabsTrigger value={LeadSource.GOOGLE_MAPS} className="text-xs sm:text-sm">
                        <span className="hidden sm:inline">Google Maps</span>
                        <span className="sm:hidden">GMaps</span>
                        <span className="ml-1">({getLeadsForSource(LeadSource.GOOGLE_MAPS).length})</span>
                    </TabsTrigger>
                    <TabsTrigger value={LeadSource.INSTAGRAM} className="text-xs sm:text-sm">
                        <span className="hidden sm:inline">Instagram</span>
                        <span className="sm:hidden">IG</span>
                        <span className="ml-1">({getLeadsForSource(LeadSource.INSTAGRAM).length})</span>
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

            {/* Dialogs */}
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
