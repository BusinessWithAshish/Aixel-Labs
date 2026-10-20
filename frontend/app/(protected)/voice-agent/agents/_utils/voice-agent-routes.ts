import { VOICE_AGENT_SUB_MODULES } from '@aixellabs/backend/db/types';
import { SubModuleUrls } from '@/config/app-config';

export const VOICE_AGENTS_URL = SubModuleUrls[VOICE_AGENT_SUB_MODULES.AGENTS];

export const VOICE_PHONE_NUMBERS_URL = SubModuleUrls[VOICE_AGENT_SUB_MODULES.PHONE_NUMBERS];

/** The Gemini API key card on the agents page. */
export const GEMINI_KEY_ANCHOR = 'gemini-key';
export const GEMINI_KEY_URL = `${VOICE_AGENTS_URL}#${GEMINI_KEY_ANCHOR}`;

export function voiceAgentUrl(agentId: string): string {
    return `${VOICE_AGENTS_URL}/${agentId}`;
}
