'use client';

import Link, { useLinkStatus } from 'next/link';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** A spinning ring: something is on its way. */
export function Spinner({ className }: { className?: string }) {
    return <span className={cn('spin', className)} aria-hidden="true" />;
}

/** A whole screen waiting on the game server: joining a room, taking a seat back. */
export function ScreenLoader({ text }: { text: string }) {
    return (
        <main className="screen form loader" role="status" aria-live="polite">
            <Spinner />
            <p className="center">{text}</p>
        </main>
    );
}

/** Inside a `PendingLink`: a spinner while the page it opens is on its way. */
function LinkPending() {
    const { pending } = useLinkStatus();
    return pending ? <Spinner className="sm" /> : null;
}

/** A game button that is a link, and shows a spinner from the tap until the next page is up. */
export function PendingLink({ href, className, onClick, children }: { href: string; className?: string; onClick?: () => void; children: ReactNode }) {
    return (
        <Link href={href} className={cn('gbtn', className)} onClick={onClick}>
            <LinkPending />
            {children}
        </Link>
    );
}
