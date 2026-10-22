'use client';

import { useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import type { VoiceAgentOption } from '@/app/actions/voice-agent-actions';
import type { VoiceAnalytics, VoiceAnalyticsRange } from '@/app/actions/voice-analytics-actions';
import { ANALYTICS_RANGES } from '../_utils/analytics-ranges';

export type VoiceAnalyticsPageData = {
    analytics: VoiceAnalytics | null;
    agents: VoiceAgentOption[];
    agentFilter: string | null;
    range: VoiceAnalyticsRange;
    loadError: string | null;
};

export function useVoiceAnalyticsPage(data: VoiceAnalyticsPageData) {
    const router = useRouter();
    const pathname = usePathname();
    const [filtering, startFiltering] = useTransition();

    /** The filters live in the URL (`?agent=&range=`), like Call logs. */
    const applyFilters = (agentId: string | null, range: VoiceAnalyticsRange) => {
        const params = new URLSearchParams({ range });
        if (agentId) params.set('agent', agentId);
        startFiltering(() => {
            router.push(`${pathname}?${params}`);
        });
    };

    return {
        analytics: data.analytics,
        agents: data.agents,
        agentFilter: data.agentFilter,
        range: data.range,
        rangeLabel: ANALYTICS_RANGES.find((r) => r.value === data.range)?.label ?? '',
        loadError: data.loadError,
        filtering,
        setAgentFilter: (agentId: string | null) => applyFilters(agentId, data.range),
        setRange: (range: VoiceAnalyticsRange) => applyFilters(data.agentFilter, range),
    };
}

export type UseVoiceAnalyticsPageReturn = ReturnType<typeof useVoiceAnalyticsPage>;
