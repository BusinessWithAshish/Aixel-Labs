import { LEAD_GENERATION_SUB_MODULES } from '@aixellabs/backend/db/types';
import { generateLocalStorageKey } from '@/helpers/generate-local-storage-key';

/** Hard cap on conversation turns (one turn = one user message + one assistant reply). */
export const NL_CHAT_MAX_TURNS = 15;

/** Show a "turns remaining" warning when this many turns are left. */
export const NL_CHAT_WARNING_TURNS_LEFT = 5;

/** Hard cap on how many past sessions we retain per module (oldest trimmed first). */
export const NL_CHAT_MAX_SESSIONS = 30;

/** localStorage key version — bump whenever the persisted shape changes. */
export const NL_CHAT_STORAGE_VERSION = 'v4';

/** Modules that support natural-language chat (also validated server-side). */
export const NL_CHAT_MODULES = new Set<LEAD_GENERATION_SUB_MODULES>([
    LEAD_GENERATION_SUB_MODULES.GOOGLE_MAPS,
    LEAD_GENERATION_SUB_MODULES.INSTAGRAM_SEARCH,
    LEAD_GENERATION_SUB_MODULES.LINKEDIN,
]);

export function buildChatStorageKey(name: LEAD_GENERATION_SUB_MODULES): string {
    return generateLocalStorageKey('nl-chat-history', NL_CHAT_STORAGE_VERSION, name);
}
