import { flag } from 'flags/next';
import {
    EMAIL_SUB_MODULES,
    LEAD_ENRICHMENT_SUB_MODULES,
    LEAD_GENERATION_SUB_MODULES,
    MESSAGING_SUB_MODULES,
    type SubModule,
    type User,
    VOICE_AGENT_SUB_MODULES,
} from '@aixellabs/backend/db/types';

/**
 * Product feature flags (Flags SDK), evaluated on the server and off by default.
 *
 * Override for one browser (dev / preview) without a deploy: set the `vercel-flag-overrides`
 * cookie to `await encryptOverrides({ '<flag-key>': true })` from `flags`. The server needs
 * `FLAGS_SECRET` (32 random bytes, base64url) to read it; Vercel Toolbar's Flags Explorer
 * writes the same cookie. Without the secret no override applies.
 */
export enum FeatureFlagKey {
    NL_CHAT_GOOGLE_MAPS = 'nl-chat-google-maps',
    NL_CHAT_INSTAGRAM_SEARCH = 'nl-chat-instagram-search',
    NL_CHAT_LINKEDIN = 'nl-chat-linkedin',
    LINKEDIN_BY_PEOPLE = 'linkedin-by-people',
    INSTAGRAM_ADVANCED_SEARCH = 'instagram-advanced-search',
    VOICE_WEB_DIALER = 'voice-web-dialer',
    VOICE_AGENT_ANALYTICS = 'voice-agent-analytics',
    MESSAGING = 'messaging',
    EMAIL = 'email',
    LEAD_ENRICHMENT = 'lead-enrichment',
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

export const linkedInByPeopleFlag = flag<boolean>({
    key: FeatureFlagKey.LINKEDIN_BY_PEOPLE,
    description: 'LinkedIn lead search by people (form and related flows)',
    defaultValue: false,
    decide() {
        return false;
    },
});

/** A page flag: `enabled` is the shipped value, so turning a page on is a one-word change. */
function pageFlag(key: FeatureFlagKey, description: string, enabled: boolean) {
    return flag<boolean>({ key, description, defaultValue: false, decide: () => enabled });
}

/**
 * Unfinished pages. While off, the page is left out of the sidebar (a module with nothing left
 * disappears) and its URL 404s for every user, admins included, except admins on {@link PREVIEW_TENANT}.
 * The page code stays in place.
 */
export const instagramAdvancedFlag = pageFlag(FeatureFlagKey.INSTAGRAM_ADVANCED_SEARCH, 'Instagram advanced search', false);
export const voiceWebDialerFlag = pageFlag(FeatureFlagKey.VOICE_WEB_DIALER, 'Voice agent web dialer', false);
export const voiceAgentAnalyticsFlag = pageFlag(FeatureFlagKey.VOICE_AGENT_ANALYTICS, 'Voice agent analytics', false);
export const messagingFlag = pageFlag(FeatureFlagKey.MESSAGING, 'Messaging module', false);
export const emailFlag = pageFlag(FeatureFlagKey.EMAIL, 'Email module', false);
export const leadEnrichmentFlag = pageFlag(FeatureFlagKey.LEAD_ENRICHMENT, 'Lead enrichment module', false);

const FLAG_BY_KEY = {
    [FeatureFlagKey.NL_CHAT_GOOGLE_MAPS]: nlChatGoogleMapsFlag,
    [FeatureFlagKey.NL_CHAT_INSTAGRAM_SEARCH]: nlChatInstagramFlag,
    [FeatureFlagKey.NL_CHAT_LINKEDIN]: nlChatLinkedInFlag,
    [FeatureFlagKey.LINKEDIN_BY_PEOPLE]: linkedInByPeopleFlag,
    [FeatureFlagKey.INSTAGRAM_ADVANCED_SEARCH]: instagramAdvancedFlag,
    [FeatureFlagKey.VOICE_WEB_DIALER]: voiceWebDialerFlag,
    [FeatureFlagKey.VOICE_AGENT_ANALYTICS]: voiceAgentAnalyticsFlag,
    [FeatureFlagKey.MESSAGING]: messagingFlag,
    [FeatureFlagKey.EMAIL]: emailFlag,
    [FeatureFlagKey.LEAD_ENRICHMENT]: leadEnrichmentFlag,
} as const satisfies Record<FeatureFlagKey, ReturnType<typeof flag<boolean>>>;

export async function evaluateFlag(key: FeatureFlagKey): Promise<boolean> {
    return FLAG_BY_KEY[key]();
}

const wholeModule = (subModules: Record<string, SubModule>, key: FeatureFlagKey) =>
    Object.fromEntries(Object.values(subModules).map((subModule) => [subModule, key]));

/** Submodules whose page sits behind a flag. Unlisted submodules only need module access. */
export const SUB_MODULE_FLAG_KEY: Partial<Record<SubModule, FeatureFlagKey>> = {
    [LEAD_GENERATION_SUB_MODULES.INSTAGRAM_ADVANCED_SEARCH]: FeatureFlagKey.INSTAGRAM_ADVANCED_SEARCH,
    [VOICE_AGENT_SUB_MODULES.WEB_DIALER]: FeatureFlagKey.VOICE_WEB_DIALER,
    [VOICE_AGENT_SUB_MODULES.CUSTOM_AGENT_ANALYTICS]: FeatureFlagKey.VOICE_AGENT_ANALYTICS,
    ...wholeModule(MESSAGING_SUB_MODULES, FeatureFlagKey.MESSAGING),
    ...wholeModule(EMAIL_SUB_MODULES, FeatureFlagKey.EMAIL),
    ...wholeModule(LEAD_ENRICHMENT_SUB_MODULES, FeatureFlagKey.LEAD_ENRICHMENT),
};

/** Tenant where admins see every page, flagged or not, to try unfinished work before it ships. */
export const PREVIEW_TENANT = 'test';

/** Submodules hidden for this user because their flag is off (sidebar + path ACL). */
export async function getHiddenSubModules({
    isAdmin,
    tenantName,
}: Pick<User, 'isAdmin' | 'tenantName'>): Promise<ReadonlySet<SubModule>> {
    if (isAdmin && tenantName === PREVIEW_TENANT) return new Set();
    const gated = Object.entries(SUB_MODULE_FLAG_KEY) as [SubModule, FeatureFlagKey][];
    const enabled = await Promise.all(gated.map(([, key]) => evaluateFlag(key)));
    return new Set(gated.filter((_, i) => !enabled[i]).map(([subModule]) => subModule));
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
