'use client';

import { useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import type { VoiceAgentOption } from '@/app/actions/voice-agent-actions';
import type { CallSuccessFilter, VoiceAgentCostTotals, VoiceCallListItem } from '@/app/actions/voice-call-actions';

export type CallLogsPageData = {
    calls: VoiceCallListItem[];
    agents: VoiceAgentOption[];
    /** Per agent, over all their priced calls (just the filtered agent's when filtered). */
    costTotals: VoiceAgentCostTotals[];
    agentFilter: string | null;
    /** Calls the analysis judged successful or not (`?success=yes|no`). */
    successFilter: CallSuccessFilter | null;
    limit: number;
    loadError: string | null;
};

export function useCallLogsPage(data: CallLogsPageData) {
    const router = useRouter();
    const pathname = usePathname();
    const [filtering, startFiltering] = useTransition();

    /** The filters live in the URL (`?agent=&success=`), so a filtered list can be reloaded and shared. */
    const applyFilters = (agentId: string | null, success: CallSuccessFilter | null) => {
        const params = new URLSearchParams();
        if (agentId) params.set('agent', agentId);
        if (success) params.set('success', success);
        const query = params.toString();
        startFiltering(() => {
            router.push(query ? `${pathname}?${query}` : pathname);
        });
    };
    const setAgentFilter = (agentId: string | null) => applyFilters(agentId, data.successFilter);
    const setSuccessFilter = (success: CallSuccessFilter | null) => applyFilters(data.agentFilter, success);

    const agentFilterName = data.agentFilter
        ? (data.agents.find((a) => a.id === data.agentFilter)?.name ?? 'Deleted agent')
        : null;

    // The summary above the list: the filtered agent, or every agent added up.
    const costTotal = data.costTotals.reduce(
        (sum, row) => ({
            calls: sum.calls + row.calls,
            durationSec: sum.durationSec + row.durationSec,
            totalUsd: sum.totalUsd + row.totalUsd,
            geminiUsd: sum.geminiUsd + row.geminiUsd,
            providerUsd: sum.providerUsd + row.providerUsd,
            estimated: sum.estimated || row.estimated,
        }),
        { calls: 0, durationSec: 0, totalUsd: 0, geminiUsd: 0, providerUsd: 0, estimated: false },
    );

    return {
        calls: data.calls,
        costTotal,
        agents: data.agents,
        agentFilter: data.agentFilter,
        agentFilterName,
        successFilter: data.successFilter,
        setSuccessFilter,
        limit: data.limit,
        loadError: data.loadError,
        filtering,
        setAgentFilter,
    };
}

export type UseCallLogsPageReturn = ReturnType<typeof useCallLogsPage>;
