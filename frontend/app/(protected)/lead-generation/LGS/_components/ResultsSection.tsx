'use client';

import { useState, useMemo } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { SortAsc, SortDesc } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useSubmission } from '../_contexts';
import { AlertCircle, Loader2 } from 'lucide-react';
import { LeadCard } from './LeadCard';
import { GMAPS_SCRAPE_LEAD_INFO, GMAPS_SCRAPE_RESPONSE } from '@aixellabs/shared/apis';

type SortKey = 'rating' | 'reviews';
type SortDirection = 'asc' | 'desc';

const extractNumericValue = (value: string, isRating: boolean): number => {
    if (!value || value === 'N/A' || value === '' || value === null || value === undefined) {
        return -1;
    }
    
    const stringValue = String(value);
    const normalized = stringValue.replace(/[^\d.]/g, '');
    
    if (!normalized || normalized === '') {
        return -1;
    }
    
    const numeric = isRating ? parseFloat(normalized) : parseInt(normalized, 10);
    return Number.isFinite(numeric) && numeric >= 0 ? numeric : -1;
};

const sortLeads = (leads: GMAPS_SCRAPE_LEAD_INFO[], sortKey: SortKey, sortDirection: SortDirection): GMAPS_SCRAPE_LEAD_INFO[] => {
    const isRating = sortKey === 'rating';
    
    return [...leads].sort((a, b) => {
        const aValue = extractNumericValue(isRating ? a.overAllRating : a.numberOfReviews, isRating);
        const bValue = extractNumericValue(isRating ? b.overAllRating : b.numberOfReviews, isRating);
        
        if (aValue === -1 && bValue === -1) return 0;
        if (aValue === -1) return 1;
        if (bValue === -1) return -1;
        
        const comparison = aValue - bValue;
        return sortDirection === 'asc' ? comparison : -comparison;
    });
};

const categorizeLeads = (leads: GMAPS_SCRAPE_LEAD_INFO[]) => {
    const hasWebsite = (lead: GMAPS_SCRAPE_LEAD_INFO) => lead.website && lead.website !== 'N/A';
    const hasPhone = (lead: GMAPS_SCRAPE_LEAD_INFO) => lead.phoneNumber && lead.phoneNumber !== 'N/A';

    return {
        all: leads,
        hotLeads: leads.filter((lead) => !hasWebsite(lead) && hasPhone(lead)),
        warmLeads: leads.filter((lead) => hasWebsite(lead) && hasPhone(lead)),
        coldLeads: leads.filter((lead) => !hasWebsite(lead) && !hasPhone(lead)),
    };
};

const generateUniqueKey = (lead: GMAPS_SCRAPE_LEAD_INFO, index: number): string => {
    const baseKey = lead.gmapsUrl || `${lead.name}-${lead.phoneNumber || 'no-phone'}-${lead.website || 'no-website'}`;
    return `${baseKey}-${index}`;
};

export const ResultsSection = () => {
    const { submissionState } = useSubmission();
    const [sortKey, setSortKey] = useState<SortKey>('rating');
    const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

    const result = submissionState.result as GMAPS_SCRAPE_RESPONSE | null;

    const leads = useMemo(() => result?.allLeads ?? [], [result?.allLeads]);

    const sortedLeads = useMemo(() => {
        const sorted = sortLeads(leads, sortKey, sortDirection);
        console.log('Sorting:', { sortKey, sortDirection, totalLeads: sorted.length });
        if (sorted.length > 0) {
            const firstLead = sorted[0];
            const lastLead = sorted[sorted.length - 1];
            console.log('First lead:', sortKey === 'rating' ? firstLead.overAllRating : firstLead.numberOfReviews, firstLead.name);
            console.log('Last lead:', sortKey === 'rating' ? lastLead.overAllRating : lastLead.numberOfReviews, lastLead.name);
        }
        return sorted;
    }, [leads, sortKey, sortDirection]);

    const leadGroups = useMemo(() => {
        return categorizeLeads(sortedLeads);
    }, [sortedLeads]);

    const handleSortToggle = () => {
        setSortKey((prev) => {
            const newKey = prev === 'rating' ? 'reviews' : 'rating';
            console.log('Sort key changed to:', newKey);
            return newKey;
        });
    };

    const handleDirectionToggle = () => {
        setSortDirection((prev) => {
            const newDirection = prev === 'asc' ? 'desc' : 'asc';
            console.log('Sort direction changed to:', newDirection);
            return newDirection;
        });
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

    if (submissionState.isSubmitting) {
        return (
            <Card>
                <CardContent className="p-6">
                    <div className="flex items-center gap-3">
                        <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
                        <span className="text-gray-600">Processing your request...</span>
                    </div>
                </CardContent>
            </Card>
        );
    }

    if (submissionState.error) {
        return (
            <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>Error: {submissionState.error}</AlertDescription>
            </Alert>
        );
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
