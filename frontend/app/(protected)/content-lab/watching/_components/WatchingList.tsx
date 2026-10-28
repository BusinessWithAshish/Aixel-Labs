'use client';

import { formatDistanceToNow } from 'date-fns';
import { Eye, Loader2, RefreshCw, Trash2 } from 'lucide-react';
import { CONTENT_LAB_PLATFORMS } from '@aixellabs/backend/content-lab/constants';
import type { ContentLabPlatform } from '@aixellabs/backend/content-lab/types';
import { EmptyState } from '@/components/common/EmptyState';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { usePage } from '@/contexts/PageStore';
import { CONTENT_LAB_PLATFORM_LABELS } from '../../_constants';
import type { UseWatchingPageReturn } from '../_hooks/use-watching-page';

const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });
const count = (value: number | null) => (value === null ? '—' : compact.format(value));

const MAX_CHIPS = 3;

export function WatchingList() {
    const page = usePage<UseWatchingPageReturn>();
    const busy = !!page.progress || !!page.refreshingId;

    return (
        <div className="flex w-full flex-col gap-5 p-1 sm:p-2">
            <p className="text-muted-foreground max-w-prose">
                Creators you follow closely. Refresh to see what they posted far above their usual.
            </p>

            <Card className="py-4">
                <CardContent className="px-4">
                    <form
                        className="flex flex-wrap items-end gap-2"
                        onSubmit={(event) => {
                            event.preventDefault();
                            void page.add();
                        }}
                        aria-label="Watch a creator"
                    >
                        <Select value={page.platform} onValueChange={(value) => page.setPlatform(value as ContentLabPlatform)}>
                            <SelectTrigger className="w-36" aria-label="Platform">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {CONTENT_LAB_PLATFORMS.map((platform) => (
                                    <SelectItem key={platform} value={platform}>
                                        {CONTENT_LAB_PLATFORM_LABELS[platform]}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Input
                            className="min-w-0 flex-1 basis-48"
                            aria-label="Creator handle"
                            placeholder="@handle"
                            value={page.handle}
                            maxLength={200}
                            onChange={(event) => page.setHandle(event.target.value)}
                        />
                        <Button type="submit" disabled={page.adding || !page.handle.trim()}>
                            {page.adding ? <Loader2 className="animate-spin" /> : <Eye />} Watch
                        </Button>
                    </form>
                </CardContent>
            </Card>

            {page.watches.length === 0 ? (
                <EmptyState
                    icon={<Eye />}
                    title="No creators watched yet"
                    description="Add a creator above. Each refresh lists the posts that got at least twice their usual views."
                />
            ) : (
                <section className="flex flex-col gap-3" aria-label="Watched creators">
                    <div className="flex flex-wrap items-center gap-3">
                        <Button variant="outline" onClick={() => void page.refreshAll()} disabled={busy}>
                            <RefreshCw className={page.progress ? 'animate-spin' : undefined} /> Refresh all
                        </Button>
                        {page.progress ? (
                            <div className="flex min-w-40 flex-1 items-center gap-2" role="status">
                                <Progress value={(page.progress.done / page.progress.total) * 100} className="max-w-60" />
                                <span className="text-muted-foreground text-sm">
                                    Refreshing {Math.min(page.progress.done + 1, page.progress.total)} of {page.progress.total}
                                </span>
                            </div>
                        ) : null}
                    </div>
                    <ul className="grid gap-3">
                        {page.watches.map((watch) => (
                            <li key={watch._id}>
                                <Card className="gap-3 py-4" data-testid="watch-card">
                                    <CardContent className="flex flex-col gap-3 px-4">
                                        <div className="flex flex-wrap items-start justify-between gap-2">
                                            <div className="min-w-0">
                                                <p className="truncate font-semibold">{watch.name ?? `@${watch.handle}`}</p>
                                                <p className="text-muted-foreground flex flex-wrap items-center gap-x-2 text-sm">
                                                    <span>@{watch.handle}</span>
                                                    <Badge variant="secondary">{CONTENT_LAB_PLATFORM_LABELS[watch.platform]}</Badge>
                                                </p>
                                            </div>
                                            <div className="flex gap-1">
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    disabled={busy}
                                                    onClick={() => void page.refreshOne(watch)}
                                                    aria-label={`Refresh @${watch.handle}`}
                                                >
                                                    {page.refreshingId === watch._id ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    className="text-destructive"
                                                    disabled={busy}
                                                    onClick={() => void page.remove(watch)}
                                                    aria-label={`Stop watching @${watch.handle}`}
                                                >
                                                    <Trash2 />
                                                </Button>
                                            </div>
                                        </div>
                                        <dl className="grid grid-cols-3 gap-2 text-sm">
                                            <div>
                                                <dt className="text-muted-foreground text-xs">Followers</dt>
                                                <dd className="font-medium tabular-nums">{count(watch.followers)}</dd>
                                            </div>
                                            <div>
                                                <dt className="text-muted-foreground text-xs">Usual views</dt>
                                                <dd className="font-medium tabular-nums">{count(watch.usualViews)}</dd>
                                            </div>
                                            <div>
                                                <dt className="text-muted-foreground text-xs">Last checked</dt>
                                                <dd className="font-medium">
                                                    {watch.lastCheckedAt ? formatDistanceToNow(new Date(watch.lastCheckedAt), { addSuffix: true }) : 'Never'}
                                                </dd>
                                            </div>
                                        </dl>
                                        <div className="flex flex-wrap gap-2" aria-label="Latest standouts">
                                            {watch.standouts.length === 0 ? (
                                                <span className="text-muted-foreground text-sm">Nothing far above usual yet</span>
                                            ) : (
                                                watch.standouts.slice(0, MAX_CHIPS).map((standout) => (
                                                    <a
                                                        key={standout.postId}
                                                        href={standout.url}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        data-testid="standout-chip"
                                                        className="hover:border-foreground flex max-w-full min-w-0 items-center gap-2 rounded-full border px-3 py-1 text-sm"
                                                    >
                                                        <span className="truncate">{standout.title}</span>
                                                        <span className="shrink-0 font-semibold tabular-nums text-orange-700 dark:text-orange-300">
                                                            {standout.multiple}x
                                                        </span>
                                                    </a>
                                                ))
                                            )}
                                        </div>
                                    </CardContent>
                                </Card>
                            </li>
                        ))}
                    </ul>
                </section>
            )}
        </div>
    );
}
