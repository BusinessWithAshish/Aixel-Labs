import { LeadCard as CommonLeadCard } from '@/components/common/LeadCard';
import { getLeadType } from '../_utils';
import type { GMAPS_SCRAPE_LEAD_INFO } from '@aixellabs/shared/common/apis';

export const LeadCard = ({ lead }: { lead: GMAPS_SCRAPE_LEAD_INFO }) => {
    const leadType = getLeadType(lead);
    return <CommonLeadCard lead={lead} leadType={leadType} />;
};
