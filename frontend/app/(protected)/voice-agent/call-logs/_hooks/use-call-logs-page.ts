'use client';

import { useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import type { VoiceAgentOption } from '@/app/actions/voice-agent-actions';
import type { CallSuccessFilter, VoiceCallListItem } from '@/app/actions/voice-call-actions';
import { isCostEstimated } from '@/helpers/voice-call-cost';

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

    // The summary above the list adds up exactly the calls in it; only some calls have a cost.
    const summary = data.calls.reduce(
        (sum, call) => ({
            durationSec: sum.durationSec + call.durationSec,
            priced: sum.priced + (call.cost ? 1 : 0),
            pricedSec: sum.pricedSec + (call.cost ? call.durationSec : 0),
            totalUsd: sum.totalUsd + (call.cost?.totalUsd ?? 0),
            geminiUsd: sum.geminiUsd + (call.cost?.geminiUsd ?? 0),
            providerUsd: sum.providerUsd + (call.cost?.providerUsd ?? 0),
            estimated: sum.estimated || (!!call.cost && isCostEstimated(call.cost)),
        }),
        { durationSec: 0, priced: 0, pricedSec: 0, totalUsd: 0, geminiUsd: 0, providerUsd: 0, estimated: false },
    );

    return {
        calls: data.calls,
        summary,
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
