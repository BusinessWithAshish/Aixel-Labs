'use client';

import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import type { CONTENT_LAB_CHECK_RESPONSE, ContentLabPlatform } from '@aixellabs/backend/content-lab/types';
import { CONTENT_LAB_CHECK_ROUTE } from '@/config/app-config';
import { contentLabApi } from '@/helpers/content-lab-api';
import { CONTENT_LAB_DEFAULT_LANGUAGE } from '../../../_constants';

export type CheckPageData = {
    platform: ContentLabPlatform;
    query: string;
    text: string;
    country: string;
    /** "3 stronger versions" run on the owner's own Gemini key. */
    hasGeminiKey: boolean;
};

type CheckInput = { platform: ContentLabPlatform; query: string; text: string; language: string };

export type CheckState =
    | { status: 'idle' }
    | { status: 'loading' }
    | { status: 'error'; error: string }
    | { status: 'done'; result: CONTENT_LAB_CHECK_RESPONSE };

export type RewritesState =
    | { status: 'idle' }
    | { status: 'loading' }
    | { status: 'no-key' }
    | { status: 'error'; error: string }
    | { status: 'done'; versions: string[] };

const WINNER_EXAMPLES = 6;

function syncUrl({ platform, query, text }: CheckInput): void {
    const search = new URLSearchParams({ platform, q: query, text });
    window.history.replaceState(null, '', `${CONTENT_LAB_CHECK_ROUTE}?${search}`);
}

/**
 * Check my idea: scores a title/hook against the niche's winners, then (on the owner's Gemini key)
 * writes 3 stronger versions. "Use" swaps a version in and checks again; a new check aborts the last.
 */
export function useCheckPage(data: CheckPageData) {
    const [platform, setPlatform] = useState(data.platform);
    const [query, setQuery] = useState(data.query);
    const [text, setText] = useState(data.text);
    const [language, setLanguage] = useState<string>(CONTENT_LAB_DEFAULT_LANGUAGE);
    const [check, setCheck] = useState<CheckState>({ status: 'idle' });
    const [rewrites, setRewrites] = useState<RewritesState>({ status: 'idle' });
    const inFlight = useRef<AbortController | null>(null);

    const run = useCallback(
        async (input: CheckInput) => {
            inFlight.current?.abort();
            const controller = new AbortController();
            inFlight.current = controller;
            setCheck({ status: 'loading' });
            setRewrites({ status: 'idle' });
            syncUrl(input);

            const reply = await contentLabApi.check(
                { text: input.text, platform: input.platform, query: input.query, country: data.country },
                controller.signal,
            );
            if (controller.signal.aborted) return;
            if (!reply.success || !reply.data) {
                setCheck({ status: 'error', error: reply.error ?? 'Could not check this idea' });
                return;
            }
            const result = reply.data;
            setCheck({ status: 'done', result });
            if (!data.hasGeminiKey) {
                setRewrites({ status: 'no-key' });
                return;
            }

            setRewrites({ status: 'loading' });
            const written = await contentLabApi.write(
                {
                    mode: 'rewrites',
                    draft: input.text,
                    platform: input.platform,
                    language: input.language,
                    context: {
                        topic: input.query,
                        patterns: result.checks.map((c) => `${c.passed ? 'Has' : 'Missing'}: ${c.label} (${c.detail})`),
                        examples: result.winners.slice(0, WINNER_EXAMPLES).map((post) => ({ title: post.title, url: post.url })),
                    },
                },
                controller.signal,
            );
            if (controller.signal.aborted) return;
            if (written.success && written.data && 'versions' in written.data) {
                setRewrites({ status: 'done', versions: written.data.versions });
            } else {
                setRewrites({ status: 'error', error: written.error ?? 'Could not write stronger versions' });
            }
        },
        [data.country, data.hasGeminiKey],
    );

    // A shared link (`?q=&text=`) checks at once; leaving the page aborts what is in flight.
    const initial = useRef({ platform: data.platform, query: data.query, text: data.text });
    useEffect(() => {
        const { platform: p, query: q, text: t } = initial.current;
        if (q && t) void run({ platform: p, query: q, text: t, language: CONTENT_LAB_DEFAULT_LANGUAGE });
        return () => inFlight.current?.abort();
    }, [run]);

    const canSubmit = !!text.trim() && !!query.trim() && check.status !== 'loading';

    const submit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (canSubmit) void run({ platform, query: query.trim(), text: text.trim(), language });
    };

    const applyVersion = (version: string) => {
        setText(version);
        void run({ platform, query: query.trim(), text: version, language });
    };

    return {
        platform,
        setPlatform,
        query,
        setQuery,
        text,
        setText,
        language,
        setLanguage,
        check,
        rewrites,
        canSubmit,
        submit,
        applyVersion,
    };
}

export type UseCheckPageReturn = ReturnType<typeof useCheckPage>;
