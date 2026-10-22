'use client';

import { useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import type { VoiceAgentOption } from '@/app/actions/voice-agent-actions';
import type { CallSuccessFilter, VoiceCallListItem } from '@/app/actions/voice-call-actions';
import { costParts, isCostEstimated } from '@/helpers/voice-call-cost';

export type CallLogsPageData = {
    calls: VoiceCallListItem[];
    agents: VoiceAgentOption[];
    agentFilter: string | null;
    /** Calls the analysis judged successful or not (`?success=yes|no`). */
    successFilter: CallSuccessFilter | null;
    /** Calls of agents deleted since show too (`?deleted=1`). */
    includeDeleted: boolean;
    limit: number;
    loadError: string | null;
};

export function useCallLogsPage(data: CallLogsPageData) {
    const router = useRouter();
    const pathname = usePathname();
    const [filtering, startFiltering] = useTransition();

    /** The filters live in the URL (`?agent=&success=&deleted=1`), so a filtered list can be reloaded and shared. */
    const applyFilters = (next: Partial<{ agent: string | null; success: CallSuccessFilter | null; deleted: boolean }>) => {
        const { agent, success, deleted } = {
            agent: data.agentFilter,
            success: data.successFilter,
            deleted: data.includeDeleted,
            ...next,
        };
        const params = new URLSearchParams();
        if (agent) params.set('agent', agent);
        if (success) params.set('success', success);
        if (deleted) params.set('deleted', '1');
        const query = params.toString();
        startFiltering(() => {
            router.push(query ? `${pathname}?${query}` : pathname);
        });
    };

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
        agentFilter: data.agentFilter,
        agentFilterName,
        successFilter: data.successFilter,
        includeDeleted: data.includeDeleted,
        setSuccessFilter: (success: CallSuccessFilter | null) => applyFilters({ success }),
        setAgentFilter: (agent: string | null) => applyFilters({ agent }),
        setIncludeDeleted: (deleted: boolean) => applyFilters({ deleted }),
        limit: data.limit,
        loadError: data.loadError,
        filtering,
    };
}

export type UseCallLogsPageReturn = ReturnType<typeof useCallLogsPage>;
