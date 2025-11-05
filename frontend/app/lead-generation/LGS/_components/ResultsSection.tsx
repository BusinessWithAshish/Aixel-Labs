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
import { Lead, GmapsScrapeResponse } from '@/app/lead-generation/LGS/_utlis/types';
import { LeadCard } from './LeadCard';

type SortKey = 'rating' | 'reviews';
type SortDirection = 'asc' | 'desc';

export const ResultsSection = () => {
    const { submissionState } = useSubmission();
    const [sortKey, setSortKey] = useState<SortKey>('rating');
    const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

    const result = submissionState.result as GmapsScrapeResponse | null;

    const leads = useMemo(() => result?.allLeads ?? [], [result?.allLeads]);

    const sortedLeads = useMemo(() => {
        return [...leads].sort((a, b) => {
            const getNumericValue = (lead: Lead, key: SortKey) => {
                const value = key === 'rating' ? lead.overAllRating : lead.numberOfReviews;
                if (value === 'N/A' || value === '') return 0;
                const parsed = key === 'rating' ? parseFloat(value) : parseInt(value);
                return isNaN(parsed) ? 0 : parsed;
            };

            const aVal = getNumericValue(a, sortKey);
            const bVal = getNumericValue(b, sortKey);

            return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
        });
    }, [leads, sortKey, sortDirection]);

    const leadGroups = useMemo(() => {
        const hasWebsite = (lead: Lead) => lead.website && lead.website !== 'N/A';
        const hasPhone = (lead: Lead) => lead.phoneNumber && lead.phoneNumber !== 'N/A';

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
                {leads.map((lead) => (
                    <LeadCard key={lead.id || lead.name} lead={lead} />
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
                        <TabsTrigger value="all">All Leads</TabsTrigger>
                        <TabsTrigger value="hotLeads">Hot Leads</TabsTrigger>
                        <TabsTrigger value="warmLeads">Warm Leads</TabsTrigger>
                        <TabsTrigger value="coldLeads">Cold Leads</TabsTrigger>
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
