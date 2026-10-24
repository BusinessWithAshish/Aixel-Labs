'use client';

import { useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import type { VoiceAgentOption } from '@/app/actions/voice-agent-actions';
import type { VoiceAnalytics } from '@/app/actions/voice-analytics-actions';
import { CALL_RANGES, DEFAULT_ANALYTICS_RANGE, type VoiceCallRange } from '@/helpers/voice-call-ranges';

export type VoiceAnalyticsPageData = {
    analytics: VoiceAnalytics | null;
    agents: VoiceAgentOption[];
    agentFilter: string | null;
    /** Agents deleted since count too (`?deleted=1`). */
    includeDeleted: boolean;
    range: VoiceCallRange;
    loadError: string | null;
};

export function useVoiceAnalyticsPage(data: VoiceAnalyticsPageData) {
    const router = useRouter();
    const pathname = usePathname();
    const [filtering, startFiltering] = useTransition();

    /** The filters live in the URL (`?agent=&range=&deleted=1`), like Call logs. */
    const applyFilters = (next: Partial<{ agent: string | null; range: VoiceCallRange; deleted: boolean }>) => {
        const { agent, range, deleted } = {
            agent: data.agentFilter,
            range: data.range,
            deleted: data.includeDeleted,
            ...next,
        };
        const params = new URLSearchParams({ range });
        if (agent) params.set('agent', agent);
        if (deleted) params.set('deleted', '1');
        startFiltering(() => {
            router.push(`${pathname}?${params}`);
        });
    };

    return {
        analytics: data.analytics,
        agents: data.agents,
        agentFilter: data.agentFilter,
        includeDeleted: data.includeDeleted,
        range: data.range,
        rangeLabel: CALL_RANGES.find((r) => r.value === data.range)?.label ?? '',
        loadError: data.loadError,
        filtering,
        setAgentFilter: (agent: string | null) => applyFilters({ agent }),
        setRange: (range: VoiceCallRange) => applyFilters({ range }),
        setIncludeDeleted: (deleted: boolean) => applyFilters({ deleted }),
        filtersSet: !!data.agentFilter || data.includeDeleted || data.range !== DEFAULT_ANALYTICS_RANGE,
        clearFilters: () => applyFilters({ agent: null, deleted: false, range: DEFAULT_ANALYTICS_RANGE }),
    };
}

export type UseVoiceAnalyticsPageReturn = ReturnType<typeof useVoiceAnalyticsPage>;
