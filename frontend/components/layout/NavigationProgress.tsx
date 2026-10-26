'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { eventBus } from '@/lib/event-bus';

/** Longest the bar stays up when a click did not navigate after all (its own handler stopped it). */
const GIVE_UP_MS = 10_000;

/** Shows the bar when `href` opens another page of this app; query-only changes have their own pending states. */
export function startNavigationProgress(href: string) {
    const url = new URL(href, window.location.href);
    if (url.origin === window.location.origin && url.pathname !== window.location.pathname) {
        void eventBus.publish('navigation:progress', true);
    }
}

function onLinkClick(event: MouseEvent) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const anchor = (event.target as Element | null)?.closest?.('a[href]');
    if (!(anchor instanceof HTMLAnchorElement) || anchor.hasAttribute('download')) return;
    if (anchor.target && anchor.target !== '_self') return;
    startNavigationProgress(anchor.href);
}

/**
 * A thin bar at the top from the moment an in-app link is clicked (or `useProgressRouter` pushes) until the next
 * page renders, so a page that is still loading never looks frozen.
 */
export function NavigationProgress() {
    const pathname = usePathname();
    const [active, setActive] = useState(false);

    useEffect(() => eventBus.subscribe('navigation:progress', setActive), []);
    useEffect(() => void eventBus.publish('navigation:progress', false), [pathname]);
    useEffect(() => {
        // Capture: Next's Link stops the click before it bubbles up to the document.
        document.addEventListener('click', onLinkClick, true);
        return () => document.removeEventListener('click', onLinkClick, true);
    }, []);
    useEffect(() => {
        if (!active) return;
        const timer = setTimeout(() => void eventBus.publish('navigation:progress', false), GIVE_UP_MS);
        return () => clearTimeout(timer);
    }, [active]);

    if (!active) return null;
    return (
        <div
            role="progressbar"
            aria-label="Loading the page"
            className="bg-primary/20 fixed inset-x-0 top-0 z-[100] h-0.5 overflow-hidden"
        >
            <div className="bg-primary h-full w-1/3 animate-[shimmer_1.1s_ease-in-out_infinite]" />
        </div>
    );
}
