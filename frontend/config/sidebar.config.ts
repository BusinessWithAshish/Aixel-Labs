import { SubModuleUrls, ModuleUrls } from './app-config';
import {
    EMAIL_SUB_MODULES,
    LEAD_GENERATION_SUB_MODULES,
    MESSAGING_SUB_MODULES,
    Modules,
    VOICE_AGENT_SUB_MODULES,
} from '@aixellabs/shared/mongodb';
import {AudioWaveform, LucideIcon, Mail, MessageCircleMore, UsersRound} from "lucide-react";

export type SidebarNavItem = {
    title: string;
    url: string;
    items?: {
        title: string;
        url: string;
    }[];
};

export type SidebarTenant = {
    name: string;
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

export const modulesIconMap: Record<Modules, LucideIcon> = {
    [Modules.LEAD_GENERATION]: UsersRound,
    [Modules.VOICE_AGENT]: AudioWaveform,
    [Modules.MESSAGING]: MessageCircleMore,
    [Modules.EMAIL]: Mail,
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
                {
                    title: LEAD_GENERATION_SUB_MODULES.GOOGLE_ADVANCED_SEARCH,
                    url: SubModuleUrls.GOOGLE_ADVANCED_SEARCH,
                },
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
                { title: VOICE_AGENT_SUB_MODULES.WEB_DIALER, url: VOICE_AGENT_SUB_MODULES.WEB_DIALER },
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
