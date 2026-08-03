'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ArrowLeft, ArrowRight, Quote, Sparkles } from 'lucide-react';
import { EASE_OUT_EXPO, SECTION_IDS } from '../constants';
import { Reveal } from './primitives';
import { LandingSection, SectionEyebrow } from './primitives';

type Testimonial = {
    quote: string;
    author: string;
    role: string;
    company: string;
    face: string;
    accent: string; // tailwind gradient stops for the spotlight aurora + avatar ring
};

const TESTIMONIALS: Testimonial[] = [
    {
        quote:
            'We replaced three tools with Aixel Labs. The Maps scraper plus enrichment plus dialer combo closed the loop in a single afternoon.',
        author: 'Priya Nair',
        role: 'Head of Growth',
        company: 'Outreachly',
        face: '/testimonials/face-1.jpg',
        accent: 'from-violet-400/40 to-fuchsia-400/30',
    },
    {
        quote:
            'Their consultancy built our outbound motion in two weeks. We went from zero outbound to 40 booked meetings a week.',
        author: 'Marcus Chung',
        role: 'SDR Lead',
        company: 'Cyera',
        face: '/testimonials/face-2.jpg',
        accent: 'from-sky-400/40 to-cyan-400/30',
    },
    {
        quote:
            'We run Maps and LinkedIn scrapers for every client engagement. Credits stay predictable, and lists land ready for outreach the same day.',
        author: 'Sofia Ramirez',
        role: 'Founder',
        company: 'LeadHaus Agency',
        face: '/testimonials/face-3.jpg',
        accent: 'from-amber-400/40 to-orange-400/30',
    },
    {
        quote:
            'Credits debited only on successful scrape is the fairest pricing model in lead-gen. No more paying for empty results.',
        author: 'David Park',
        role: 'RevOps',
        company: 'Northwind',
        face: '/testimonials/face-4.jpg',
        accent: 'from-emerald-400/40 to-teal-400/30',
    },
    {
        quote:
            'We wired Aixel into our CRM in an afternoon. Leads now flow from scrape to dialer without a single Zapier step.',
        author: 'Aisha Khan',
        role: 'Ops Lead',
        company: 'Brightline',
        face: '/testimonials/face-5.jpg',
        accent: 'from-rose-400/40 to-pink-400/30',
    },
    {
        quote:
            'The consultancy team rebuilt our routing rules and lifted our reply rate by 38 percent in the first month.',
        author: 'Tom Becker',
        role: 'VP Sales',
        company: 'Northstar',
        face: '/testimonials/face-6.jpg',
        accent: 'from-indigo-400/40 to-blue-400/30',
    },
];

const ROTATION_MS = 7000;

export function Testimonials() {
    return (
        <LandingSection id={SECTION_IDS.customers} tone="muted" overflow>
            <Reveal className="mx-auto max-w-2xl text-center">
                <SectionEyebrow>Customers</SectionEyebrow>
                <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
                    Growth teams who stopped renting tools and started shipping pipeline.
                </h2>
            </Reveal>

            <Reveal delay={0.08} className="mt-12">
                <Spotlight />
            </Reveal>

            <Reveal delay={0.16} className="mt-16 sm:mt-20">
                <MoreVoices />
            </Reveal>

            <Reveal delay={0.2} className="mt-12 text-center text-sm text-muted-foreground">
                Join <span className="font-semibold text-foreground">1,200+ growth teams</span> generating leads on Aixel
                Labs.
            </Reveal>
        </LandingSection>
    );
}

function Spotlight() {
    const [active, setActive] = useState(0);
    const [paused, setPaused] = useState(false);
    const [dir, setDir] = useState<1 | -1>(1);
    const reduce = useReducedMotion();
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const go = useCallback((next: number, direction: 1 | -1) => {
        setDir(direction);
        setActive((i) => (next + TESTIMONIALS.length) % TESTIMONIALS.length);
    }, []);

    const advance = useCallback((direction: 1 | -1 = 1) => {
        go(active + direction, direction);
    }, [active, go]);

    useEffect(() => {
        if (paused) return;
        timer.current = setTimeout(() => advance(1), ROTATION_MS);
        return () => {
            if (timer.current) clearTimeout(timer.current);
        };
    }, [active, paused, advance]);

    const t = TESTIMONIALS[active];
    const words = useMemo(() => t.quote.split(' '), [t.quote]);

    return (
        <div
            className="relative"
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
        >
            {/* Cinematic primary panel */}
            <div className="relative overflow-hidden rounded-4xl border border-primary/30 bg-linear-to-br from-primary via-primary to-primary/80 px-6 py-14 text-primary-foreground shadow-2xl shadow-primary/30 sm:px-14 sm:py-20">
                {/* Animated aurora that shifts per testimonial */}
                <AnimatePresence>
                    <motion.div
                        key={`aura-${active}`}
                        aria-hidden
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 1.1, ease: 'easeInOut' }}
                        className={`pointer-events-none absolute inset-0 bg-linear-to-br ${t.accent}`}
                    />
                </AnimatePresence>
                <div
                    aria-hidden
                    className="pointer-events-none absolute -top-1/3 left-1/2 size-144 -translate-x-1/2 rounded-full bg-white/10 blur-3xl animate-aurora-drift"
                />
                <div
                    aria-hidden
                    className="pointer-events-none absolute inset-0 opacity-[0.06]"
                    style={{
                        backgroundImage: 'radial-gradient(currentColor 1px, transparent 1px)',
                        backgroundSize: '28px 28px',
                        color: 'white',
                    }}
                />

                <div className="relative">
                    {/* Top row: index + controls */}
                    <div className="flex items-center justify-between">
                        <AnimatePresence mode="wait">
                            <motion.div
                                key={`idx-${active}`}
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -8 }}
                                transition={{ duration: 0.4 }}
                                className="flex items-baseline gap-1 font-mono text-sm text-primary-foreground/70"
                            >
                                <span className="text-2xl font-semibold text-primary-foreground">
                                    {String(active + 1).padStart(2, '0')}
                                </span>
                </motion.div>
                        </AnimatePresence>
                        <div className="flex items-center gap-2">
                            <span className="hidden font-mono text-xs text-primary-foreground/60 sm:inline">
                                {String(active + 1).padStart(2, '0')} / {String(TESTIMONIALS.length).padStart(2, '0')}
                            </span>
                            <CircleButton label="Previous" onClick={() => advance(-1)}>
                                <ArrowLeft className="size-4" />
                            </CircleButton>
                            <CircleButton label="Next" onClick={() => advance(1)}>
                                <ArrowRight className="size-4" />
                            </CircleButton>
                        </div>
                    </div>

                    {/* Quote */}
                    <div className="relative mt-8 min-h-40 sm:min-h-44">
                        <Quote className="pointer-events-none absolute -top-8 left-0 size-8 text-primary-foreground/20 sm:-top-10 sm:size-12" aria-hidden />
                        <AnimatePresence mode="wait" custom={dir}>
                            <motion.blockquote
                                key={`q-${active}`}
                                custom={dir}
                                initial="enter"
                                animate="show"
                                exit="exit"
                                variants={{
                                    enter: (d: number) => ({ opacity: 0, x: d * 40 }),
                                    show: { opacity: 1, x: 0, transition: { staggerChildren: reduce ? 0 : 0.022 } },
                                    exit: (d: number) => ({ opacity: 0, x: d * -40, transition: { duration: 0.3 } }),
                                }}
                                className="text-pretty pl-10 text-2xl font-medium leading-snug tracking-tight sm:pl-16 sm:text-3xl md:text-[2.1rem]"
                            >
                                {words.map((w, i) => (
                                    <motion.span
                                        key={`${active}-${i}`}
                                        variants={{
                                            enter: { opacity: 0, y: 14, filter: 'blur(6px)' },
                                            show: { opacity: 1, y: 0, filter: 'blur(0px)' },
                                            exit: { opacity: 0, y: -6, filter: 'blur(6px)' },
                                        }}
                                        transition={{ duration: 0.42, ease: EASE_OUT_EXPO }}
                                        className="inline-block"
                                    >
                                        {w}&nbsp;
                                    </motion.span>
                                ))}
                            </motion.blockquote>
                        </AnimatePresence>
                    </div>

                    {/* Author + progress */}
                    <div className="mt-10 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
                        <AnimatePresence mode="wait">
                            <motion.figure
                                key={`a-${active}`}
                                initial={{ opacity: 0, y: 16 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -12 }}
                                transition={{ duration: 0.45, ease: EASE_OUT_EXPO, delay: 0.12 }}
                                className="flex items-center gap-4"
                            >
                                <span className="relative grid size-12 place-items-center overflow-hidden rounded-full ring-2 ring-primary-foreground/40 backdrop-blur-sm">
                                    <Image
                                        src={t.face}
                                        alt={t.author}
                                        width={48}
                                        height={48}
                                        className="absolute inset-0 size-full object-cover"
                                    />
                                </span>
                                <figcaption className="text-sm">
                                    <span className="block text-base font-semibold text-primary-foreground">{t.author}</span>
                                    <span className="text-primary-foreground/70">
                                        {t.role} · {t.company}
                                    </span>
                                </figcaption>
                            </motion.figure>
                        </AnimatePresence>

                        {/* Dots */}
                        <div className="flex items-center gap-2">
                            {TESTIMONIALS.map((item, i) => (
                                <button
                                    key={item.author}
                                    type="button"
                                    aria-label={`Show testimonial from ${item.author}`}
                                    onClick={() => go(i, i > active ? 1 : -1)}
                                    className="group relative h-2.5 w-2.5 cursor-pointer rounded-full transition-colors"
                                >
                                    <span
                                        className={`absolute inset-0 rounded-full transition-colors ${
                                            i === active
                                                ? 'bg-primary-foreground'
                                                : 'bg-primary-foreground/30 group-hover:bg-primary-foreground/50'
                                        }`}
                                    />
                                    {i === active && (
                                        <motion.span
                                            layoutId="spotlight-pill"
                                            className="absolute -inset-1 rounded-full ring-1 ring-primary-foreground/50"
                                            transition={{ type: 'spring', stiffness: 320, damping: 26 }}
                                        />
                                    )}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Chunky glowing progress bar */}
                <div className="absolute inset-x-6 bottom-3 h-1 overflow-hidden rounded-full bg-primary-foreground/15 sm:inset-x-14">
                    <motion.div
                        key={`bar-${active}-${paused ? 'p' : 'r'}`}
                        initial={{ width: '0%' }}
                        animate={{ width: paused ? '40%' : '100%' }}
                        transition={{ duration: paused ? 0 : ROTATION_MS / 1000, ease: 'linear' }}
                        className="h-full rounded-full bg-primary-foreground shadow-[0_0_10px_2px_rgba(255,255,255,0.6)]"
                    />
                </div>
            </div>
        </div>
    );
}

function CircleButton({
    children,
    label,
    onClick,
}: {
    children: React.ReactNode;
    label: string;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            aria-label={label}
            onClick={onClick}
            className="grid size-10 place-items-center rounded-full border border-primary-foreground/25 bg-primary-foreground/10 text-primary-foreground backdrop-blur-sm transition-all hover:scale-105 hover:bg-primary-foreground/20 active:scale-95"
        >
            {children}
        </button>
    );
}

function MoreVoices() {
    // Single refined marquee of short quote snippets — clearly a secondary "more voices" strip.
    const items = TESTIMONIALS;
    const doubled = [...items, ...items];
    return (
        <div>
            <div className="mb-5 flex items-center justify-center gap-3">
                <span className="h-px w-8 bg-border" />
                <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
                    <Sparkles className="size-3.5 text-primary" />
                    More voices
                </p>
                <span className="h-px w-8 bg-border" />
            </div>
            <div className="marquee-pause relative overflow-hidden [mask-image:linear-gradient(90deg,transparent,black_8%,black_92%,transparent)]">
                <div className="marquee-track flex w-max items-center gap-8 animate-marquee-x">
                    {doubled.map((t, i) => (
                        <div key={`mv-${t.author}-${i}`} className="flex shrink-0 items-center gap-3 py-1">
                            <span className="relative grid size-8 shrink-0 place-items-center overflow-hidden rounded-full ring-1 ring-primary/20">
                                <Image
                                    src={t.face}
                                    alt={t.author}
                                    width={32}
                                    height={32}
                                    className="absolute inset-0 size-full object-cover"
                                />
                            </span>
                            <p className="max-w-sm text-pretty text-sm italic text-muted-foreground">
                                “{t.quote}”
                                <span className="ml-2 not-italic font-medium text-foreground/80">
                                    {t.author}, {t.company}
                                </span>
                            </p>
                            <span className="size-1 shrink-0 rounded-full bg-border" />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
