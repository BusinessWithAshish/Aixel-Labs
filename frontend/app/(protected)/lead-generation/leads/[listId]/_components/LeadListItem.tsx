'use client';

import { LeadSource, type Lead } from '@aixellabs/backend/db/types';
import type { GMAPS_INTERNAL_RESPONSE } from '@aixellabs/backend/gmaps/internal/types';
import { GoogleMapLead } from '@/components/common/lead-card/GoogleMapLead';
import { InstagramLeadCard } from '@/components/common/lead-card/InstagramLeadCard';
import { INSTAGRAM_RESPONSE } from '@aixellabs/backend/instagram';

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

    return null;
}
