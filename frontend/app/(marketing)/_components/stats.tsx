'use client';

import Image from 'next/image';
import { Sparkles, Star, Route as RouteIcon, Send } from 'lucide-react';
import { BRAND_LOGOS, GOOGLE_LOGO } from '../constants';
import { Reveal, StaggerGroup, StaggerItem } from './primitives';
import { CountUp } from './primitives';
import { LandingSection, SectionEyebrow } from './primitives';

const STATS = [
    { to: 48_000, suffix: '+', label: 'Leads enriched', sub: 'across Maps, search and social' },
    { to: 91, suffix: '%', label: 'Enrichment accuracy', sub: 'verified email and phone' },
    { to: 60, suffix: '+', label: 'Growth teams', sub: 'on Aixel Labs today' },
    { to: 2, suffix: 'x', label: 'Outreach conversion', sub: 'vs. manual prospecting' },
];

type SourceNode = { kind: 'source'; label: string; src: string };
type IconNode = {
    kind: 'icon';
    label: string;
    icon: React.ReactNode;
    chip: string;
};
type Node = SourceNode | IconNode;

const SOURCES: SourceNode[] = [
    { kind: 'source', label: 'Maps', src: BRAND_LOGOS.googleMaps },
    { kind: 'source', label: 'Search', src: GOOGLE_LOGO },
    { kind: 'source', label: 'Instagram', src: BRAND_LOGOS.instagram },
    { kind: 'source', label: 'LinkedIn', src: BRAND_LOGOS.linkedin },
];

const ENRICH: IconNode = {
    kind: 'icon',
    label: 'Enrich',
    icon: <Sparkles className="size-5" />,
    chip: 'bg-primary text-primary-foreground',
};

const SCORE: IconNode = {
    kind: 'icon',
    label: 'Score',
    icon: <Star className="size-5" />,
    chip: 'bg-amber-500 text-white',
};

const ROUTE: IconNode = {
    kind: 'icon',
    label: 'Route',
    icon: <RouteIcon className="size-5" />,
    chip: 'bg-sky-500 text-white',
};

const OUTREACH: IconNode = {
    kind: 'icon',
    label: 'Outreach',
    icon: <Send className="size-5" />,
    chip: 'bg-emerald-500 text-white',
};

export function Stats() {
    return (
        <LandingSection>
            <Reveal className="mx-auto max-w-2xl text-center">
                <SectionEyebrow>By the numbers</SectionEyebrow>
                <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
                    The intelligence layer for your pipeline.
                </h2>
            </Reveal>

            <StaggerGroup className="mt-12 grid grid-cols-2 gap-4 lg:grid-cols-4" stagger={0.1}>
                {STATS.map((s) => (
                    <StaggerItem key={s.label}>
                        <div className="relative h-full overflow-hidden rounded-2xl border border-border bg-card p-5 sm:p-6">
                            <div
                                aria-hidden
                                className="pointer-events-none absolute -right-8 -top-8 size-24 rounded-full bg-primary/10 blur-2xl"
                            />
                            <p className="relative text-2xl font-semibold tracking-tight text-foreground sm:text-4xl">
                                <CountUp to={s.to} suffix={s.suffix} duration={1.8} />
                            </p>
                            <p className="relative mt-2 text-sm font-medium text-foreground/80">{s.label}</p>
                            <p className="relative mt-0.5 text-xs text-muted-foreground">{s.sub}</p>
                        </div>
                    </StaggerItem>
                ))}
            </StaggerGroup>

            <Reveal delay={0.2} className="mt-10">
                <LeadFlowDiagram />
            </Reveal>
        </LandingSection>
    );
}

function NodeChip({ node, size = 'md' }: { node: Node; size?: 'md' | 'sm' }) {
    const box = size === 'md' ? 'size-11' : 'size-9';
    const logo = size === 'md' ? 'size-6' : 'size-5';
    const label = (
        <span className="text-[11px] font-medium text-muted-foreground">{node.label}</span>
    );
    if (node.kind === 'icon') {
        return (
            <div className="flex flex-col items-center gap-1.5">
                <div className={`grid ${box} shrink-0 place-items-center rounded-xl shadow-sm ${node.chip}`}>
                    {node.icon}
                </div>
                {label}
            </div>
        );
    }
    return (
        <div className="flex flex-col items-center gap-1.5">
            <div className={`grid ${box} shrink-0 place-items-center rounded-xl border border-border bg-card shadow-sm shadow-primary/5`}>
                <Image src={node.src} alt={node.label} width={24} height={24} className={logo} />
            </div>
            {label}
        </div>
    );
}

function LeadFlowDiagram() {
    return (
        <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-4 sm:p-6">
            <p className="mb-4 text-center text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
                Sources to enrichment, scoring and routing, then outreach
            </p>

            {/* Desktop: horizontal hub-and-spoke diagram */}
            <DesktopDiagram />

            {/* Mobile / tablet: vertical flow */}
            <MobileDiagram />

            <p className="mt-4 text-center text-xs text-muted-foreground">One automated run.</p>
        </div>
    );
}

function DesktopDiagram() {
    // viewBox 800 x 360; nodes positioned in that coordinate space, rendered as % overlays
    const positions: Record<string, { left: string; top: string }> = {
        Maps: { left: '7%', top: '14%' },
        Search: { left: '7%', top: '38%' },
        Instagram: { left: '7%', top: '62%' },
        LinkedIn: { left: '7%', top: '86%' },
        Enrich: { left: '37%', top: '50%' },
        Score: { left: '67%', top: '28%' },
        Route: { left: '67%', top: '72%' },
        Outreach: { left: '93%', top: '50%' },
    };
    const nodes: Record<string, Node> = {
        Maps: SOURCES[0],
        Search: SOURCES[1],
        Instagram: SOURCES[2],
        LinkedIn: SOURCES[3],
        Enrich: ENRICH,
        Score: SCORE,
        Route: ROUTE,
        Outreach: OUTREACH,
    };
    const edges: [string, string][] = [
        ['Maps', 'Enrich'],
        ['Search', 'Enrich'],
        ['Instagram', 'Enrich'],
        ['LinkedIn', 'Enrich'],
        ['Enrich', 'Score'],
        ['Enrich', 'Route'],
        ['Score', 'Outreach'],
        ['Route', 'Outreach'],
    ];
    const coord = (key: string) => {
        const left = parseFloat(positions[key].left);
        const top = parseFloat(positions[key].top);
        return { x: (left / 100) * 800, y: (top / 100) * 360 };
    };

    return (
        <div className="relative hidden aspect-2/1 w-full lg:block">
            <svg
                viewBox="0 0 800 360"
                preserveAspectRatio="none"
                className="absolute inset-0 size-full"
                aria-hidden
            >
                <defs>
                    <linearGradient id="flow-line-2" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.15" />
                        <stop offset="50%" stopColor="var(--primary)" stopOpacity="0.85" />
                        <stop offset="100%" stopColor="var(--primary)" stopOpacity="0.15" />
                    </linearGradient>
                </defs>
                {edges.map(([from, to], i) => {
                    const a = coord(from);
                    const b = coord(to);
                    return (
                        <path
                            key={i}
                            d={`M ${a.x + 40} ${a.y} C ${(a.x + b.x) / 2 + 30} ${a.y}, ${(a.x + b.x) / 2} ${b.y}, ${b.x - 40} ${b.y}`}
                            fill="none"
                            stroke="url(#flow-line-2)"
                            strokeWidth="1.5"
                            strokeDasharray="6 6"
                            className="animate-dash-march"
                            style={{ animationDelay: `${i * 0.2}s` }}
                        />
                    );
                })}
            </svg>
            {Object.entries(positions).map(([key, pos]) => (
                <div
                    key={key}
                    className="absolute"
                    style={{ left: pos.left, top: pos.top, transform: 'translate(-50%, -50%)' }}
                >
                    <NodeChip node={nodes[key]} />
                </div>
            ))}
        </div>
    );
}

function MobileDiagram() {
    return (
        <div className="flex flex-col items-center gap-5 lg:hidden">
            {/* Sources 2x2 grid */}
            <div className="grid grid-cols-4 gap-3">
                {SOURCES.map((s) => (
                    <NodeChip key={s.label} node={s} size="sm" />
                ))}
            </div>
            <DownArrow />
            <NodeChip node={ENRICH} />
            <DownArrow />
            <div className="grid grid-cols-2 gap-6">
                <NodeChip node={SCORE} size="sm" />
                <NodeChip node={ROUTE} size="sm" />
            </div>
            <DownArrow />
            <NodeChip node={OUTREACH} />
        </div>
    );
}

function DownArrow() {
    return (
        <svg viewBox="0 0 24 24" className="size-4 text-primary/60 animate-float-y" fill="none" aria-hidden>
            <path d="M12 4 L12 18 M6 12 L12 18 L18 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}
