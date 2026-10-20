'use client';

import { useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import type { VoiceAgentOption } from '@/app/actions/voice-agent-actions';
import type { CallSuccessFilter, VoiceCallListItem } from '@/app/actions/voice-call-actions';

export type CallLogsPageData = {
    calls: VoiceCallListItem[];
    agents: VoiceAgentOption[];
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

    return {
        calls: data.calls,
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
