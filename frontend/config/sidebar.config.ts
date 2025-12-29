import { SubModuleUrls, ModuleUrls } from './app-config';
import {
    EMAIL_SUB_MODULES,
    LEAD_GENERATION_SUB_MODULES,
    MESSAGING_SUB_MODULES,
    Modules,
    VOICE_AGENT_SUB_MODULES,
} from '@aixellabs/shared/mongodb';
import { enumToTitleCase } from '@/helpers/string-helpers';

// Icon names as strings for serialization
export type IconName = 'UsersRound' | 'AudioWaveform' | 'MessageCircleMore' | 'Mail' | 'Settings2' | 'GalleryVerticalEnd';

export type SidebarNavItem = {
    title: string;
    url: (typeof ModuleUrls)[keyof typeof ModuleUrls];
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
            title: enumToTitleCase(Modules.LEAD_GENERATION),
            url: ModuleUrls.LEAD_GENERATION,
            icon: 'UsersRound',
            items: [
                {
                    title: enumToTitleCase(LEAD_GENERATION_SUB_MODULES.GOOGLE_MAPS),
                    url: SubModuleUrls.GOOGLE_MAPS,
                },
                {
                    title: enumToTitleCase(LEAD_GENERATION_SUB_MODULES.GOOGLE_ADVANCED_SEARCH),
                    url: SubModuleUrls.GOOGLE_ADVANCED_SEARCH,
                },
                {
                    title: enumToTitleCase(LEAD_GENERATION_SUB_MODULES.INSTAGRAM_SEARCH),
                    url: SubModuleUrls.INSTAGRAM_SEARCH,
                },
                {
                    title: enumToTitleCase(LEAD_GENERATION_SUB_MODULES.INSTAGRAM_ADVANCED_SEARCH),
                    url: SubModuleUrls.INSTAGRAM_ADVANCED_SEARCH,
                },
                {
                    title: enumToTitleCase(LEAD_GENERATION_SUB_MODULES.FACEBOOK),
                    url: SubModuleUrls.FACEBOOK,
                },
                {
                    title: enumToTitleCase(LEAD_GENERATION_SUB_MODULES.LINKEDIN),
                    url: SubModuleUrls.LINKEDIN,
                },
            ],
        },
        {
            title: enumToTitleCase(Modules.VOICE_AGENT),
            url: ModuleUrls.VOICE_AGENT,
            icon: 'AudioWaveform',
            items: [
                { title: enumToTitleCase(VOICE_AGENT_SUB_MODULES.WEB_DIALER), url: VOICE_AGENT_SUB_MODULES.WEB_DIALER },
                {
                    title: enumToTitleCase(VOICE_AGENT_SUB_MODULES.INQUIRY_BOOKINGS),
                    url: VOICE_AGENT_SUB_MODULES.INQUIRY_BOOKINGS,
                },
                {
                    title: enumToTitleCase(VOICE_AGENT_SUB_MODULES.CUSTOM_AGENT_ANALYTICS),
                    url: VOICE_AGENT_SUB_MODULES.CUSTOM_AGENT_ANALYTICS,
                },
            ],
        },
        {
            title: enumToTitleCase(Modules.MESSAGING),
            url: ModuleUrls.MESSAGING,
            icon: 'MessageCircleMore',
            items: [
                { title: enumToTitleCase(MESSAGING_SUB_MODULES.WHATSAPP), url: MESSAGING_SUB_MODULES.WHATSAPP },
                { title: enumToTitleCase(MESSAGING_SUB_MODULES.SMS), url: MESSAGING_SUB_MODULES.SMS },
            ],
        },
        {
            title: enumToTitleCase(Modules.EMAIL),
            url: ModuleUrls.EMAIL,
            icon: 'Mail',
            items: [
                { title: enumToTitleCase(EMAIL_SUB_MODULES.COLD_OUTREACH), url: EMAIL_SUB_MODULES.COLD_OUTREACH },
                { title: enumToTitleCase(EMAIL_SUB_MODULES.WARM_OUTREACH), url: EMAIL_SUB_MODULES.WARM_OUTREACH },
                { title: enumToTitleCase(EMAIL_SUB_MODULES.TEMPLATES), url: EMAIL_SUB_MODULES.TEMPLATES },
                { title: enumToTitleCase(EMAIL_SUB_MODULES.AI_REPLIES), url: EMAIL_SUB_MODULES.AI_REPLIES },
            ],
        },
    ],
};
