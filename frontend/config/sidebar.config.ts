import { SubModuleUrls, ModuleUrls } from './app-config';
import {
    EMAIL_SUB_MODULES,
    LEAD_GENERATION_SUB_MODULES,
    MESSAGING_SUB_MODULES,
    Modules,
    SubModule,
    VOICE_AGENT_SUB_MODULES,
} from '@aixellabs/shared/mongodb';
import {
    AudioWaveform,
    Instagram,
    Linkedin,
    LucideIcon,
    Mail,
    MessageCircleMore,
    UsersRound,
    Phone,
    FacebookIcon,
    MapPinIcon,
    SearchIcon,
} from 'lucide-react';

export type SidebarNavItem = {
    title: string;
    url: string;
    items?: {
        title: string;
        url: string;
    }[];
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

export const modulesIconMap: Record<Modules, LucideIcon> = {
    [Modules.LEAD_GENERATION]: UsersRound,
    [Modules.VOICE_AGENT]: AudioWaveform,
    [Modules.MESSAGING]: MessageCircleMore,
    [Modules.EMAIL]: Mail,
};

export const subModuleIconMap: Record<SubModule, { icon: LucideIcon; color: string }> = {
    [LEAD_GENERATION_SUB_MODULES.GOOGLE_MAPS]: {
        icon: MapPinIcon,
        color: '!text-red-500',
    },
    [LEAD_GENERATION_SUB_MODULES.GOOGLE_ADVANCED_SEARCH]: {
        icon: SearchIcon,
        color: '!text-blue-500',
    },
    [LEAD_GENERATION_SUB_MODULES.INSTAGRAM_SEARCH]: {
        icon: Instagram,
        color: '!text-pink-500',
    },
    [LEAD_GENERATION_SUB_MODULES.INSTAGRAM_ADVANCED_SEARCH]: {
        icon: Instagram,
        color: '!text-pink-500',
    },
    [LEAD_GENERATION_SUB_MODULES.FACEBOOK]: {
        icon: FacebookIcon,
        color: '!text-blue-600',
    },
    [LEAD_GENERATION_SUB_MODULES.LINKEDIN]: {
        icon: Linkedin,
        color: '!text-blue-700',
    },
    [VOICE_AGENT_SUB_MODULES.WEB_DIALER]: {
        icon: Phone,
        color: '!text-green-500',
    },
    [VOICE_AGENT_SUB_MODULES.INQUIRY_BOOKINGS]: {
        icon: Phone,
        color: '!text-green-500',
    },
    [VOICE_AGENT_SUB_MODULES.CUSTOM_AGENT_ANALYTICS]: {
        icon: Phone,
        color: '!text-green-500',
    },
    [MESSAGING_SUB_MODULES.WHATSAPP]: {
        icon: MessageCircleMore,
        color: '!text-green-500',
    },
    [MESSAGING_SUB_MODULES.SMS]: {
        icon: MessageCircleMore,
        color: '!text-gray-500',
    },
    [EMAIL_SUB_MODULES.COLD_OUTREACH]: {
        icon: Mail,
        color: '!text-blue-500',
    },
    [EMAIL_SUB_MODULES.WARM_OUTREACH]: {
        icon: Mail,
        color: '!text-orange-500',
    },
    [EMAIL_SUB_MODULES.TEMPLATES]: {
        icon: Mail,
        color: '!text-gray-500',
    },
    [EMAIL_SUB_MODULES.AI_REPLIES]: {
        icon: Mail,
        color: '!text-purple-500',
    },
};



export const sidebarConfig: SidebarConfig = {
    navMain: [
        {
            title: Modules.LEAD_GENERATION,
            url: ModuleUrls.LEAD_GENERATION,
            items: [
                {
                    title: LEAD_GENERATION_SUB_MODULES.GOOGLE_MAPS,
                    url: SubModuleUrls.GOOGLE_MAPS,
                },
                // FOR NOW, WE ARE NOT USING THE ADVANCED SEARCH
                // {
                //     title: LEAD_GENERATION_SUB_MODULES.GOOGLE_ADVANCED_SEARCH,
                //     url: SubModuleUrls.GOOGLE_ADVANCED_SEARCH,
                // },
                {
                    title: LEAD_GENERATION_SUB_MODULES.INSTAGRAM_SEARCH,
                    url: SubModuleUrls.INSTAGRAM_SEARCH,
                },
                {
                    title: LEAD_GENERATION_SUB_MODULES.INSTAGRAM_ADVANCED_SEARCH,
                    url: SubModuleUrls.INSTAGRAM_ADVANCED_SEARCH,
                },
                {
                    title: LEAD_GENERATION_SUB_MODULES.FACEBOOK,
                    url: SubModuleUrls.FACEBOOK,
                },
                {
                    title: LEAD_GENERATION_SUB_MODULES.LINKEDIN,
                    url: SubModuleUrls.LINKEDIN,
                },
            ],
        },
        {
            title: Modules.VOICE_AGENT,
            url: ModuleUrls.VOICE_AGENT,
            items: [
                {
                    title: VOICE_AGENT_SUB_MODULES.WEB_DIALER,
                    url: SubModuleUrls.WEB_DIALER,
                },
                {
                    title: VOICE_AGENT_SUB_MODULES.INQUIRY_BOOKINGS,
                    url: SubModuleUrls.INQUIRY_BOOKINGS,
                },
                {
                    title: VOICE_AGENT_SUB_MODULES.CUSTOM_AGENT_ANALYTICS,
                    url: SubModuleUrls.CUSTOM_AGENT_ANALYTICS,
                },
            ],
        },
        {
            title: Modules.MESSAGING,
            url: ModuleUrls.MESSAGING,
            items: [
                { title: MESSAGING_SUB_MODULES.WHATSAPP, url: SubModuleUrls.WHATSAPP },
                { title: MESSAGING_SUB_MODULES.SMS, url: SubModuleUrls.SMS },
            ],
        },
        {
            title: Modules.EMAIL,
            url: ModuleUrls.EMAIL,
            items: [
                { title: EMAIL_SUB_MODULES.COLD_OUTREACH, url: SubModuleUrls.COLD_OUTREACH },
                { title: EMAIL_SUB_MODULES.WARM_OUTREACH, url: SubModuleUrls.WARM_OUTREACH },
                { title: EMAIL_SUB_MODULES.TEMPLATES, url: SubModuleUrls.TEMPLATES },
                { title: EMAIL_SUB_MODULES.AI_REPLIES, url: SubModuleUrls.AI_REPLIES },
            ],
        },
    ],
};
