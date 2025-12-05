'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { RefreshCw, Database } from 'lucide-react';
import { getUserLeadsAction } from '@/app/actions/lead-actions';
import { LeadSource, type Lead } from '@aixellabs/shared/mongodb';
import type { GMAPS_SCRAPE_LEAD_INFO } from '@aixellabs/shared/common';
import { LeadCard } from '@/app/(protected)/lead-generation/google-maps-scraper/_components/LeadCard';
import { toast } from 'sonner';

export const AllUserLeads = () => {
    const [leads, setLeads] = useState<Lead[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedSource, setSelectedSource] = useState<'all' | LeadSource>('all');

    const fetchLeads = async () => {
        setIsLoading(true);
        try {
            const result = await getUserLeadsAction(selectedSource === 'all' ? undefined : selectedSource);

            if (result.success && result.data) {
                setLeads(result.data);
            } else {
                toast.error('Error', {
                    description: result.error || 'Failed to fetch saved leads',
                });
            }
        } catch (error) {
            toast.error('Error', {
                description: error instanceof Error ? error.message : 'Failed to fetch saved leads',
            });
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchLeads();
    }, [selectedSource]);

    const gmapsLeads = leads.filter((lead) => lead.source === LeadSource.GOOGLE_MAPS);
    const instagramLeads = leads.filter((lead) => lead.source === LeadSource.INSTAGRAM);

    const renderLeadsList = (leadsToRender: Lead[]) => {
        if (isLoading) {
            return (
                <div className="flex items-center justify-center h-64">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
                    <span className="ml-3">Loading leads...</span>
                </div>
            );
        }

        if (leadsToRender.length === 0) {
            return (
                <div className="flex flex-col items-center justify-center h-64 text-gray-500">
                    <Database className="w-12 h-12 mb-3 opacity-50" />
                    <p className="text-lg font-medium">No saved leads found</p>
                    <p className="text-sm mt-1">Start scraping and save leads to see them here</p>
                </div>
            );
        }

        return (
            <ScrollArea className="h-[600px] pr-4">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 pb-4">
                    {leadsToRender.map((lead) => {
                        // Extract the lead data based on source
                        const leadData = lead.data as GMAPS_SCRAPE_LEAD_INFO;
                        return <LeadCard key={lead._id} lead={leadData} />;
                    })}
                </div>
            </ScrollArea>
        );
    };

    return (
        <Card>
            <CardHeader>
                <div className="flex items-center justify-between">
                    <CardTitle>Your Saved Leads</CardTitle>
                    <Button variant="outline" size="sm" onClick={fetchLeads} disabled={isLoading}>
                        <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                        Refresh
                    </Button>
                </div>
            </CardHeader>

            <CardContent>
                <Tabs
                    value={selectedSource}
                    onValueChange={(value) => setSelectedSource(value as 'all' | LeadSource)}
                    className="w-full"
                >
                    <TabsList className="grid w-full grid-cols-3 mb-6">
                        <TabsTrigger value="all">All Leads ({leads.length})</TabsTrigger>
                        <TabsTrigger value={LeadSource.GOOGLE_MAPS}>Google Maps ({gmapsLeads.length})</TabsTrigger>
                        <TabsTrigger value={LeadSource.INSTAGRAM}>Instagram ({instagramLeads.length})</TabsTrigger>
                    </TabsList>

                    <TabsContent value="all" className="mt-0">
                        {renderLeadsList(leads)}
                    </TabsContent>

                    <TabsContent value={LeadSource.GOOGLE_MAPS} className="mt-0">
                        {renderLeadsList(gmapsLeads)}
                    </TabsContent>

                    <TabsContent value={LeadSource.INSTAGRAM} className="mt-0">
                        {renderLeadsList(instagramLeads)}
                    </TabsContent>
                </Tabs>
            </CardContent>
        </Card>
    );
};
