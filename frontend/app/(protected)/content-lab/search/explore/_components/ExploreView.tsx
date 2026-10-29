'use client';

import { useEffect, useRef, useState } from 'react';
import {
    AlertTriangleIcon,
    ArrowDownWideNarrowIcon,
    CheckCircle2Icon,
    GlobeIcon,
    LayoutDashboardIcon,
    Loader2Icon,
    RotateCwIcon,
    SearchXIcon,
    SparklesIcon,
    TrendingUpIcon,
} from 'lucide-react';
import { CONTENT_LAB_ERROR_MESSAGES, CONTENT_LAB_OUTLIER_MULTIPLE, CONTENT_LAB_PLATFORMS } from '@aixellabs/backend/content-lab/constants';
import type { CONTENT_LAB_POST, ContentLabPlatform } from '@aixellabs/backend/content-lab/types';
import { EmptyState } from '@/components/common/EmptyState';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { usePage } from '@/contexts/PageStore';
import { cn } from '@/lib/utils';
import {
    CONTENT_LAB_COUNTRIES,
    CONTENT_LAB_PLATFORM_FILTERS,
    CONTENT_LAB_PLATFORM_LABELS,
    CONTENT_LAB_POST_FORMAT_LABELS,
    type ContentLabPlatformFilter,
} from '../../../_constants';
import { PlatformIcon } from '../../../_components/PlatformIcon';
import { SegmentedSwitch } from '../../../_components/SegmentedSwitch';
import { PostCard } from '../../_components/PostCard';
import { SmartBox } from '../../_components/SmartBox';
import { TOPIC_BOARD_TEMPLATE, POST_BOARD_TEMPLATE } from '../../_hooks/use-post-actions';
import { compactNumber, creatorLabel } from '../../_utils/format';
import { EXPLORE_SORTS, sortPosts, type ExploreResult, type ExploreSort, type UseExplorePageReturn } from '../_hooks/use-explore-page';

/** Grids per platform: YouTube 16:9, Instagram a denser 9:16, like each platform's own. `lane` = half the width, beside the other. */
const GRID: Record<ContentLabPlatform, { full: string; lane: string }> = {
    youtube: { full: 'grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4', lane: 'grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2' },
    instagram: {
        full: 'grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6',
        lane: 'grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3',
    },
};

const countryName = (code: string) => CONTENT_LAB_COUNTRIES.find((c) => c.code === code)?.label ?? code;

const postsOn = (posts: CONTENT_LAB_POST[], platform: ContentLabPlatform) => posts.filter((post) => post.platform === platform);

/** Both logos, overlapped, for "All". */
function BothLogos() {
    return (
        <span className="flex -space-x-1">
            <PlatformIcon platform="youtube" className="size-4" />
            <PlatformIcon platform="instagram" className="size-4" />
        </span>
    );
}

function Toolbar() {
    const { platform, setPlatform, country, setCountry, sort, setSort, query, busy, startBoard, state } = usePage<UseExplorePageReturn>();
    const posts = state.status === 'done' ? state.result.posts : null;
    const options = CONTENT_LAB_PLATFORM_FILTERS.map((filter) => ({
        value: filter.value as ContentLabPlatformFilter,
        label: filter.label,
        icon: filter.value === 'both' ? <BothLogos /> : <PlatformIcon platform={filter.value} />,
        count: posts && filter.value !== 'both' && platform === 'both' ? postsOn(posts, filter.value).length : undefined,
    }));

    return (
        <div className="bg-background/90 supports-[backdrop-filter]:bg-background/75 sticky top-0 z-20 -mx-1 flex flex-wrap items-center gap-2 border-b px-1 py-2 backdrop-blur sm:-mx-2 sm:px-2">
            <SegmentedSwitch options={options} value={platform} onValueChange={setPlatform} aria-label="Platforms" />
            <Select value={country} onValueChange={setCountry}>
                <SelectTrigger aria-label="Country" className="w-auto min-w-36 gap-1.5">
                    <GlobeIcon className="text-muted-foreground size-4" />
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    {CONTENT_LAB_COUNTRIES.map((c) => (
                        <SelectItem key={c.code} value={c.code}>
                            {c.label}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
            <Select value={sort} onValueChange={(value) => setSort(value as ExploreSort)}>
                <SelectTrigger aria-label="Sort by" className="w-auto min-w-36 gap-1.5">
                    <ArrowDownWideNarrowIcon className="text-muted-foreground size-4" />
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    {EXPLORE_SORTS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                            {option.label}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
            {query ? (
                <Button size="sm" className="h-9 sm:ml-auto" disabled={!!busy} onClick={() => startBoard(TOPIC_BOARD_TEMPLATE, { query })}>
                    {busy === `board:${query}` ? <Loader2Icon className="animate-spin" /> : <LayoutDashboardIcon />} Use on a board
                </Button>
            ) : null}
        </div>
    );
}

function SkeletonCards({ platform, count, lane }: { platform: ContentLabPlatform; count: number; lane?: boolean }) {
    return (
        <div className={lane ? GRID[platform].lane : GRID[platform].full}>
            {Array.from({ length: count }, (_, i) => (
                <div key={i} className="flex flex-col gap-2 overflow-hidden rounded-xl border">
                    <Skeleton className={cn('w-full rounded-none', platform === 'instagram' ? 'aspect-[9/16]' : 'aspect-video')} />
                    <div className="flex flex-col gap-2 p-3">
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-3 w-2/3" />
                    </div>
                </div>
            ))}
        </div>
    );
}

function LoadingResults() {
    const { platform } = usePage<UseExplorePageReturn>();
    const platforms = platform === 'both' ? CONTENT_LAB_PLATFORMS : [platform];
    return (
        <div aria-busy="true" className="flex flex-col gap-4">
            <div className="bg-muted/50 flex items-start gap-3 rounded-xl border p-4">
                <Loader2Icon className="text-primary mt-0.5 size-5 shrink-0 animate-spin" />
                <div>
                    <p className="font-medium">Finding posts that are doing better than usual…</p>
                    <p className="text-muted-foreground text-sm">
                        This can take up to a minute: each post is compared with its creator&apos;s other recent posts.
                    </p>
                </div>
            </div>
            <div className={cn('grid gap-6', platforms.length > 1 && 'lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]')}>
                {platforms.map((p) => (
                    <SkeletonCards key={p} platform={p} count={p === 'instagram' ? 6 : 4} lane={platforms.length > 1} />
                ))}
            </div>
        </div>
    );
}

function PlatformErrors({ errors }: { errors: ExploreResult['errors'] }) {
    const entries = Object.entries(errors) as [ContentLabPlatform, string][];
    if (!entries.length) return null;
    return (
        <div className="flex flex-col gap-2">
            {entries.map(([platform, message]) => (
                <Alert key={platform} variant="destructive">
                    <AlertTriangleIcon className="size-4" />
                    <AlertTitle>{CONTENT_LAB_PLATFORM_LABELS[platform]} results did not load</AlertTitle>
                    <AlertDescription>{message}</AlertDescription>
                </Alert>
            ))}
        </div>
    );
}

/** "We checked 48 posts. 17 got at least twice …. Reels did best on Instagram." */
function summaryLine(niche: NonNullable<ExploreResult['niche']>): string {
    const best = (Object.entries(niche.bestFormat) as [ContentLabPlatform, keyof typeof CONTENT_LAB_POST_FORMAT_LABELS][]).map(
        ([platform, format]) => `${CONTENT_LAB_POST_FORMAT_LABELS[format].toLowerCase()}s on ${CONTENT_LAB_PLATFORM_LABELS[platform]}`,
    );
    const times = CONTENT_LAB_OUTLIER_MULTIPLE === 2 ? 'twice' : `${CONTENT_LAB_OUTLIER_MULTIPLE} times`;
    return [
        `We checked ${niche.postCount} posts.`,
        `${niche.outlierCount} got at least ${times} the views their creator usually gets.`,
        best.length ? `Best right now: ${best.join(' and ')}.` : '',
    ]
        .filter(Boolean)
        .join(' ');
}

/** The patterns the winning posts share, in a few plain lines. */
function Takeaways({ result }: { result: ExploreResult }) {
    const { takeaways, niche } = result;
    if (!takeaways.length && !niche) return null;
    return (
        <section aria-labelledby="explore-glance" className="bg-muted/40 flex flex-col gap-3 rounded-xl border p-4">
            <div className="flex flex-col gap-0.5">
                <h2 id="explore-glance" className="flex items-center gap-2 font-semibold">
                    <SparklesIcon className="text-primary size-4" /> What the top posts have in common
                </h2>
                {niche ? <p className="text-muted-foreground text-sm">{summaryLine(niche)}</p> : null}
            </div>
            {takeaways.length ? (
                <ul className="grid gap-2 md:grid-cols-3">
                    {takeaways.map((takeaway) => (
                        <li key={takeaway.headline + takeaway.detail} className="bg-card flex items-start gap-2 rounded-lg border p-3 text-sm">
                            <CheckCircle2Icon className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                            {/* The headline to scan; the full sentence in two lines at most (all of it on hover). */}
                            <span className="flex min-w-0 flex-col gap-0.5">
                                <b className="font-semibold">{takeaway.headline}</b>
                                <span className="text-muted-foreground line-clamp-2" title={takeaway.detail}>
                                    {takeaway.detail}
                                </span>
                            </span>
                        </li>
                    ))}
                </ul>
            ) : null}
        </section>
    );
}

function CreatorSummary({ result }: { result: ExploreResult }) {
    if (!result.creators.length) return null;
    return (
        <div className="grid gap-3 sm:grid-cols-2">
            {result.creators.map(({ creator, usualViews, posts }) => (
                <Card key={`${creator.platform}:${creator.id}`} className="flex-row items-center gap-3 px-4">
                    {creator.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={creator.avatarUrl} alt="" referrerPolicy="no-referrer" className="size-12 shrink-0 rounded-full object-cover" />
                    ) : (
                        <PlatformIcon platform={creator.platform} className="size-10" />
                    )}
                    <div className="flex min-w-0 flex-col gap-0.5">
                        <p className="flex items-center gap-1.5 font-semibold break-words">
                            <PlatformIcon platform={creator.platform} className="size-4" />
                            {creator.name ?? creatorLabel(creator)}
                        </p>
                        <p className="text-muted-foreground text-sm">
                            {creatorLabel(creator)} · {compactNumber(creator.followers)} followers
                        </p>
                        <p className="text-muted-foreground text-sm">
                            A normal post gets about {compactNumber(usualViews)} views · {posts.length} recent posts
                        </p>
                    </div>
                </Card>
            ))}
        </div>
    );
}

/** One platform's posts, with its logo heading; beside the other platform's on wide screens. */
function Lane({ platform, posts, lane }: { platform: ContentLabPlatform; posts: CONTENT_LAB_POST[]; lane: boolean }) {
    const { busy, watchCreator, startBoard, setPlatform } = usePage<UseExplorePageReturn>();
    return (
        <section aria-label={`From ${CONTENT_LAB_PLATFORM_LABELS[platform]}`} className="flex min-w-0 flex-col gap-3">
            <div className="flex items-center gap-2">
                <PlatformIcon platform={platform} className="size-5" />
                <h3 className="font-semibold">Working on {CONTENT_LAB_PLATFORM_LABELS[platform]}</h3>
                <span className="text-muted-foreground text-sm">· {posts.length}</span>
                {lane ? (
                    <Button variant="link" size="sm" className="ml-auto h-auto px-0" onClick={() => setPlatform(platform)}>
                        Only {CONTENT_LAB_PLATFORM_LABELS[platform]}
                    </Button>
                ) : null}
            </div>
            {posts.length ? (
                <div className={lane ? GRID[platform].lane : GRID[platform].full}>
                    {posts.map((post) => (
                        <PostCard
                            key={post.id}
                            post={post}
                            busy={busy}
                            onWatch={() => watchCreator(post.creator)}
                            onBoard={() => startBoard(POST_BOARD_TEMPLATE, { url: post.url })}
                        />
                    ))}
                </div>
            ) : (
                <p className="text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm">
                    Nothing from {CONTENT_LAB_PLATFORM_LABELS[platform]} yet.
                </p>
            )}
        </section>
    );
}

/** Loads the next page when the bottom of the list scrolls into view; a button too, for keyboards and failed loads. */
function MorePosts() {
    const { hasMore, more, loadMore, platform } = usePage<UseExplorePageReturn>();
    const sentinel = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const node = sentinel.current;
        if (!node || !hasMore || more.status !== 'idle') return;
        const observer = new IntersectionObserver((entries) => entries.some((entry) => entry.isIntersecting) && loadMore(), {
            rootMargin: '600px 0px',
        });
        observer.observe(node);
        return () => observer.disconnect();
    }, [hasMore, more.status, loadMore]);

    if (!hasMore) {
        return <p className="text-muted-foreground py-6 text-center text-sm">That&apos;s everything we found for this search.</p>;
    }
    return (
        <div ref={sentinel} className="flex flex-col items-center gap-3 py-4">
            {more.status === 'loading' ? (
                <div aria-busy="true" className="flex w-full flex-col gap-3">
                    <p className="text-muted-foreground flex items-center justify-center gap-2 text-sm">
                        <Loader2Icon className="size-4 animate-spin" /> Loading more posts…
                    </p>
                    <SkeletonCards platform={platform === 'instagram' ? 'instagram' : 'youtube'} count={platform === 'instagram' ? 6 : 3} />
                </div>
            ) : more.status === 'error' ? (
                <Alert variant="destructive" className="max-w-md">
                    <AlertTriangleIcon className="size-4" />
                    <AlertTitle>More posts did not load</AlertTitle>
                    <AlertDescription className="flex flex-col items-start gap-2">
                        {more.error}
                        <Button variant="outline" size="sm" onClick={loadMore}>
                            <RotateCwIcon /> Try again
                        </Button>
                    </AlertDescription>
                </Alert>
            ) : (
                <>
                    {more.status === 'stalled' ? (
                        <p className="text-muted-foreground text-sm">Nothing new came back that time. Try again for more.</p>
                    ) : null}
                    <Button variant="outline" onClick={loadMore}>
                        Show more posts
                    </Button>
                </>
            )}
        </div>
    );
}

function Results() {
    const { state, query, retry, platform, sort } = usePage<UseExplorePageReturn>();
    const [phoneLane, setPhoneLane] = useState<ContentLabPlatform>('youtube');
    if (state.status === 'loading') return <LoadingResults />;
    if (state.status === 'error') {
        return (
            <Alert variant="destructive">
                <AlertTriangleIcon className="size-4" />
                <AlertTitle>Results did not load</AlertTitle>
                <AlertDescription className="flex flex-col items-start gap-2">
                    {state.error}
                    <Button variant="outline" size="sm" onClick={retry}>
                        <RotateCwIcon /> Try again
                    </Button>
                </AlertDescription>
            </Alert>
        );
    }
    if (state.status !== 'done') return null;
    const { result } = state;
    const posts = sortPosts(result.posts, sort);
    const shown = (platform === 'both' ? CONTENT_LAB_PLATFORMS : [platform]).filter((p) => postsOn(posts, p).length || platform !== 'both');
    const lanes = shown.length > 1;
    const visibleLane = shown.includes(phoneLane) ? phoneLane : shown[0];

    return (
        <div className="flex flex-col gap-6">
            <PlatformErrors errors={result.errors} />
            <CreatorSummary result={result} />
            <Takeaways result={result} />
            {posts.length ? (
                <section aria-labelledby="explore-posts" className="flex flex-col gap-3">
                    <h2 id="explore-posts" className="sr-only">
                        The posts
                    </h2>
                    {lanes ? (
                        // Phones and tablets show one platform at a time; wide screens put them side by side.
                        <SegmentedSwitch
                            className="lg:hidden"
                            aria-label="Show posts from"
                            value={visibleLane}
                            onValueChange={setPhoneLane}
                            options={shown.map((p) => ({
                                value: p,
                                label: CONTENT_LAB_PLATFORM_LABELS[p],
                                icon: <PlatformIcon platform={p} />,
                                count: postsOn(posts, p).length,
                            }))}
                        />
                    ) : null}
                    <div className={cn('grid gap-8', lanes && 'lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]')}>
                        {shown.map((p) => (
                            <div key={p} className={cn('min-w-0', lanes && p !== visibleLane && 'hidden lg:block')}>
                                <Lane platform={p} posts={postsOn(posts, p)} lane={lanes} />
                            </div>
                        ))}
                    </div>
                    {query ? <MorePosts /> : null}
                </section>
            ) : (
                <EmptyState
                    icon={<SearchXIcon />}
                    title={query ? `No posts found for "${query}"` : 'No posts found for this creator'}
                    description="Try a broader topic, another country or the other platform."
                />
            )}
        </div>
    );
}

/** What's working: smart box, a sticky filter bar, what the winners share, then each platform's posts with more on scroll. */
export function ExploreView() {
    const { query, creator, unsupported, country } = usePage<UseExplorePageReturn>();
    const searching = !!(query || creator);
    const title = query ? `What's working in "${query}"` : creator ? `Standouts from @${creator.handle}` : "What's working";
    const subtitle = creator
        ? 'Their recent posts. The ones at the top got far more views than this creator usually gets.'
        : `Posts in ${countryName(country)} that got far more views than their creator usually gets: a sign the idea itself works.`;

    return (
        <div className="flex w-full flex-col gap-4 p-1 sm:p-2">
            <header className="flex flex-col gap-1">
                <h1 className="text-2xl font-bold tracking-tight break-words text-balance sm:text-3xl">{title}</h1>
                {searching ? <p className="text-muted-foreground">{subtitle}</p> : null}
            </header>
            <SmartBox size="default" defaultValue={query ?? (creator ? `@${creator.handle}` : '')} />
            {searching ? (
                <>
                    <Toolbar />
                    <Results />
                </>
            ) : (
                <EmptyState
                    icon={unsupported ? <SearchXIcon /> : <TrendingUpIcon />}
                    title={unsupported ? 'That link cannot be broken down' : 'Search a topic, link or @creator'}
                    description={
                        unsupported
                            ? CONTENT_LAB_ERROR_MESSAGES.UNSUPPORTED_URL
                            : 'See the posts doing far better than usual for their creator, on YouTube and Instagram.'
                    }
                />
            )}
        </div>
    );
}
