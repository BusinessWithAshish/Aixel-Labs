'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { motion, useReducedMotion } from 'motion/react';
import { ArrowRight, Play, Terminal } from 'lucide-react';
import { BRAND_LOGOS, EASE_OUT_EXPO } from '../constants';
import { Reveal } from './primitives';
import { LandingSection, SectionEyebrow } from './primitives';

type UseCase = {
    title: string;
    tag: string;
    logo: string;
};

const USE_CASES: UseCase[] = [
    { title: 'Find 500 local plumbers from Google Maps', tag: 'Maps', logo: BRAND_LOGOS.googleMaps },
    { title: 'Scrape LinkedIn for SaaS founders in the US', tag: 'LinkedIn', logo: BRAND_LOGOS.linkedin },
    { title: 'Build a lead list from Instagram hashtags', tag: 'Instagram', logo: BRAND_LOGOS.instagram },
    { title: 'Discover dental clinics on Facebook Pages', tag: 'Facebook', logo: BRAND_LOGOS.facebook },
    { title: 'Pull local gyms across California cities', tag: 'Maps', logo: BRAND_LOGOS.googleMaps },
    { title: 'Find B2B software companies by industry', tag: 'LinkedIn', logo: BRAND_LOGOS.linkedin },
];

const TITLES = USE_CASES.map((u) => u.title);

export function UseCases() {
    const { text, activeIndex, select } = useTypewriter(TITLES);

    return (
        <LandingSection
            overflow
            atmosphere={
                <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
                    <div className="absolute -top-20 right-1/4 size-72 rounded-full bg-primary/8 blur-3xl animate-aurora-drift" />
                    <div
                        className="absolute bottom-0 left-1/4 size-80 rounded-full bg-primary/8 blur-3xl animate-aurora-drift"
                        style={{ animationDelay: '-7s' }}
                    />
                </div>
            }
        >
            <Reveal className="flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-end">
                <div className="max-w-2xl">
                    <SectionEyebrow>Start here</SectionEyebrow>
                    <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
                        Pick a play. Run it in minutes.
                    </h2>
                </div>
                <p className="max-w-sm text-sm text-muted-foreground">
                    Each play opens a ready scraper with sample filters. Credits debit only after a successful run.
                </p>
            </Reveal>

            <PromptBar text={text} />

            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {USE_CASES.map((u, i) => (
                    <PlayCard
                        key={u.title}
                        useCase={u}
                        active={i === activeIndex}
                        index={i}
                        onSelect={() => select(i)}
                    />
                ))}
            </div>
        </LandingSection>
    );
}

function PromptBar({ text }: { text: string }) {
    return (
        <Reveal delay={0.05} className="mt-10">
            <div className="group relative rounded-2xl bg-linear-to-r from-primary/30 via-primary/10 to-primary/30 p-px">
                <div className="relative flex items-center gap-3 rounded-[15px] border border-border bg-card/80 px-4 py-3 backdrop-blur-sm sm:px-5 sm:py-4">
                    <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                        <Terminal className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground sm:text-base">
                            <span className="text-muted-foreground">{text}</span>
                            <span
                                className="ml-0.5 inline-block h-[1.05em] w-0.5 -translate-y-[0.05em] bg-primary align-middle animate-caret-blink"
                                aria-hidden
                            />
                        </p>
                    </div>
                    <button
                        type="button"
                        disabled
                        aria-disabled="true"
                        className="relative inline-flex shrink-0 cursor-default items-center gap-2 overflow-hidden rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm shadow-primary/30 opacity-90"
                    >
                        <Play className="size-4" />
                        <span className="relative">Run</span>
                    </button>
                </div>
            </div>
        </Reveal>
    );
}

function PlayCard({
    useCase,
    active,
    index,
    onSelect,
}: {
    useCase: UseCase;
    active: boolean;
    index: number;
    onSelect: () => void;
}) {
    const ref = useRef<HTMLButtonElement>(null);
    const reduce = useReducedMotion();

    function onMove(e: React.MouseEvent<HTMLButtonElement>) {
        if (reduce || !ref.current) return;
        const r = ref.current.getBoundingClientRect();
        ref.current.style.setProperty('--mx', `${e.clientX - r.left}px`);
        ref.current.style.setProperty('--my', `${e.clientY - r.top}px`);
    }

    return (
        <motion.button
            type="button"
            ref={ref}
            onClick={onSelect}
            onMouseMove={onMove}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.65, delay: index * 0.07, ease: EASE_OUT_EXPO }}
            whileHover={{ y: -4 }}
            className={`group relative flex h-full w-full cursor-pointer items-center justify-between gap-4 overflow-hidden rounded-2xl border bg-card p-5 text-left transition-colors ${
                active ? 'border-primary/60 ring-1 ring-primary/30' : 'border-border hover:border-primary/40'
            }`}
        >
            <div
                aria-hidden
                className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                style={{
                    background:
                        'radial-gradient(220px circle at var(--mx) var(--my), color-mix(in oklab, var(--primary) 14%, transparent), transparent 70%)',
                }}
            />
            {active && (
                <span
                    aria-hidden
                    className="pointer-events-none absolute -right-3 -top-3 size-3 rounded-full bg-primary animate-pulse-ring"
                />
            )}
            <div className="relative flex min-w-0 items-center gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-border bg-muted/20 transition-transform duration-300 group-hover:scale-110">
                    <Image src={useCase.logo} alt="" width={18} height={18} className="size-4.5" />
                </span>
                <div className="min-w-0">
                    <span
                        className={`inline-flex rounded-md px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider transition-colors ${
                            active ? 'bg-primary text-primary-foreground' : 'bg-primary/10 text-primary'
                        }`}
                    >
                        {useCase.tag}
                    </span>
                    <p className="mt-1.5 text-sm font-medium text-foreground">{useCase.title}</p>
                </div>
            </div>
            <ArrowRight className="relative size-4 shrink-0 text-muted-foreground transition-all group-hover:translate-x-0.5 group-hover:text-primary" />
        </motion.button>
    );
}

function useTypewriter(texts: string[], typeSpeed = 42, holdMs = 2200, deleteSpeed = 22) {
    const [i, setI] = useState(0);
    const [n, setN] = useState(0);
    const [deleting, setDeleting] = useState(false);
    const pausedUntil = useRef(0);

    const select = useCallback(
        (index: number) => {
            const next = (index + texts.length) % texts.length;
            setI(next);
            setN(texts[next]?.length ?? 0);
            setDeleting(false);
            // Hold on the selected play before auto-cycle continues
            pausedUntil.current = Date.now() + holdMs * 2;
        },
        [texts, holdMs],
    );

    useEffect(() => {
        const full = texts[i] ?? '';
        let t: ReturnType<typeof setTimeout>;

        if (Date.now() < pausedUntil.current) {
            t = setTimeout(() => setDeleting(true), Math.max(0, pausedUntil.current - Date.now()));
            return () => clearTimeout(t);
        }

        if (!deleting && n < full.length) {
            t = setTimeout(() => setN(n + 1), typeSpeed);
        } else if (!deleting && n === full.length) {
            t = setTimeout(() => setDeleting(true), holdMs);
        } else if (deleting && n > 0) {
            t = setTimeout(() => setN(n - 1), deleteSpeed);
        } else {
            setDeleting(false);
            setI((prev) => (prev + 1) % texts.length);
        }
        return () => clearTimeout(t);
    }, [i, n, deleting, texts, typeSpeed, holdMs, deleteSpeed]);

    return { text: (texts[i] ?? '').slice(0, n), activeIndex: i, select };
}
