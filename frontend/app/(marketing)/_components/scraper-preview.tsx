import Image from 'next/image';
import { ChevronDown, Hash, MapPin, RefreshCw, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BRAND_LOGOS, LABELS } from '../constants';
import type { PreviewFieldIcon } from '../types';

export function PreviewShell({
    title,
    logo,
    tabs,
    children,
}: {
    title: string;
    logo: string;
    tabs: string[];
    children: React.ReactNode;
}) {
    return (
        <div className="overflow-hidden rounded-xl border border-border bg-muted/25">
            <div className="flex items-center justify-between gap-2 border-b border-border/80 bg-card/80 px-3 py-2.5">
                <div className="flex min-w-0 items-center gap-2">
                    <Image src={logo} alt="" width={16} height={16} className="size-4 shrink-0" />
                    <span className="truncate text-xs font-semibold text-foreground">{title}</span>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                    <span className="grid size-7 place-items-center rounded-full border border-border bg-background text-muted-foreground">
                        <RefreshCw className="size-3" />
                    </span>
                    <span className="inline-flex h-7 items-center gap-1 rounded-lg bg-primary px-2.5 text-[11px] font-semibold text-primary-foreground">
                        {LABELS.saveAndRun}
                        <ChevronDown className="size-3 opacity-80" />
                    </span>
                </div>
            </div>
            <div className="flex gap-1 border-b border-border/60 px-3 py-2">
                {tabs.map((tab, i) => (
                    <span
                        key={tab}
                        className={cn(
                            'rounded-md px-2.5 py-1 text-[11px] font-medium',
                            i === 0 ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground',
                        )}
                    >
                        {tab}
                    </span>
                ))}
            </div>
            <div className="space-y-2.5 p-3">{children}</div>
        </div>
    );
}

export function PreviewField({
    label,
    value,
    icon,
    className,
    compact,
}: {
    label: string;
    value: string;
    icon?: PreviewFieldIcon;
    className?: string;
    /** Slightly smaller field used in the hero workspace mockup. */
    compact?: boolean;
}) {
    return (
        <div className={cn('space-y-1', className)}>
            <p className="text-[10px] font-medium text-muted-foreground">{label}</p>
            <div
                className={cn(
                    'flex items-center gap-2 rounded-lg border border-border px-2.5 text-foreground',
                    compact
                        ? 'h-8 bg-card text-[11px] sm:h-9 sm:text-xs'
                        : 'h-9 bg-background text-xs',
                )}
            >
                {icon === 'search' ? <Search className="size-3.5 shrink-0 text-muted-foreground" /> : null}
                {icon === 'pin' ? <MapPin className="size-3.5 shrink-0 text-muted-foreground" /> : null}
                {icon === 'hash' ? <Hash className="size-3.5 shrink-0 text-muted-foreground" /> : null}
                <span className="min-w-0 flex-1 truncate">{value}</span>
                {icon === 'chevron' || icon === 'pin' || compact ? (
                    <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
                ) : null}
            </div>
        </div>
    );
}

export function ChipRow({ items }: { items: string[] }) {
    return (
        <div className="flex flex-wrap gap-1.5">
            {items.map((item) => (
                <span
                    key={item}
                    className="inline-flex items-center rounded-md border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary"
                >
                    {item}
                </span>
            ))}
        </div>
    );
}

export function MapsPreview() {
    return (
        <PreviewShell title="Google Maps Form" logo={BRAND_LOGOS.googleMaps} tabs={['Query', 'URLs']}>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <PreviewField label="Country *" value="United States" icon="chevron" />
                <PreviewField label="State" value="California" icon="chevron" />
            </div>
            <PreviewField label="Cities" value="San Francisco, Oakland, San Jose" icon="pin" />
            <PreviewField label="Category" value="Plumbers · Home services" icon="chevron" />
            <ChipRow items={['Restaurants', 'Gyms', 'Dentists']} />
        </PreviewShell>
    );
}

export function InstagramPreview() {
    return (
        <PreviewShell title="Instagram Search" logo={BRAND_LOGOS.instagram} tabs={['Query', 'Usernames']}>
            <PreviewField label="Query" value="SaaS founders Bay Area" icon="search" />
            <PreviewField label="Country *" value="United States" icon="chevron" />
            <div className="space-y-1">
                <p className="text-[10px] font-medium text-muted-foreground">Hashtags</p>
                <ChipRow items={['#saas', '#startup', '#b2b']} />
            </div>
            <PreviewField label="Keywords" value="agency, growth, leads" icon="hash" />
        </PreviewShell>
    );
}

export function FacebookPreview() {
    return (
        <PreviewShell title="Facebook Pages Form" logo={BRAND_LOGOS.facebook} tabs={['Query', 'Pages']}>
            <PreviewField label="Query" value="Dental clinics near me" icon="search" />
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <PreviewField label="Country *" value="India" icon="chevron" />
                <PreviewField label="City" value="Pune" icon="pin" />
            </div>
            <PreviewField label="Keywords" value="clinic, orthodontist" />
            <PreviewField label="Limit" value="100 pages" />
        </PreviewShell>
    );
}

export function LinkedInPreview() {
    return (
        <PreviewShell title="LinkedIn · By Company" logo={BRAND_LOGOS.linkedin} tabs={['By Company', 'By People']}>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <PreviewField label="Country *" value="United States" icon="chevron" />
                <PreviewField label="Industry" value="Software Development" icon="chevron" />
            </div>
            <PreviewField label="Company name" value="Acme" icon="search" />
            <PreviewField label="Keywords" value="B2B, Series A, AI" />
            <ChipRow items={['HQ: US', 'Industry match', 'Ready to scrape']} />
        </PreviewShell>
    );
}
