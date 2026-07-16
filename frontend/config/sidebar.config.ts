import { MANAGE_TENANTS_ROUTE } from './app-config';

/** Admin-only paths (not in sidebar nav). Exact match or nested routes (e.g. /manage-tenants/[tenantId]) require admin. */
export const ADMIN_ONLY_PATHS = [MANAGE_TENANTS_ROUTE] as const;
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
} from 'lucide-react';

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
    [Modules.LEAD_ENRICHMENT]: UsersRound,
};

export const subModuleIconMap: Record<SubModule, { icon: LucideIcon; color: string }> = {
    [LEAD_GENERATION_SUB_MODULES.LEADS]: {
        icon: ListIcon,
        color: '!text-slate-600',
    },
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
    [LEAD_ENRICHMENT_SUB_MODULES.EMAIL_VERIFICATION]: {
        icon: Mail,
        color: '!text-blue-500',
    },
    [LEAD_ENRICHMENT_SUB_MODULES.PHONE_VERIFICATION]: {
        icon: PhoneIcon,
        color: '!text-green-500',
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

/**
 * Nav items are not listed here. Full / admin nav is built from
 * `getDefaultModuleAccess()` in `helpers/sidebar-config-helpers.ts` (SSOT).
 */
