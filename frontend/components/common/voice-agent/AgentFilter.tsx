'use client';

import type { VoiceAgentOption } from '@/app/actions/voice-agent-actions';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';

const ALL_AGENTS = 'all';

/**
 * Call logs' and Analytics' agent picker, and whether agents deleted since count too (off by
 * default: only current agents). A deleted agent picked through the URL stays pickable.
 */
export function AgentFilter({
    id,
    agents,
    agentId,
    includeDeleted,
    disabled,
    onAgentChange,
    onIncludeDeletedChange,
}: {
    id: string;
    agents: VoiceAgentOption[];
    agentId: string | null;
    includeDeleted: boolean;
    disabled: boolean;
    onAgentChange: (agentId: string | null) => void;
    onIncludeDeletedChange: (includeDeleted: boolean) => void;
}) {
    return (
        <>
            <div className="flex w-full flex-col gap-1.5 sm:w-56">
                <Label htmlFor={id}>Agent</Label>
                <Select
                    value={agentId ?? ALL_AGENTS}
                    disabled={disabled}
                    onValueChange={(value) => onAgentChange(value === ALL_AGENTS ? null : value)}
                >
                    <SelectTrigger id={id} className="w-full">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value={ALL_AGENTS}>All agents</SelectItem>
                        {agentId && !agents.some((a) => a.id === agentId) ? (
                            <SelectItem value={agentId}>Deleted agent</SelectItem>
                        ) : null}
                        {agents.map((agent) => (
                            <SelectItem key={agent.id} value={agent.id}>
                                {agent.name}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
            <div className="flex items-center gap-2 sm:h-9">
                <Switch
                    id={`${id}-deleted`}
                    checked={includeDeleted}
                    disabled={disabled || !!agentId}
                    onCheckedChange={onIncludeDeletedChange}
                />
                <Label htmlFor={`${id}-deleted`}>Include deleted agents</Label>
            </div>
        </>
    );
}
