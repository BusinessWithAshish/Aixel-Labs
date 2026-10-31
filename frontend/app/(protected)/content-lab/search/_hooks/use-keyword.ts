'use client';

import { useEffect, useState } from 'react';
import type { CONTENT_LAB_KEYWORD_RESPONSE, ContentLabPlatform } from '@aixellabs/backend/content-lab/types';
import { contentLabApi } from '@/helpers/content-lab-api';

const MIN_CHARS = 2;

type KeywordState = { key: string; data: CONTENT_LAB_KEYWORD_RESPONSE | null; error: string | null };

type UseKeywordOptions = {
    /** Also read the 12-month YouTube search interest (~2-4 s) for the score; without it only what people search (~0.3 s). */
    trend: boolean;
    /** Wait this long after the last change before asking. */
    delayMs: number;
    /** The sources picked: each is scored on its own; changing them asks again. */
    platforms: readonly ContentLabPlatform[];
};

/**
 * How strong a topic is on each source picked, and what people search for it (`/api/content-lab/keyword`). Like creator type-ahead:
 * asks `delayMs` after the text settles and cancels the request in flight when it changes, so an older answer
 * never lands last. `query` null or under 2 characters asks nothing.
 */
export function useKeyword(query: string | null, country: string, { trend, delayMs, platforms }: UseKeywordOptions) {
    const text = query?.trim() ?? '';
    const sources = platforms.join(',');
    const key = text.length >= MIN_CHARS ? `${country}|${trend}|${sources}|${text.toLowerCase()}` : '';
    const [state, setState] = useState<KeywordState>({ key: '', data: null, error: null });

    useEffect(() => {
        if (!key) return;
        const controller = new AbortController();
        const timer = window.setTimeout(async () => {
            const response = await contentLabApi.keyword({ query: text, country, trend, platforms: [...platforms] }, controller.signal);
            if (controller.signal.aborted) return;
            setState({
                key,
                data: response.success ? (response.data ?? null) : null,
                error: response.success ? null : (response.error ?? 'Could not score this topic'),
            });
        }, delayMs);
        return () => {
            window.clearTimeout(timer);
            controller.abort();
        };
        // `key` covers the text, country, trend and sources.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key]);

    const current = !!key && state.key === key;
    return {
        data: current ? state.data : null,
        error: current ? state.error : null,
        /** Waiting for the answer to the text as it is now. */
        loading: !!key && !current,
    };
}

export type UseKeywordReturn = ReturnType<typeof useKeyword>;
