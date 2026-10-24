'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { startNavigationProgress } from '@/components/layout/NavigationProgress';

type AppRouter = ReturnType<typeof useRouter>;

/** `useRouter` whose push / replace show the navigation bar when they open another page. */
export function useProgressRouter(): AppRouter {
    const router = useRouter();
    return useMemo(
        () => ({
            ...router,
            push: (href: Parameters<AppRouter['push']>[0], options?: Parameters<AppRouter['push']>[1]) => {
                startNavigationProgress(href);
                router.push(href, options);
            },
            replace: (href: Parameters<AppRouter['replace']>[0], options?: Parameters<AppRouter['replace']>[1]) => {
                startNavigationProgress(href);
                router.replace(href, options);
            },
        }),
        [router],
    );
}
