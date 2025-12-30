import {
    EMAIL_SUB_MODULES,
    LEAD_GENERATION_SUB_MODULES,
    MESSAGING_SUB_MODULES,
    Modules,
    SubModule,
    VOICE_AGENT_SUB_MODULES,
} from '@aixellabs/shared/mongodb';

export const ModuleUrls = {
    [Modules.LEAD_GENERATION]: '/lead-generation',
    [Modules.VOICE_AGENT]: '/voice-agent',
    [Modules.MESSAGING]: '/messaging',
    [Modules.EMAIL]: '/email',
};

export const SubModuleUrls: Record<SubModule, string> = {
    [LEAD_GENERATION_SUB_MODULES.GOOGLE_MAPS]: '/lead-generation/google-maps',
    [LEAD_GENERATION_SUB_MODULES.GOOGLE_ADVANCED_SEARCH]: '/lead-generation/google-advanced-search',
    [LEAD_GENERATION_SUB_MODULES.INSTAGRAM_SEARCH]: '/lead-generation/instagram-search',
    [LEAD_GENERATION_SUB_MODULES.INSTAGRAM_ADVANCED_SEARCH]: '/lead-generation/instagram-advanced-search',
    [LEAD_GENERATION_SUB_MODULES.FACEBOOK]: '/lead-generation/facebook',
    [LEAD_GENERATION_SUB_MODULES.LINKEDIN]: '/lead-generation/linkedin',
    [VOICE_AGENT_SUB_MODULES.WEB_DIALER]: '/voice-agent/web-dialer',
    [VOICE_AGENT_SUB_MODULES.INQUIRY_BOOKINGS]: '/voice-agent',
    [VOICE_AGENT_SUB_MODULES.CUSTOM_AGENT_ANALYTICS]: '/voice-agent',
    [MESSAGING_SUB_MODULES.WHATSAPP]: '/messaging/whatsapp',
    [MESSAGING_SUB_MODULES.SMS]: '/messaging/sms',
    [EMAIL_SUB_MODULES.COLD_OUTREACH]: '/email',
    [EMAIL_SUB_MODULES.WARM_OUTREACH]: '/email',
    [EMAIL_SUB_MODULES.TEMPLATES]: '/email',
    [EMAIL_SUB_MODULES.AI_REPLIES]: '/email',
};

export const DEFAULT_HOME_PAGE_ROUTE = '/';

export const BACKEND_URL = process.env.NEXT_PUBLIC_BE_API;
