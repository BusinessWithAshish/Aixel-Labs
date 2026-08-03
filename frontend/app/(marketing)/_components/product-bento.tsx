'use client';

import Image from 'next/image';
import { motion } from 'motion/react';
import { ArrowUpRight } from 'lucide-react';
import { BRAND_LOGOS, LEAD_SOURCES, SECTION_IDS } from '../constants';
import { Reveal, StaggerGroup, StaggerItem } from './primitives';
import {
    FacebookPreview,
    InstagramPreview,
    LinkedInPreview,
    MapsPreview,
} from './scraper-preview';
import { LandingSection, SectionEyebrow } from './primitives';

const SOURCES = [
    {
        key: 'maps' as const,
        logo: BRAND_LOGOS.googleMaps,
        label: 'Google Maps',
        title: 'Find local businesses by query, city, and category',
        span: 'lg:col-span-4 sm:col-span-2',
        featured: true,
        Preview: MapsPreview,
    },
    {
        key: 'instagram' as const,
        logo: BRAND_LOGOS.instagram,
        label: 'Instagram Search',
        title: 'Search by query, hashtags, and location',
        span: 'lg:col-span-2',
        featured: false,
        Preview: InstagramPreview,
    },
    {
        key: 'facebook' as const,
        logo: BRAND_LOGOS.facebook,
        label: 'Facebook Pages',
        title: 'Discover business Pages by query and geo',
        span: 'lg:col-span-3',
        featured: false,
        Preview: FacebookPreview,
    },
    {
        key: 'linkedin' as const,
        logo: BRAND_LOGOS.linkedin,
        label: 'LinkedIn Search',
        title: 'Find companies by industry, name, and region',
        span: 'lg:col-span-3',
        featured: false,
        Preview: LinkedInPreview,
    },
];

const FOOTER_CHIPS = [
    { src: BRAND_LOGOS.googleMaps, label: 'Google Maps' },
    { src: BRAND_LOGOS.googleMaps, label: 'Maps Advanced' },
    ...LEAD_SOURCES.filter((s) => s.key !== 'maps').map((s) => ({ src: s.src, label: s.label })),
] as const;

export function ProductBento() {
    return (
        <LandingSection id={SECTION_IDS.product} tone="muted">
            <Reveal className="flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-end">
                <div className="max-w-2xl">
                    <SectionEyebrow>The product</SectionEyebrow>
                    <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
                        Scrapers that actually run. Maps, Instagram, Facebook, LinkedIn.
                    </h2>
                </div>
                <p className="max-w-md text-sm text-muted-foreground">
                    Manual forms and AI chat for every source. Set query, location, and filters. Hit Save and Run.
                    Credits debit only after a successful scrape.
                </p>
            </Reveal>

            <StaggerGroup className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-6" stagger={0.08}>
                {SOURCES.map((source) => (
                    <StaggerItem key={source.key} className={source.span}>
                        <BentoCard>
                            <CardHeader
                                logo={<Image src={source.logo} alt="" width={16} height={16} />}
                                label={source.label}
                                title={source.title}
                                compact={!source.featured}
                            />
                            <div className="mt-5">
                                <source.Preview />
                            </div>
                        </BentoCard>
                    </StaggerItem>
                ))}
            </StaggerGroup>

            <Reveal delay={0.15} className="mt-6 flex flex-wrap items-center justify-center gap-2 sm:mt-8">
                {FOOTER_CHIPS.map((item) => (
                    <span
                        key={item.label}
                        className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-medium text-muted-foreground"
                    >
                        <Image src={item.src} alt="" width={14} height={14} className="size-3.5" />
                        {item.label}
                    </span>
                ))}
                <span className="inline-flex items-center rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                    Google Advanced Search
                </span>
            </Reveal>
        </LandingSection>
    );
}

function BentoCard({ children }: { children: React.ReactNode }) {
    return (
        <motion.article
            whileHover={{ y: -4 }}
            transition={{ type: 'spring', stiffness: 300, damping: 22 }}
            className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card p-4 sm:p-5 transition-colors hover:border-primary/40"
        >
            {children}
        </motion.article>
    );
}

function CardHeader({
    logo,
    label,
    title,
    compact,
}: {
    logo: React.ReactNode;
    label: string;
    title: string;
    compact?: boolean;
}) {
    return (
        <div className="flex items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">{logo}</span>
            <div className="min-w-0 flex-1">
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
                <h3 className={`mt-1 font-semibold tracking-tight text-foreground ${compact ? 'text-base' : 'text-lg'}`}>
                    {title}
                </h3>
            </div>
            <ArrowUpRight className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
        </div>
    );
}
