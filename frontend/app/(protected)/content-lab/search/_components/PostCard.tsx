'use client';

import Link from 'next/link';
import { EyeIcon, LayoutDashboardIcon, Loader2Icon } from 'lucide-react';
import type { CONTENT_LAB_POST } from '@aixellabs/backend/content-lab/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { CONTENT_LAB_PLATFORM_LABELS, CONTENT_LAB_POST_FORMAT_LABELS } from '../../_constants';
import { compactNumber, creatorLabel, formatMultiple } from '../_utils/format';
import { postBreakdownHref } from '../_utils/smart-box';
import { PostThumb } from './PostThumb';

export function PostBadges({ post, className }: { post: Pick<CONTENT_LAB_POST, 'platform' | 'format'>; className?: string }) {
    return (
        <span className={cn('text-muted-foreground text-xs font-medium uppercase tracking-wide', className)}>
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

/** One result on "What's working": opens its breakdown; watch the creator or start a board from it. */
export function PostCard({ post, busy, onWatch, onBoard }: PostCardProps) {
    const watching = busy === `watch:${post.creator.id}`;
    const boarding = busy === `board:${post.url}`;

    return (
        <Card className="gap-0 overflow-hidden py-0" data-testid="content-lab-post-card">
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
            <div className="flex flex-wrap gap-1 border-t p-2">
                <Button variant="ghost" size="sm" onClick={onWatch} disabled={!!busy}>
                    {watching ? <Loader2Icon className="animate-spin" /> : <EyeIcon />} Watch creator
                </Button>
                <Button variant="ghost" size="sm" onClick={onBoard} disabled={!!busy}>
                    {boarding ? <Loader2Icon className="animate-spin" /> : <LayoutDashboardIcon />} Use on a board
                </Button>
            </div>
        </Card>
    );
}
