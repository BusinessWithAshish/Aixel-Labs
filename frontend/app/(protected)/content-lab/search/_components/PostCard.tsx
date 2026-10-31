'use client';

import Link from 'next/link';
import { EyeIcon, FlameIcon, Loader2Icon, PenLineIcon, PlayIcon } from 'lucide-react';
import type { CONTENT_LAB_POST } from '@aixellabs/backend/content-lab/types';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { CONTENT_LAB_PLATFORM_LABELS, CONTENT_LAB_POST_FORMAT_LABELS } from '../../_constants';
import { PlatformIcon } from '../../_components/PlatformIcon';
import { compactNumber, creatorLabel, formatMultiple, formatSeconds, timeAgo, timesUsual } from '../_utils/format';
import { postBreakdownHref } from '../_utils/smart-box';
import { PostThumb } from './PostThumb';

export function PostBadges({ post, className }: { post: Pick<CONTENT_LAB_POST, 'platform' | 'format'>; className?: string }) {
    return (
        <span className={cn('text-muted-foreground flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide', className)}>
            <PlatformIcon platform={post.platform} className="size-3.5" />
            {CONTENT_LAB_PLATFORM_LABELS[post.platform]} · {CONTENT_LAB_POST_FORMAT_LABELS[post.format]}
        </span>
    );
}

/** "1.2M views (usually 85K)"; photo posts have no views, so likes against usual likes. */
export function PostReach({ post }: { post: CONTENT_LAB_POST }) {
    const unit = post.views == null ? 'likes' : 'views';
    return (
        <>
            <b className="text-foreground">{compactNumber(post.views ?? post.likes)}</b> {unit}
            {post.usualViews != null ? ` (usually ${compactNumber(post.usualViews)})` : null}
        </>
    );
}

const unitOf = (post: CONTENT_LAB_POST) => (post.views == null ? 'likes' : 'views');

/** The first reason that says more than the jump already on the card ("113 times their usual views"). */
const whyOf = (post: CONTENT_LAB_POST) => post.reasons.find((reason) => !/\btimes\b.*\busual/i.test(reason)) ?? null;

/** "12x usual" on the cover; only for posts that did clearly better than usual. */
function JumpBadge({ post, className }: { post: CONTENT_LAB_POST; className?: string }) {
    if (post.multiple == null || post.multiple < 1.5) return null;
    return (
        <span
            title={timesUsual(post.multiple, unitOf(post))}
            className={cn(
                'inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2 py-0.5 text-xs font-bold text-white shadow-sm',
                className,
            )}
        >
            <FlameIcon className="size-3" aria-hidden />
            {formatMultiple(post.multiple)} usual
        </span>
    );
}

/** "@creator · 1.2M views · 3 weeks ago". */
function MetaLine({ post, className }: { post: CONTENT_LAB_POST; className?: string }) {
    const ago = timeAgo(post.publishedAt);
    return (
        <p className={cn('text-muted-foreground truncate text-xs', className)}>
            {creatorLabel(post.creator)} · {compactNumber(post.views ?? post.likes)} {unitOf(post)}
            {ago ? ` · ${ago}` : null}
        </p>
    );
}

type PostCardProps = {
    post: CONTENT_LAB_POST;
    busy: string | null;
    onWatch: () => void;
    onBoard: () => void;
};

/** Watch the creator / write my version (a board seeded with the post); icon-only on the narrow portrait card. */
function CardActions({ post, busy, onWatch, onBoard, compact }: PostCardProps & { compact?: boolean }) {
    const watching = busy === `watch:${post.creator.id}`;
    const boarding = busy === `board:${post.url}`;
    return (
        <div className={cn('flex justify-between gap-1 border-t px-2 py-1.5', compact && 'justify-around px-1 py-1')}>
            <Button variant="ghost" size={compact ? 'icon' : 'sm'} onClick={onWatch} disabled={!!busy} aria-label="Watch creator" title="Watch creator">
                {watching ? <Loader2Icon className="animate-spin" /> : <EyeIcon />}
                {compact ? null : 'Watch'}
            </Button>
            <Button variant="ghost" size={compact ? 'icon' : 'sm'} onClick={onBoard} disabled={!!busy} aria-label="Write my version" title="Write my version: a board that turns this post into your own">
                {boarding ? <Loader2Icon className="animate-spin" /> : <PenLineIcon />}
                {compact ? null : 'Write my version'}
            </Button>
        </div>
    );
}

/** YouTube: a 16:9 card like the platform's own grid, with the jump and length on the thumbnail. */
function LandscapeCard(props: PostCardProps) {
    const { post } = props;
    return (
        <Card
            className="group/card gap-0 overflow-hidden py-0 transition-shadow hover:shadow-md"
            data-testid="content-lab-post-card"
            data-platform={post.platform}
        >
            <Link href={postBreakdownHref(post)} className="group flex flex-1 flex-col focus-visible:outline-none">
                <div className="relative overflow-hidden">
                    <PostThumb post={post} className="transition-transform group-hover:scale-[1.02]" />
                    <JumpBadge post={post} className="absolute top-2 left-2" />
                    {post.durationSeconds ? (
                        <span className="absolute right-2 bottom-2 rounded bg-black/80 px-1.5 py-0.5 text-xs font-medium text-white">
                            {formatSeconds(post.durationSeconds)}
                        </span>
                    ) : null}
                </div>
                <div className="flex flex-1 gap-3 p-3 group-hover:bg-muted/40 group-focus-visible:bg-muted/40">
                    <PlatformIcon platform={post.platform} className="mt-0.5 size-5" />
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <h3 className="line-clamp-2 leading-snug font-semibold">{post.title}</h3>
                        <MetaLine post={post} />
                        {post.multiple != null && post.multiple >= 1.5 ? (
                            <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">{timesUsual(post.multiple, unitOf(post))}</p>
                        ) : null}
                        {whyOf(post) ? <p className="text-muted-foreground mt-auto line-clamp-2 pt-1 text-xs">Why: {whyOf(post)}</p> : null}
                    </div>
                </div>
            </Link>
            <CardActions {...props} />
        </Card>
    );
}

/** Instagram: a 9:16 card like a Reels grid, with the jump, plays and creator on the cover. */
function PortraitCard(props: PostCardProps) {
    const { post } = props;
    return (
        <Card
            className="group/card gap-0 overflow-hidden py-0 transition-shadow hover:shadow-md"
            data-testid="content-lab-post-card"
            data-platform={post.platform}
        >
            <Link href={postBreakdownHref(post)} className="group flex flex-1 flex-col focus-visible:outline-none">
                <div className="relative overflow-hidden">
                    <PostThumb post={post} className="aspect-[9/16] transition-transform group-hover:scale-[1.02]" />
                    <JumpBadge post={post} className="absolute top-2 left-2" />
                    <PlatformIcon platform={post.platform} className="absolute top-2 right-2 size-5 drop-shadow" />
                    <span className="absolute inset-x-0 bottom-0 flex flex-col gap-0.5 bg-gradient-to-t from-black/85 via-black/40 to-transparent p-2 pt-10 text-white">
                        <span className="flex items-center gap-1 text-sm font-semibold">
                            {post.format === 'reel' ? <PlayIcon className="size-3.5 fill-white" aria-hidden /> : null}
                            {compactNumber(post.views ?? post.likes)} {unitOf(post)}
                        </span>
                        <span className="truncate text-xs opacity-90">
                            {creatorLabel(post.creator)} · {CONTENT_LAB_POST_FORMAT_LABELS[post.format]}
                        </span>
                    </span>
                </div>
                <div className="flex flex-1 flex-col gap-1 p-2.5 group-hover:bg-muted/40 group-focus-visible:bg-muted/40">
                    <h3 className="line-clamp-2 text-sm leading-snug font-semibold">{post.title || 'No caption'}</h3>
                    {whyOf(post) ? <p className="text-muted-foreground mt-auto line-clamp-2 text-xs">Why: {whyOf(post)}</p> : null}
                </div>
            </Link>
            <CardActions {...props} compact />
        </Card>
    );
}

/** One result on "What's working": opens its breakdown; watch the creator or start a board from it. Shaped like its platform. */
export function PostCard(props: PostCardProps) {
    return props.post.platform === 'instagram' ? <PortraitCard {...props} /> : <LandscapeCard {...props} />;
}
