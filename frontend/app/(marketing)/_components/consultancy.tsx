'use client';

import { useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
    ArrowRight,
    Bot,
    Calendar,
    Headphones,
    Mail,
    PhoneCall,
    Sparkles,
    Workflow,
} from 'lucide-react';
import { Reveal } from './primitives';
import { BookCallButton } from './booking';
import { LandingSection, SectionEyebrow } from './primitives';
import {
    CONTACT_EMAIL,
    CONTACT_MAILTO,
    EASE_OUT_EXPO,
    SECTION_IDS,
} from '../constants';

type Offering = {
    num: string;
    title: string;
    body: string;
    icon: React.ReactNode;
};

const OFFERINGS: Offering[] = [
    {
        num: '01',
        title: 'Lead generation pipelines',
        body: 'End-to-end automation from discovery and qualification to booked appointments and nurture sequences. Your team only talks to the hottest prospects.',
        icon: <Workflow className="size-4" />,
    },
    {
        num: '02',
        title: 'Inbound and outbound voice AI',
        body: 'Answer every call, route intelligently, and scale outbound to hundreds of leads at once. Hot prospects land with your sales team. The rest stays automated.',
        icon: <PhoneCall className="size-4" />,
    },
    {
        num: '03',
        title: 'Custom AI workflows',
        body: 'Support bots, content engines, document extraction, CRM sync, and analytics dashboards. We design and ship the stack that fits how you already work.',
        icon: <Bot className="size-4" />,
    },
    {
        num: '04',
        title: 'Done-with-you builds',
        body: 'Free audit call, custom solution design, seamless integration, and ongoing support. Typical first automation ships in about two days.',
        icon: <Headphones className="size-4" />,
    },
];

const STATS = [
    { k: '70%', v: 'cost reduction potential' },
    { k: '24/7', v: 'automated operations' },
    { k: '2 days', v: 'typical first build' },
    { k: 'Free', v: 'audit call to start' },
];

export function Consultancy() {
    const [active, setActive] = useState(0);

    return (
        <LandingSection
            id={SECTION_IDS.consultancy}
            tone="muted"
            overflow
            atmosphere={<AmbientBackground />}
        >
            <Reveal className="mx-auto max-w-3xl text-center">
                <SectionEyebrow className="inline-flex items-center gap-2">
                    <Sparkles className="size-3.5" />
                    Book a free audit call
                </SectionEyebrow>
                <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight sm:text-4xl md:text-5xl">
                    We build the automations.{' '}
                    <span className="text-muted-foreground">You keep the upside.</span>
                </h2>
                <p className="mx-auto mt-4 max-w-2xl text-pretty text-muted-foreground">
                    Aixel Labs is also an AI automation agency. We help businesses cut repetitive work, lower labor
                    cost, and run lead gen, voice, support, and ops flows around the clock. Start with a free audit.
                    We map what to automate. Then we build it.
                </p>
            </Reveal>

            <BookingPanel />

            <div className="mt-14 grid gap-8 lg:grid-cols-[1fr_1.15fr] lg:items-start lg:gap-12">
                <Reveal>
                    <SectionEyebrow muted>What we automate</SectionEyebrow>
                    <h3 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
                        From lead pipelines to voice AI and custom workflows.
                    </h3>
                    <p className="mt-3 text-sm text-muted-foreground">
                        Same craft as our platform work. Scoped to your stack, your CRM, and your team.
                    </p>
                    <ul className="mt-6 space-y-2 text-sm text-muted-foreground">
                        {[
                            'Free initial consultation',
                            'Custom solution design',
                            'Seamless integration',
                            'Ongoing support',
                        ].map((item) => (
                            <li key={item} className="flex items-center gap-2">
                                <span className="size-1.5 shrink-0 rounded-full bg-primary" />
                                {item}
                            </li>
                        ))}
                    </ul>
                </Reveal>

                <Reveal delay={0.1}>
                    <div className="overflow-hidden rounded-3xl border border-border/70 bg-card/60 backdrop-blur-sm">
                        {OFFERINGS.map((o, i) => (
                            <OfferingRow
                                key={o.num}
                                offering={o}
                                active={active === i}
                                onHover={() => setActive(i)}
                                onTap={() => setActive(i)}
                            />
                        ))}
                    </div>
                </Reveal>
            </div>

            <Reveal delay={0.15} className="mt-14">
                <motion.dl
                    initial="hidden"
                    whileInView="show"
                    viewport={{ once: true, margin: '-60px' }}
                    variants={{
                        hidden: {},
                        show: { transition: { staggerChildren: 0.08 } },
                    }}
                    className="grid grid-cols-2 gap-4 rounded-3xl border border-border/70 bg-card/50 p-5 sm:grid-cols-4 sm:p-6"
                >
                    {STATS.map((s) => (
                        <motion.div
                            key={s.v}
                            variants={{
                                hidden: { opacity: 0, y: 12 },
                                show: { opacity: 1, y: 0 },
                            }}
                            transition={{ duration: 0.45, ease: EASE_OUT_EXPO }}
                            className="text-center sm:text-left"
                        >
                            <dt className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                                {s.k}
                            </dt>
                            <dd className="mt-1 text-xs text-muted-foreground">{s.v}</dd>
                        </motion.div>
                    ))}
                </motion.dl>
            </Reveal>
        </LandingSection>
    );
}

function AmbientBackground() {
    return (
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
            <div className="absolute -top-24 left-1/3 size-80 rounded-full bg-primary/10 blur-3xl animate-aurora-drift" />
            <div
                className="absolute bottom-0 right-1/4 size-72 rounded-full bg-primary/8 blur-3xl animate-aurora-drift"
                style={{ animationDelay: '-5s' }}
            />
        </div>
    );
}

function BookingPanel() {
    return (
        <Reveal delay={0.08} className="mt-10">
            <div className="relative overflow-hidden rounded-4xl border border-primary/30 bg-linear-to-br from-primary via-primary to-primary/80 px-6 py-10 text-primary-foreground shadow-2xl shadow-primary/25 sm:px-12 sm:py-12">
                <div
                    aria-hidden
                    className="pointer-events-none absolute -right-16 -top-20 size-72 rounded-full bg-white/15 blur-3xl animate-aurora-drift"
                />
                <div
                    aria-hidden
                    className="pointer-events-none absolute -bottom-24 left-1/4 size-64 rounded-full bg-fuchsia-400/20 blur-3xl animate-aurora-drift"
                    style={{ animationDelay: '-7s' }}
                />
                <div
                    aria-hidden
                    className="pointer-events-none absolute inset-0 opacity-[0.07]"
                    style={{
                        backgroundImage: 'radial-gradient(currentColor 1px, transparent 1px)',
                        backgroundSize: '24px 24px',
                        color: 'white',
                    }}
                />

                <div className="relative flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
                    <div className="max-w-xl">
                        <p className="text-xs font-medium uppercase tracking-[0.2em] text-primary-foreground/70">
                            Free audit · 30 minutes
                        </p>
                        <h3 className="mt-2 text-balance text-2xl font-semibold tracking-tight sm:text-3xl">
                            Tell us where the busywork is. We show you what to automate first.
                        </h3>
                        <p className="mt-3 text-sm text-primary-foreground/75">
                            No pitch deck marathon. A clear map of lead gen, voice, support, and ops automations you can
                            ship in weeks, not quarters.
                        </p>
                    </div>

                    <div className="flex w-full flex-col gap-3 sm:w-auto sm:min-w-60">
                        <BookCallButton className="group relative inline-flex h-12 items-center justify-center gap-2 overflow-hidden rounded-xl bg-primary-foreground px-6 text-sm font-semibold text-primary shadow-lg transition-transform hover:scale-[1.03] active:scale-95">
                            <span
                                aria-hidden
                                className="pointer-events-none absolute inset-0 -translate-x-full bg-linear-to-r from-transparent via-primary/15 to-transparent group-hover:animate-shimmer"
                            />
                            <Calendar className="relative size-4" />
                            <span className="relative">Book a free audit call</span>
                            <ArrowRight className="relative size-4 transition-transform group-hover:translate-x-0.5" />
                        </BookCallButton>
                        <a
                            href={CONTACT_MAILTO}
                            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-primary-foreground/25 bg-primary-foreground/10 px-5 text-sm font-medium text-primary-foreground backdrop-blur-sm transition-colors hover:bg-primary-foreground/20"
                        >
                            <Mail className="size-4" />
                            {CONTACT_EMAIL}
                        </a>
                        <p className="text-center text-[11px] text-primary-foreground/60">
                            Pune, India · Available 24x7
                        </p>
                    </div>
                </div>
            </div>
        </Reveal>
    );
}

function OfferingRow({
    offering,
    active,
    onHover,
    onTap,
}: {
    offering: Offering;
    active: boolean;
    onHover: () => void;
    onTap: () => void;
}) {
    const ref = useRef<HTMLLIElement>(null);
    const reduce = useReducedMotion();

    function onMouseMove(e: React.MouseEvent<HTMLLIElement>) {
        if (reduce || !ref.current) return;
        const r = ref.current.getBoundingClientRect();
        ref.current.style.setProperty('--mx', `${e.clientX - r.left}px`);
        ref.current.style.setProperty('--my', `${e.clientY - r.top}px`);
    }

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
                className={`pointer-events-none absolute inset-0 transition-opacity duration-300 ${
                    active ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                }`}
                style={{
                    background:
                        'radial-gradient(280px circle at var(--mx) var(--my), color-mix(in oklab, var(--primary) 12%, transparent), transparent 70%)',
                }}
            />
            <motion.span
                aria-hidden
                animate={{ height: active ? '64%' : '0%' }}
                transition={{ type: 'spring', stiffness: 280, damping: 28 }}
                className="absolute left-0 top-1/2 w-0.5 -translate-y-1/2 rounded-full bg-primary"
            />

            <div className="relative flex items-start gap-4 px-4 py-5 sm:px-6">
                <span
                    className={`mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl transition-colors ${
                        active ? 'bg-primary text-primary-foreground' : 'bg-primary/10 text-primary'
                    }`}
                >
                    {offering.icon}
                </span>
                <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-3">
                        <span
                            className={`text-[11px] font-medium tabular-nums transition-colors ${
                                active ? 'text-primary' : 'text-muted-foreground/60'
                            }`}
                        >
                            {offering.num}
                        </span>
                        <h4
                            className={`text-base font-semibold tracking-tight transition-colors sm:text-lg ${
                                active ? 'text-foreground' : 'text-foreground/75'
                            }`}
                        >
                            {offering.title}
                        </h4>
                    </div>
                    <AnimatePresence initial={false}>
                        {active && (
                            <motion.p
                                key="body"
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.35, ease: EASE_OUT_EXPO }}
                                className="overflow-hidden text-sm leading-relaxed text-muted-foreground"
                            >
                                <span className="mt-2 block pb-0.5">{offering.body}</span>
                            </motion.p>
                        )}
                    </AnimatePresence>
                </div>
                <motion.span
                    animate={{ opacity: active ? 1 : 0, x: active ? 0 : -6 }}
                    className="mt-2 text-primary"
                >
                    <ArrowRight className="size-4" />
                </motion.span>
            </div>
        </li>
    );
}
