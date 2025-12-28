export enum Modules {
    LEAD_GENERATION = 'LEAD_GENERATION',
    VOICE_AGENT = 'VOICE_AGENT',
    MESSAGING = 'MESSAGING',
    EMAIL = 'EMAIL',
}

export const ModuleUrls = {
    [Modules.LEAD_GENERATION]: '/lead-generation',
    [Modules.VOICE_AGENT]: '/voice-agent',
    [Modules.MESSAGING]: '/messaging',
    [Modules.EMAIL]: '/email',
};

export enum LEAD_GENERATION_SUB_MODULES {
    GOOGLE_MAPS = 'GOOGLE_MAPS',
    GOOGLE_ADVANCED_SEARCH = 'GOOGLE_ADVANCED_SEARCH',
    INSTAGRAM_SEARCH = 'INSTAGRAM_SEARCH',
    INSTAGRAM_ADVANCED_SEARCH = 'INSTAGRAM_ADVANCED_SEARCH',
    FACEBOOK = 'FACEBOOK',
    LINKEDIN = 'LINKEDIN',
}

export const LEAD_GENERATION_SUB_MODULE_URLS = {
    [LEAD_GENERATION_SUB_MODULES.GOOGLE_MAPS]: '/lead-generation/google-maps',
    [LEAD_GENERATION_SUB_MODULES.GOOGLE_ADVANCED_SEARCH]: '/lead-generation/google-advanced-search',
    [LEAD_GENERATION_SUB_MODULES.INSTAGRAM_SEARCH]: '/lead-generation/instagram-search',
    [LEAD_GENERATION_SUB_MODULES.INSTAGRAM_ADVANCED_SEARCH]: '/lead-generation/instagram-advanced-search',
    [LEAD_GENERATION_SUB_MODULES.FACEBOOK]: '/lead-generation/facebook',
    [LEAD_GENERATION_SUB_MODULES.LINKEDIN]: '/lead-generation/linkedin',
};

export const BACKEND_URL = process.env.NEXT_PUBLIC_BE_API;
