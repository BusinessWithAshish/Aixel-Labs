'use client';

import Link from 'next/link';
import { HashIcon, InfoIcon, MoveRightIcon, SearchIcon, TrendingDownIcon, TrendingUpIcon } from 'lucide-react';
import { CONTENT_LAB_DEFAULT_COUNTRY } from '@aixellabs/backend/content-lab/constants';
import type { CONTENT_LAB_KEYWORD_PLATFORM, CONTENT_LAB_KEYWORD_RESPONSE, CONTENT_LAB_KEYWORD_TREND } from '@aixellabs/backend/content-lab/types';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { CONTENT_LAB_PLATFORM_LABELS, type ContentLabPlatformFilter } from '../../_constants';
import { CONTENT_LAB_PLATFORM_COLOR, PlatformIcon } from '../../_components/PlatformIcon';
import type { UseKeywordReturn } from '../_hooks/use-keyword';
import { compactNumber } from '../_utils/format';
import { exploreHref, platformParam, platformsOf } from '../_utils/smart-box';

type KeywordLabel = CONTENT_LAB_KEYWORD_RESPONSE['label'];

export const KEYWORD_LABELS: Record<KeywordLabel, string> = { strong: 'Strong', okay: 'Decent', weak: 'Weak' };

const LABEL_TONE: Record<KeywordLabel, string> = {
    strong: 'bg-emerald-600/10 text-emerald-700 ring-emerald-600/25 dark:text-emerald-400',
    okay: 'bg-amber-500/10 text-amber-700 ring-amber-500/25 dark:text-amber-300',
    weak: 'bg-muted text-muted-foreground ring-border',
};

export const KEYWORD_SCORE_HELP =
    'Out of 100 on each platform. YouTube: how many related searches it suggests, how busy they are against the busiest week this year, and whether they are going up. Instagram: how many posts use the topic’s hashtag, and how many related hashtags are busy. The number in the middle is the average.';

/** "Strong" as a small pill in its colour. */
export function LabelPill({ label, className }: { label: KeywordLabel; className?: string }) {
    return (
        <span className={cn('inline-flex shrink-0 items-center rounded-full px-1.5 py-px text-[11px] font-semibold ring-1 ring-inset', LABEL_TONE[label], className)}>
            {KEYWORD_LABELS[label]}
        </span>
    );
}

const RING_RADIUS = 42;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

type ScoreRingProps = {
    data: CONTENT_LAB_KEYWORD_RESPONSE | null;
    /** Pixels. */
    size?: number;
    className?: string;
};

/**
 * The overall score in the middle of a ring cut into one arc per platform, each filled as far as that platform
 * scores, in its brand colour: one look says how strong the topic is and where. An empty pulsing ring while loading.
 */
export function ScoreRing({ data, size = 56, className }: ScoreRingProps) {
    const parts = data?.platforms ?? [];
    const slice = RING_LENGTH / Math.max(parts.length, 1);
    const gap = parts.length > 1 ? 5 : 0;
    const arc = slice - gap;
    const label = data
        ? `Score ${data.score} of 100${parts.length > 1 ? `: ${parts.map((p) => `${CONTENT_LAB_PLATFORM_LABELS[p.platform]} ${p.score}`).join(', ')}` : ''}`
        : 'Scoring';
    return (
        <span
            role="img"
            aria-label={label}
            className={cn('relative grid shrink-0 place-items-center', !data && 'animate-pulse', className)}
            style={{ width: size, height: size }}
            data-testid="score-ring"
        >
            <svg viewBox="0 0 100 100" className="absolute inset-0 size-full -rotate-90" aria-hidden>
                {(parts.length ? parts : [null]).map((part, i) => {
                    // Each arc starts half a gap in, so the gaps sit between platforms.
                    const offset = -(i * slice + gap / 2);
                    const filled = part ? (arc * part.score) / 100 : 0;
                    return (
                        <g key={part?.platform ?? 'empty'} fill="none" strokeWidth="11" strokeLinecap="butt">
                            <circle
                                cx="50"
                                cy="50"
                                r={RING_RADIUS}
                                className="stroke-muted"
                                strokeDasharray={`${arc} ${RING_LENGTH - arc}`}
                                strokeDashoffset={offset}
                            />
                            {part && filled > 0 ? (
                                <circle
                                    cx="50"
                                    cy="50"
                                    r={RING_RADIUS}
                                    stroke="currentColor"
                                    className={CONTENT_LAB_PLATFORM_COLOR[part.platform]}
                                    strokeDasharray={`${filled} ${RING_LENGTH - filled}`}
                                    strokeDashoffset={offset}
                                />
                            ) : null}
                        </g>
                    );
                })}
            </svg>
            <span className="font-bold tabular-nums" style={{ fontSize: size * 0.3 }}>
                {data ? data.score : ''}
            </span>
        </span>
    );
}

/** One platform's score as a bar in its colour, "80 · Strong", and the sentence behind it. */
function PlatformScoreRow({ part, compact }: { part: CONTENT_LAB_KEYWORD_PLATFORM; compact?: boolean }) {
    return (
        <li className="grid min-w-0 gap-0.5" data-testid="platform-score" data-platform={part.platform}>
            <span className="flex min-w-0 items-center gap-2">
                <PlatformIcon platform={part.platform} className="size-4" />
                <span className={cn('shrink-0 text-xs font-medium', compact ? 'w-16' : 'w-[4.5rem]')}>{CONTENT_LAB_PLATFORM_LABELS[part.platform]}</span>
                <span className="bg-muted h-1.5 min-w-8 flex-1 overflow-hidden rounded-full">
                    <span className={cn('block h-full rounded-full bg-current', CONTENT_LAB_PLATFORM_COLOR[part.platform])} style={{ width: `${part.score}%` }} />
                </span>
                <span className="w-6 shrink-0 text-right text-xs font-bold tabular-nums">{part.score}</span>
                <LabelPill label={part.label} />
            </span>
            <span className={cn('text-muted-foreground text-xs', compact ? 'truncate pl-6' : 'pl-6')}>{part.summary}</span>
        </li>
    );
}

/** Each platform's score, one row each. */
export function PlatformScores({ data, compact, className }: { data: CONTENT_LAB_KEYWORD_RESPONSE; compact?: boolean; className?: string }) {
    return (
        <ul className={cn('grid min-w-0 gap-2', className)} aria-label="Score per platform">
            {data.platforms.map((part) => (
                <PlatformScoreRow key={part.platform} part={part} compact={compact} />
            ))}
        </ul>
    );
}

/** Placeholder rows while a score loads. */
export function PlatformScoresSkeleton({ count }: { count: number }) {
    return (
        <div className="grid gap-2.5" aria-hidden>
            {Array.from({ length: count }, (_, i) => (
                <div key={i} className="flex items-center gap-2">
                    <span className="bg-muted size-4 animate-pulse rounded" />
                    <span className="bg-muted h-1.5 flex-1 animate-pulse rounded-full" />
                    <span className="bg-muted h-3 w-14 animate-pulse rounded" />
                </div>
            ))}
        </div>
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

/** "How the score works" behind an (i). */
export function ScoreHelp() {
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <button type="button" className="text-muted-foreground hover:text-foreground" aria-label="How the score works">
                    <InfoIcon className="size-3.5" />
                </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">{KEYWORD_SCORE_HELP}</TooltipContent>
        </Tooltip>
    );
}

type TopicStrengthProps = {
    /** `useKeyword` with the trend, for `query` on the sources picked. */
    keyword: UseKeywordReturn;
    query: string;
    country: string;
    platform: ContentLabPlatformFilter;
    className?: string;
};

const chip = 'bg-muted hover:bg-primary/10 hover:text-primary inline-flex max-w-full items-center gap-1 rounded-md px-2 py-1 text-xs font-medium';

/**
 * Results page: how strong the topic is on each source picked: the ring, a row per platform with the sentence behind
 * it, and 12 months of YouTube searches. Loads in about a second, while the posts are still coming.
 */
export function TopicStrength({ keyword, platform, className }: Omit<TopicStrengthProps, 'query' | 'country'>) {
    const { data, loading, error } = keyword;

    return (
        <section aria-labelledby="topic-strength" className={cn('flex min-w-0 flex-col gap-4', className)} data-testid="keyword-card">
            <div className="flex items-center gap-2">
                <h2 id="topic-strength" className="text-sm font-semibold">
                    How strong is this topic?
                </h2>
                <ScoreHelp />
            </div>
            {data ? (
                <>
                    <div className="flex items-center gap-4">
                        <ScoreRing data={data} size={84} />
                        <div className="flex min-w-0 flex-col gap-1">
                            <p className="font-semibold" data-testid="keyword-card-score">
                                {KEYWORD_LABELS[data.label]} topic
                                <span className="sr-only">, {data.score} out of 100</span>
                            </p>
                            <p className="text-muted-foreground text-sm">{data.summary}</p>
                        </div>
                    </div>
                    <PlatformScores data={data} />
                    {data.trend ? (
                        <div className="flex flex-col gap-1">
                            <div className="flex items-center justify-between gap-2 text-xs">
                                <span className="text-muted-foreground">YouTube searches, last 12 months</span>
                                <TrendWord trend={data.trend} className="text-xs" />
                            </div>
                            <Sparkline values={data.trend.weekly} className={DIRECTION[data.trend.direction].tone} />
                        </div>
                    ) : null}
                </>
            ) : loading ? (
                <div className="flex flex-col gap-4" aria-busy="true">
                    <div className="flex items-center gap-4">
                        <ScoreRing data={null} size={84} />
                        <div className="flex flex-1 flex-col gap-2">
                            <div className="bg-muted h-4 w-1/3 animate-pulse rounded" />
                            <div className="bg-muted h-3 w-2/3 animate-pulse rounded" />
                        </div>
                    </div>
                    <PlatformScoresSkeleton count={platformsOf(platform).length} />
                </div>
            ) : (
                <p className="text-muted-foreground text-sm">{error ? 'Could not score this topic right now.' : null}</p>
            )}
        </section>
    );
}

/**
 * What to search next: what people also search on YouTube and the related hashtags on Instagram, each a new search.
 * Nothing until the score has loaded.
 */
export function RelatedSearches({ keyword, query, country, platform, className }: TopicStrengthProps) {
    const { data } = keyword;
    const related = [...new Set([...(data?.trend?.rising ?? []), ...(data?.searches ?? [])])].slice(0, 5);
    const hashtags = (data?.hashtags ?? []).filter((tag) => tag.name !== query.toLowerCase().replace(/\s+/g, '')).slice(0, 4);
    const countryParam = country === CONTENT_LAB_DEFAULT_COUNTRY ? undefined : country;
    if (!related.length && !hashtags.length) return null;
    return (
        <section aria-labelledby="related-searches" className={cn('flex min-w-0 flex-col gap-3', className)}>
            <h2 id="related-searches" className="text-sm font-semibold">
                Search next
            </h2>
            {related.length ? (
                <div className="flex flex-col gap-1.5">
                    <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
                        <PlatformIcon platform="youtube" className="size-3.5" /> People also search
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                        {related.map((text) => (
                            <Link key={text} href={exploreHref({ q: text, platform: platformParam(platform), country: countryParam })} className={chip}>
                                <SearchIcon className="size-3 shrink-0 opacity-60" aria-hidden />
                                <span className="truncate">{text}</span>
                            </Link>
                        ))}
                    </div>
                </div>
            ) : null}
            {hashtags.length ? (
                <div className="flex flex-col gap-1.5">
                    <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
                        <PlatformIcon platform="instagram" className="size-3.5" /> Related hashtags
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                        {hashtags.map((tag) => (
                            <Link key={tag.name} href={exploreHref({ q: `#${tag.name}`, platform: 'instagram', country: countryParam })} className={chip}>
                                <HashIcon className="size-3 shrink-0 opacity-60" aria-hidden />
                                <span className="truncate">{tag.name}</span>
                                {tag.posts != null ? <span className="text-muted-foreground font-normal tabular-nums">{compactNumber(tag.posts)}</span> : null}
                            </Link>
                        ))}
                    </div>
                </div>
            ) : null}
        </section>
    );
}
