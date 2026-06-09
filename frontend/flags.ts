import { flag } from 'flags/next';
import { LEAD_GENERATION_SUB_MODULES } from '@aixellabs/backend/db/types';

export enum FeatureFlagKey {
    NL_CHAT_GOOGLE_MAPS = 'nl-chat-google-maps',
    NL_CHAT_INSTAGRAM_SEARCH = 'nl-chat-instagram-search',
    NL_CHAT_LINKEDIN = 'nl-chat-linkedin',
}

export const nlChatGoogleMapsFlag = flag<boolean>({
    key: FeatureFlagKey.NL_CHAT_GOOGLE_MAPS,
    description: 'Natural language chat for Google Maps lead generation',
    defaultValue: false,
    decide() {
        return false;
    },
});

export const nlChatInstagramFlag = flag<boolean>({
    key: FeatureFlagKey.NL_CHAT_INSTAGRAM_SEARCH,
    description: 'Natural language chat for Instagram lead generation',
    defaultValue: false,
    decide() {
        return false;
    },
});

export const nlChatLinkedInFlag = flag<boolean>({
    key: FeatureFlagKey.NL_CHAT_LINKEDIN,
    description: 'Natural language chat for LinkedIn lead generation',
    defaultValue: false,
    decide() {
        return false;
    },
});

const FLAG_BY_KEY = {
    [FeatureFlagKey.NL_CHAT_GOOGLE_MAPS]: nlChatGoogleMapsFlag,
    [FeatureFlagKey.NL_CHAT_INSTAGRAM_SEARCH]: nlChatInstagramFlag,
    [FeatureFlagKey.NL_CHAT_LINKEDIN]: nlChatLinkedInFlag,
} as const satisfies Record<FeatureFlagKey, ReturnType<typeof flag<boolean>>>;

export async function evaluateFlag(key: FeatureFlagKey): Promise<boolean> {
    return FLAG_BY_KEY[key]();
}

export type NlChatModule =
    | typeof LEAD_GENERATION_SUB_MODULES.GOOGLE_MAPS
    | typeof LEAD_GENERATION_SUB_MODULES.INSTAGRAM_SEARCH
    | typeof LEAD_GENERATION_SUB_MODULES.LINKEDIN;

const NL_CHAT_MODULE_TO_FLAG_KEY = {
    [LEAD_GENERATION_SUB_MODULES.GOOGLE_MAPS]: FeatureFlagKey.NL_CHAT_GOOGLE_MAPS,
    [LEAD_GENERATION_SUB_MODULES.INSTAGRAM_SEARCH]: FeatureFlagKey.NL_CHAT_INSTAGRAM_SEARCH,
    [LEAD_GENERATION_SUB_MODULES.LINKEDIN]: FeatureFlagKey.NL_CHAT_LINKEDIN,
} as const satisfies Record<NlChatModule, FeatureFlagKey>;

export async function isNlChatEnabled(module: NlChatModule): Promise<boolean> {
    return evaluateFlag(NL_CHAT_MODULE_TO_FLAG_KEY[module]);
}
