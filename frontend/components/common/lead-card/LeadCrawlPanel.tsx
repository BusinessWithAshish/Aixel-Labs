'use client';

import type { CRAWL_RESPONSE } from '@aixellabs/backend/crawl/types';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Email, PhoneNumber } from './ExternalContacts';
import { Globe2, Link2 } from 'lucide-react';

type LeadCrawlPanelProps = {
    data: CRAWL_RESPONSE;
    className?: string;
    /** When true, omit the Enriched badge (Crawl-generated cards). */
    hideBadge?: boolean;
};

export function LeadCrawlPanel({ data, className, hideBadge = false }: LeadCrawlPanelProps) {
    const emails = data.emails?.map((e) => e.value).filter(Boolean) ?? [];
    const phones = data.phones?.map((p) => p.value).filter(Boolean) ?? [];
    const socialEntries = Object.entries(data.socials ?? {}).flatMap(([platform, urls]) =>
        (urls ?? []).map((url) => ({ platform, url })),
    );
    const hasContacts = emails.length > 0 || phones.length > 0 || socialEntries.length > 0;

    return (
        <section
            className={cn(
                'space-y-2 rounded-md border border-border bg-muted/40 p-3',
                className,
            )}
        >
            <header className="flex min-w-0 flex-wrap items-center gap-2">
                {!hideBadge ? (
                    <Badge variant="secondary">Enriched</Badge>
                ) : null}
                <span className="min-w-0 truncate text-xs text-muted-foreground" title={data.domain}>
                    {data.domain}
                </span>
                {data.status !== 'success' ? (
                    <Badge variant="outline">{data.status}</Badge>
                ) : null}
            </header>

            {data.meta?.title || data.meta?.siteName ? (
                <p
                    className="truncate text-sm font-medium text-foreground"
                    title={data.meta.title ?? data.meta.siteName}
                >
                    {data.meta.title ?? data.meta.siteName}
                </p>
            ) : null}

            {emails.map((email) => (
                <Email key={email} value={email} hideWhenEmpty />
            ))}
            {phones.map((phone) => (
                <PhoneNumber key={phone} value={phone} hideWhenEmpty />
            ))}
            {socialEntries.map(({ platform, url }) => (
                <a
                    key={`${platform}-${url}`}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex min-w-0 items-center gap-2 truncate text-sm text-primary hover:underline"
                    title={url}
                >
                    <Link2 className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="shrink-0 capitalize text-foreground">{platform}</span>
                    <span className="truncate text-muted-foreground">{url}</span>
                </a>
            ))}
            {!hasContacts ? (
                <p className="flex items-center gap-1.5 text-sm italic text-muted-foreground">
                    <Globe2 className="size-3.5 shrink-0" />
                    No published contacts found
                </p>
            ) : null}
        </section>
    );
}
