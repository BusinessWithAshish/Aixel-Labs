import { WHATSAPP_AGENTS_URL, WHATSAPP_NUMBERS_URL, WHATSAPP_URL } from '@/helpers/voice-routes';
import { FILE_UPLOADS_ROUTE, MANAGE_TENANTS_ROUTE } from './app-config';

/** Admin-only paths (not in sidebar nav). Exact match or nested routes (e.g. /manage-tenants/[tenantId]) require admin. */
export const ADMIN_ONLY_PATHS = [MANAGE_TENANTS_ROUTE, FILE_UPLOADS_ROUTE] as const;
import {
    EMAIL_SUB_MODULES,
    LEAD_ENRICHMENT_SUB_MODULES,
    LEAD_GENERATION_SUB_MODULES,
    MESSAGING_SUB_MODULES,
    Modules,
    SubModule,
    VOICE_AGENT_SUB_MODULES,
} from '@aixellabs/backend/db/types';
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
    PhoneIcon,
    ListIcon,
    Globe,
    Bot,
    Inbox,
    History,
    CalendarCheck,
    Megaphone,
    ChartColumn,
    Settings,
} from 'lucide-react';

/**
 * Sub-modules shown as a sidebar group of their own, right below their module, instead of one link: the group's
 * key, and its pages in order (each key labelled and iconed in the maps below). Access stays the sub-module's.
 */
export const subModuleGroups = {
    [VOICE_AGENT_SUB_MODULES.WHATSAPP]: {
        key: 'WHATSAPP_GROUP',
        links: [
            { title: 'WHATSAPP_INBOX', url: WHATSAPP_URL },
            { title: 'WHATSAPP_AGENTS', url: WHATSAPP_AGENTS_URL },
            { title: 'WHATSAPP_NUMBERS', url: WHATSAPP_NUMBERS_URL },
        ],
    },
} as const satisfies Partial<Record<SubModule, { key: string; links: readonly { title: string; url: string }[] }>>;

type SubModuleGroup = (typeof subModuleGroups)[keyof typeof subModuleGroups];
/** A sidebar group made from a sub-module, and one of its links. */
export type SidebarGroupKey = SubModuleGroup['key'];
export type SidebarGroupLink = SubModuleGroup['links'][number]['title'];

/** Group labels that differ from the key's title case. */
export const navGroupLabelMap: Partial<Record<Modules | SidebarGroupKey, string>> = {
    WHATSAPP_GROUP: 'WhatsApp',
};

/** Sidebar labels that differ from the enum's title case. */
export const subModuleLabelMap: Partial<Record<SubModule | SidebarGroupLink, string>> = {
    WHATSAPP_INBOX: 'Inbox',
    WHATSAPP_AGENTS: 'Agents',
    WHATSAPP_NUMBERS: 'Numbers',
    [VOICE_AGENT_SUB_MODULES.INQUIRY_BOOKINGS]: 'Bookings',
    [VOICE_AGENT_SUB_MODULES.WHATSAPP]: 'WhatsApp',
    [VOICE_AGENT_SUB_MODULES.CUSTOM_AGENT_ANALYTICS]: 'Analytics',
};

export type SidebarNavItem = {
    title: string;
    items?: {
        title: string;
        url: string;
    }[];
};

export type SidebarUser = {
    name: string;
    email: string;
    avatar?: string;
    isAdmin: boolean;
    tenantId: string;
};

export type SidebarConfig = {
    navMain: SidebarNavItem[];
};

export const modulesIconMap: Record<Modules | SidebarGroupKey, LucideIcon> = {
    WHATSAPP_GROUP: MessageCircleMore,
    [Modules.LEAD_GENERATION]: UsersRound,
    [Modules.VOICE_AGENT]: AudioWaveform,
    [Modules.MESSAGING]: MessageCircleMore,
    [Modules.EMAIL]: Mail,
    [Modules.LEAD_ENRICHMENT]: UsersRound,
};

export const subModuleIconMap: Record<SubModule | SidebarGroupLink, { icon: LucideIcon; color: string }> = {
    WHATSAPP_INBOX: { icon: Inbox, color: '!text-green-600' },
    WHATSAPP_AGENTS: { icon: Bot, color: '!text-green-600' },
    WHATSAPP_NUMBERS: { icon: Phone, color: '!text-green-600' },
    [LEAD_GENERATION_SUB_MODULES.LEADS]: {
        icon: ListIcon,
        color: '!text-slate-600',
    },
    [LEAD_GENERATION_SUB_MODULES.GOOGLE_MAPS]: {
        icon: MapPinIcon,
        color: '!text-red-500',
    },
    [LEAD_GENERATION_SUB_MODULES.GOOGLE_MAPS_ADVANCED]: {
        icon: MapPinIcon,
        color: '!text-orange-500',
    },
    [LEAD_GENERATION_SUB_MODULES.GOOGLE_ADVANCED_SEARCH]: {
        icon: SearchIcon,
        color: '!text-blue-500',
    },
    [LEAD_GENERATION_SUB_MODULES.INSTAGRAM_SEARCH]: {
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
    [LEAD_GENERATION_SUB_MODULES.CRAWL]: {
        icon: Globe,
        color: '!text-teal-600',
    },
    [LEAD_ENRICHMENT_SUB_MODULES.EMAIL_VERIFICATION]: {
        icon: Mail,
        color: '!text-blue-500',
    },
    [LEAD_ENRICHMENT_SUB_MODULES.PHONE_VERIFICATION]: {
        icon: PhoneIcon,
        color: '!text-green-500',
    },
    [VOICE_AGENT_SUB_MODULES.AGENTS]: {
        icon: Bot,
        color: '!text-violet-500',
    },
    [VOICE_AGENT_SUB_MODULES.PHONE_NUMBERS]: {
        icon: PhoneIcon,
        color: '!text-green-500',
    },
    [VOICE_AGENT_SUB_MODULES.CALL_LOGS]: {
        icon: History,
        color: '!text-blue-500',
    },
    [VOICE_AGENT_SUB_MODULES.WHATSAPP]: {
        icon: MessageCircleMore,
        color: '!text-green-600',
    },
    [VOICE_AGENT_SUB_MODULES.WEB_DIALER]: {
        icon: Phone,
        color: '!text-green-500',
    },
    [VOICE_AGENT_SUB_MODULES.CAMPAIGNS]: {
        icon: Megaphone,
        color: '!text-orange-500',
    },
    [VOICE_AGENT_SUB_MODULES.INQUIRY_BOOKINGS]: {
        icon: CalendarCheck,
        color: '!text-teal-600',
    },
    [VOICE_AGENT_SUB_MODULES.CUSTOM_AGENT_ANALYTICS]: {
        icon: ChartColumn,
        color: '!text-indigo-500',
    },
    [VOICE_AGENT_SUB_MODULES.SETTINGS]: {
        icon: Settings,
        color: '!text-slate-600',
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

/**
 * Nav items are not listed here. Full / admin nav is built from
 * `getDefaultModuleAccess()` in `helpers/sidebar-config-helpers.ts` (SSOT).
 */
