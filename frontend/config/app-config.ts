import {
    EMAIL_SUB_MODULES,
    LEAD_ENRICHMENT_SUB_MODULES,
    LEAD_GENERATION_SUB_MODULES,
    MESSAGING_SUB_MODULES,
    Modules,
    SubModule,
    TenantType,
    VOICE_AGENT_SUB_MODULES,
} from '@aixellabs/backend/db/types';

export const APP_NAME = 'Aixel Labs';

export const APP_DESCRIPTION = 'Agentic Lead management system';

export const ModuleUrls = {
    [Modules.LEAD_GENERATION]: '/lead-generation',
    [Modules.LEAD_ENRICHMENT]: '/lead-enrichment',
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
    [LEAD_ENRICHMENT_SUB_MODULES.EMAIL_VERIFICATION]: '/lead-enrichment/email-verification',
    [LEAD_ENRICHMENT_SUB_MODULES.PHONE_VERIFICATION]: '/lead-enrichment/phone-verification',
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

export const BACKEND_URL = process.env.NEXT_PUBLIC_BE_API;

export const DEFAULT_LOGO_SRC = '/aixellabs.svg';

export const DEFAULT_THEME_COLOR = '#4f46e5';

export const TENANT_TYPE_OPTIONS = [
    { value: TenantType.IFRAME, label: 'Iframe' },
    { value: TenantType.EXTERNAL, label: 'External' },
    { value: TenantType.PRODUCT, label: 'Product' },
];

export const DEFAULT_HOME_PAGE_ROUTE = '/';
export const PATHNAME_HEADER_KEY = 'x-pathname'
export const API_ROUTE_PREFIX = '/api';
export const TENANT_API_ROUTE_PREFIX = '/tenant';
export const SUBDOMAIN_PARAM_NAME = 'name';
export const IFRAME_TENANTS_ROUTE_PREFIX = '/iframe';
export const PRODUCT_TENANTS_ROUTE_PREFIX = '/products';
export const NOT_FOUND_ROUTE = '/not-found';
export const ACCOUNT_SETTINGS_ROUTE = '/account-settings';
export const MANAGE_TENANTS_ROUTE = '/manage-tenants';

/** Paths always allowed for signed-in users (not module-gated) */
export const ALWAYS_ALLOWED_PATHS = [DEFAULT_HOME_PAGE_ROUTE, ACCOUNT_SETTINGS_ROUTE] as const;

/** Path prefix for manage-tenants dynamic routes */
export const MANAGE_TENANTS_PREFIX = `${MANAGE_TENANTS_ROUTE}/`;
