import { VOICE_AGENT_SUB_MODULES } from '@aixellabs/backend/db/types';
import { SubModuleUrls } from '@/config/app-config';

export const CAMPAIGNS_URL = SubModuleUrls[VOICE_AGENT_SUB_MODULES.CAMPAIGNS];
export const NEW_CAMPAIGN_URL = `${CAMPAIGNS_URL}/new`;

export function campaignUrl(campaignId: string): string {
    return `${CAMPAIGNS_URL}/${campaignId}`;
}
