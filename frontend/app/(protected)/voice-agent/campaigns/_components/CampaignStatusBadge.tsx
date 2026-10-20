import type { VoiceCampaignStatus } from '@aixellabs/backend/db/types';
import { Badge } from '@/components/ui/badge';
import { CAMPAIGN_STATUS } from '../_utils/campaign-format';

export function CampaignStatusBadge({ status }: { status: VoiceCampaignStatus }) {
    const { label, variant } = CAMPAIGN_STATUS[status];
    return (
        <Badge variant={variant} data-testid="campaign-status">
            {label}
        </Badge>
    );
}
