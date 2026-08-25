import { cn } from '@/lib/utils';
import { Sparkles } from 'lucide-react';

type LeadEnrichmentStatusProps = {
    /** True when `lead.enriched` is set (or Crawl-native contacts). */
    enriched: boolean;
    className?: string;
};

/** Compact sparkles mark — filled when enriched, muted outline when not. */
export function LeadEnrichmentStatus({ enriched, className }: LeadEnrichmentStatusProps) {
    const label = enriched ? 'Website enriched' : 'Not enriched';
    return (
        <span
            role="img"
            aria-label={label}
            title={label}
            className={cn(
                'inline-flex shrink-0 items-center justify-center',
                enriched ? 'text-primary' : 'text-muted-foreground/40',
                className,
            )}
        >
            <Sparkles className="size-3.5" fill={enriched ? 'currentColor' : 'none'} aria-hidden />
        </span>
    );
}
