'use client';

import { useEffect, useState } from 'react';
import type { CONTENT_LAB_SUGGESTION, ContentLabPlatform } from '@aixellabs/backend/content-lab/types';
import { contentLabApi } from '@/helpers/content-lab-api';

/** Wait this long after the last keystroke before asking. */
const DEBOUNCE_MS = 250;
const MIN_CHARS = 2;

type SuggestState = { key: string; creators: CONTENT_LAB_SUGGESTION[]; error: string | null };

/**
 * Creators matching what has been typed, Google-style: asks the BFF 250 ms after the last keystroke and
 * cancels the request in flight when the text or platform changes, so an older answer never lands last.
 */
export function useCreatorSuggest(platform: ContentLabPlatform, query: string, country: string) {
    const typed = query.trim().replace(/^@+/, '');
    const key = typed.length >= MIN_CHARS ? `${platform}|${country}|${typed.toLowerCase()}` : '';
    const [state, setState] = useState<SuggestState>({ key: '', creators: [], error: null });

    useEffect(() => {
        if (!key) return;
        const controller = new AbortController();
        const timer = window.setTimeout(async () => {
            const response = await contentLabApi.suggest({ platform, query: typed, country }, controller.signal);
            if (controller.signal.aborted) return;
            setState({
                key,
                creators: response.success ? (response.data?.creators ?? []) : [],
                error: response.success ? null : (response.error ?? 'Could not look up creators'),
            });
        }, DEBOUNCE_MS);
        return () => {
            window.clearTimeout(timer);
            controller.abort();
        };
        // `key` covers platform, country and the typed text.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key]);

    const current = !!key && state.key === key;
    return {
        /** What was typed, without a leading @. */
        typed,
        creators: current ? state.creators : [],
        error: current ? state.error : null,
        /** Waiting for the answer to what is typed now. */
        loading: !!key && !current,
    };
}

export type UseCreatorSuggestReturn = ReturnType<typeof useCreatorSuggest>;
