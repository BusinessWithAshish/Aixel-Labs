'use client';

import { Fragment, type ReactNode, useEffect, useRef, useState } from 'react';
import {
    AlertTriangleIcon,
    ArrowDownWideNarrowIcon,
    ArrowRightIcon,
    CheckCircle2Icon,
    ChevronLeftIcon,
    ChevronRightIcon,
    EyeIcon,
    FlameIcon,
    GlobeIcon,
    Loader2Icon,
    PenLineIcon,
    RocketIcon,
    RotateCwIcon,
    SearchXIcon,
    SlidersHorizontalIcon,
    SparklesIcon,
    TrendingUpIcon,
    TrophyIcon,
} from 'lucide-react';
import { CONTENT_LAB_ERROR_MESSAGES, CONTENT_LAB_OUTLIER_MULTIPLE, CONTENT_LAB_PLATFORMS } from '@aixellabs/backend/content-lab/constants';
import type { CONTENT_LAB_POST, ContentLabPlatform } from '@aixellabs/backend/content-lab/types';
import { EmptyState } from '@/components/common/EmptyState';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { usePage } from '@/contexts/PageStore';
import { cn } from '@/lib/utils';
import { CONTENT_LAB_COUNTRIES, CONTENT_LAB_PLATFORM_LABELS, CONTENT_LAB_POST_FORMAT_LABELS } from '../../../_constants';
import { PlatformIcon } from '../../../_components/PlatformIcon';
import { PostCard } from '../../_components/PostCard';
import { KEYWORD_LABELS, RelatedSearches, ScoreRing, TopicStrength } from '../../_components/KeywordScore';
import { RecentSearches } from '../../_components/RecentSearches';
import { SmartBox } from '../../_components/SmartBox';
import { TOPIC_BOARD_TEMPLATE, POST_BOARD_TEMPLATE } from '../../_hooks/use-post-actions';
import { compactNumber, creatorLabel, formatMultiple } from '../../_utils/format';
import { platformsOf } from '../../_utils/smart-box';
import { EXPLORE_SORTS, sortPosts, type ExploreResult, type ExploreSort, type UseExplorePageReturn } from '../_hooks/use-explore-page';

/** One platform's posts in the results column: YouTube 16:9 in 2-3 columns, Instagram a denser 9:16 grid. */
const GRID: Record<ContentLabPlatform, string> = {
    youtube: 'grid gap-4 sm:grid-cols-2 xl:grid-cols-3',
    instagram: 'grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5',
};

/** Mixed results: this many videos (two full rows at 2 or 3 columns), then a row of reels, then again. */
const VIDEOS_PER_BLOCK = 6;
const REELS_PER_SHELF = 6;

const countryName = (code: string) => CONTENT_LAB_COUNTRIES.find((c) => c.code === code)?.label ?? code;

const postsOn = (posts: CONTENT_LAB_POST[], platform: ContentLabPlatform) => posts.filter((post) => post.platform === platform);

type FeedBlock = { kind: 'videos' | 'shelf' | 'reels'; posts: CONTENT_LAB_POST[] };

/**
 * Both platforms in one list, like YouTube's own search with its Shorts shelves: blocks of videos with a row of reels
 * between them, so neither platform leaves a gap beside the other. Leftover reels close the list as a grid. Positions
 * only grow as more pages load, so nothing already seen jumps.
 */
function mixFeed(videos: CONTENT_LAB_POST[], reels: CONTENT_LAB_POST[]): FeedBlock[] {
    const blocks: FeedBlock[] = [];
    for (let i = 0; i * VIDEOS_PER_BLOCK < videos.length; i++) {
        blocks.push({ kind: 'videos', posts: videos.slice(i * VIDEOS_PER_BLOCK, (i + 1) * VIDEOS_PER_BLOCK) });
        const shelf = reels.slice(i * REELS_PER_SHELF, (i + 1) * REELS_PER_SHELF);
        if (shelf.length) blocks.push({ kind: 'shelf', posts: shelf });
    }
    const left = reels.slice(Math.ceil(videos.length / VIDEOS_PER_BLOCK) * REELS_PER_SHELF);
    if (left.length) blocks.push({ kind: 'reels', posts: left });
    return blocks;
}

function SkeletonCards({ platform, count }: { platform: ContentLabPlatform; count: number }) {
    return (
        <div className={GRID[platform]}>
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

function LoadingBanner() {
    return (
        <div aria-busy="true" className="bg-muted/50 flex items-start gap-3 rounded-xl border p-4">
            <Loader2Icon className="text-primary mt-0.5 size-5 shrink-0 animate-spin" />
            <div>
                <p className="font-medium">Finding posts that are doing better than usual…</p>
                <p className="text-muted-foreground text-sm">
                    This can take up to a minute: each post is compared with its creator&apos;s other recent posts.
                </p>
            </div>
        </div>
    );
}

function LoadingPosts() {
    const { platform } = usePage<UseExplorePageReturn>();
    return (
        <div aria-busy="true" className="flex flex-col gap-6">
            <LoadingBanner />
            {platformsOf(platform).map((p) => (
                <SkeletonCards key={p} platform={p} count={p === 'instagram' ? 5 : 3} />
            ))}
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

const TIMES = CONTENT_LAB_OUTLIER_MULTIPLE === 2 ? 'twice' : `${CONTENT_LAB_OUTLIER_MULTIPLE} times`;

function StatTile({ label, value, hint, icon }: { label: string; value: ReactNode; hint?: ReactNode; icon?: ReactNode }) {
    return (
        <div className="bg-muted/40 flex min-w-0 flex-col gap-0.5 rounded-lg px-3 py-2.5">
            <p className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
                {icon}
                {label}
            </p>
            <p className="truncate text-lg leading-tight font-bold tabular-nums">{value}</p>
            {hint ? <p className="text-muted-foreground truncate text-xs">{hint}</p> : null}
        </div>
    );
}

/** The numbers at a glance: how many took off, the biggest jump, the most views, the format doing best per platform. */
function StatTiles({ result }: { result: ExploreResult }) {
    const { niche, posts } = result;
    if (!niche) return null;
    const biggest = posts.reduce<CONTENT_LAB_POST | null>((top, p) => ((p.multiple ?? 0) > (top?.multiple ?? 0) ? p : top), null);
    const mostSeen = posts.reduce<CONTENT_LAB_POST | null>((top, p) => ((p.views ?? 0) > (top?.views ?? 0) ? p : top), null);
    const best = Object.entries(niche.bestFormat) as [ContentLabPlatform, keyof typeof CONTENT_LAB_POST_FORMAT_LABELS][];
    return (
        <div className="grid grid-cols-2 gap-2" data-testid="explore-stats">
            <StatTile
                label="Took off"
                icon={<RocketIcon className="size-3.5" />}
                value={`${niche.outlierCount} of ${niche.postCount}`}
                hint={`${TIMES} their usual or more`}
            />
            {biggest?.multiple ? (
                <StatTile
                    label="Biggest jump"
                    icon={<FlameIcon className="size-3.5" />}
                    value={`${formatMultiple(biggest.multiple)} usual`}
                    hint={creatorLabel(biggest.creator)}
                />
            ) : null}
            {mostSeen?.views ? (
                <StatTile label="Most views" icon={<EyeIcon className="size-3.5" />} value={compactNumber(mostSeen.views)} hint={creatorLabel(mostSeen.creator)} />
            ) : null}
            {best.length ? (
                <StatTile
                    label="Works best"
                    icon={<TrophyIcon className="size-3.5" />}
                    value={
                        <span className="flex flex-wrap items-center gap-x-2 text-base">
                            {best.map(([platform, format]) => (
                                <span key={platform} className="flex items-center gap-1">
                                    <PlatformIcon platform={platform} className="size-4" />
                                    {CONTENT_LAB_POST_FORMAT_LABELS[format]}s
                                </span>
                            ))}
                        </span>
                    }
                    hint="right now, by format"
                />
            ) : null}
        </div>
    );
}

/** A titled part of the insights panel. */
function PanelSection({ title, icon, children, id }: { title: string; icon: ReactNode; children: ReactNode; id: string }) {
    return (
        <section aria-labelledby={id} className="flex min-w-0 flex-col gap-3 p-4">
            <h2 id={id} className="flex items-center gap-2 text-sm font-semibold">
                {icon}
                {title}
            </h2>
            {children}
        </section>
    );
}

/** The numbers, then the patterns the winning posts share in a few plain lines. */
function Glance({ result }: { result: ExploreResult }) {
    const { niche } = result;
    // "69 of 85 took off" is already the first tile.
    const takeaways = niche ? result.takeaways.filter((t) => !t.headline.startsWith(`${niche.outlierCount} of ${niche.postCount}`)) : result.takeaways;
    if (!takeaways.length && !niche) return null;
    return (
        <PanelSection id="explore-glance" title="What the top posts have in common" icon={<SparklesIcon className="text-primary size-4" />}>
            <StatTiles result={result} />
            {takeaways.length ? (
                <ul className="flex flex-col gap-2.5">
                    {takeaways.map((takeaway) => (
                        <li key={takeaway.headline + takeaway.detail} className="flex items-start gap-2 text-sm">
                            <CheckCircle2Icon className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                            <span className="flex min-w-0 flex-col gap-0.5">
                                <b className="font-semibold">{takeaway.headline}</b>
                                <span className="text-muted-foreground">{takeaway.detail}</span>
                            </span>
                        </li>
                    ))}
                </ul>
            ) : null}
        </PanelSection>
    );
}

function GlanceSkeleton() {
    return (
        <div className="flex flex-col gap-3 p-4" aria-busy="true">
            <Skeleton className="h-4 w-2/3" />
            <div className="grid grid-cols-2 gap-2">
                {Array.from({ length: 4 }, (_, i) => (
                    <Skeleton key={i} className="h-16" />
                ))}
            </div>
        </div>
    );
}

function CreatorSummary({ result }: { result: ExploreResult }) {
    if (!result.creators.length) return null;
    return (
        <div className="flex flex-col divide-y">
            {result.creators.map(({ creator, usualViews, posts }) => (
                <div key={`${creator.platform}:${creator.id}`} className="flex items-center gap-3 p-4">
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
                </div>
            ))}
        </div>
    );
}

/** What "Write my version" does, in plain words, with the button that starts it. */
function WriteMyVersion() {
    const { query, busy, startBoard } = usePage<UseExplorePageReturn>();
    if (!query) return null;
    return (
        <PanelSection id="write-my-version" title="Write my version" icon={<PenLineIcon className="text-primary size-4" />}>
            <p className="text-muted-foreground text-sm">
                Opens a board that takes these top posts, pulls out the hooks that worked and drafts a reel script in your tone, on your
                own AI key. You can edit every step.
            </p>
            <Button className="self-start" disabled={!!busy} onClick={() => startBoard(TOPIC_BOARD_TEMPLATE, { query })}>
                {busy === `board:${query}` ? <Loader2Icon className="animate-spin" /> : <PenLineIcon />}
                Write my version
                <ArrowRightIcon />
            </Button>
        </PanelSection>
    );
}

/** Everything about the search beside the posts: how strong the topic is, the numbers, what the winners share, what to do next. */
function Insights() {
    const { state, query, country, platform, keyword } = usePage<UseExplorePageReturn>();
    return (
        <div className="flex min-w-0 flex-col divide-y">
            {query ? <TopicStrength keyword={keyword} platform={platform} className="p-4" /> : null}
            {state.status === 'done' ? (
                <>
                    <CreatorSummary result={state.result} />
                    <Glance result={state.result} />
                </>
            ) : state.status === 'loading' ? (
                <GlanceSkeleton />
            ) : null}
            <WriteMyVersion />
            {query ? <RelatedSearches keyword={keyword} query={query} country={country} platform={platform} className="p-4" /> : null}
        </div>
    );
}

/**
 * Phones and tablets: the insights don't fit beside the posts, so a short summary sits above them (the ring, each
 * platform's score, how many took off) and opens the whole panel in a sheet from the bottom.
 */
function InsightsSummary() {
    const { state, query, keyword } = usePage<UseExplorePageReturn>();
    const [open, setOpen] = useState(false);
    const data = keyword.data;
    const niche = state.status === 'done' ? state.result.niche : null;
    return (
        <div className="bg-card flex items-center gap-3 rounded-xl border p-3 lg:hidden" data-testid="insights-summary">
            {query ? <ScoreRing data={data} size={48} /> : null}
            <div className="flex min-w-0 flex-1 flex-col gap-1">
                {query ? (
                    <p className="truncate text-sm font-semibold">{data ? `${KEYWORD_LABELS[data.label]} topic` : 'Scoring this topic…'}</p>
                ) : (
                    <p className="text-sm font-semibold">This creator at a glance</p>
                )}
                <p className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
                    {data?.platforms.map((part) => (
                        <span key={part.platform} className="flex items-center gap-1">
                            <PlatformIcon platform={part.platform} className="size-3.5" />
                            <b className="text-foreground tabular-nums">{part.score}</b>
                        </span>
                    ))}
                    {niche ? (
                        <span>
                            <b className="text-foreground">
                                {niche.outlierCount} of {niche.postCount}
                            </b>{' '}
                            took off
                        </span>
                    ) : null}
                </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
                <SlidersHorizontalIcon /> Insights
            </Button>
            <Sheet open={open} onOpenChange={setOpen}>
                <SheetContent
                    side="bottom"
                    className="max-h-[85dvh] gap-0 overflow-y-auto rounded-t-2xl p-0"
                    // Focusing the first control would pop the score tooltip open.
                    onOpenAutoFocus={(event) => event.preventDefault()}
                >
                    <SheetHeader className="border-b">
                        <SheetTitle>Insights</SheetTitle>
                        <SheetDescription>{query ? `About "${query}" on the sources you picked` : 'About this creator'}</SheetDescription>
                    </SheetHeader>
                    <Insights />
                </SheetContent>
            </Sheet>
        </div>
    );
}

/** A row of reels between blocks of videos; swipes sideways, with arrows on wider screens. */
function ReelShelf({ posts, card }: { posts: CONTENT_LAB_POST[]; card: (post: CONTENT_LAB_POST) => ReactNode }) {
    const row = useRef<HTMLDivElement>(null);
    const scroll = (direction: 1 | -1) => row.current?.scrollBy({ left: direction * row.current.clientWidth * 0.8, behavior: 'smooth' });
    return (
        <section aria-label="Reels from Instagram" className="bg-muted/40 -mx-1 flex min-w-0 flex-col gap-3 rounded-xl p-3 sm:mx-0" data-testid="reel-shelf">
            <div className="flex items-center gap-2">
                <PlatformIcon platform="instagram" className="size-4" />
                <h3 className="text-sm font-semibold">Reels on Instagram</h3>
                <div className="ml-auto hidden gap-1 sm:flex">
                    <Button variant="outline" size="icon" className="size-7" onClick={() => scroll(-1)} aria-label="Previous reels">
                        <ChevronLeftIcon />
                    </Button>
                    <Button variant="outline" size="icon" className="size-7" onClick={() => scroll(1)} aria-label="More reels">
                        <ChevronRightIcon />
                    </Button>
                </div>
            </div>
            <div ref={row} className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1 [scrollbar-width:thin]">
                {posts.map((post) => (
                    <div key={post.id} className="w-[42%] shrink-0 snap-start sm:w-44">
                        {card(post)}
                    </div>
                ))}
            </div>
        </section>
    );
}

/** Loads the next page when the bottom of the list scrolls into view; a button too, for keyboards and failed loads. */
function MorePosts() {
    const { hasMore, more, loadMore, platform, view } = usePage<UseExplorePageReturn>();
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
    const skeleton = view !== 'all' ? view : platform === 'instagram' ? 'instagram' : 'youtube';
    return (
        <div ref={sentinel} className="flex flex-col items-center gap-3 py-4">
            {more.status === 'loading' ? (
                <div aria-busy="true" className="flex w-full flex-col gap-3">
                    <p className="text-muted-foreground flex items-center justify-center gap-2 text-sm">
                        <Loader2Icon className="size-4 animate-spin" /> Loading more posts…
                    </p>
                    <SkeletonCards platform={skeleton} count={3} />
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

/** All / YouTube / Instagram over the loaded posts (no new search), with counts. */
function ViewChips({ counts }: { counts: Record<ContentLabPlatform, number> }) {
    const { view, setView } = usePage<UseExplorePageReturn>();
    const total = counts.youtube + counts.instagram;
    const options = [
        { value: 'all' as const, label: 'All', count: total, icon: null },
        ...CONTENT_LAB_PLATFORMS.map((p) => ({ value: p, label: CONTENT_LAB_PLATFORM_LABELS[p], count: counts[p], icon: <PlatformIcon platform={p} className="size-4" /> })),
    ];
    return (
        <div role="radiogroup" aria-label="Show posts from" className="flex items-center gap-1.5">
            {options.map((option) => (
                <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={view === option.value}
                    aria-label={`${option.label} (${option.count})`}
                    onClick={() => setView(option.value)}
                    className={cn(
                        'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors',
                        view === option.value ? 'bg-foreground text-background border-foreground' : 'bg-background hover:bg-muted',
                    )}
                >
                    {option.icon}
                    <span className={cn(option.icon && 'hidden sm:inline')}>{option.label}</span>
                    <span className={cn('tabular-nums', view === option.value ? 'opacity-70' : 'text-muted-foreground')}>{option.count}</span>
                </button>
            ))}
        </div>
    );
}

/** Country and order: change what is shown, so they sit with the results rather than in the search bar. */
function ResultFilters() {
    const { country, setCountry, sort, setSort } = usePage<UseExplorePageReturn>();
    return (
        <div className="flex items-center gap-2">
            <Select value={country} onValueChange={setCountry}>
                <SelectTrigger aria-label="Country" size="sm" className="w-auto gap-1.5">
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
                <SelectTrigger aria-label="Sort by" size="sm" className="w-auto gap-1.5">
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
        </div>
    );
}

/** The posts: mixed (videos with reel shelves between) or one platform's grid, then more on scroll. */
function Posts() {
    const { state, query, platform, sort, view, busy, watchCreator, startBoard, retry } = usePage<UseExplorePageReturn>();
    if (state.status === 'loading') return <LoadingPosts />;
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

    const posts = sortPosts(state.result.posts, sort);
    const videos = postsOn(posts, 'youtube');
    const reels = postsOn(posts, 'instagram');
    const counts = { youtube: videos.length, instagram: reels.length };
    const both = platform === 'both' && videos.length > 0 && reels.length > 0;
    const shown: ContentLabPlatform | 'mixed' = both && view === 'all' ? 'mixed' : view !== 'all' ? view : reels.length && !videos.length ? 'instagram' : 'youtube';
    const card = (post: CONTENT_LAB_POST) => (
        <PostCard post={post} busy={busy} onWatch={() => watchCreator(post.creator)} onBoard={() => startBoard(POST_BOARD_TEMPLATE, { url: post.url })} />
    );

    return (
        <section aria-labelledby="explore-posts" className="flex min-w-0 flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 id="explore-posts" className="sr-only">
                    The posts
                </h2>
                {both ? (
                    <ViewChips counts={counts} />
                ) : (
                    <p className="text-muted-foreground text-sm">
                        <b className="text-foreground">{posts.length}</b> posts
                    </p>
                )}
                <ResultFilters />
            </div>
            <PlatformErrors errors={state.result.errors} />
            {!posts.length ? (
                <EmptyState
                    icon={<SearchXIcon />}
                    title={query ? `No posts found for "${query}"` : 'No posts found for this creator'}
                    description="Try a broader topic, another country or another source."
                />
            ) : shown === 'mixed' ? (
                <div className="flex flex-col gap-6" data-testid="mixed-feed">
                    {mixFeed(videos, reels).map((block, i) =>
                        block.kind === 'shelf' ? (
                            <ReelShelf key={`shelf-${i}`} posts={block.posts} card={card} />
                        ) : (
                            <div key={`${block.kind}-${i}`} className={GRID[block.kind === 'videos' ? 'youtube' : 'instagram']}>
                                {block.posts.map((post) => (
                                    <Fragment key={post.id}>{card(post)}</Fragment>
                                ))}
                            </div>
                        ),
                    )}
                </div>
            ) : (
                <section aria-label={`From ${CONTENT_LAB_PLATFORM_LABELS[shown]}`} className={GRID[shown]}>
                    {postsOn(posts, shown).map((post) => (
                        <Fragment key={post.id}>{card(post)}</Fragment>
                    ))}
                </section>
            )}
            {query && posts.length ? <MorePosts /> : null}
        </section>
    );
}

/** The search bar (sources at its start), pinned to the top while the results scroll under it. */
function SearchBar() {
    const { query, creator, country, platform, setPlatform } = usePage<UseExplorePageReturn>();
    return (
        <div data-testid="explore-search-bar" className="bg-background sticky top-0 z-20 -mx-1 border-b px-1 pt-1 pb-3 sm:-mx-2 sm:px-2">
            <SmartBox
                size="default"
                defaultValue={query ?? (creator ? `@${creator.handle}` : '')}
                platform={platform}
                onPlatformChange={setPlatform}
                country={country}
            />
        </div>
    );
}

/**
 * What's working: the pinned search bar, then the posts on the left and, from `lg`, the insights pinned on the right
 * (how strong the topic is per platform, the numbers, what the winners share, "Write my version"), like a video page
 * with its side panel. Below `lg` a short summary above the posts opens the same insights in a sheet.
 */
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
            <SearchBar />
            {searching ? (
                <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(19rem,30%)] lg:items-start">
                    <div className="flex min-w-0 flex-col gap-4">
                        <InsightsSummary />
                        <Posts />
                    </div>
                    <aside
                        aria-label="Insights"
                        className="bg-card sticky top-[4.5rem] hidden max-h-[calc(100dvh-9rem)] min-w-0 overflow-y-auto rounded-xl border lg:block"
                        data-testid="explore-insights"
                    >
                        <Insights />
                    </aside>
                </div>
            ) : (
                <>
                    <EmptyState
                        icon={unsupported ? <SearchXIcon /> : <TrendingUpIcon />}
                        title={unsupported ? 'That link cannot be broken down' : 'Search a topic, link or @creator'}
                        description={
                            unsupported
                                ? CONTENT_LAB_ERROR_MESSAGES.UNSUPPORTED_URL
                                : 'See the posts doing far better than usual for their creator, on the sources you pick.'
                        }
                    />
                    <RecentSearches />
                </>
            )}
        </div>
    );
}
