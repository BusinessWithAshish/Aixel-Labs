'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Save, SortAsc, SortDesc } from 'lucide-react';
import {
    generateUniqueKey,
    type SortDirection,
    type SortKey,
    sortLeads,
} from '@/components/common/lead-card/lead-utils';
import { saveUserLeadsBySource } from '@/app/actions/user-lead-actions';
import { LeadSource } from '@aixellabs/backend/db/types';
import { formatLeadStats } from '@/helpers/lead-helpers';
import { toast } from 'sonner';
import { UseGoogleMapsFormReturn } from '../_hooks/use-google-maps-form';
import { usePage } from '@/contexts/PageStore';
import { CommonLoader } from '@/components/common/CommonLoader';
import { NoDataFound } from '@/components/common/NoDataFound';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { GMAPS_INTERNAL_RESPONSE } from '@aixellabs/backend/gmaps/internal/types';
import { GoogleMapLead } from '@/components/common/lead-card/GoogleMapLead';

export const ResultsSection = () => {
    const { leads, setLeads, form } = usePage<UseGoogleMapsFormReturn>();
    const [sortKey, setSortKey] = useState<SortKey>('rating');
    const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
    const [isSaving, setIsSaving] = useState(false);
    const [isSaved, setIsSaved] = useState(false);

    const sortedLeads = useMemo(() => {
        return sortLeads(leads, sortKey, sortDirection);
    }, [leads, sortKey, sortDirection]);

    const handleDeleteLead = (leadToDelete: GMAPS_INTERNAL_RESPONSE) => {
        setLeads((prev) => prev.filter((lead) => lead.placeId !== leadToDelete.placeId));
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
            const saveResult = await saveUserLeadsBySource(leads, LeadSource.GOOGLE_MAPS);

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

    if (!leads.length) {
        return <NoDataFound message='No leads found! Please try again.' showBackButton={false} />
    }

    const renderLeadsGrid = (leadsToRender: GMAPS_INTERNAL_RESPONSE[]) => (
        <div className="grid h-screen overflow-auto gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {leadsToRender.map((lead, index) => (
                <GoogleMapLead
                    key={generateUniqueKey(lead, index)}
                    data={lead}
                    onDelete={() => handleDeleteLead(lead)}
                />
            ))}
        </div>
    );

    return (
        <Card>
            <CardHeader>
                <CardTitle>
                    Results ({leads.length} leads)
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
