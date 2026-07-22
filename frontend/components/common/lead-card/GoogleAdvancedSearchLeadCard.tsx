'use client';

import {
    Card,
    CardAction,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import type { GSEARCH_RESPONSE } from '@aixellabs/backend/gsearch/types';
import { CalendarDays, ExternalLink, Trash2, User } from 'lucide-react';
import Image from 'next/image';
import { type ReactNode, useLayoutEffect, useMemo, useRef, useState } from 'react';

const DEFAULT_DISPLAY_VALUE = 'N/A';

type GoogleAdvancedSearchLeadCardProps = {
    lead: GSEARCH_RESPONSE;
    className?: string;
    actions?: ReactNode;
    showCheckbox?: boolean;
    onDelete?: () => void;
    onSelect?: (selected: boolean) => void;
    isSelected?: boolean;
};

function formatPublishedTime(value: string | null | undefined): string | null {
    if (!value?.trim()) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value.trim();
    return date.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    });
}

export const GoogleAdvancedSearchLeadCard = (props: GoogleAdvancedSearchLeadCardProps) => {
    const { lead, className, actions, showCheckbox, onDelete, onSelect, isSelected } = props;

    const leadInfo = useMemo(() => {
        const title = lead.title?.trim() || DEFAULT_DISPLAY_VALUE;
        const displayHost = lead.displayUrl?.trim() || lead.siteName?.trim() || null;
        const snippet = lead.metaDescription?.trim() || lead.snippet?.trim() || DEFAULT_DISPLAY_VALUE;
        return {
            title,
            url: lead.url?.trim() || lead.id,
            displayHost,
            snippet,
            siteName: lead.siteName?.trim() || null,
            type: lead.type?.trim() || null,
            authorName: lead.author?.name?.trim() || null,
            publishedTime: formatPublishedTime(lead.publishedTime),
            thumbnail: lead.thumbnail || lead.image || null,
            keywords: (lead.keywords ?? '')
                .split(',')
                .map((k: string) => k.trim())
                .filter(Boolean)
                .slice(0, 4),
        };
    }, [lead]);

    const [snippetExpanded, setSnippetExpanded] = useState(false);
    const [snippetOverflows, setSnippetOverflows] = useState(false);
    const snippetRef = useRef<HTMLParagraphElement>(null);

    useLayoutEffect(() => {
        if (snippetExpanded) return;
        const el = snippetRef.current;
        if (!el || leadInfo.snippet === DEFAULT_DISPLAY_VALUE || !leadInfo.snippet.trim()) {
            setSnippetOverflows(false);
            return;
        }
        const checkOverflow = () => {
            setSnippetOverflows(el.scrollHeight > el.clientHeight + 1);
        };
        checkOverflow();
        const observer = new ResizeObserver(checkOverflow);
        observer.observe(el);
        return () => observer.disconnect();
    }, [leadInfo.snippet, snippetExpanded]);

    const handleOpenResult = () => {
        if (leadInfo.url) {
            window.open(leadInfo.url, '_blank', 'noopener,noreferrer');
        }
    };

    return (
        <Card
            className={cn(
                'relative h-fit min-h-55 w-full gap-3 overflow-hidden transition-shadow hover:shadow-lg',
                isSelected && 'ring-2 ring-primary',
                className,
            )}
        >
            {onDelete && (
                <div className="absolute bottom-4 right-4 z-10">
                    <Button
                        type="button"
                        onClick={onDelete}
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-full hover:bg-destructive/10 hover:text-destructive"
                        title="Remove from results"
                    >
                        <Trash2 className="h-4 w-4" />
                    </Button>
                </div>
            )}

            <CardHeader className="min-w-0 gap-2">
                <CardTitle className="flex min-w-0 w-full items-start gap-2 font-normal">
                    {showCheckbox && onSelect && (
                        <Checkbox
                            className="mt-1 shrink-0"
                            checked={isSelected}
                            onCheckedChange={onSelect}
                        />
                    )}
                    {leadInfo.thumbnail ? (
                        <div className="relative size-10 shrink-0 overflow-hidden rounded-md bg-muted">
                            <Image
                                src={leadInfo.thumbnail}
                                alt=""
                                fill
                                className="object-cover"
                                unoptimized
                            />
                        </div>
                    ) : null}
                    <div className="flex min-w-0 flex-1 flex-col gap-1 overflow-hidden">
                        <span
                            className="min-w-0 truncate text-lg font-semibold text-foreground"
                            title={leadInfo.title}
                        >
                            {leadInfo.title}
                        </span>
                        {leadInfo.displayHost && (
                            <CardDescription className="truncate" title={leadInfo.displayHost}>
                                {leadInfo.displayHost}
                            </CardDescription>
                        )}
                    </div>
                </CardTitle>

                <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                    {leadInfo.type && (
                        <Badge size="sm" variant="secondary" className="rounded-full">
                            {leadInfo.type}
                        </Badge>
                    )}
                    {leadInfo.siteName && leadInfo.siteName !== leadInfo.displayHost && (
                        <Badge size="sm" variant="blue" className="rounded-full">
                            {leadInfo.siteName}
                        </Badge>
                    )}
                    {leadInfo.keywords.map((keyword: string) => (
                        <Badge key={keyword} size="sm" variant="secondary" className="rounded-full">
                            {keyword}
                        </Badge>
                    ))}
                </div>

                <CardAction className="shrink-0">
                    <Button
                        onClick={handleOpenResult}
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-full transition-all duration-100 hover:scale-110"
                        title="Open result"
                        aria-label="Open search result"
                    >
                        <Image src="/google-logo.png" alt="Google" width={20} height={20} />
                    </Button>
                </CardAction>
            </CardHeader>

            <CardContent className="flex min-w-0 flex-col gap-2 overflow-hidden">
                <div className="min-w-0">
                    <p
                        ref={snippetRef}
                        className={cn(
                            'min-w-0 text-sm leading-relaxed text-muted-foreground wrap-break-words',
                            !snippetExpanded && 'line-clamp-3',
                        )}
                    >
                        {leadInfo.snippet}
                    </p>
                    {snippetOverflows && (
                        <Button
                            type="button"
                            variant="link"
                            className="h-auto p-0 text-sm font-medium"
                            onClick={() => setSnippetExpanded((e) => !e)}
                        >
                            {snippetExpanded ? 'See less' : 'See more'}
                        </Button>
                    )}
                </div>

                {(leadInfo.authorName || leadInfo.publishedTime) && (
                    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        {leadInfo.authorName && (
                            <span className="inline-flex min-w-0 items-center gap-1">
                                <User className="size-3.5 shrink-0" />
                                <span className="truncate">{leadInfo.authorName}</span>
                            </span>
                        )}
                        {leadInfo.publishedTime && (
                            <span className="inline-flex items-center gap-1">
                                <CalendarDays className="size-3.5 shrink-0" />
                                {leadInfo.publishedTime}
                            </span>
                        )}
                    </div>
                )}

                <a
                    href={leadInfo.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-w-0 max-w-full items-center gap-1 truncate text-sm text-blue-600 hover:underline"
                    title={leadInfo.url}
                >
                    <span className="truncate">{leadInfo.url}</span>
                    <ExternalLink className="size-3.5 shrink-0" />
                </a>

                {actions && <div className="border-t">{actions}</div>}
            </CardContent>
        </Card>
    );
};
