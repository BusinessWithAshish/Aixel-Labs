'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Save, SortAsc, SortDesc } from 'lucide-react';
import { CommonLeadCard } from '@/components/common/lead-card/CommonLeadCard';
import { GMAPS_SCRAPE_LEAD_INFO } from '@aixellabs/shared/common/apis';
import {
    generateUniqueKey,
    type SortDirection,
    type SortKey,
    sortLeads,
} from '@/components/common/lead-card/lead-utils';
import { saveLeadsAction } from '@/app/actions/lead-actions';
import { LeadSource } from '@aixellabs/shared/mongodb';
import { formatLeadStats } from '@/helpers/lead-operations';
import { toast } from 'sonner';
import { UseGoogleMapsFormReturn } from '../_hooks/use-google-maps-form';
import { usePage } from '@/contexts/PageStore';
import { CommonLoader } from '@/components/common/CommonLoader';
import { NoDataFound } from '@/components/common/NoDataFound';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export const ResultsSection = () => {
    const { response, form } = usePage<UseGoogleMapsFormReturn>();
    const [sortKey, setSortKey] = useState<SortKey>('rating');
    const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
    const [isSaving, setIsSaving] = useState(false);
    const [isSaved, setIsSaved] = useState(false);
    const [displayedLeads, setDisplayedLeads] = useState<GMAPS_SCRAPE_LEAD_INFO[]>([]);

    const leads = useMemo(() => response?.allLeads ?? [], [response?.allLeads]);

    useEffect(() => {
        setDisplayedLeads(leads);
    }, [leads]);

    const sortedLeads = useMemo(() => {
        return sortLeads(displayedLeads, sortKey, sortDirection);
    }, [displayedLeads, sortKey, sortDirection]);

    const handleDeleteLead = (leadToDelete: GMAPS_SCRAPE_LEAD_INFO) => {
        setDisplayedLeads((prev) => prev.filter((lead) => lead.placeId !== leadToDelete.placeId));
        toast.success('Lead removed from results');
    };

    const handleSortToggle = () => {
        setSortKey((prev) => (prev === 'rating' ? 'reviews' : 'rating'));
    };

    const handleDirectionToggle = () => {
        setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    };

    const handleSaveLeads = async () => {
        if (!leads || leads.length === 0) {
            toast.error('No leads to save', {
                description: 'There are no leads available to save.',
            });
            return;
        }

        setIsSaving(true);

        try {
            const saveResult = await saveLeadsAction(displayedLeads, LeadSource.GOOGLE_MAPS);

            if (saveResult.success && saveResult.data) {
                setIsSaved(true);
                const statsMessage = formatLeadStats(saveResult.data);

                toast.success('Leads saved successfully!', {
                    description: statsMessage,
                });

                // Reset saved state after 3 seconds
                setTimeout(() => setIsSaved(false), 3000);
            } else {
                toast.error('Failed to save leads', {
                    description: saveResult.error || 'An error occurred while saving leads.',
                });
            }
        } catch (error) {
            toast.error('Error', {
                description: error instanceof Error ? error.message : 'Failed to save leads',
            });
        } finally {
            setIsSaving(false);
        }
    };

    if (form.formState.isSubmitting) {
        return <CommonLoader text='Loading your leads' />
    }

    if ((!response || !leads.length) || !leads.length) {
        return <NoDataFound message='No leads found! Please try again.' showBackButton={false} />
    }

    const renderLeadsGrid = (leadsToRender: GMAPS_SCRAPE_LEAD_INFO[]) => (
        <div className="grid h-screen overflow-auto gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {leadsToRender.map((lead, index) => (
                <CommonLeadCard
                    key={generateUniqueKey(lead, index)}
                    lead={lead}
                    onDelete={() => handleDeleteLead(lead)}
                />
            ))}
        </div>
    );

    if (response && response.allLeadsCount > 0) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>
                        Results ({displayedLeads.length} leads)
                    </CardTitle>
                    <CardDescription>
                        Sorted by {sortKey === 'rating' ? 'Rating' : 'Reviews'} (
                        {sortDirection === 'asc' ? 'Low to High' : 'High to Low'})
                    </CardDescription>

                    <CardAction className="flex flex-wrap items-center gap-2">
                        <Button
                            size="sm"
                            onClick={handleSaveLeads}
                            disabled={isSaving || isSaved}
                            className="text-xs sm:text-sm"
                        >
                            {isSaved ? (
                                <>
                                    <CheckCircle2 className="w-4 h-4 mr-1" />
                                    Saved
                                </>
                            ) : (
                                <>
                                    <Save className="w-4 h-4 mr-1" />
                                    {isSaving ? 'Saving...' : 'Save Leads'}
                                </>
                            )}
                        </Button>
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
                            {sortDirection === 'asc' ? (
                                <SortAsc className="w-4 h-4 mr-1" />
                            ) : (
                                <SortDesc className="w-4 h-4 mr-1" />
                            )}
                            {sortDirection === 'asc' ? 'Ascending' : 'Descending'}
                        </Button>
                    </CardAction>
                </CardHeader>

                <CardContent>{renderLeadsGrid(sortedLeads)}</CardContent>

            </Card>
        );
    }

    return null;
};
