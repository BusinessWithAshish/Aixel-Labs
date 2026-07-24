import { LeadSource, LEAD_GENERATION_SUB_MODULES } from '@aixellabs/backend/db/types';
import { SubModuleUrls } from '@/config/app-config';

/** Lead sources shown on the home dashboard. */
export const DASHBOARD_LEAD_SOURCES = [
    LeadSource.GOOGLE_MAPS,
    LeadSource.GOOGLE_ADVANCED_SEARCH,
    LeadSource.INSTAGRAM,
    LeadSource.FACEBOOK,
    LeadSource.LINKEDIN,
] as const;

export type DashboardLeadSource = (typeof DASHBOARD_LEAD_SOURCES)[number];

export type LeadSourceCount = {
    source: DashboardLeadSource;
    count: number;
};

export type LeadDayCount = {
    date: string;
    count: number;
};

export type RecentLeadListSummary = {
    id: string;
    name: string;
    leadCount: number;
    createdAt: string;
};

export type LeadGenerationDashboardStats = {
    totalLeads: number;
    totalLists: number;
    leadsThisWeek: number;
    averageLeadsPerList: number;
    bySource: LeadSourceCount[];
    trend: LeadDayCount[];
    recentLists: RecentLeadListSummary[];
    credits: number | null;
    creditsExempt: boolean;
};

export const DASHBOARD_SOURCE_META: Record<
    DashboardLeadSource,
    {
        label: string;
        shortLabel: string;
        href: string;
        chartKey: string;
        /** Solid brand color for badges / tooltips. */
        color: string;
        /** Brand gradient stops for chart bars (left → right). */
        gradient: readonly string[];
        imageSrc: string;
        imageAlt: string;
        subModule: LEAD_GENERATION_SUB_MODULES;
    }
> = {
    [LeadSource.GOOGLE_MAPS]: {
        label: 'Google Maps',
        shortLabel: 'Maps',
        href: SubModuleUrls[LEAD_GENERATION_SUB_MODULES.GOOGLE_MAPS],
        chartKey: 'maps',
        color: '#34A853',
        // Maps-forward: green → yellow/orange → red
        gradient: ['#34A853', '#FBBC04', '#EA4335'],
        imageSrc: '/google-maps.svg',
        imageAlt: 'Google Maps',
        subModule: LEAD_GENERATION_SUB_MODULES.GOOGLE_MAPS,
    },
    [LeadSource.GOOGLE_ADVANCED_SEARCH]: {
        label: 'Google Advanced Search',
        shortLabel: 'Search',
        href: SubModuleUrls[LEAD_GENERATION_SUB_MODULES.GOOGLE_ADVANCED_SEARCH],
        chartKey: 'search',
        color: '#4285F4',
        // Google four-color, blue-led (distinct from Maps)
        gradient: ['#4285F4', '#EA4335', '#FBBC04', '#34A853'],
        imageSrc: '/google-logo.png',
        imageAlt: 'Google',
        subModule: LEAD_GENERATION_SUB_MODULES.GOOGLE_ADVANCED_SEARCH,
    },
    [LeadSource.INSTAGRAM]: {
        label: 'Instagram',
        shortLabel: 'Instagram',
        href: SubModuleUrls[LEAD_GENERATION_SUB_MODULES.INSTAGRAM_SEARCH],
        chartKey: 'instagram',
        color: '#E1306C',
        gradient: ['#FCAF45', '#E1306C', '#833AB4'],
        imageSrc: '/instagram-logo.svg',
        imageAlt: 'Instagram',
        subModule: LEAD_GENERATION_SUB_MODULES.INSTAGRAM_SEARCH,
    },
    [LeadSource.FACEBOOK]: {
        label: 'Facebook',
        shortLabel: 'Facebook',
        href: SubModuleUrls[LEAD_GENERATION_SUB_MODULES.FACEBOOK],
        chartKey: 'facebook',
        color: '#1877F2',
        // Soft blue variant around Facebook blue
        gradient: ['#4BA0FF', '#1877F2', '#0B5FCC'],
        imageSrc: '/facebook-logo.svg',
        imageAlt: 'Facebook',
        subModule: LEAD_GENERATION_SUB_MODULES.FACEBOOK,
    },
    [LeadSource.LINKEDIN]: {
        label: 'LinkedIn',
        shortLabel: 'LinkedIn',
        href: SubModuleUrls[LEAD_GENERATION_SUB_MODULES.LINKEDIN],
        chartKey: 'linkedin',
        color: '#0A66C2',
        gradient: ['#378FE9', '#0A66C2', '#004182'],
        imageSrc: '/linkedin-logo-svg.png',
        imageAlt: 'LinkedIn',
        subModule: LEAD_GENERATION_SUB_MODULES.LINKEDIN,
    },
};
