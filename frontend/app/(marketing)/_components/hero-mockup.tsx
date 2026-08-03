'use client';

import Image from 'next/image';
import { motion, useMotionValue, useSpring, useTransform } from 'motion/react';
import { useRef, type MouseEvent } from 'react';
import { ChevronDown, LayoutDashboard } from 'lucide-react';
import { APP_HOST, BRAND_LOGOS, EASE_OUT_EXPO, LABELS, LEAD_SOURCES } from '../constants';
import { ChipRow, PreviewField } from './scraper-preview';

const SIDEBAR_NAV = [
    { label: 'Leads', active: false },
    { label: 'Google Maps', active: true, logo: BRAND_LOGOS.googleMaps },
    { label: 'Instagram Search', active: false, logo: BRAND_LOGOS.instagram },
    { label: 'LinkedIn Search', active: false, logo: BRAND_LOGOS.linkedin },
    { label: 'Facebook Pages', active: false, logo: BRAND_LOGOS.facebook },
] as const;

/** Browser chrome + theme-aware workspace preview (follows light/dark tokens). */
export function ProductMockup() {
    const ref = useRef<HTMLDivElement>(null);
    const mx = useMotionValue(0);
    const my = useMotionValue(0);
    const rotateX = useSpring(useTransform(my, [-0.5, 0.5], [6, -6]), { stiffness: 160, damping: 20 });
    const rotateY = useSpring(useTransform(mx, [-0.5, 0.5], [-7, 7]), { stiffness: 160, damping: 20 });

    function onMove(e: MouseEvent<HTMLDivElement>) {
        const el = ref.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        mx.set((e.clientX - rect.left) / rect.width - 0.5);
        my.set((e.clientY - rect.top) / rect.height - 0.5);
    }

    function onLeave() {
        mx.set(0);
        my.set(0);
    }

    return (
        <div style={{ perspective: 1200 }} className="relative">
            <motion.div
                ref={ref}
                onMouseMove={onMove}
                onMouseLeave={onLeave}
                style={{ rotateX, rotateY, transformStyle: 'preserve-3d' }}
                className="relative overflow-hidden rounded-2xl border border-border/80 bg-card shadow-2xl shadow-primary/10 dark:shadow-primary/20"
                role="img"
                aria-label="Aixel Labs lead-generation workspace with sidebar sources and Google Maps scraper"
            >
                <div className="flex items-center gap-2 border-b border-border/80 bg-muted/40 px-4 py-2.5">
                    <div className="flex gap-1.5">
                        <span className="size-2.5 rounded-full bg-foreground/12" />
                        <span className="size-2.5 rounded-full bg-foreground/12" />
                        <span className="size-2.5 rounded-full bg-foreground/12" />
                    </div>
                    <div className="mx-auto flex min-w-0 max-w-[min(100%,20rem)] items-center gap-1.5 truncate rounded-md border border-border bg-background px-2.5 py-1 text-[11px] text-muted-foreground">
                        <span className="size-2.5 shrink-0 rounded-sm bg-primary/70" />
                        <span className="truncate">{APP_HOST}</span>
                    </div>
                </div>

                <div className="flex min-h-72 bg-background sm:min-h-88">
                    <aside className="hidden w-46 shrink-0 border-r border-border bg-muted/30 p-3 sm:block">
                        <p className="px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                            Lead Generation
                        </p>
                        <ul className="mt-2 space-y-0.5">
                            {SIDEBAR_NAV.map((item) => (
                                <li key={item.label}>
                                    <span
                                        className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-[11px] ${
                                            item.active
                                                ? 'bg-primary/12 font-medium text-primary'
                                                : 'text-muted-foreground'
                                        }`}
                                    >
                                        {'logo' in item && item.logo ? (
                                            <Image src={item.logo} alt="" width={14} height={14} className="size-3.5" />
                                        ) : (
                                            <LayoutDashboard className="size-3.5 opacity-70" />
                                        )}
                                        {item.label}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </aside>

                    <div className="min-w-0 flex-1 p-3 sm:p-4">
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                    <Image
                                        src={BRAND_LOGOS.googleMaps}
                                        alt=""
                                        width={18}
                                        height={18}
                                        className="size-4.5"
                                    />
                                    <h3 className="truncate text-sm font-semibold text-foreground">
                                        Google Maps Scraper
                                    </h3>
                                </div>
                                <p className="mt-0.5 text-[11px] text-muted-foreground">
                                    Query · location · category · {LABELS.saveAndRun}
                                </p>
                            </div>
                            <span className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg bg-primary px-3 text-[11px] font-semibold text-primary-foreground">
                                {LABELS.saveAndRun}
                                <ChevronDown className="size-3 opacity-80" />
                            </span>
                        </div>

                        <div className="mt-3 flex gap-1 border-b border-border/70 pb-px">
                            {['Manual Form', 'AI Chat'].map((tab, i) => (
                                <span
                                    key={tab}
                                    className={`-mb-px border-b-2 px-2.5 pb-2 text-[11px] font-medium ${
                                        i === 0
                                            ? 'border-primary text-foreground'
                                            : 'border-transparent text-muted-foreground'
                                    }`}
                                >
                                    {tab}
                                </span>
                            ))}
                        </div>

                        <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                            <PreviewField label="Country" value="United States" compact />
                            <PreviewField label="State" value="California" compact />
                            <PreviewField
                                label="Cities"
                                value="San Francisco, Oakland"
                                icon="pin"
                                className="sm:col-span-2"
                                compact
                            />
                            <PreviewField
                                label="Category"
                                value="Plumbers · Home services"
                                icon="search"
                                className="sm:col-span-2"
                                compact
                            />
                        </div>

                        <div className="mt-3">
                            <ChipRow items={['Restaurants', 'Gyms', 'Dentists']} />
                        </div>
                    </div>
                </div>

                <motion.div
                    aria-hidden
                    initial={{ x: '-120%', opacity: 0 }}
                    animate={{ x: '140%', opacity: [0, 0.45, 0] }}
                    transition={{ duration: 1.4, delay: 0.85, ease: EASE_OUT_EXPO }}
                    className="pointer-events-none absolute inset-y-0 w-1/3 skew-x-[-18deg] bg-linear-to-r from-transparent via-foreground/15 to-transparent dark:via-foreground/10"
                />
            </motion.div>
        </div>
    );
}

export const HERO_SOURCE_PILLS = LEAD_SOURCES.map((s) => ({ src: s.src, label: s.label }));

export const HERO_FLOATING_LOGOS = [
    { src: BRAND_LOGOS.googleMaps, alt: 'Google Maps', className: 'top-[10%] -left-[4%] sm:-left-[6%]', delay: 0 },
    { src: BRAND_LOGOS.instagram, alt: 'Instagram', className: 'top-[4%] -right-[4%] sm:-right-[7%]', delay: 0.35 },
    { src: BRAND_LOGOS.linkedin, alt: 'LinkedIn', className: 'bottom-[18%] -left-[5%] sm:-left-[8%]', delay: 0.7 },
    { src: BRAND_LOGOS.facebook, alt: 'Facebook', className: 'bottom-[14%] -right-[4%] sm:-right-[6%]', delay: 1.05 },
] as const;
