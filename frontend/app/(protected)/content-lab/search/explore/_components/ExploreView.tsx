'use client';

import { AlertTriangleIcon, LayoutDashboardIcon, Loader2Icon, RotateCwIcon, SearchXIcon, TrendingUpIcon } from 'lucide-react';
import { CONTENT_LAB_ERROR_MESSAGES, CONTENT_LAB_OUTLIER_MULTIPLE } from '@aixellabs/backend/content-lab/constants';
import type { ContentLabPlatform } from '@aixellabs/backend/content-lab/types';
import { EmptyState } from '@/components/common/EmptyState';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { usePage } from '@/contexts/PageStore';
import {
    CONTENT_LAB_COUNTRIES,
    CONTENT_LAB_PLATFORM_FILTERS,
    CONTENT_LAB_PLATFORM_LABELS,
    CONTENT_LAB_POST_FORMAT_LABELS,
    type ContentLabPlatformFilter,
} from '../../../_constants';
import { PostCard } from '../../_components/PostCard';
import { SmartBox } from '../../_components/SmartBox';
import { TOPIC_BOARD_TEMPLATE, POST_BOARD_TEMPLATE } from '../../_hooks/use-post-actions';
import { compactNumber, creatorLabel, formatMultiple } from '../../_utils/format';
import type { ExploreResult, UseExplorePageReturn } from '../_hooks/use-explore-page';

const countryName = (code: string) => CONTENT_LAB_COUNTRIES.find((c) => c.code === code)?.label ?? code;

function Toolbar() {
    const { platform, setPlatform, country, setCountry, query, busy, startBoard } = usePage<UseExplorePageReturn>();
    return (
        <div className="flex flex-wrap items-center gap-2">
            <ToggleGroup
                type="single"
                variant="outline"
                value={platform}
                onValueChange={(value) => value && setPlatform(value as ContentLabPlatformFilter)}
                aria-label="Platforms"
                className="max-w-full"
            >
                {CONTENT_LAB_PLATFORM_FILTERS.map((filter) => (
                    <ToggleGroupItem
                        key={filter.value}
                        value={filter.value}
                        className="data-[state=on]:bg-primary data-[state=on]:text-primary-foreground px-3"
                    >
                        {filter.label}
                    </ToggleGroupItem>
                ))}
            </ToggleGroup>
            <Select value={country} onValueChange={setCountry}>
                <SelectTrigger aria-label="Country" className="w-44">
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
            {query ? (
                <Button
                    variant="outline"
                    className="sm:ml-auto"
                    disabled={!!busy}
                    onClick={() => startBoard(TOPIC_BOARD_TEMPLATE, { query })}
                >
                    {busy === `board:${query}` ? <Loader2Icon className="animate-spin" /> : <LayoutDashboardIcon />} Use on a board
                </Button>
            ) : null}
        </div>
    );
}

function LoadingResults({ withTakeaways }: { withTakeaways: boolean }) {
    return (
        <div aria-busy="true" className="flex flex-col gap-6">
            <p className="text-muted-foreground flex items-center gap-2 text-sm">
                <Loader2Icon className="size-4 animate-spin" /> Finding posts that beat their usual…
            </p>
            {withTakeaways ? (
                <div className="grid gap-3 sm:grid-cols-3">
                    {[0, 1, 2].map((i) => (
                        <Skeleton key={i} className="h-24" />
                    ))}
                </div>
            ) : null}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {[0, 1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="flex flex-col gap-2 rounded-xl border p-0">
                        <Skeleton className="aspect-video w-full rounded-b-none" />
                        <div className="flex flex-col gap-2 p-4">
                            <Skeleton className="h-3 w-24" />
                            <Skeleton className="h-8 w-28" />
                            <Skeleton className="h-4 w-full" />
                            <Skeleton className="h-4 w-2/3" />
                        </div>
                    </div>
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

function Takeaways({ result }: { result: ExploreResult }) {
    const { takeaways, niche } = result;
    const bestFormats = niche
        ? (Object.entries(niche.bestFormat) as [ContentLabPlatform, keyof typeof CONTENT_LAB_POST_FORMAT_LABELS][])
              .map(([platform, format]) => `${CONTENT_LAB_POST_FORMAT_LABELS[format]}s on ${CONTENT_LAB_PLATFORM_LABELS[platform]}`)
              .join(', ')
        : '';
    return (
        <>
            {takeaways.length ? (
                <section aria-labelledby="explore-glance" className="flex flex-col gap-3">
                    <h2 id="explore-glance" className="text-lg font-semibold">
                        In one glance
                    </h2>
                    <div className="grid gap-3 sm:grid-cols-3">
                        {takeaways.map((takeaway) => (
                            <Card key={takeaway.headline + takeaway.detail} className="gap-1 px-4">
                                <p className="text-primary text-xl font-bold">{takeaway.headline}</p>
                                <p className="text-sm">{takeaway.detail}</p>
                            </Card>
                        ))}
                    </div>
                </section>
            ) : null}
            {niche ? (
                <section aria-label="Niche snapshot" className="bg-muted/50 grid grid-cols-2 gap-3 rounded-xl border p-4 sm:grid-cols-4">
                    <Stat label="Posts looked at" value={String(niche.postCount)} />
                    <Stat label={`Beat their usual ${CONTENT_LAB_OUTLIER_MULTIPLE}x+`} value={String(niche.outlierCount)} />
                    <Stat label="Median multiple" value={niche.medianMultiple != null ? formatMultiple(niche.medianMultiple) : '–'} />
                    <Stat label="Best format" value={bestFormats || '–'} />
                </section>
            ) : null}
        </>
    );
}

function Stat({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex min-w-0 flex-col">
            <span className="text-muted-foreground text-xs">{label}</span>
            <span className="font-semibold break-words">{value}</span>
        </div>
    );
}

function CreatorSummary({ result }: { result: ExploreResult }) {
    if (!result.creators.length) return null;
    return (
        <div className="grid gap-3 sm:grid-cols-2">
            {result.creators.map(({ creator, usualViews, posts }) => (
                <Card key={`${creator.platform}:${creator.id}`} className="gap-1 px-4">
                    <span className="text-muted-foreground text-xs font-medium uppercase">{CONTENT_LAB_PLATFORM_LABELS[creator.platform]}</span>
                    <p className="font-semibold break-words">
                        {creator.name ?? creatorLabel(creator)} <span className="text-muted-foreground font-normal">{creatorLabel(creator)}</span>
                    </p>
                    <p className="text-muted-foreground text-sm">
                        {compactNumber(creator.followers)} followers · usually {compactNumber(usualViews)} views · {posts.length} recent posts
                    </p>
                </Card>
            ))}
        </div>
    );
}

function Results() {
    const { state, query, creator, retry, busy, watchCreator, startBoard } = usePage<UseExplorePageReturn>();
    if (state.status === 'loading') return <LoadingResults withTakeaways={!creator} />;
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

    return (
        <div className="flex flex-col gap-6">
            <PlatformErrors errors={result.errors} />
            <CreatorSummary result={result} />
            <Takeaways result={result} />
            {result.posts.length ? (
                <section aria-labelledby="explore-posts" className="flex flex-col gap-3">
                    <h2 id="explore-posts" className="text-lg font-semibold">
                        The posts
                    </h2>
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {result.posts.map((post) => (
                            <PostCard
                                key={post.id}
                                post={post}
                                busy={busy}
                                onWatch={() => watchCreator(post.creator)}
                                onBoard={() => startBoard(POST_BOARD_TEMPLATE, { url: post.url })}
                            />
                        ))}
                    </div>
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

/** What's working: smart box, platform + country, takeaways, niche snapshot and the ranked posts. */
export function ExploreView() {
    const { query, creator, unsupported, country } = usePage<UseExplorePageReturn>();
    const searching = !!(query || creator);
    const title = query ? `What's working in "${query}"` : creator ? `Standouts from @${creator.handle}` : "What's working";
    const subtitle = creator
        ? "Their recent posts, ranked by how far each one beat this creator's usual views."
        : `Posts in ${countryName(country)}, ranked by how far they beat their own creator's usual views.`;

    return (
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-2">
            <header className="flex flex-col gap-1">
                <p className="text-primary text-xs font-medium tracking-wider uppercase">1 · Find</p>
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
                            : "Posts ranked by how far they beat their own creator's usual views, on YouTube and Instagram."
                    }
                />
            )}
        </div>
    );
}
