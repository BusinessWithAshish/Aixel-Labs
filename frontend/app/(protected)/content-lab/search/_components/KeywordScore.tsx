'use client';

import Link from 'next/link';
import { InfoIcon, Loader2Icon, MoveRightIcon, SearchIcon, TrendingDownIcon, TrendingUpIcon } from 'lucide-react';
import { CONTENT_LAB_DEFAULT_COUNTRY } from '@aixellabs/backend/content-lab/constants';
import type { CONTENT_LAB_KEYWORD_RESPONSE, CONTENT_LAB_KEYWORD_TREND } from '@aixellabs/backend/content-lab/types';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { ContentLabPlatformFilter } from '../../_constants';
import { useKeyword } from '../_hooks/use-keyword';
import { exploreHref, platformParam } from '../_utils/smart-box';

type KeywordLabel = CONTENT_LAB_KEYWORD_RESPONSE['label'];

export const KEYWORD_LABELS: Record<KeywordLabel, string> = { strong: 'Strong topic', okay: 'Decent topic', weak: 'Weak topic' };

const LABEL_TONE: Record<KeywordLabel, string> = {
    strong: 'bg-emerald-600/10 text-emerald-700 ring-emerald-600/25 dark:text-emerald-400',
    okay: 'bg-amber-500/10 text-amber-700 ring-amber-500/25 dark:text-amber-300',
    weak: 'bg-muted text-muted-foreground ring-border',
};

export const KEYWORD_SCORE_HELP =
    'Out of 100: how many related searches YouTube suggests for it, how busy those searches are now against the busiest week this year, and whether they are going up.';

/** "79 · Strong topic" as a small pill; a spinner while it is worked out. */
export function KeywordBadge({ data, loading, className }: { data: CONTENT_LAB_KEYWORD_RESPONSE | null; loading?: boolean; className?: string }) {
    if (!data) {
        return loading ? (
            <span className={cn('text-muted-foreground inline-flex items-center gap-1 text-xs', className)}>
                <Loader2Icon className="size-3 animate-spin" aria-hidden /> Scoring…
            </span>
        ) : null;
    }
    return (
        <span
            className={cn('inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ring-1 ring-inset', LABEL_TONE[data.label], className)}
            title={`${data.summary} ${KEYWORD_SCORE_HELP}`}
            data-testid="keyword-score"
        >
            {data.score}
            <span className="font-medium">· {KEYWORD_LABELS[data.label]}</span>
        </span>
    );
}

/** 12 months of weekly interest as a line; scales to its box. */
export function Sparkline({ values, className }: { values: readonly number[]; className?: string }) {
    if (values.length < 2) return null;
    const max = Math.max(...values, 1);
    const points = values.map((v, i) => `${(i / (values.length - 1)) * 100},${30 - (v / max) * 28}`).join(' ');
    return (
        <svg viewBox="0 0 100 31" preserveAspectRatio="none" className={cn('h-8 w-full overflow-visible', className)} aria-hidden>
            <polyline points={`0,31 ${points} 100,31`} className="fill-current opacity-10" stroke="none" />
            <polyline points={points} fill="none" stroke="currentColor" strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        </svg>
    );
}

const DIRECTION: Record<CONTENT_LAB_KEYWORD_TREND['direction'], { icon: typeof TrendingUpIcon; tone: string; word: string }> = {
    rising: { icon: TrendingUpIcon, tone: 'text-emerald-600 dark:text-emerald-400', word: 'Rising' },
    steady: { icon: MoveRightIcon, tone: 'text-sky-600 dark:text-sky-400', word: 'Steady' },
    falling: { icon: TrendingDownIcon, tone: 'text-rose-600 dark:text-rose-400', word: 'Falling' },
};

/** "Rising +23%" with its arrow. */
export function TrendWord({ trend, className }: { trend: CONTENT_LAB_KEYWORD_TREND; className?: string }) {
    const { icon: Icon, tone, word } = DIRECTION[trend.direction];
    return (
        <span className={cn('inline-flex items-center gap-1 font-medium', tone, className)}>
            <Icon className="size-4" aria-hidden />
            {word}
            {trend.direction === 'steady' ? null : ` ${trend.change > 0 ? '+' : ''}${trend.change}%`}
        </span>
    );
}

type KeywordCardProps = {
    query: string;
    country: string;
    platform: ContentLabPlatformFilter;
    className?: string;
};

/**
 * Results page: how strong the topic is (score, the sentence behind it, 12 months of YouTube searches)
 * and what else people search, each a new search. Loads in a few seconds, while the posts are still coming.
 */
export function KeywordCard({ query, country, platform, className }: KeywordCardProps) {
    const { data, loading, error } = useKeyword(query, country, { trend: true, delayMs: 0 });
    const related = [...new Set([...(data?.trend?.rising ?? []), ...(data?.searches ?? [])])].slice(0, 6);

    return (
        <section
            aria-labelledby="keyword-card"
            className="bg-card flex min-w-0 flex-col gap-3 rounded-xl border p-4"
            data-testid="keyword-card"
        >
            <div className="flex items-center gap-2">
                <h2 id="keyword-card" className="text-sm font-semibold">
                    How strong is this topic?
                </h2>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <button type="button" className="text-muted-foreground hover:text-foreground" aria-label="How the score works">
                            <InfoIcon className="size-3.5" />
                        </button>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">{KEYWORD_SCORE_HELP}</TooltipContent>
                </Tooltip>
            </div>
            {data ? (
                <div className={cn('grid gap-4', className)}>
                    <div className="flex items-start gap-4">
                        <div
                            className={cn('grid size-16 shrink-0 place-items-center rounded-2xl ring-1 ring-inset', LABEL_TONE[data.label])}
                            data-testid="keyword-card-score"
                        >
                            <span className="text-2xl leading-none font-bold tabular-nums">{data.score}</span>
                        </div>
                        <div className="flex min-w-0 flex-col gap-1">
                            <p className="font-semibold">{KEYWORD_LABELS[data.label]}</p>
                            <p className="text-muted-foreground text-sm">{data.summary}</p>
                        </div>
                    </div>
                    {data.trend ? (
                        <div className="flex flex-col gap-1">
                            <div className="flex items-center justify-between gap-2 text-xs">
                                <span className="text-muted-foreground">YouTube searches, last 12 months</span>
                                <TrendWord trend={data.trend} className="text-xs" />
                            </div>
                            <Sparkline values={data.trend.weekly} className={DIRECTION[data.trend.direction].tone} />
                        </div>
                    ) : null}
                    {related.length ? (
                        <div className="flex flex-col gap-1.5">
                            <p className="text-muted-foreground text-xs">People also search</p>
                            {/* Phones: three, so the posts stay near the top. */}
                            <div className="flex flex-wrap gap-1.5 max-sm:[&>a:nth-child(n+4)]:hidden">
                                {related.map((text) => (
                                    <Link
                                        key={text}
                                        href={exploreHref({ q: text, platform: platformParam(platform), country: country === CONTENT_LAB_DEFAULT_COUNTRY ? undefined : country })}
                                        className="bg-muted hover:bg-primary/10 hover:text-primary inline-flex max-w-full items-center gap-1 rounded-md px-2 py-1 text-xs font-medium"
                                    >
                                        <SearchIcon className="size-3 shrink-0 opacity-60" aria-hidden />
                                        <span className="truncate">{text}</span>
                                    </Link>
                                ))}
                            </div>
                        </div>
                    ) : null}
                </div>
            ) : loading ? (
                <div className="flex flex-col gap-3" aria-busy="true">
                    <div className="flex items-center gap-4">
                        <div className="bg-muted size-16 animate-pulse rounded-2xl" />
                        <div className="flex flex-1 flex-col gap-2">
                            <div className="bg-muted h-4 w-1/3 animate-pulse rounded" />
                            <div className="bg-muted h-3 w-2/3 animate-pulse rounded" />
                        </div>
                    </div>
                    <div className="bg-muted h-8 animate-pulse rounded" />
                </div>
            ) : (
                <p className="text-muted-foreground text-sm">{error ? 'Could not score this topic right now.' : null}</p>
            )}
        </section>
    );
}
