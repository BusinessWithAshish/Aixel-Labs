import { LEAD_GENERATION_SUB_MODULE_URLS, LEAD_GENERATION_SUB_MODULES, Modules, ModuleUrls } from './app-config';

// Icon names as strings for serialization
export type IconName = 'UsersRound' | 'AudioWaveform' | 'MessageCircleMore' | 'Mail' | 'Settings2' | 'GalleryVerticalEnd';

export type SidebarNavItem = {
    title: Modules;
    url: (typeof ModuleUrls)[Modules];
    icon?: IconName;
    items?: {
        title: string;
        url: string;
    }[];
};

export type SidebarTenant = {
    name: string;
    logo: IconName;
    url: string;
};

export type SidebarUser = {
    name: string;
    email: string;
    avatar: string;
    isAdmin: boolean;
    tenantId: string;
};

export type SidebarConfig = {
    navMain: SidebarNavItem[];
};

export const sidebarConfig: SidebarConfig = {
    navMain: [
        {
            title: Modules.LEAD_GENERATION,
            url: ModuleUrls.LEAD_GENERATION,
            icon: 'UsersRound',
            items: [
                { title: LEAD_GENERATION_SUB_MODULES.GOOGLE_MAPS, url: LEAD_GENERATION_SUB_MODULE_URLS.GOOGLE_MAPS },
                {
                    title: LEAD_GENERATION_SUB_MODULES.GOOGLE_ADVANCED_SEARCH,
                    url: LEAD_GENERATION_SUB_MODULE_URLS.GOOGLE_ADVANCED_SEARCH,
                },
                {
                    title: LEAD_GENERATION_SUB_MODULES.INSTAGRAM_SEARCH,
                    url: LEAD_GENERATION_SUB_MODULE_URLS.INSTAGRAM_SEARCH,
                },
                {
                    title: LEAD_GENERATION_SUB_MODULES.INSTAGRAM_ADVANCED_SEARCH,
                    url: LEAD_GENERATION_SUB_MODULE_URLS.INSTAGRAM_ADVANCED_SEARCH,
                },
                { title: LEAD_GENERATION_SUB_MODULES.FACEBOOK, url: LEAD_GENERATION_SUB_MODULE_URLS.FACEBOOK },
                { title: LEAD_GENERATION_SUB_MODULES.LINKEDIN, url: LEAD_GENERATION_SUB_MODULE_URLS.LINKEDIN },
            ],
        },
        {
            title: Modules.VOICE_AGENT,
            url: ModuleUrls.VOICE_AGENT,
            icon: 'AudioWaveform',
            items: [
                { title: 'Web dialer', url: '/voice-agent/web-dialer' },
                { title: 'Inquiry / Bookings', url: '/voice-agent' },
                { title: 'Custom Agent Analytics', url: '/voice-agent' },
            ],
        },
        {
            title: Modules.MESSAGING,
            url: '/messaging',
            icon: 'MessageCircleMore',
            items: [
                { title: 'Whatsapp', url: '/messaging/whatsapp' },
                { title: 'SMS', url: '/messaging/sms' },
                { title: 'Analytics', url: '/messaging' },
            ],
        },
        {
            title: Modules.EMAIL,
            url: '/mail',
            icon: 'Mail',
            items: [
                { title: 'Cold Outreach', url: '/mail' },
                { title: 'Warm Outreach', url: '/mail' },
                { title: 'Templates', url: '/mail' },
                { title: 'AI Replies', url: '/mail' },
                { title: 'Analytics', url: '/mail' },
            ],
        },
    ],
};
