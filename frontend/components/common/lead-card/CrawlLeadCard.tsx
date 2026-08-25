'use client';

import type { CRAWL_RESPONSE } from '@aixellabs/backend/crawl/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Globe } from 'lucide-react';
import { LeadCrawlPanel } from './LeadCrawlPanel';
import { LeadEnrichmentStatus } from './LeadEnrichmentStatus';

type CrawlLeadCardProps = {
    data: CRAWL_RESPONSE;
    className?: string;
    showCheckbox?: boolean;
    isSelected?: boolean;
    onSelect?: (selected: boolean) => void;
    isEnriched?: boolean;
};

export function CrawlLeadCard({
    data,
    className,
    showCheckbox,
    isSelected,
    onSelect,
}: CrawlLeadCardProps) {
    return (
        <Card
            className={cn(
                'relative h-fit min-h-40 w-full gap-2 overflow-hidden transition-shadow hover:shadow-lg',
                isSelected && 'ring-2 ring-primary',
                className,
            )}
        >
            <CardHeader className="min-w-0 gap-2">
                <CardTitle className="flex min-w-0 w-full items-center gap-2 font-normal">
                    {showCheckbox && onSelect ? (
                        <Checkbox
                            className="shrink-0"
                            checked={isSelected}
                            onCheckedChange={onSelect}
                        />
                    ) : null}
                    <Globe className="size-4 shrink-0 text-primary" />
                    <span
                        className="min-w-0 flex-1 truncate text-lg font-semibold"
                        title={data.domain}
                    >
                        {data.meta?.siteName || data.meta?.title || data.domain}
                    </span>
                    <LeadEnrichmentStatus enriched />
                    <Badge variant="secondary" className="shrink-0">
                        Crawl
                    </Badge>
                </CardTitle>
                <CardDescription className="truncate" title={data.domain}>
                    {data.domain}
                    {data.address ? ` · ${data.address}` : ''}
                </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
                <LeadCrawlPanel data={data} hideBadge />
            </CardContent>
        </Card>
    );
}
