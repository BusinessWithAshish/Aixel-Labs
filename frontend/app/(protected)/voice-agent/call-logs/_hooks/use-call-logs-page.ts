'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import type { VoiceAgentOption } from '@/app/actions/voice-agent-actions';
import { listMyCalls, type VoiceCallListItem } from '@/app/actions/voice-call-actions';
import { costParts, isCostEstimated } from '@/helpers/voice-call-cost';
import {
    callLogFiltersQuery,
    callLogsQuery,
    NO_CALL_LOG_FILTERS,
    parseCallLogFilters,
    type CallLogFilters,
} from '../_utils/call-log-filters';

export type CallLogsPageData = {
    calls: VoiceCallListItem[];
    agents: VoiceAgentOption[];
    filters: CallLogFilters;
    limit: number;
    loadError: string | null;
};

const LOAD_ERROR = 'Could not load your calls';

/** The filters in the address bar right now. */
const urlFilters = () => parseCallLogFilters(Object.fromEntries(new URLSearchParams(window.location.search)));

/**
 * The page arrives rendered for its URL; a filter change after that loads the calls through `listMyCalls` and moves
 * the URL with `history.pushState` (Next keeps `useSearchParams` and Back in step). Not `router.push`: on Next 15.5 a
 * push made soon after the previous one sometimes never commits, which left the page on the old calls with every
 * filter disabled (call-logs e2e, about one run in two).
 */
export function useCallLogsPage(data: CallLogsPageData) {
    const pathname = usePathname();
    const [shown, setShown] = useState({
        source: data,
        filters: data.filters,
        calls: data.calls,
        loadError: data.loadError,
    });
    const [filtering, setFiltering] = useState(false);
    const latest = useRef(0);

    // A fresh server render (a reload, the currency changed) replaces what the filters loaded.
    if (shown.source !== data) {
        setShown({ source: data, filters: data.filters, calls: data.calls, loadError: data.loadError });
    }
    const { filters } = shown;

    const load = async (next: CallLogFilters) => {
        const request = ++latest.current;
        setShown((s) => ({ ...s, filters: next }));
        setFiltering(true);
        const res = await listMyCalls(callLogsQuery(next, data.limit)).catch(() => null);
        // Only the last change counts: an earlier answer arriving late is dropped.
        if (request !== latest.current) return;
        setShown((s) => ({
            ...s,
            calls: res?.success && res.data ? res.data : [],
            loadError: res?.success ? null : (res?.error ?? LOAD_ERROR),
        }));
        setFiltering(false);
    };

    const pushFilters = (next: CallLogFilters) => {
        const query = callLogFiltersQuery(next);
        window.history.pushState(null, '', query ? `${pathname}?${query}` : pathname);
        void load(next);
    };

    // Back and Forward walk the filters the same way. Coming Back from a call, Next may hand the list its first
    // render while the URL holds later filters: the URL wins.
    const loadRef = useRef(load);
    loadRef.current = load;
    const rendered = useRef(data.filters);
    useEffect(() => {
        const fromUrl = urlFilters();
        if (callLogFiltersQuery(fromUrl) !== callLogFiltersQuery(rendered.current)) void loadRef.current(fromUrl);
        const onPop = () => void loadRef.current(urlFilters());
        window.addEventListener('popstate', onPop);
        return () => window.removeEventListener('popstate', onPop);
    }, []);

    const agentFilterName = filters.agent
        ? (data.agents.find((a) => a.id === filters.agent)?.name ?? 'Deleted agent')
        : null;

    // The summary above the list adds up exactly the calls in it; only some calls have a cost.
    const summary = shown.calls.reduce(
        (sum, call) => ({
            durationSec: sum.durationSec + call.durationSec,
            priced: sum.priced + (call.cost ? 1 : 0),
            pricedSec: sum.pricedSec + (call.cost ? call.durationSec : 0),
            totalUsd: sum.totalUsd + (call.cost?.totalUsd ?? 0),
            parts: call.cost
                ? costParts(call.cost).reduce(
                      (parts, { part, usd }) => ({ ...parts, [part]: (parts[part] ?? 0) + usd }),
                      sum.parts,
                  )
                : sum.parts,
            estimated: sum.estimated || (!!call.cost && isCostEstimated(call.cost)),
        }),
        {
            durationSec: 0,
            priced: 0,
            pricedSec: 0,
            totalUsd: 0,
            parts: {} as Record<string, number>,
            estimated: false,
        },
    );

    return {
        calls: shown.calls,
        summary,
        agents: data.agents,
        filters,
        filtersSet: callLogFiltersQuery(filters) !== '',
        /** How many of the sheet's filters are set (the search sits on the page, beside it). */
        sheetFiltersSet: [filters.agent, filters.deleted, filters.kind, filters.success, filters.range !== 'all'].filter(
            Boolean,
        ).length,
        resetSheetFilters: () => pushFilters({ ...NO_CALL_LOG_FILTERS, q: filters.q }),
        setFilter: <K extends keyof CallLogFilters>(key: K, value: CallLogFilters[K]) =>
            pushFilters({ ...filters, [key]: value }),
        clearFilters: () => pushFilters(NO_CALL_LOG_FILTERS),
        agentFilterName,
        limit: data.limit,
        loadError: shown.loadError,
        filtering,
    };
}

export type UseCallLogsPageReturn = ReturnType<typeof useCallLogsPage>;
