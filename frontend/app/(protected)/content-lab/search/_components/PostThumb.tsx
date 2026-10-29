'use client';

import { useState } from 'react';
import type { CONTENT_LAB_POST } from '@aixellabs/backend/content-lab/types';
import { cn } from '@/lib/utils';

type PostThumbProps = {
    post: Pick<CONTENT_LAB_POST, 'title' | 'thumbnailUrl'>;
    className?: string;
};

/**
 * The post's thumbnail, straight from the platform CDN (`no-referrer`, as lead cards load Instagram
 * images); a tinted title card when there is none or it fails. Plain `<img>`: CDN hosts are not in `next.config` images.
 */
export function PostThumb({ post, className }: PostThumbProps) {
    const [failed, setFailed] = useState(false);
    const src = !failed ? post.thumbnailUrl : null;

    return (
        <div className={cn('bg-muted relative aspect-video w-full overflow-hidden', className)}>
            {src ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                    src={src}
                    alt={post.title}
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    onError={() => setFailed(true)}
                    className="size-full object-cover"
                />
            ) : (
                <div
                    role="img"
                    aria-label={post.title}
                    className="from-primary/80 to-primary/40 text-primary-foreground flex size-full items-end bg-gradient-to-br p-3 text-sm font-semibold"
                >
                    <span className="line-clamp-3">{post.title}</span>
                </div>
            )}
        </div>
    );
}
