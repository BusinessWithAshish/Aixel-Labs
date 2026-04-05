'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Save, SortAsc, SortDesc } from 'lucide-react';
import {
    type InstagramSortKey,
    type SortDirection,
    generateInstagramUniqueKey,
    sortInstagramLeads,
} from '@/components/common/lead-card/lead-utils';
import { saveUserLeadsBySource } from '@/app/actions/user-lead-actions';
import { LeadSource } from '@aixellabs/backend/db/types';
import { formatLeadStats } from '@/helpers/lead-helpers';
import { toast } from 'sonner';
import { UseInstagramFormReturn } from '../_hooks/use-instagram-form';
import { usePage } from '@/contexts/PageStore';
import { CommonLoader } from '@/components/common/CommonLoader';
import { NoDataFound } from '@/components/common/NoDataFound';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { INSTAGRAM_RESPONSE } from '@aixellabs/backend/instagram';
import { InstagramLeadCard } from '@/components/common/lead-card/InstagramLeadCard';

const INSTAGRAM_SORT_SEQUENCE: InstagramSortKey[] = ['fullName', 'followers', 'following', 'posts'];

const sortKeyButtonLabel: Record<InstagramSortKey, string> = {
    fullName: 'Full name',
    followers: 'Followers',
    following: 'Following',
    posts: 'Posts',
};

const sortKeyDescriptionLabel: Record<InstagramSortKey, string> = {
    fullName: 'Full name',
    followers: 'Followers',
    following: 'Following',
    posts: 'Posts',
};

const instagramLeadKey = (lead: INSTAGRAM_RESPONSE) =>
    lead.id ?? `${lead.username ?? ''}|${lead.instagramUrl ?? ''}`;

export const InstagramResultsSection = () => {
    const { instagramLeads, setInstagramLeads, form } = usePage<UseInstagramFormReturn>();
    const [sortKey, setSortKey] = useState<InstagramSortKey>('fullName');
    const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
    const [isSaving, setIsSaving] = useState(false);
    const [isSaved, setIsSaved] = useState(false);

    const sortedLeads = useMemo(() => {
        return sortInstagramLeads(instagramLeads, sortKey, sortDirection);
    }, [instagramLeads, sortKey, sortDirection]);

    const handleDeleteLead = (leadToDelete: INSTAGRAM_RESPONSE) => {
        const removeKey = instagramLeadKey(leadToDelete);
        setInstagramLeads((prev) => prev.filter((lead) => instagramLeadKey(lead) !== removeKey));
        toast.success('Lead removed from results');
    };

    const handleSortToggle = () => {
        setSortKey((prev) => {
            const i = INSTAGRAM_SORT_SEQUENCE.indexOf(prev);
            const next = (i + 1) % INSTAGRAM_SORT_SEQUENCE.length;
            return INSTAGRAM_SORT_SEQUENCE[next];
        });
    };

    const handleDirectionToggle = () => {
        setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    };

    const directionDescription =
        sortKey === 'fullName'
            ? sortDirection === 'asc'
                ? 'A to Z'
                : 'Z to A'
            : sortDirection === 'asc'
                ? 'Low to High'
                : 'High to Low';

    const handleSaveLeads = async () => {
        if (!instagramLeads || instagramLeads.length === 0) {
            toast.error('No leads to save', {
                description: 'There are no leads available to save.',
            });
            return;
        }

        setIsSaving(true);

        try {
            const saveResult = await saveUserLeadsBySource(instagramLeads, LeadSource.INSTAGRAM);

            if (saveResult.success && saveResult.data) {
                setIsSaved(true);
                const statsMessage = formatLeadStats(saveResult.data);

                toast.success('Leads saved successfully!', {
                    description: statsMessage,
                });

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
        return <CommonLoader text="Loading your Instagram leads" />;
    }

    if (!instagramLeads.length) {
        return <NoDataFound message="No Instagram leads found! Please try again." showBackButton={false} />;
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>Results ({instagramLeads.length} leads)</CardTitle>
                <CardDescription>
                    Sorted by {sortKeyDescriptionLabel[sortKey]} ({directionDescription})
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
                                <CheckCircle2 className="mr-1 h-4 w-4" />
                                Saved
                            </>
                        ) : (
                            <>
                                <Save className="mr-1 h-4 w-4" />
                                {isSaving ? 'Saving...' : 'Save Leads'}
                            </>
                        )}
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleSortToggle} className="text-xs sm:text-sm">
                        Sort by: {sortKeyButtonLabel[sortKey]}
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleDirectionToggle}
                        className="text-xs sm:text-sm"
                        title={sortDirection === 'asc' ? 'Ascending' : 'Descending'}
                    >
                        {sortDirection === 'asc' ? (
                            <SortAsc className="mr-1 h-4 w-4" />
                        ) : (
                            <SortDesc className="mr-1 h-4 w-4" />
                        )}
                        {sortDirection === 'asc' ? 'Ascending' : 'Descending'}
                    </Button>
                </CardAction>
            </CardHeader>

            <CardContent className="grid min-h-0 grid-cols-1 gap-4 overflow-y-auto md:grid-cols-2 lg:grid-cols-3">
                {sortedLeads.map((lead, index) => (
                    <InstagramLeadCard
                        key={generateInstagramUniqueKey(lead, index)}
                        lead={lead}
                        onDelete={() => handleDeleteLead(lead)}
                    />
                ))}
            </CardContent>
        </Card>
    );
};