'use client';

import { useState, useMemo } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { SortAsc, SortDesc } from 'lucide-react';
import { useSubmission } from '../_contexts';
import { LeadCard } from './LeadCard';
import { GMAPS_SCRAPE_LEAD_INFO, GMAPS_SCRAPE_RESPONSE } from '@aixellabs/shared/apis';

type SortKey = 'rating' | 'reviews';
type SortDirection = 'asc' | 'desc';

export const ResultsSection = () => {
    const { submissionState } = useSubmission();
    const [sortKey, setSortKey] = useState<SortKey>('rating');
    const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

    const result = submissionState.result as GMAPS_SCRAPE_RESPONSE | null;

    const leads = useMemo(() => result?.allLeads ?? [], [result?.allLeads]);

    const sortedLeads = useMemo(() => {
        return [...leads].sort((a, b) => {
            const getNumericValue = (lead: GMAPS_SCRAPE_LEAD_INFO, key: SortKey) => {
                const value = key === 'rating' ? lead.overAllRating : lead.numberOfReviews;
                if (value === 'N/A' || value === '') return 0;
                if (key === 'rating') {
                    const normalizedRating = value.replace(/[^\d.]/g, '') || '0';
                    const rating = parseFloat(normalizedRating);
                    return Number.isFinite(rating) ? rating : 0;
                }

                const normalizedReviews = value.replace(/\D/g, '') || '0';
                const reviews = parseInt(normalizedReviews, 10);
                return Number.isFinite(reviews) ? reviews : 0;
            };

            const aVal = getNumericValue(a, sortKey);
            const bVal = getNumericValue(b, sortKey);

            return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
        });
    }, [leads, sortKey, sortDirection]);

    const leadGroups = useMemo(() => {
        const hasWebsite = (lead: GMAPS_SCRAPE_LEAD_INFO) => lead.website && lead.website !== 'N/A';
        const hasPhone = (lead: GMAPS_SCRAPE_LEAD_INFO) => lead.phoneNumber && lead.phoneNumber !== 'N/A';

        return {
            all: sortedLeads,
            hotLeads: sortedLeads.filter((lead) => !hasWebsite(lead) && hasPhone(lead)),
            warmLeads: sortedLeads.filter((lead) => hasWebsite(lead) && hasPhone(lead)),
            coldLeads: sortedLeads.filter((lead) => !hasWebsite(lead) && !hasPhone(lead)),
        };
    }, [sortedLeads]);

    const handleSortToggle = () => {
        setSortKey((prev) => (prev === 'rating' ? 'reviews' : 'rating'));
    };

    const handleDirectionToggle = () => {
        setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    };

    const renderTabContent = (leads: typeof sortedLeads) => (
        <ScrollArea className="h-[500px]">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {leads.map((lead, index) => (
                    <LeadCard key={lead.gmapsUrl || `${lead.name}-${index}`} lead={lead} />
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
                <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold">Results ({leads.length} leads)</h2>
                    <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={handleSortToggle}>
                            Sort by: {sortKey === 'rating' ? '⭐ Rating' : '📝 Reviews'}
                        </Button>
                        <Button variant="ghost" size="icon" onClick={handleDirectionToggle}>
                            {sortDirection === 'asc' ? <SortAsc className="w-4 h-4" /> : <SortDesc className="w-4 h-4" />}
                        </Button>
                    </div>
                </div>

                <Separator />

                <Tabs defaultValue="all" className="w-full space-y-4">
                    <TabsList className="grid grid-cols-2 lg:grid-cols-4 w-full gap-2">
                        <TabsTrigger value="all">All Leads ({leadGroups.all.length})</TabsTrigger>
                        <TabsTrigger value="hotLeads">Hot Leads ({leadGroups.hotLeads.length})</TabsTrigger>
                        <TabsTrigger value="warmLeads">Warm Leads ({leadGroups.warmLeads.length})</TabsTrigger>
                        <TabsTrigger value="coldLeads">Cold Leads ({leadGroups.coldLeads.length})</TabsTrigger>
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
