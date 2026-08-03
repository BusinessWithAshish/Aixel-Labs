'use client';

import Image from 'next/image';
import { useEffect, useMemo, useState } from 'react';
import { motion, useScroll, useTransform } from 'motion/react';
import { ArrowRight, Calendar, Check, LayoutDashboard } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EASE_OUT_EXPO, HERO_TRUST, LABELS, SECTION_IDS } from '../constants';
import { BookCallButton, StartFreeLink } from './booking';
import { HERO_FLOATING_LOGOS, HERO_SOURCE_PILLS, ProductMockup } from './hero-mockup';

export function Hero() {
    const { scrollY } = useScroll();
    const y = useTransform(scrollY, [0, 600], [0, -48]);
    const scale = useTransform(scrollY, [0, 600], [1, 0.97]);

    return (
        <section id={SECTION_IDS.hero} className="relative overflow-hidden bg-background">
            <div aria-hidden className="pointer-events-none absolute inset-0">
                <div className="absolute inset-x-0 top-0 h-112 bg-[radial-gradient(ellipse_at_top,oklch(0.72_0.16_292/0.14),transparent_60%)]" />
                <div className="absolute -left-24 top-40 size-72 rounded-full bg-primary/8 blur-3xl animate-aurora-drift" />
                <div
                    className="absolute -right-16 top-56 size-80 rounded-full bg-primary/6 blur-3xl animate-aurora-drift"
                    style={{ animationDelay: '-4s' }}
                />
                    <div
                    className="absolute inset-0 opacity-[0.35]"
                    style={{
                        backgroundImage:
                            'linear-gradient(to right, color-mix(in oklab, var(--border) 55%, transparent) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in oklab, var(--border) 55%, transparent) 1px, transparent 1px)',
                        backgroundSize: '48px 48px',
                        maskImage: 'radial-gradient(ellipse at 50% 0%, black 20%, transparent 70%)',
                        WebkitMaskImage: 'radial-gradient(ellipse at 50% 0%, black 20%, transparent 70%)',
                    }}
                />
                <HeroParticles />
            </div>

            <div className="relative mx-auto w-full max-w-7xl px-4 pb-16 pt-8 sm:px-6 sm:pt-12 lg:pt-16">
                <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
                    <motion.h1
                        initial={{ opacity: 0, y: 18 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.7, ease: EASE_OUT_EXPO }}
                        className="text-balance text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl lg:text-[3.5rem]"
                    >
                        The fastest and cheapest{' '}
                        <span className="text-primary">lead gen scraper</span> out there.
                    </motion.h1>

                    <motion.p
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.7, delay: 0.14, ease: EASE_OUT_EXPO }}
                        className="mt-5 max-w-xl text-pretty text-base text-muted-foreground sm:text-lg"
                    >
                        More leads for less. Run Google Maps, search, and social scrapers from one workspace. Credits
                        debit only after a successful scrape.
                    </motion.p>

                    <motion.div
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.7, delay: 0.22, ease: EASE_OUT_EXPO }}
                        className="mt-8 flex flex-col items-center gap-3 sm:flex-row"
                    >
                        <motion.div whileHover={{ scale: 1.04, y: -1 }} whileTap={{ scale: 0.97 }}>
                            <StartFreeLink className="group relative inline-flex h-11 items-center gap-1.5 overflow-hidden rounded-xl bg-primary px-5 text-sm font-medium text-primary-foreground shadow-md shadow-primary/30">
                                <span
                                    aria-hidden
                                    className="pointer-events-none absolute inset-0 rounded-xl bg-primary-foreground/0 transition-colors duration-300 group-hover:bg-primary-foreground/10"
                                />
                                <span
                                    aria-hidden
                                    className="pointer-events-none absolute inset-0 animate-shimmer bg-linear-to-r from-transparent via-primary-foreground/25 to-transparent"
                                />
                                <span className="relative">{LABELS.startFree}</span>
                                <ArrowRight className="relative size-4 transition-transform duration-300 group-hover:translate-x-1" />
                            </StartFreeLink>
                        </motion.div>
                        <motion.div whileHover={{ scale: 1.03, y: -1 }} whileTap={{ scale: 0.97 }}>
                            <BookCallButton className="group relative inline-flex h-11 items-center gap-2 overflow-hidden rounded-xl border border-border bg-card/80 px-5 text-sm font-medium text-foreground backdrop-blur-sm transition-colors hover:border-primary/40 hover:bg-accent">
                                <span
                                    aria-hidden
                                    className="pointer-events-none absolute inset-0 -translate-x-full bg-linear-to-r from-transparent via-primary/10 to-transparent transition-transform duration-700 group-hover:translate-x-full"
                                />
                                <span className="relative grid size-5 place-items-center rounded-md bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                                    <Calendar className="size-3" />
                                </span>
                                <span className="relative">{LABELS.bookCall}</span>
                                <ArrowRight className="relative size-3.5 -translate-x-1 opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:opacity-100" />
                            </BookCallButton>
                        </motion.div>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, delay: 0.32, ease: EASE_OUT_EXPO }}
                        className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:flex-wrap sm:justify-center sm:gap-x-0 sm:gap-y-2"
                    >
                        {HERO_TRUST.map((t, i) => (
                            <motion.div
                                key={t.label}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ duration: 0.4, delay: 0.34 + i * 0.06 }}
                                className="flex items-center"
                            >
                                {i > 0 ? (
                                    <span aria-hidden className="mx-3 hidden h-3 w-px bg-border sm:mx-4 sm:block" />
                                ) : null}
                                <span className="inline-flex items-center gap-2 text-sm text-foreground/80 sm:text-[15px]">
                                    <Check className="size-4 shrink-0 text-primary" strokeWidth={2.25} />
                                    <span>
                                        {t.label}
                                        {t.highlight ? (
                                            <>
                                                {' '}
                                                <span className="font-mono text-[13px] font-semibold tracking-wide text-foreground sm:text-sm">
                                                    {t.highlight}
                                                </span>
                                            </>
                                        ) : null}
                                    </span>
                                </span>
                            </motion.div>
                        ))}
                    </motion.div>
                </div>

                <motion.div
                    initial={{ opacity: 0, y: 40 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.85, delay: 0.3, ease: EASE_OUT_EXPO }}
                    style={{ y, scale }}
                    className="relative mx-auto mt-12 max-w-5xl sm:mt-14"
                >
                    <div className="mb-5 flex flex-col items-center gap-3 sm:mb-6">
                        <p className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                            <LayoutDashboard className="size-3.5 text-primary" />
                            Inside the app
                        </p>
                        <div className="flex flex-wrap items-center justify-center gap-2">
                            {HERO_SOURCE_PILLS.map((pill, i) => (
                                <motion.span
                                    key={pill.label}
                                    initial={{ opacity: 0, y: 8 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.4, delay: 0.4 + i * 0.05 }}
                                    className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-card/90 px-2.5 py-1 text-[11px] font-medium text-foreground/80 shadow-sm backdrop-blur-sm"
                                >
                                    <Image src={pill.src} alt="" width={14} height={14} className="size-3.5" />
                                    {pill.label}
                                </motion.span>
                            ))}
                        </div>
                    </div>

                    {HERO_FLOATING_LOGOS.map((logo) => (
                        <motion.div
                            key={logo.alt}
                            aria-hidden
                            initial={{ opacity: 0, scale: 0.6 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ duration: 0.5, delay: 0.55 + logo.delay * 0.12, ease: EASE_OUT_EXPO }}
                            className={`absolute z-20 hidden sm:block ${logo.className}`}
                        >
                            <div className="animate-float-y" style={{ animationDelay: `${logo.delay}s` }}>
                                <div className="grid size-12 place-items-center rounded-2xl border border-border/80 bg-card/95 shadow-lg shadow-black/5 backdrop-blur-md dark:shadow-black/40">
                                    <Image src={logo.src} alt={logo.alt} width={26} height={26} className="size-6" />
                                </div>
                            </div>
                        </motion.div>
                    ))}

                    <div
                        aria-hidden
                        className="pointer-events-none absolute inset-x-[12%] -bottom-6 h-24 rounded-[100%] bg-primary/25 blur-3xl"
                    />

                    <ProductMockup />

                    <motion.p
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.5, delay: 0.7 }}
                        className="mt-5 flex items-center justify-center gap-2 text-center text-xs text-muted-foreground"
                    >
                        <LayoutDashboard className="size-3.5 text-primary" />
                        Lead-gen workspace · sources, scrapers, and runs in one view
                    </motion.p>
                </motion.div>
            </div>
        </section>
    );
}

/* --- Hero particles --- */

type Particle = {
    id: number;
    left: string;
    top: string;
    size: number;
    delay: number;
    duration: number;
    drift: number;
    opacity: number;
};

function buildParticles(count: number): Particle[] {
    // Deterministic layout so SSR + client match (no Math.random in render).
    return Array.from({ length: count }, (_, i) => {
        const t = (i * 0.6180339887) % 1;
        const u = (i * 0.3819660113 + 0.17) % 1;
        return {
            id: i,
            left: `${(t * 100).toFixed(2)}%`,
            top: `${(u * 100).toFixed(2)}%`,
            size: i % 7 === 0 ? 2.5 : i % 3 === 0 ? 1.75 : 1.25,
            delay: (i % 12) * 0.55,
            duration: 14 + (i % 9) * 1.8,
            drift: ((i % 5) - 2) * 12,
            opacity: 0.22 + (i % 5) * 0.06,
        };
    });
}

/** Soft drifting motes — quiet atmosphere, not a particle party. */
function HeroParticles({ className }: { className?: string }) {
    const [reduced, setReduced] = useState(false);
    const particles = useMemo(() => buildParticles(36), []);

    useEffect(() => {
        const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
        const sync = () => setReduced(mq.matches);
        sync();
        mq.addEventListener('change', sync);
        return () => mq.removeEventListener('change', sync);
    }, []);

    if (reduced) return null;

    return (
        <div
            aria-hidden
            className={cn(
                'pointer-events-none absolute inset-0 overflow-hidden',
                // Quieter in light mode; a touch brighter in dark
                'opacity-50 dark:opacity-80',
                className,
            )}
        >
            {particles.map((p) => (
                <span
                    key={p.id}
                    className="absolute rounded-full bg-primary/70 shadow-[0_0_6px_color-mix(in_oklab,var(--primary)_35%,transparent)] dark:bg-primary-foreground/55 dark:shadow-[0_0_8px_color-mix(in_oklab,white_25%,transparent)] animate-hero-mote"
                    style={{
                        left: p.left,
                        top: p.top,
                        width: p.size,
                        height: p.size,
                        animationDelay: `${p.delay}s`,
                        animationDuration: `${p.duration}s`,
                        ['--mote-drift' as string]: `${p.drift}px`,
                        ['--mote-opacity' as string]: String(p.opacity),
                    }}
                />
            ))}
        </div>
    );
}
