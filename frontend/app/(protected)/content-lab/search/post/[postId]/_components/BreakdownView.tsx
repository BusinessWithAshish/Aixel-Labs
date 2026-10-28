'use client';

import Link from 'next/link';
import {
    AlertTriangleIcon,
    ClipboardCheckIcon,
    ExternalLinkIcon,
    EyeIcon,
    Loader2Icon,
    PenLineIcon,
    RotateCwIcon,
    ScanSearchIcon,
} from 'lucide-react';
import { CONTENT_LAB_ERROR_MESSAGES } from '@aixellabs/backend/content-lab/constants';
import type { CONTENT_LAB_BREAKDOWN_RESPONSE, CONTENT_LAB_SEGMENT, ContentLabFormat } from '@aixellabs/backend/content-lab/types';
import { EmptyState } from '@/components/common/EmptyState';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { CONTENT_LAB_CHECK_ROUTE } from '@/config/app-config';
import { usePage } from '@/contexts/PageStore';
import { cn } from '@/lib/utils';
import { PostBadges } from '../../../_components/PostCard';
import { PostThumb } from '../../../_components/PostThumb';
import { POST_BOARD_TEMPLATE } from '../../../_hooks/use-post-actions';
import { compactNumber, creatorLabel, formatMultiple, formatSeconds } from '../../../_utils/format';
import type { UseBreakdownPageReturn } from '../_hooks/use-breakdown-page';

/** Long video, short vertical video, or slides/caption: each gets its own words and layout. */
type Layout = 'long' | 'short' | 'slides';

const layoutOf = (format: ContentLabFormat): Layout =>
    format === 'video' ? 'long' : format === 'reel' || format === 'short' ? 'short' : 'slides';

const THUMB_ASPECT: Record<Layout, string> = { long: 'aspect-video', short: 'aspect-[4/5]', slides: 'aspect-square' };
const THUMB_TITLE: Record<Layout, string> = { long: 'Thumbnail', short: 'Cover frame', slides: 'Cover' };

function hookTitle(layout: Layout, format: ContentLabFormat, seconds: number | null): string {
    if (layout === 'slides') return format === 'carousel' ? 'Slide 1 · the cover' : 'First line of the caption';
    if (seconds == null) return 'Hook · the opening';
    return `Hook · first ${seconds < 60 ? `${Number(seconds.toFixed(1))} seconds` : formatSeconds(seconds)}`;
}

function structureTitle(layout: Layout, { post, structure }: CONTENT_LAB_BREAKDOWN_RESPONSE): string {
    if (layout === 'long') return `Structure · ${formatSeconds(post.durationSeconds)}`;
    if (layout === 'short') return `Pacing · ${formatSeconds(post.durationSeconds)} · ${structure.length} beats`;
    return post.format === 'carousel' ? `Slide flow · ${structure.length} slides` : 'Caption flow';
}

function ctaTitle(layout: Layout, atPercent: number | null | undefined): string {
    if (layout === 'slides') return 'Caption CTA';
    return atPercent != null ? `CTA · at ${Math.round(atPercent)}%` : 'CTA';
}

const segmentWeight = (s: CONTENT_LAB_SEGMENT) =>
    s.startSeconds != null && s.endSeconds != null && s.endSeconds > s.startSeconds ? s.endSeconds - s.startSeconds : 1;

const SEGMENT_TONES = ['bg-primary/25', 'bg-muted', 'bg-primary/10'];

function Timeline({ segments, timed }: { segments: CONTENT_LAB_SEGMENT[]; timed: boolean }) {
    if (!segments.length) return <p className="text-muted-foreground text-sm">No clear structure found.</p>;
    return (
        <div className="flex flex-col gap-3">
            <div className="flex h-10 w-full gap-0.5 overflow-hidden rounded-md" aria-hidden="true">
                {segments.map((segment, index) => (
                    <div
                        key={`${segment.label}-${index}`}
                        style={{ flexGrow: segmentWeight(segment), flexBasis: 0 }}
                        className={cn(
                            'min-w-1 truncate px-1.5 text-[11px] leading-10 font-medium',
                            index === 0 ? SEGMENT_TONES[0] : SEGMENT_TONES[1 + (index % 2)],
                        )}
                    >
                        {segment.label}
                    </div>
                ))}
            </div>
            <ol className="grid gap-1 text-sm">
                {segments.map((segment, index) => (
                    <li key={`${segment.label}-${index}`} className="flex gap-3">
                        <span className="text-muted-foreground w-14 shrink-0 tabular-nums">
                            {timed && segment.startSeconds != null ? formatSeconds(segment.startSeconds) : `${index + 1}.`}
                        </span>
                        <span className="min-w-0 break-words">{segment.label}</span>
                    </li>
                ))}
            </ol>
        </div>
    );
}

function Numbers({ breakdown }: { breakdown: CONTENT_LAB_BREAKDOWN_RESPONSE }) {
    const { post } = breakdown;
    const rows: [string, string][] = [
        [post.views == null ? 'Likes' : 'Views', compactNumber(post.views ?? post.likes)],
        ['Their usual', compactNumber(post.usualViews)],
        ['Likes', compactNumber(post.likes)],
        ['Comments', compactNumber(post.comments)],
    ];
    if (post.durationSeconds != null) rows.push(['Length', formatSeconds(post.durationSeconds)]);
    if (post.publishedAt) rows.push(['Posted', new Date(post.publishedAt).toLocaleDateString()]);
    return (
        <Card className="h-auto">
            <CardHeader>
                <CardTitle>The numbers</CardTitle>
            </CardHeader>
            <CardContent>
                <dl className="grid grid-cols-2 gap-3">
                    {rows.map(([label, value]) => (
                        <div key={label}>
                            <dt className="text-muted-foreground text-xs">{label}</dt>
                            <dd className="font-semibold">{value}</dd>
                        </div>
                    ))}
                </dl>
            </CardContent>
        </Card>
    );
}

function Breakdown({ breakdown }: { breakdown: CONTENT_LAB_BREAKDOWN_RESPONSE }) {
    const { busy, watchCreator, startBoard } = usePage<UseBreakdownPageReturn>();
    const { post, hook, structure, cta, audience, whyItWorked, text } = breakdown;
    const layout = layoutOf(post.format);
    const who = creatorLabel(post.creator);

    return (
        <div className="flex flex-col gap-6" data-layout={layout}>
            <header className="flex flex-col gap-2">
                <p className="text-primary text-xs font-medium tracking-wider uppercase">2 · Learn</p>
                <h1 className="text-2xl font-bold tracking-tight break-words text-balance sm:text-3xl">{post.title}</h1>
                <p className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                    <PostBadges post={post} />
                    <span>· {who}</span>
                    {post.multiple != null ? (
                        <span>
                            · <b className="text-primary text-lg">{formatMultiple(post.multiple)}</b> their usual views
                        </span>
                    ) : null}
                    <a href={post.url} target="_blank" rel="noreferrer" className="text-foreground inline-flex items-center gap-1 underline-offset-2 hover:underline">
                        Open original <ExternalLinkIcon className="size-3.5" />
                    </a>
                </p>
            </header>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
                <div className="flex min-w-0 flex-col gap-4">
                    <Card className="h-auto gap-0 overflow-hidden py-0">
                        <PostThumb post={post} className={THUMB_ASPECT[layout]} />
                        <p className="text-muted-foreground px-4 py-2 text-xs">{THUMB_TITLE[layout]}</p>
                    </Card>
                    <Card className="h-auto border-green-500/30 bg-green-500/5">
                        <CardHeader>
                            <CardTitle>Why it worked</CardTitle>
                        </CardHeader>
                        <CardContent className="flex flex-col gap-3 text-sm">
                            {whyItWorked.length ? (
                                <ol className="list-decimal space-y-1 pl-5">
                                    {whyItWorked.map((reason) => (
                                        <li key={reason}>{reason}</li>
                                    ))}
                                </ol>
                            ) : (
                                <p className="text-muted-foreground">No single reason stands out.</p>
                            )}
                            <p>
                                <b>Copy:</b> the structure. <b>Don&apos;t copy:</b> their personal story.
                            </p>
                        </CardContent>
                    </Card>
                    <Numbers breakdown={breakdown} />
                </div>

                <div className="flex min-w-0 flex-col gap-4">
                    <Card className="bg-primary/5 border-primary/30 h-auto">
                        <CardHeader>
                            <CardTitle>{hookTitle(layout, post.format, hook.seconds)}</CardTitle>
                        </CardHeader>
                        <CardContent className="flex flex-col gap-1">
                            <p className="text-lg leading-snug font-semibold break-words">&ldquo;{hook.text ?? post.title}&rdquo;</p>
                            {hook.type ? <p className="text-muted-foreground text-sm">Type: {hook.type}</p> : null}
                        </CardContent>
                    </Card>
                    <Card className="h-auto">
                        <CardHeader>
                            <CardTitle>{structureTitle(layout, breakdown)}</CardTitle>
                        </CardHeader>
                        <CardContent className="flex flex-col gap-3">
                            <Timeline segments={structure} timed={layout !== 'slides'} />
                            {layout !== 'slides' && audience.rewatchedSeconds.length ? (
                                <p className="text-muted-foreground text-sm">
                                    Viewers rewatched {audience.rewatchedSeconds.slice(0, 3).map(formatSeconds).join(', ')} most (from
                                    timestamps in comments).
                                </p>
                            ) : null}
                        </CardContent>
                    </Card>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <Card className="h-auto">
                            <CardHeader>
                                <CardTitle>{ctaTitle(layout, cta?.atPercent)}</CardTitle>
                            </CardHeader>
                            <CardContent className="text-sm break-words">
                                {cta?.text ? <>&ldquo;{cta.text}&rdquo;</> : <span className="text-muted-foreground">No clear call to action found.</span>}
                            </CardContent>
                        </Card>
                        <Card className="h-auto">
                            <CardHeader>
                                <CardTitle>What viewers said</CardTitle>
                            </CardHeader>
                            <CardContent className="text-sm">
                                {audience.topComments.length ? (
                                    <ul className="space-y-1">
                                        {audience.topComments.slice(0, 3).map((comment) => (
                                            <li key={comment} className="line-clamp-2 break-words">
                                                &ldquo;{comment}&rdquo;
                                            </li>
                                        ))}
                                    </ul>
                                ) : (
                                    <span className="text-muted-foreground">No comments to read.</span>
                                )}
                            </CardContent>
                        </Card>
                    </div>
                    {text ? (
                        <details className="rounded-xl border p-4 text-sm">
                            <summary className="cursor-pointer font-medium">{layout === 'long' ? 'Transcript' : 'Caption and words'}</summary>
                            <p className="text-muted-foreground mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words">{text}</p>
                        </details>
                    ) : null}
                </div>
            </div>

            <div className="flex flex-wrap gap-2">
                <Button disabled={!!busy} onClick={() => startBoard(POST_BOARD_TEMPLATE, { url: post.url })}>
                    {busy === `board:${post.url}` ? <Loader2Icon className="animate-spin" /> : <PenLineIcon />} Write my version
                </Button>
                <Button variant="outline" disabled={!!busy} onClick={() => watchCreator(post.creator)} className="max-w-full">
                    {busy === `watch:${post.creator.id}` ? <Loader2Icon className="animate-spin" /> : <EyeIcon />}
                    <span className="truncate">Watch {who}</span>
                </Button>
                <Button variant="outline" asChild>
                    <Link href={`${CONTENT_LAB_CHECK_ROUTE}?platform=${post.platform}`}>
                        <ClipboardCheckIcon /> Check an idea
                    </Link>
                </Button>
            </div>
        </div>
    );
}

/** Breakdown of one post; loading, error and unsupported-link states around it. */
export function BreakdownView() {
    const { url, state, retry } = usePage<UseBreakdownPageReturn>();

    let body;
    if (!url) {
        body = <EmptyState icon={<ScanSearchIcon />} title="That link cannot be broken down" description={CONTENT_LAB_ERROR_MESSAGES.UNSUPPORTED_URL} />;
    } else if (state.status === 'loading') {
        body = (
            <div aria-busy="true" className="flex flex-col gap-4">
                <p className="text-muted-foreground flex items-center gap-2 text-sm">
                    <Loader2Icon className="size-4 animate-spin" /> Breaking this post down…
                </p>
                <Skeleton className="h-9 w-3/4" />
                <div className="grid gap-4 lg:grid-cols-[2fr_3fr]">
                    <Skeleton className="aspect-video w-full" />
                    <div className="flex flex-col gap-4">
                        <Skeleton className="h-28" />
                        <Skeleton className="h-40" />
                    </div>
                </div>
            </div>
        );
    } else if (state.status === 'error') {
        body = (
            <Alert variant="destructive">
                <AlertTriangleIcon className="size-4" />
                <AlertTitle>This post could not be broken down</AlertTitle>
                <AlertDescription className="flex flex-col items-start gap-2">
                    {state.error}
                    <Button variant="outline" size="sm" onClick={retry}>
                        <RotateCwIcon /> Try again
                    </Button>
                </AlertDescription>
            </Alert>
        );
    } else {
        body = <Breakdown breakdown={state.breakdown} />;
    }

    return <div className="flex w-full flex-col gap-6 p-1 sm:p-2">{body}</div>;
}
