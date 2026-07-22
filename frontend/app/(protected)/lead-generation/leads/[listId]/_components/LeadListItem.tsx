'use client';

import { LeadSource, type Lead } from '@aixellabs/backend/db/types';
import type { GMAPS_INTERNAL_RESPONSE } from '@aixellabs/backend/gmaps/internal/types';
import type { GSEARCH_RESPONSE } from '@aixellabs/backend/gsearch/types';
import type { INSTAGRAM_RESPONSE } from '@aixellabs/backend/instagram';
import { LINKEDIN_SEARCH_TYPE } from '@aixellabs/backend/linkedin/schemas';
import type { LINKEDIN_BY_COMPANY_RESPONSE } from '@aixellabs/backend/linkedin/types';
import { GoogleAdvancedSearchLeadCard } from '@/components/common/lead-card/GoogleAdvancedSearchLeadCard';
import { GoogleMapLead } from '@/components/common/lead-card/GoogleMapLead';
import { InstagramLeadCard } from '@/components/common/lead-card/InstagramLeadCard';
import { LinkedInByCompanyLeadCard } from '@/components/common/lead-card/LinkedInByCompanyLeadCard';

export type LeadListItemProps = {
    lead: Lead;
    isSelected: boolean;
    onToggleSelect: (leadId: string, selected: boolean) => void;
};

export function LeadListItem({ lead, isSelected, onToggleSelect }: LeadListItemProps) {
    const id = lead._id as string;

    if (lead.source === LeadSource.GOOGLE_MAPS) {
        return (
            <GoogleMapLead
                data={lead.data as GMAPS_INTERNAL_RESPONSE}
                showCheckbox
                isSelected={isSelected}
                onSelect={(checked) => onToggleSelect(id, checked)}
            />
        );
    }

    if (lead.source === LeadSource.GOOGLE_ADVANCED_SEARCH) {
        return (
            <GoogleAdvancedSearchLeadCard
                lead={lead.data as GSEARCH_RESPONSE}
                showCheckbox
                isSelected={isSelected}
                onSelect={(checked) => onToggleSelect(id, checked)}
            />
        );
    }

    if (lead.source === LeadSource.INSTAGRAM) {
        return (
            <InstagramLeadCard
                lead={lead.data as INSTAGRAM_RESPONSE}
                showCheckbox
                isSelected={isSelected}
                onSelect={(checked) => onToggleSelect(id, checked)}
            />
        );
    }

    if (
        lead.source === LeadSource.LINKEDIN &&
        (lead.data as LINKEDIN_BY_COMPANY_RESPONSE).searchType === LINKEDIN_SEARCH_TYPE.COMPANY
    ) {
        return (
            <LinkedInByCompanyLeadCard
                lead={lead.data as LINKEDIN_BY_COMPANY_RESPONSE}
                showCheckbox
                isSelected={isSelected}
                onSelect={(checked) => onToggleSelect(id, checked)}
            />
        );
    }

    return null;
}
