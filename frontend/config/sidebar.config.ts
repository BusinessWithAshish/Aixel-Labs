// Icon names as strings for serialization
export type IconName = 'UsersRound' | 'AudioWaveform' | 'MessageCircleMore' | 'Mail' | 'Settings2' | 'GalleryVerticalEnd';

export type SidebarNavItem = {
    title: string;
    url: string;
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
            title: 'Lead Generation',
            url: '/lead-generation',
            icon: 'UsersRound',
            items: [
                { title: 'All in 1 scraper', url: '/lead-generation/AI1' },
                { title: 'Google Maps Scraper', url: '/lead-generation/LGS' },
                { title: 'Google Advanced Search', url: '/lead-generation' },
                { title: 'LinkedIn', url: '/lead-generation' },
                { title: 'Instagram', url: '/lead-generation' },
                { title: 'Facebook', url: '/lead-generation' },
            ],
        },
        {
            title: 'Voice Agent',
            url: '/voice-agent',
            icon: 'AudioWaveform',
            items: [
                { title: 'Web dialer', url: '/voice-agent/web-dialer' },
                { title: 'Inquiry / Bookings', url: '/voice-agent' },
                { title: 'Custom Agent Analytics', url: '/voice-agent' },
            ],
        },
        {
            title: 'Messaging',
            url: '/messaging',
            icon: 'MessageCircleMore',
            items: [
                { title: 'Whatsapp', url: '/messaging/whatsapp' },
                { title: 'SMS', url: '/messaging/sms' },
                { title: 'Analytics', url: '/messaging' },
            ],
        },
        {
            title: 'Email Module',
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
        {
            title: 'Client Management',
            url: '/settings',
            icon: 'Settings2',
            items: [
                { title: 'Enabled Modules', url: '/settings/enabled-modules' },
                { title: 'Multi-tenant Accounts', url: '/settings/multi-tenant-accounts' },
            ],
        },
    ],
};
