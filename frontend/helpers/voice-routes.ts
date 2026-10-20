import { VOICE_AGENT_SUB_MODULES } from '@aixellabs/backend/db/types';
import { SubModuleUrls } from '@/config/app-config';

/** Voice pages and their sub-pages, built from `SubModuleUrls` (the URL SSOT). */

export const VOICE_AGENTS_URL = SubModuleUrls[VOICE_AGENT_SUB_MODULES.AGENTS];

export const VOICE_PHONE_NUMBERS_URL = SubModuleUrls[VOICE_AGENT_SUB_MODULES.PHONE_NUMBERS];

/** The Gemini API key card on the agents page. */
export const GEMINI_KEY_ANCHOR = 'gemini-key';
export const GEMINI_KEY_URL = `${VOICE_AGENTS_URL}#${GEMINI_KEY_ANCHOR}`;

/** Where Composio sends the browser back to (under Agents, so the same access applies). */
export const CONNECTED_APP_CALLBACK_URL = `${VOICE_AGENTS_URL}/connected-apps/callback`;

export function voiceAgentUrl(agentId: string): string {
    return `${VOICE_AGENTS_URL}/${agentId}`;
}

export const CAMPAIGNS_URL = SubModuleUrls[VOICE_AGENT_SUB_MODULES.CAMPAIGNS];
export const NEW_CAMPAIGN_URL = `${CAMPAIGNS_URL}/new`;

export function campaignUrl(campaignId: string): string {
    return `${CAMPAIGNS_URL}/${campaignId}`;
}
