'use client';

import type { VoiceAgentOption } from '@/app/actions/voice-agent-actions';
import { FilterSelect, FilterSwitch } from '@/components/common/FilterToolbar';

const ALL_AGENTS = 'all';

/**
 * The agent filter of Call logs, Analytics and Bookings, for a `FilterToolbar`. With
 * `onIncludeDeletedChange`, also whether agents deleted since count (off by default: current agents
 * only). A deleted agent picked through the URL stays pickable.
 */
export function AgentFilter({
    id,
    agents,
    agentId,
    disabled,
    onAgentChange,
    includeDeleted = false,
    onIncludeDeletedChange,
}: {
    id: string;
    agents: VoiceAgentOption[];
    agentId: string | null;
    disabled: boolean;
    onAgentChange: (agentId: string | null) => void;
    includeDeleted?: boolean;
    onIncludeDeletedChange?: (includeDeleted: boolean) => void;
}) {
    const options = [
        { value: ALL_AGENTS, label: 'All agents' },
        ...(agentId && !agents.some((a) => a.id === agentId) ? [{ value: agentId, label: 'Deleted agent' }] : []),
        ...agents.map((agent) => ({ value: agent.id, label: agent.name })),
    ];
    return (
        <>
            <FilterSelect
                id={id}
                label="Agent"
                value={agentId ?? ALL_AGENTS}
                options={options}
                disabled={disabled}
                onChange={(value) => onAgentChange(value === ALL_AGENTS ? null : value)}
                className="sm:max-w-56"
            />
            {onIncludeDeletedChange ? (
                <FilterSwitch
                    id={`${id}-deleted`}
                    label="Show deleted agents"
                    checked={includeDeleted}
                    disabled={disabled || !!agentId}
                    onChange={onIncludeDeletedChange}
                />
            ) : null}
        </>
    );
}
