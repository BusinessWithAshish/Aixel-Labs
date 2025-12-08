'use client';

import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Database, Search, ArrowUpDown, X } from 'lucide-react';
import { LeadSource, type Lead } from '@aixellabs/shared/mongodb';
import type { GMAPS_SCRAPE_LEAD_INFO } from '@aixellabs/shared/common';
import { LeadCard } from '@/app/(protected)/lead-generation/google-maps-scraper/_components/LeadCard';
import { usePage } from '@/contexts/PageStore';
import type { UseAllLeadsPageReturn } from '../_hooks';
import type { SortKey } from '../../google-maps-scraper/_utils/lead-operations';

export const AllUserLeads = () => {
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
                        // Extract the lead data based on source
                        const leadData = lead.data as GMAPS_SCRAPE_LEAD_INFO;
                        return <LeadCard key={lead._id} lead={leadData} />;
                    })}
                </div>
            </ScrollArea>
        );
    };

    // Get the appropriate leads based on selected source
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

    return (
        <div className='h-full w-full flex flex-col gap-4 p-2'>
            <div className="flex py-2 flex-col sm:flex-row gap-3">
                {/* Search Input */}
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

                {/* Sort Select */}
                <div className="flex justify-start items-center gap-2">
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

                    {/* Sort Direction Toggle */}
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
        </div>
    );
};
