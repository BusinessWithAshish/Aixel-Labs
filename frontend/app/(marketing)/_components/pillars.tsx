'use client';

import { useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowRight, Bot, Calendar, Headphones, Mail, MapPinned, MessageSquare, Phone, Search, Sparkles, Workflow, Zap } from 'lucide-react';
import Image from 'next/image';
import { BRAND_LOGOS, EASE_OUT_EXPO, LEAD_SOURCES, SECTION_IDS } from '../constants';
import { LandingSection, Reveal, SectionEyebrow } from './primitives';

type Pillar = {
    num: string;
    eyebrow: string;
    title: string;
    body: string;
    points: string[];
};

const PILLARS: Pillar[] = [
    {
        num: '01',
        eyebrow: 'The platform',
        title: 'What the app provides',
        body: 'Self-serve lead generation in one workspace. Scrape Maps, search, and social. Enrich and score contacts. Route them into outreach without stitching five tools together.',
        points: [
            'Google Maps, Advanced Search, Instagram, Facebook, LinkedIn scrapers',
            'Email and phone enrichment with success-based credits',
            'AI scoring, lists, and routing into SMS, WhatsApp, and dialer',
        ],
    },
    {
        num: '02',
        eyebrow: 'The agency',
        title: 'What the agency provides',
        body: 'Our automation consultancy maps the busywork, designs the stack, and ships the flows with you. Free audit first. Then voice AI, custom workflows, and ongoing support.',
        points: [
            'Free 30-minute audit of lead gen, voice, support, and ops',
            'Voice AI, CRM wiring, and custom workflow builds',
            'Done-with-you delivery plus ongoing support from Pune, 24x7',
        ],
    },
    {
        num: '03',
        eyebrow: 'Better together',
        title: 'What we ship when you use both',
        body: 'Run scrapers on the platform while the agency wires scoring, outreach, and voice around your CRM. You keep the upside. We keep the pipeline moving.',
        points: [
            'Platform scrapes and enriches. Agency automates the handoff.',
            'One motion from first lead to booked call or dialer queue',
            'Your team stays in control of credits, lists, and messaging',
        ],
    },
];

export function Pillars() {
    const [active, setActive] = useState(0);

    return (
        <LandingSection id={SECTION_IDS.why}>
            <Reveal className="mx-auto max-w-2xl text-center">
                <SectionEyebrow>Why Aixel Labs</SectionEyebrow>
                <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
                    Platform, agency, or both.
                </h2>
                <p className="mt-4 text-pretty text-muted-foreground">
                    Most lead tools stop at a CSV. Aixel Labs is a lead-gen app and an automation agency. Use one, or
                    combine them when you want the full motion built out.
                </p>
            </Reveal>

            <Reveal delay={0.1} className="mt-12 grid gap-8 lg:grid-cols-12 lg:gap-12">
                <div className="lg:col-span-5">
                    <ul className="flex flex-col">
                        {PILLARS.map((p, i) => (
                            <PillarRow
                                key={p.num}
                                pillar={p}
                                active={active === i}
                                onHover={() => setActive(i)}
                                onTap={() => setActive(i)}
                            />
                        ))}
                    </ul>
                </div>

                <div className="lg:col-span-7">
                    <div className="lg:sticky lg:top-24">
                        <div className="relative aspect-4/3 overflow-hidden rounded-2xl border border-border bg-muted/20">
                            <div
                                aria-hidden
                                className="pointer-events-none absolute inset-0 opacity-70 [background:radial-gradient(circle_at_30%_20%,color-mix(in_oklch,var(--primary)_10%,transparent),transparent_55%),radial-gradient(circle_at_80%_80%,color-mix(in_oklch,var(--primary)_8%,transparent),transparent_55%)]"
                            />
                            <AnimatePresence mode="wait">
                                <motion.div
                                    key={active}
                                    initial={{ opacity: 0, scale: 0.96, filter: 'blur(10px)' }}
                                    animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
                                    exit={{ opacity: 0, scale: 0.96, filter: 'blur(10px)' }}
                                    transition={{ duration: 0.45, ease: EASE_OUT_EXPO }}
                                    className="absolute inset-0 pb-10"
                                >
                                    {active === 0 ? (
                                        <AppVisual />
                                    ) : active === 1 ? (
                                        <AgencyVisual />
                                    ) : (
                                        <TogetherVisual />
                                    )}
                                </motion.div>
                            </AnimatePresence>
                            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 border-t border-border/50 bg-muted/40 px-4 py-2.5 backdrop-blur-[2px]">
                                <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                                    <span className="text-primary">{PILLARS[active].num}</span>
                                    <span className="text-foreground/30">/</span>
                                    <span>{PILLARS[active].eyebrow}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </Reveal>
        </LandingSection>
    );
}

function PillarRow({
    pillar,
    active,
    onHover,
    onTap,
}: {
    pillar: Pillar;
    active: boolean;
    onHover: () => void;
    onTap: () => void;
}) {
    const ref = useRef<HTMLLIElement>(null);

    const onMouseMove = (e: React.MouseEvent) => {
        const el = ref.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        el.style.setProperty('--mx', `${e.clientX - rect.left}px`);
        el.style.setProperty('--my', `${e.clientY - rect.top}px`);
    };

    return (
        <li
            ref={ref}
            onMouseEnter={onHover}
            onMouseMove={onMouseMove}
            onClick={onTap}
            className="group relative cursor-pointer border-b border-border/60 last:border-b-0"
        >
            <div
                aria-hidden
                className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                style={{
                    background:
                        'radial-gradient(260px circle at var(--mx) var(--my), color-mix(in oklch, var(--primary) 12%, transparent), transparent 60%)',
                }}
            />
            <motion.span
                aria-hidden
                initial={false}
                animate={{ height: active ? '64%' : '0%', opacity: active ? 1 : 0 }}
                transition={{ duration: 0.35, ease: EASE_OUT_EXPO }}
                className="absolute left-0 top-1/2 w-0.5 -translate-y-1/2 rounded-full bg-primary"
            />
            <div className="relative flex items-start gap-4 px-4 py-6 sm:px-6">
                <span
                    className={`mt-1 text-xs font-medium tabular-nums transition-colors ${
                        active ? 'text-primary' : 'text-muted-foreground/60'
                    }`}
                >
                    {pillar.num}
                </span>
                <div className="min-w-0 flex-1">
                    <p
                        className={`text-[11px] font-medium uppercase tracking-wider transition-colors ${
                            active ? 'text-primary' : 'text-muted-foreground'
                        }`}
                    >
                        {pillar.eyebrow}
                    </p>
                    <h3
                        className={`mt-1.5 text-lg font-semibold tracking-tight transition-colors sm:text-xl ${
                            active ? 'text-foreground' : 'text-foreground/70'
                        }`}
                    >
                        {pillar.title}
                    </h3>
                    <motion.div
                        initial={false}
                        animate={{ height: active ? 'auto' : 0, opacity: active ? 1 : 0 }}
                        transition={{ duration: 0.35, ease: EASE_OUT_EXPO }}
                        className="overflow-hidden"
                    >
                        <p className="pt-2.5 text-sm leading-relaxed text-muted-foreground">{pillar.body}</p>
                        <ul className="mt-3 space-y-2">
                            {pillar.points.map((point) => (
                                <li key={point} className="flex items-start gap-2 text-sm text-foreground/80">
                                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
                                    <span>{point}</span>
                                </li>
                            ))}
                        </ul>
                    </motion.div>
                </div>
                <motion.span
                    initial={false}
                    animate={{ opacity: active ? 1 : 0, x: active ? 0 : -6 }}
                    transition={{ duration: 0.3 }}
                    aria-hidden
                    className="mt-2 text-primary"
                >
                    <ArrowRight className="size-4" />
                </motion.span>
            </div>
        </li>
    );
}

/* --- Pillar diagram visuals --- */

const APP_SOURCES = LEAD_SOURCES.map((s) => ({ src: s.src, label: s.short }));

const APP_ACTIONS = [
    { icon: Search, label: 'Search' },
    { icon: Sparkles, label: 'Enrich' },
    { icon: Zap, label: 'Score' },
    { icon: MessageSquare, label: 'Outreach' },
] as const;

const AGENCY_SERVICES = [
    { icon: Calendar, label: 'Free audit', detail: '30 min map' },
    { icon: Bot, label: 'Voice AI', detail: 'Inbound + outbound' },
    { icon: Workflow, label: 'Workflows', detail: 'Custom builds' },
    { icon: Headphones, label: 'Support', detail: '24x7 coverage' },
] as const;

export function AppVisual() {
    const outcomes = [
        { icon: Mail, label: 'Verified contacts' },
        { icon: Phone, label: 'Dialer ready' },
        { icon: Zap, label: 'Credits on success' },
    ] as const;

    return (
        <div className="flex h-full flex-col gap-4 p-5 sm:gap-5 sm:p-7" role="img" aria-label="App capabilities diagram">
            <div>
                <p className="text-[11px] font-medium uppercase tracking-wider text-primary">Inside the app</p>
                <p className="mt-1 text-sm font-semibold text-foreground">Scrape → enrich → score → outreach</p>
            </div>

            <div className="grid grid-cols-4 gap-2 sm:gap-3">
                {APP_SOURCES.map((s, i) => (
                    <motion.div
                        key={s.label}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.05 * i, duration: 0.35 }}
                        className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-card p-3 shadow-sm"
                    >
                        <Image src={s.src} alt="" width={28} height={28} className="size-7" />
                        <span className="text-[10px] font-medium text-muted-foreground sm:text-[11px]">{s.label}</span>
                    </motion.div>
                ))}
            </div>

            <div className="relative flex items-center justify-center py-1">
                <div className="h-px w-full bg-border" />
                <span className="absolute inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-primary">
                    <MapPinned className="size-3" />
                    Lead workspace
                </span>
            </div>

            <div className="grid grid-cols-4 gap-2 sm:gap-3">
                {APP_ACTIONS.map((a, i) => (
                    <motion.div
                        key={a.label}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 + 0.05 * i, duration: 0.35 }}
                        className="flex flex-col items-center gap-2 rounded-2xl border border-primary/20 bg-primary/5 p-3"
                    >
                        <span className="grid size-8 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm shadow-primary/25">
                            <a.icon className="size-4" />
                        </span>
                        <span className="text-[10px] font-medium text-foreground/80 sm:text-[11px]">{a.label}</span>
                    </motion.div>
                ))}
            </div>

            <div className="mt-auto grid grid-cols-3 divide-x divide-border overflow-hidden rounded-xl border border-border bg-card">
                {outcomes.map((item) => (
                    <div
                        key={item.label}
                        className="flex flex-col items-center gap-1.5 px-2 py-3 text-center sm:flex-row sm:justify-center sm:gap-2 sm:px-3 sm:py-3.5 sm:text-left"
                    >
                        <item.icon className="size-3.5 shrink-0 text-primary" />
                        <span className="text-[10px] font-medium leading-tight text-foreground/80 sm:text-[11px]">
                            {item.label}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}

export function AgencyVisual() {
    return (
        <div
            className="flex h-full flex-col justify-between gap-4 p-5 pb-2 sm:p-7 sm:pb-2"
            role="img"
            aria-label="Agency services diagram"
        >
            <div>
                <p className="text-[11px] font-medium uppercase tracking-wider text-primary">Automation agency</p>
                <p className="mt-1 text-sm font-semibold text-foreground">We design and ship the automations</p>
            </div>

            <div className="relative flex flex-1 items-center justify-center">
                <div
                    aria-hidden
                    className="absolute size-40 rounded-full border border-dashed border-primary/30 sm:size-48 animate-spin-slow"
                />
                <div aria-hidden className="absolute size-28 rounded-full bg-primary/10 blur-2xl sm:size-32" />
                <div className="relative z-10 flex size-24 flex-col items-center justify-center rounded-full border border-primary/30 bg-card shadow-lg shadow-primary/10 sm:size-28">
                    <Sparkles className="size-5 text-primary" />
                    <span className="mt-1 text-[11px] font-semibold text-foreground">Agency</span>
                    <span className="text-[10px] text-muted-foreground">done-with-you</span>
                </div>

                {AGENCY_SERVICES.map((s, i) => {
                    const positions = [
                        'left-2 top-2 sm:left-4 sm:top-3',
                        'right-2 top-2 sm:right-4 sm:top-3',
                        'bottom-2 left-2 sm:bottom-3 sm:left-4',
                        'bottom-2 right-2 sm:bottom-3 sm:right-4',
                    ];
                    return (
                        <motion.div
                            key={s.label}
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: 0.1 * i, duration: 0.35 }}
                            className={`absolute ${positions[i]} flex items-center gap-2 rounded-2xl border border-border bg-card px-2.5 py-2 shadow-sm`}
                        >
                            <span className="grid size-8 place-items-center rounded-xl bg-primary/10 text-primary">
                                <s.icon className="size-4" />
                            </span>
                            <span className="pr-1">
                                <span className="block text-[11px] font-semibold text-foreground">{s.label}</span>
                                <span className="block text-[10px] text-muted-foreground">{s.detail}</span>
                            </span>
                        </motion.div>
                    );
                })}
            </div>

            <div className="grid grid-cols-3 gap-2 text-center">
                {['Lead pipelines', 'Voice agents', 'CRM wiring'].map((label, i) => (
                    <motion.div
                        key={label}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.25 + i * 0.05 }}
                        className="rounded-xl border border-primary/15 bg-primary/5 px-2 py-2 text-[10px] font-medium text-foreground/80 sm:text-[11px]"
                    >
                        {label}
                    </motion.div>
                ))}
            </div>
        </div>
    );
}

export function TogetherVisual() {
    return (
        <div
            className="flex h-full flex-col justify-between gap-4 p-5 pb-2 sm:p-7 sm:pb-2"
            role="img"
            aria-label="Platform and agency combined diagram"
        >
            <div>
                <p className="text-[11px] font-medium uppercase tracking-wider text-primary">Combined motion</p>
                <p className="mt-1 text-sm font-semibold text-foreground">
                    App runs the scrapers. Agency wires the rest.
                </p>
            </div>

            <div className="grid flex-1 grid-cols-[1fr_auto_1fr] items-center gap-2 sm:gap-3">
                <div className="space-y-2 rounded-2xl border border-border bg-card p-3 shadow-sm">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-primary">Platform</p>
                    <div className="flex items-center gap-2 rounded-xl bg-muted/40 px-2 py-1.5">
                        <Image src={BRAND_LOGOS.googleMaps} alt="" width={16} height={16} className="size-4" />
                        <span className="text-[11px] font-medium text-foreground/85">Scrape sources</span>
                    </div>
                    <div className="flex items-center gap-2 rounded-xl bg-muted/40 px-2 py-1.5">
                        <Sparkles className="size-4 text-primary" />
                        <span className="text-[11px] font-medium text-foreground/85">Enrich + score</span>
                    </div>
                    <div className="flex items-center gap-2 rounded-xl bg-muted/40 px-2 py-1.5">
                        <MessageSquare className="size-4 text-primary" />
                        <span className="text-[11px] font-medium text-foreground/85">Lists + outreach</span>
                    </div>
                </div>

                <div className="flex flex-col items-center gap-2">
                    <motion.div
                        animate={{ x: [0, 4, 0] }}
                        transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
                        className="grid size-9 place-items-center rounded-full bg-primary text-primary-foreground shadow-md shadow-primary/30"
                    >
                        <ArrowRight className="size-4" />
                    </motion.div>
                    <span className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">merge</span>
                </div>

                <div className="space-y-2 rounded-2xl border border-border bg-card p-3 shadow-sm">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-primary">Agency</p>
                    {[
                        { icon: Workflow, label: 'Custom workflows' },
                        { icon: Bot, label: 'Voice AI' },
                        { icon: Headphones, label: 'CRM + support' },
                    ].map((row) => (
                        <div key={row.label} className="flex items-center gap-2 rounded-xl bg-muted/40 px-2 py-1.5">
                            <row.icon className="size-4 text-primary" />
                            <span className="text-[11px] font-medium text-foreground/85">{row.label}</span>
                        </div>
                    ))}
                </div>
            </div>

            <div className="rounded-2xl border border-primary/25 bg-primary/5 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-primary">You get</p>
                <div className="mt-2 grid grid-cols-3 gap-2">
                    {['Booked meetings', 'Live pipeline', 'Owned stack'].map((label) => (
                        <div
                            key={label}
                            className="rounded-xl border border-border bg-card px-2 py-2 text-center text-[10px] font-semibold text-foreground sm:text-[11px]"
                        >
                            {label}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
