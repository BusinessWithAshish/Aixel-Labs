'use client';

import { Eye, Loader2, RefreshCw } from 'lucide-react';
import { CONTENT_LAB_PLATFORMS } from '@aixellabs/backend/content-lab/constants';
import type { ContentLabPlatform } from '@aixellabs/backend/content-lab/types';
import { EmptyState } from '@/components/common/EmptyState';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { usePage } from '@/contexts/PageStore';
import { CONTENT_LAB_PLATFORM_LABELS } from '../../_constants';
import { PlatformIcon, PlatformPill } from '../../_components/PlatformIcon';
import type { UseWatchingPageReturn } from '../_hooks/use-watching-page';
import { CreatorSearch } from './CreatorSearch';
import { PendingWatchCard, WatchCard } from './WatchCard';

function AddCreator() {
    const page = usePage<UseWatchingPageReturn>();

    return (
        <Card className="gap-3 py-4 sm:py-5">
            <CardContent className="grid gap-3 px-4 sm:px-5">
                <div className="grid gap-1">
                    <h3 className="font-medium">Watch a creator</h3>
                    <p className="text-muted-foreground text-sm">
                        Start typing a name or handle and pick them from the list. We show their recent posts and point out the ones doing far
                        better than usual.
                    </p>
                </div>
                <form
                    className="flex flex-col gap-2 sm:flex-row"
                    onSubmit={(event) => {
                        event.preventDefault();
                        void page.add({ handle: page.query });
                    }}
                    aria-label="Watch a creator"
                >
                    <Select value={page.platform} onValueChange={(value) => page.setPlatform(value as ContentLabPlatform)}>
                        <SelectTrigger className="w-full sm:w-40" aria-label="Platform">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {CONTENT_LAB_PLATFORMS.map((platform) => (
                                <SelectItem key={platform} value={platform}>
                                    <PlatformIcon platform={platform} />
                                    {CONTENT_LAB_PLATFORM_LABELS[platform]}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    {/* Box and button share a row, so the suggestions open below both and never cover Watch on a phone. */}
                    <div className="flex min-w-0 flex-1 gap-2">
                        <CreatorSearch
                            className="min-w-0 flex-1"
                            platform={page.platform}
                            query={page.query}
                            onQueryChange={page.setQuery}
                            suggest={page.suggest}
                            onPick={(pick) => void page.add(pick)}
                            disabled={!!page.adding}
                        />
                        <Button type="submit" disabled={!!page.adding || !page.suggest.typed}>
                            {page.adding ? <Loader2 className="animate-spin" /> : <Eye />} Watch
                        </Button>
                    </div>
                </form>
            </CardContent>
        </Card>
    );
}

export function WatchingList() {
    const page = usePage<UseWatchingPageReturn>();
    const count = page.watches.length;

    return (
        <div className="flex w-full min-w-0 flex-col gap-5 p-1 sm:p-2">
            <AddCreator />

            {page.adding ? <PendingWatchCard {...page.adding} /> : null}

            {count === 0 && !page.adding ? (
                <EmptyState
                    icon={<Eye />}
                    title="No creators watched yet"
                    description="Add a creator above. Each check lists their latest posts and the ones that got at least twice their usual views, so you see what is working for them."
                >
                    <div className="flex flex-wrap justify-center gap-2">
                        {CONTENT_LAB_PLATFORMS.map((platform) => (
                            <PlatformPill key={platform} platform={platform} />
                        ))}
                    </div>
                </EmptyState>
            ) : count > 0 ? (
                <section className="flex flex-col gap-3" aria-label="Watched creators">
                    <div className="flex flex-wrap items-center gap-3">
                        <h3 className="mr-auto text-sm font-medium">
                            Watching {count} {count === 1 ? 'creator' : 'creators'}
                        </h3>
                        {page.progress ? (
                            <div className="flex min-w-40 flex-1 items-center justify-end gap-2" role="status">
                                <Progress value={(page.progress.done / page.progress.total) * 100} className="max-w-60" />
                                <span className="text-muted-foreground text-sm whitespace-nowrap">
                                    Refreshing {Math.min(page.progress.done + 1, page.progress.total)} of {page.progress.total}
                                </span>
                            </div>
                        ) : null}
                        <Button variant="outline" size="sm" onClick={() => void page.refreshAll()} disabled={page.busy}>
                            <RefreshCw className={page.progress ? 'animate-spin' : undefined} /> Refresh all
                        </Button>
                    </div>
                    <ul className="grid gap-4">
                        {page.watches.map((watch) => (
                            <li key={watch._id} className="min-w-0">
                                <WatchCard
                                    watch={watch}
                                    refreshing={page.refreshingId === watch._id}
                                    disabled={page.busy}
                                    onRefresh={() => void page.refreshOne(watch)}
                                    onRemove={() => void page.remove(watch)}
                                />
                            </li>
                        ))}
                    </ul>
                </section>
            ) : null}
        </div>
    );
}
