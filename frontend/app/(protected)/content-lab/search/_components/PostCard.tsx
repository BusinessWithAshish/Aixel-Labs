'use client';

import Link from 'next/link';
import { EyeIcon, LayoutDashboardIcon, Loader2Icon } from 'lucide-react';
import type { CONTENT_LAB_POST } from '@aixellabs/backend/content-lab/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { CONTENT_LAB_PLATFORM_LABELS, CONTENT_LAB_POST_FORMAT_LABELS } from '../../_constants';
import { PlatformIcon } from '../../_components/PlatformIcon';
import { compactNumber, creatorLabel, formatMultiple } from '../_utils/format';
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

type PostCardProps = {
    post: CONTENT_LAB_POST;
    busy: string | null;
    onWatch: () => void;
    onBoard: () => void;
};

/** Watch the creator / start a board; icon-only on the narrow portrait card. */
function CardActions({ post, busy, onWatch, onBoard, compact }: PostCardProps & { compact?: boolean }) {
    const watching = busy === `watch:${post.creator.id}`;
    const boarding = busy === `board:${post.url}`;
    return (
        <div className={cn('flex flex-wrap gap-1 border-t p-2', compact && 'justify-around p-1')}>
            <Button variant="ghost" size={compact ? 'icon' : 'sm'} onClick={onWatch} disabled={!!busy} aria-label="Watch creator" title="Watch creator">
                {watching ? <Loader2Icon className="animate-spin" /> : <EyeIcon />}
                {compact ? null : 'Watch creator'}
            </Button>
            <Button variant="ghost" size={compact ? 'icon' : 'sm'} onClick={onBoard} disabled={!!busy} aria-label="Use on a board" title="Use on a board">
                {boarding ? <Loader2Icon className="animate-spin" /> : <LayoutDashboardIcon />}
                {compact ? null : 'Use on a board'}
            </Button>
        </div>
    );
}

/** YouTube: a 16:9 card, like the platform's own grid. */
function LandscapeCard(props: PostCardProps) {
    const { post } = props;
    return (
        <Card className="gap-0 overflow-hidden py-0" data-testid="content-lab-post-card" data-platform={post.platform}>
            <Link href={postBreakdownHref(post)} className="group flex flex-1 flex-col focus-visible:outline-none">
                <PostThumb post={post} />
                <div className="flex flex-1 flex-col gap-1.5 p-4 group-hover:bg-muted/40 group-focus-visible:bg-muted/40">
                    <PostBadges post={post} />
                    {post.multiple != null ? (
                        <p className="text-primary text-3xl font-bold tracking-tight">
                            {formatMultiple(post.multiple)}{' '}
                            <span className="text-muted-foreground text-sm font-normal">their usual views</span>
                        </p>
                    ) : (
                        <p className="text-muted-foreground text-sm">Not enough history to compare</p>
                    )}
                    <h3 className="line-clamp-2 leading-snug font-semibold">{post.title}</h3>
                    <p className="text-muted-foreground text-sm break-words">
                        {creatorLabel(post.creator)} · <PostReach post={post} />
                    </p>
                    {post.reasons[0] ? (
                        <Badge variant="secondary" className="mt-auto max-w-full whitespace-normal">
                            Why: {post.reasons[0]}
                        </Badge>
                    ) : null}
                </div>
            </Link>
            <CardActions {...props} />
        </Card>
    );
}

/** Instagram: a 9:16 card, like a Reels grid, with the multiple and creator on the cover. */
function PortraitCard(props: PostCardProps) {
    const { post } = props;
    return (
        <Card className="gap-0 overflow-hidden py-0" data-testid="content-lab-post-card" data-platform={post.platform}>
            <Link href={postBreakdownHref(post)} className="group flex flex-1 flex-col focus-visible:outline-none">
                <div className="relative">
                    <PostThumb post={post} className="aspect-[9/16]" />
                    {post.multiple != null ? (
                        <span className="bg-background/90 text-primary absolute top-2 left-2 rounded-full px-2 py-0.5 text-sm font-bold shadow-sm">
                            {formatMultiple(post.multiple)}
                        </span>
                    ) : null}
                    <span className="absolute inset-x-0 bottom-0 flex flex-col gap-0.5 bg-gradient-to-t from-black/80 to-transparent p-2 pt-8 text-white">
                        <span className="flex items-center gap-1 text-[11px] font-medium tracking-wide uppercase">
                            <PlatformIcon platform={post.platform} className="size-3 text-white" />
                            {CONTENT_LAB_POST_FORMAT_LABELS[post.format]}
                        </span>
                        <span className="text-xs break-words">
                            {creatorLabel(post.creator)} · {compactNumber(post.views ?? post.likes)} {post.views == null ? 'likes' : 'views'}
                        </span>
                    </span>
                </div>
                <div className="flex flex-1 flex-col gap-1.5 p-2.5 group-hover:bg-muted/40 group-focus-visible:bg-muted/40">
                    <h3 className="line-clamp-2 text-sm leading-snug font-semibold">{post.title}</h3>
                    {post.reasons[0] ? <p className="text-muted-foreground mt-auto line-clamp-2 text-xs">Why: {post.reasons[0]}</p> : null}
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
