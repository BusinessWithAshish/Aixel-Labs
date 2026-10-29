'use client';

import { useEffect, useState } from 'react';
import type { CONTENT_LAB_BREAKDOWN_RESPONSE } from '@aixellabs/backend/content-lab/types';
import { contentLabApi } from '@/helpers/content-lab-api';
import { usePostActions } from '../../../_hooks/use-post-actions';

export type BreakdownPageData = {
    postId: string;
    /** The post's own URL (`?url=`, else rebuilt from the id); `null` when neither works. */
    url: string | null;
    country: string;
};

export type BreakdownLoadState =
    | { status: 'loading' }
    | { status: 'error'; error: string }
    | { status: 'done'; breakdown: CONTENT_LAB_BREAKDOWN_RESPONSE };

/** One post's breakdown (hook, structure, CTA, why it worked) plus the watch / board actions. */
export function useBreakdownPage({ url, country }: BreakdownPageData) {
    const [attempt, setAttempt] = useState(0);
    const [state, setState] = useState<BreakdownLoadState>({ status: 'loading' });
    const actions = usePostActions(country);

    useEffect(() => {
        if (!url) return;
        const controller = new AbortController();
        setState({ status: 'loading' });
        void contentLabApi.breakdown({ url, country }, controller.signal).then((reply) => {
            if (controller.signal.aborted) return;
            setState(
                reply.success && reply.data
                    ? { status: 'done', breakdown: reply.data }
                    : { status: 'error', error: reply.error ?? 'Could not break this post down' },
            );
        });
        return () => controller.abort();
    }, [url, country, attempt]);

    return { url, state, retry: () => setAttempt((n) => n + 1), ...actions };
}

export type UseBreakdownPageReturn = ReturnType<typeof useBreakdownPage>;
