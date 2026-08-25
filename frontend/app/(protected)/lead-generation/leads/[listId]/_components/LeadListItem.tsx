'use client';

import { LeadSource, type Lead } from '@aixellabs/backend/db/types';
import type { GMAPS_INTERNAL_RESPONSE } from '@aixellabs/backend/gmaps/internal/types';
import type { GMAPS_DETAILS_RESPONSE } from '@aixellabs/backend/gmaps/details/types';
import type { GSEARCH_RESPONSE } from '@aixellabs/backend/gsearch/types';
import type { INSTAGRAM_RESPONSE } from '@aixellabs/backend/instagram';
import type { FACEBOOK_RESPONSE } from '@aixellabs/backend/facebook';
import { LINKEDIN_SEARCH_TYPE } from '@aixellabs/backend/linkedin/schemas';
import type { LINKEDIN_BY_COMPANY_RESPONSE } from '@aixellabs/backend/linkedin/types';
import type { CRAWL_RESPONSE } from '@aixellabs/backend/crawl/types';
import { GoogleAdvancedSearchLeadCard } from '@/components/common/lead-card/GoogleAdvancedSearchLeadCard';
import { GoogleMapLead } from '@/components/common/lead-card/GoogleMapLead';
import { GoogleMapsAdvancedLeadCard } from '@/components/common/lead-card/GoogleMapsAdvancedLeadCard';
import { InstagramLeadCard } from '@/components/common/lead-card/InstagramLeadCard';
import { FacebookLeadCard } from '@/components/common/lead-card/FacebookLeadCard';
import { LinkedInByCompanyLeadCard } from '@/components/common/lead-card/LinkedInByCompanyLeadCard';
import { CrawlLeadCard } from '@/components/common/lead-card/CrawlLeadCard';
import { LeadCrawlPanel } from '@/components/common/lead-card/LeadCrawlPanel';

export type LeadListItemProps = {
    lead: Lead;
    isSelected: boolean;
    onToggleSelect: (leadId: string, selected: boolean) => void;
};

export function LeadListItem({ lead, isSelected, onToggleSelect }: LeadListItemProps) {
    const id = lead._id as string;
    const isEnriched = Boolean(lead.enriched);
    const enrichmentPanel = lead.enriched ? (
        <LeadCrawlPanel data={lead.enriched} hideBadge />
    ) : undefined;

    const selectProps = {
        showCheckbox: true as const,
        isSelected,
        onSelect: (checked: boolean) => onToggleSelect(id, checked),
        isEnriched,
        actions: enrichmentPanel,
    };

    if (lead.source === LeadSource.CRAWL) {
        return (
            <CrawlLeadCard
                data={lead.data as CRAWL_RESPONSE}
                showCheckbox
                isSelected={isSelected}
                onSelect={(checked) => onToggleSelect(id, checked)}
            />
        );
    }

    if (lead.source === LeadSource.GOOGLE_MAPS) {
        return (
            <GoogleMapLead data={lead.data as GMAPS_INTERNAL_RESPONSE} {...selectProps} />
        );
    }

    if (lead.source === LeadSource.GOOGLE_MAPS_ADVANCED) {
        return (
            <GoogleMapsAdvancedLeadCard
                data={lead.data as GMAPS_DETAILS_RESPONSE}
                {...selectProps}
            />
        );
    }

    if (lead.source === LeadSource.GOOGLE_ADVANCED_SEARCH) {
        return (
            <GoogleAdvancedSearchLeadCard
                lead={lead.data as GSEARCH_RESPONSE}
                {...selectProps}
            />
        );
    }

    if (lead.source === LeadSource.INSTAGRAM) {
        return (
            <InstagramLeadCard lead={lead.data as INSTAGRAM_RESPONSE} {...selectProps} />
        );
    }

    if (lead.source === LeadSource.FACEBOOK) {
        return <FacebookLeadCard lead={lead.data as FACEBOOK_RESPONSE} {...selectProps} />;
    }

    if (
        lead.source === LeadSource.LINKEDIN &&
        (lead.data as LINKEDIN_BY_COMPANY_RESPONSE).searchType === LINKEDIN_SEARCH_TYPE.COMPANY
    ) {
        return (
            <LinkedInByCompanyLeadCard
                lead={lead.data as LINKEDIN_BY_COMPANY_RESPONSE}
                {...selectProps}
            />
        );
    }

    return null;
}
