import { LeadSource, LEAD_GENERATION_SUB_MODULES } from '@aixellabs/backend/db/types';
import { SubModuleUrls } from '@/config/app-config';

/** Lead sources shown on the home dashboard (excludes Facebook / people-only tracks for now). */
export const DASHBOARD_LEAD_SOURCES = [
    LeadSource.GOOGLE_MAPS,
    LeadSource.GOOGLE_ADVANCED_SEARCH,
    LeadSource.INSTAGRAM,
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
        /** CSS color token from `globals.css` (`--chart-*`). */
        color: string;
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
        color: 'var(--chart-1)',
        imageSrc: '/google-maps.svg',
        imageAlt: 'Google Maps',
        subModule: LEAD_GENERATION_SUB_MODULES.GOOGLE_MAPS,
    },
    [LeadSource.GOOGLE_ADVANCED_SEARCH]: {
        label: 'Google Advanced Search',
        shortLabel: 'Search',
        href: SubModuleUrls[LEAD_GENERATION_SUB_MODULES.GOOGLE_ADVANCED_SEARCH],
        chartKey: 'search',
        color: 'var(--chart-2)',
        imageSrc: '/google-logo.png',
        imageAlt: 'Google',
        subModule: LEAD_GENERATION_SUB_MODULES.GOOGLE_ADVANCED_SEARCH,
    },
    [LeadSource.INSTAGRAM]: {
        label: 'Instagram',
        shortLabel: 'Instagram',
        href: SubModuleUrls[LEAD_GENERATION_SUB_MODULES.INSTAGRAM_SEARCH],
        chartKey: 'instagram',
        color: 'var(--chart-3)',
        imageSrc: '/instagram-logo.svg',
        imageAlt: 'Instagram',
        subModule: LEAD_GENERATION_SUB_MODULES.INSTAGRAM_SEARCH,
    },
    [LeadSource.LINKEDIN]: {
        label: 'LinkedIn',
        shortLabel: 'LinkedIn',
        href: SubModuleUrls[LEAD_GENERATION_SUB_MODULES.LINKEDIN],
        chartKey: 'linkedin',
        color: 'var(--chart-4)',
        imageSrc: '/linkedin-logo-svg.png',
        imageAlt: 'LinkedIn',
        subModule: LEAD_GENERATION_SUB_MODULES.LINKEDIN,
    },
};
