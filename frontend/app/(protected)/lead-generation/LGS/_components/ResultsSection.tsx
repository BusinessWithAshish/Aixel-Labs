'use client';

import { useState, useMemo } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { SortAsc, SortDesc } from 'lucide-react';
import { useSubmission } from '../_contexts';
import { LeadCard } from './LeadCard';
import { GMAPS_SCRAPE_LEAD_INFO, GMAPS_SCRAPE_RESPONSE } from '@aixellabs/shared/common/apis';
import { sortLeads, categorizeLeads, generateUniqueKey, type SortKey, type SortDirection } from '../_utils';

export const ResultsSection = () => {
    const { submissionState } = useSubmission();
    const [sortKey, setSortKey] = useState<SortKey>('rating');
    const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

    const result = submissionState.result as GMAPS_SCRAPE_RESPONSE | null;

    const leads = useMemo(() => result?.allLeads ?? [], [result?.allLeads]);

    const sortedLeads = useMemo(() => {
        return sortLeads(leads, sortKey, sortDirection);
    }, [leads, sortKey, sortDirection]);

    const leadGroups = useMemo(() => {
        return categorizeLeads(sortedLeads);
    }, [sortedLeads]);

    const handleSortToggle = () => {
        setSortKey((prev) => (prev === 'rating' ? 'reviews' : 'rating'));
    };

    const handleDirectionToggle = () => {
        setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    };

    const renderTabContent = (leads: GMAPS_SCRAPE_LEAD_INFO[]) => (
        <ScrollArea className="h-[500px] pr-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 pb-4">
                {leads.map((lead, index) => (
                    <LeadCard key={generateUniqueKey(lead, index)} lead={lead} />
                ))}
            </div>
            {leads.length === 0 && (
                <div className="flex items-center justify-center h-32 text-gray-500">No leads found in this category</div>
            )}
        </ScrollArea>
    );

    // Don't show anything while submitting - StatusDisplay handles this
    if (submissionState.isSubmitting) {
        return null;
    }

    // Don't show error here - StatusDisplay handles this
    if (submissionState.error) {
        return null;
    }

    if (submissionState.isSuccess && result && result.allLeads?.length) {
        return (
            <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <h2 className="text-lg font-semibold">
                        Results ({leads.length} leads)
                        <span className="text-sm text-gray-500 ml-2 font-normal">
                            Sorted by {sortKey === 'rating' ? 'Rating' : 'Reviews'} ({sortDirection === 'asc' ? 'Low to High' : 'High to Low'})
                        </span>
                    </h2>
                    <div className="flex items-center gap-2 flex-wrap">
                        <Button variant="outline" size="sm" onClick={handleSortToggle} className="text-xs sm:text-sm">
                            Sort by: {sortKey === 'rating' ? '⭐ Rating' : '📝 Reviews'}
                        </Button>
                        <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={handleDirectionToggle} 
                            className="text-xs sm:text-sm"
                            title={sortDirection === 'asc' ? 'Currently: Low to High' : 'Currently: High to Low'}
                        >
                            {sortDirection === 'asc' ? <SortAsc className="w-4 h-4 mr-1" /> : <SortDesc className="w-4 h-4 mr-1" />}
                            {sortDirection === 'asc' ? 'Ascending' : 'Descending'}
                        </Button>
                    </div>
                </div>

                <Separator />

                <Tabs defaultValue="all" className="w-full space-y-4">
                    <TabsList className="grid grid-cols-2 lg:grid-cols-4 w-full">
                        <TabsTrigger value="all" className="text-xs sm:text-sm">
                            All Leads ({leadGroups.all.length})
                        </TabsTrigger>
                        <TabsTrigger value="hotLeads" className="text-xs sm:text-sm">
                            Hot Leads ({leadGroups.hotLeads.length})
                        </TabsTrigger>
                        <TabsTrigger value="warmLeads" className="text-xs sm:text-sm">
                            Warm Leads ({leadGroups.warmLeads.length})
                        </TabsTrigger>
                        <TabsTrigger value="coldLeads" className="text-xs sm:text-sm">
                            Cold Leads ({leadGroups.coldLeads.length})
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="all" className="mt-4">
                        {renderTabContent(leadGroups.all)}
                    </TabsContent>

                    <TabsContent value="hotLeads" className="mt-4">
                        {renderTabContent(leadGroups.hotLeads)}
                    </TabsContent>

                    <TabsContent value="warmLeads" className="mt-4">
                        {renderTabContent(leadGroups.warmLeads)}
                    </TabsContent>

                    <TabsContent value="coldLeads" className="mt-4">
                        {renderTabContent(leadGroups.coldLeads)}
                    </TabsContent>
                </Tabs>
            </div>
        );
    }

    return null;
};
