'use client';

import { useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import type { VoiceAgentOption } from '@/app/actions/voice-agent-actions';
import type { VoiceCallListItem } from '@/app/actions/voice-call-actions';
import { costParts, isCostEstimated } from '@/helpers/voice-call-cost';
import { callLogFiltersQuery, NO_CALL_LOG_FILTERS, type CallLogFilters } from '../_utils/call-log-filters';

export type CallLogsPageData = {
    calls: VoiceCallListItem[];
    agents: VoiceAgentOption[];
    filters: CallLogFilters;
    limit: number;
    loadError: string | null;
};

export function useCallLogsPage(data: CallLogsPageData) {
    const router = useRouter();
    const pathname = usePathname();
    const [filtering, startFiltering] = useTransition();
    const { filters } = data;

    const pushFilters = (next: CallLogFilters) => {
        const query = callLogFiltersQuery(next);
        startFiltering(() => {
            router.push(query ? `${pathname}?${query}` : pathname);
        });
    };

    const agentFilterName = filters.agent
        ? (data.agents.find((a) => a.id === filters.agent)?.name ?? 'Deleted agent')
        : null;

    // The summary above the list adds up exactly the calls in it; only some calls have a cost.
    const summary = data.calls.reduce(
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
        calls: data.calls,
        summary,
        agents: data.agents,
        filters,
        filtersSet: callLogFiltersQuery(filters) !== '',
        setFilter: <K extends keyof CallLogFilters>(key: K, value: CallLogFilters[K]) =>
            pushFilters({ ...filters, [key]: value }),
        clearFilters: () => pushFilters(NO_CALL_LOG_FILTERS),
        agentFilterName,
        limit: data.limit,
        loadError: data.loadError,
        filtering,
    };
}

export type UseCallLogsPageReturn = ReturnType<typeof useCallLogsPage>;
