'use client';

import { formatDistanceToNow } from 'date-fns';
import { Loader2, RefreshCw, Trash2, TrendingUp } from 'lucide-react';
import { CONTENT_LAB_OUTLIER_MULTIPLE } from '@aixellabs/backend/content-lab/constants';
import type { ContentLabPlatform } from '@aixellabs/backend/content-lab/types';
import type { ContentLabWatch, ContentLabWatchPost } from '@aixellabs/backend/db/types';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { CreatorAvatar } from '../../_components/CreatorAvatar';
import { PostThumb } from '../../search/_components/PostThumb';
import { compactNumber } from '../../search/_utils/format';
import { timesUsual } from '../_utils/format';

const MAX_STANDOUTS = 3;

/** Thumbnails per platform: YouTube is 16:9 (2 on a phone, 4 wider), Instagram 9:16 (3 on a phone, 6 wider). */
const THUMBS: Record<ContentLabPlatform, { count: number; phone: number; grid: string; aspect: string }> = {
    youtube: { count: 4, phone: 2, grid: 'grid-cols-2 sm:grid-cols-4', aspect: 'aspect-video' },
    instagram: { count: 6, phone: 3, grid: 'grid-cols-3 sm:grid-cols-6', aspect: 'aspect-[9/16]' },
};

const ago = (iso: string | null | undefined) => (iso ? formatDistanceToNow(new Date(iso), { addSuffix: true }) : null);

type WatchCardProps = {
    watch: ContentLabWatch;
    refreshing: boolean;
    disabled: boolean;
    onRefresh: () => void;
    onRemove: () => void;
};

/**
 * One watched creator: who they are (picture, name, handle, platform, followers, bio), their recent posts
 * as thumbnails, the ones doing far better than their usual in plain words, and when it was last checked.
 */
export function WatchCard({ watch, refreshing, disabled, onRefresh, onRemove }: WatchCardProps) {
    // Watches saved before recent posts were kept still have their standouts.
    const recent = watch.recent?.length ? watch.recent : watch.standouts;
    const checked = ago(watch.lastCheckedAt);

    return (
        <Card className="gap-0 overflow-hidden py-0" data-testid="watch-card" aria-busy={refreshing}>
            <div className="grid gap-5 p-4 sm:p-5 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:gap-8">
                <section className="flex min-w-0 flex-col gap-3" aria-label={`About @${watch.handle}`}>
                    <div className="flex items-start gap-3">
                        <CreatorAvatar name={watch.name} handle={watch.handle} avatarUrl={watch.avatarUrl} platform={watch.platform} className="size-14" />
                        <div className="min-w-0 flex-1">
                            <p className="truncate font-semibold">{watch.name ?? `@${watch.handle}`}</p>
                            {watch.profileUrl ? (
                                <a
                                    href={watch.profileUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-muted-foreground hover:text-foreground block truncate text-sm"
                                >
                                    @{watch.handle}
                                </a>
                            ) : (
                                <p className="text-muted-foreground truncate text-sm">@{watch.handle}</p>
                            )}
                            <p className="text-sm">
                                <span className="font-semibold tabular-nums">{compactNumber(watch.followers)}</span>{' '}
                                <span className="text-muted-foreground">followers</span>
                            </p>
                        </div>
                        <div className="-mt-1 -mr-2 flex shrink-0">
                            <Button size="icon" variant="ghost" disabled={disabled} onClick={onRefresh} aria-label={`Refresh @${watch.handle}`}>
                                {refreshing ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                            </Button>
                            <Button
                                size="icon"
                                variant="ghost"
                                className="text-destructive hover:text-destructive"
                                disabled={disabled}
                                onClick={onRemove}
                                aria-label={`Stop watching @${watch.handle}`}
                            >
                                <Trash2 />
                            </Button>
                        </div>
                    </div>
                    {watch.bio ? <p className="text-muted-foreground line-clamp-3 text-sm whitespace-pre-line">{watch.bio}</p> : null}
                    <dl className="grid grid-cols-2 gap-3 text-sm">
                        <div className="bg-muted/50 rounded-lg px-3 py-2">
                            <dt className="text-muted-foreground text-xs">Usual views per post</dt>
                            <dd className="font-semibold tabular-nums">{compactNumber(watch.usualViews)}</dd>
                        </div>
                        <div className="bg-muted/50 rounded-lg px-3 py-2">
                            <dt className="text-muted-foreground text-xs">Last checked</dt>
                            <dd className="font-semibold">{checked ?? 'Not yet'}</dd>
                        </div>
                    </dl>
                </section>

                <div className="flex min-w-0 flex-col gap-4">
                    <section className="grid gap-2" aria-label="Recent posts">
                        <h4 className="text-sm font-medium">Recent posts</h4>
                        {recent.length ? (
                            <RecentPosts platform={watch.platform} posts={recent} />
                        ) : (
                            <p className="text-muted-foreground text-sm">Refresh to load their recent posts.</p>
                        )}
                    </section>
                    <section className="grid gap-2" aria-label="What's working for them">
                        <h4 className="flex items-center gap-1.5 text-sm font-medium">
                            <TrendingUp className="size-4 text-orange-600 dark:text-orange-400" /> What&apos;s working for them
                        </h4>
                        {watch.standouts.length === 0 ? (
                            <p className="text-muted-foreground text-sm">Nothing far above their usual yet</p>
                        ) : (
                            <ul className="grid gap-2">
                                {watch.standouts.slice(0, MAX_STANDOUTS).map((standout) => (
                                    <li key={standout.postId} data-testid="standout">
                                        <a
                                            href={standout.url}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="hover:bg-muted/60 flex min-w-0 flex-col rounded-lg border px-3 py-2 transition-colors"
                                        >
                                            <span className="truncate text-sm font-medium">{standout.title}</span>
                                            <span className="text-muted-foreground text-xs">
                                                <span className="font-semibold text-orange-700 dark:text-orange-300">
                                                    Got {timesUsual(standout.multiple)}
                                                </span>
                                                {standout.publishedAt ? ` · posted ${ago(standout.publishedAt)}` : null}
                                            </span>
                                        </a>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>
                </div>
            </div>
        </Card>
    );
}

function RecentPosts({ platform, posts }: { platform: ContentLabPlatform; posts: ContentLabWatchPost[] }) {
    const layout = THUMBS[platform];
    return (
        <ul className={cn('grid gap-2', layout.grid)}>
            {posts.slice(0, layout.count).map((post, index) => (
                <li key={post.postId} className={cn('min-w-0', index >= layout.phone && 'max-sm:hidden')} data-testid="recent-post">
                    <a href={post.url} target="_blank" rel="noreferrer" className="group grid gap-1">
                        <span className="relative block overflow-hidden rounded-md">
                            <PostThumb post={{ title: post.title, thumbnailUrl: post.thumbnailUrl ?? null }} className={cn(layout.aspect, 'transition-transform group-hover:scale-[1.02]')} />
                            {post.multiple != null && post.multiple >= CONTENT_LAB_OUTLIER_MULTIPLE ? (
                                <span className="absolute top-1.5 left-1.5 rounded-full bg-orange-500 px-1.5 py-0.5 text-[11px] font-semibold text-white shadow">
                                    {timesUsual(post.multiple, true)}
                                </span>
                            ) : null}
                        </span>
                        <span className="line-clamp-2 text-xs leading-snug">{post.title}</span>
                        {post.views != null ? <span className="text-muted-foreground text-xs tabular-nums">{compactNumber(post.views)} views</span> : null}
                    </a>
                </li>
            ))}
        </ul>
    );
}

/** The card for a creator being added, until their posts are in. */
export function PendingWatchCard({ platform, handle, name, avatarUrl }: { platform: ContentLabPlatform; handle: string; name?: string | null; avatarUrl?: string | null }) {
    const layout = THUMBS[platform];
    return (
        <Card className="gap-0 py-0" role="status" aria-label={`Adding @${handle}`}>
            <div className="grid gap-5 p-4 sm:p-5 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:gap-8">
                <div className="flex items-start gap-3">
                    <CreatorAvatar name={name} handle={handle} avatarUrl={avatarUrl} platform={platform} className="size-14" />
                    <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">{name ?? `@${handle}`}</p>
                        <p className="text-muted-foreground flex items-center gap-1.5 text-sm">
                            <Loader2 className="size-3.5 animate-spin" /> Reading their recent posts…
                        </p>
                    </div>
                </div>
                <div className={cn('grid gap-2', layout.grid)}>
                    {Array.from({ length: layout.count }, (_, index) => (
                        <Skeleton key={index} className={cn(layout.aspect, 'w-full', index >= layout.phone && 'max-sm:hidden')} />
                    ))}
                </div>
            </div>
        </Card>
    );
}
