import { SubModuleUrls, ModuleUrls } from './app-config';
import {
    EMAIL_SUB_MODULES,
    LEAD_GENERATION_SUB_MODULES,
    MESSAGING_SUB_MODULES,
    Modules,
    VOICE_AGENT_SUB_MODULES,
} from '@aixellabs/shared/mongodb';
import { enumToPascalCase } from '@/helpers/string-helpers';

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
            title: Modules.LEAD_GENERATION,
            url: ModuleUrls.LEAD_GENERATION,
            icon: 'UsersRound',
            items: [
                {
                    title: enumToPascalCase(LEAD_GENERATION_SUB_MODULES.GOOGLE_MAPS),
                    url: SubModuleUrls.GOOGLE_MAPS,
                },
                {
                    title: enumToPascalCase(LEAD_GENERATION_SUB_MODULES.GOOGLE_ADVANCED_SEARCH),
                    url: SubModuleUrls.GOOGLE_ADVANCED_SEARCH,
                },
                {
                    title: enumToPascalCase(LEAD_GENERATION_SUB_MODULES.INSTAGRAM_SEARCH),
                    url: SubModuleUrls.INSTAGRAM_SEARCH,
                },
                {
                    title: enumToPascalCase(LEAD_GENERATION_SUB_MODULES.INSTAGRAM_ADVANCED_SEARCH),
                    url: SubModuleUrls.INSTAGRAM_ADVANCED_SEARCH,
                },
                {
                    title: enumToPascalCase(LEAD_GENERATION_SUB_MODULES.FACEBOOK),
                    url: SubModuleUrls.FACEBOOK,
                },
                {
                    title: enumToPascalCase(LEAD_GENERATION_SUB_MODULES.LINKEDIN),
                    url: SubModuleUrls.LINKEDIN,
                },
            ],
        },
        {
            title: Modules.VOICE_AGENT,
            url: ModuleUrls.VOICE_AGENT,
            icon: 'AudioWaveform',
            items: [
                { title: enumToPascalCase(VOICE_AGENT_SUB_MODULES.WEB_DIALER), url: VOICE_AGENT_SUB_MODULES.WEB_DIALER },
                {
                    title: enumToPascalCase(VOICE_AGENT_SUB_MODULES.INQUIRY_BOOKINGS),
                    url: VOICE_AGENT_SUB_MODULES.INQUIRY_BOOKINGS,
                },
                {
                    title: enumToPascalCase(VOICE_AGENT_SUB_MODULES.CUSTOM_AGENT_ANALYTICS),
                    url: VOICE_AGENT_SUB_MODULES.CUSTOM_AGENT_ANALYTICS,
                },
            ],
        },
        {
            title: Modules.MESSAGING,
            url: ModuleUrls.MESSAGING,
            icon: 'MessageCircleMore',
            items: [
                { title: enumToPascalCase(MESSAGING_SUB_MODULES.WHATSAPP), url: MESSAGING_SUB_MODULES.WHATSAPP },
                { title: enumToPascalCase(MESSAGING_SUB_MODULES.SMS), url: MESSAGING_SUB_MODULES.SMS },
            ],
        },
        {
            title: Modules.EMAIL,
            url: ModuleUrls.EMAIL,
            icon: 'Mail',
            items: [
                { title: enumToPascalCase(EMAIL_SUB_MODULES.COLD_OUTREACH), url: EMAIL_SUB_MODULES.COLD_OUTREACH },
                { title: enumToPascalCase(EMAIL_SUB_MODULES.WARM_OUTREACH), url: EMAIL_SUB_MODULES.WARM_OUTREACH },
                { title: enumToPascalCase(EMAIL_SUB_MODULES.TEMPLATES), url: EMAIL_SUB_MODULES.TEMPLATES },
                { title: enumToPascalCase(EMAIL_SUB_MODULES.AI_REPLIES), url: EMAIL_SUB_MODULES.AI_REPLIES },
            ],
        },
    ],
};
