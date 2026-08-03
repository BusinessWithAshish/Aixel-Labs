import type { BRAND_LOGOS, LEAD_SOURCES, SECTION_IDS } from './constants';

export type BrandLogoKey = keyof typeof BRAND_LOGOS;
export type LeadSource = (typeof LEAD_SOURCES)[number];
export type LeadSourceKey = LeadSource['key'];
export type SectionId = (typeof SECTION_IDS)[keyof typeof SECTION_IDS];

export type LogoRef = {
    src: string;
    label: string;
};

export type TrustLine = {
    label: string;
    highlight: string | null;
};

export type PreviewFieldIcon = 'search' | 'pin' | 'hash' | 'chevron';
