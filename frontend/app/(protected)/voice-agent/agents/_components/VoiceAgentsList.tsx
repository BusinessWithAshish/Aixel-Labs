'use client';

import { Bot, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EmptyState } from '@/components/common/EmptyState';
import { usePage } from '@/contexts/PageStore';
import type { AgentFilter, UseVoiceAgentsPageReturn } from '../_hooks/use-voice-agents-page';
import { CreateVoiceAgentDialog } from './CreateVoiceAgentDialog';
import { DeleteAgentDialog } from './DeleteAgentDialog';
import { VoiceAgentCard } from './VoiceAgentCard';

const FILTERS: { value: AgentFilter; label: string; whatsapp?: boolean }[] = [
    { value: 'all', label: 'All' },
    { value: 'calls', label: 'Calls' },
    { value: 'whatsapp', label: 'WhatsApp', whatsapp: true },
    { value: 'none', label: 'No number' },
];

const EMPTY_FILTER: Record<AgentFilter, string> = {
    all: '',
    calls: 'No agent answers or places calls on a phone number yet.',
    whatsapp: 'No agent answers a WhatsApp number yet.',
    none: 'Every agent is on a number.',
};

export function VoiceAgentsList() {
    const {
        total,
        agents,
        whatsapp,
        filter,
        setFilter,
        openCreate,
        toDelete,
        toDeleteOnNumbers,
        askDelete,
        onDeleteOpenChange,
        deleting,
        confirmDelete,
    } = usePage<UseVoiceAgentsPageReturn>();
    const newAgentButton = (
        <Button onClick={openCreate} data-testid="new-voice-agent">
            <Plus className="size-4" />
            New agent
        </Button>
    );

    return (
        <>
            {total === 0 ? (
                <EmptyState
                    icon={<Bot />}
                    title="No agents yet"
                    description={
                        whatsapp
                            ? 'An agent is a voice, a prompt and a few notes. Make one, talk to it in your browser, then put it on a number: it answers that number’s calls, places calls from it, or answers it on WhatsApp.'
                            : 'An agent is a voice, a prompt and a few notes. Inbound agents answer your number’s calls; outbound agents make calls. Make one, talk to it in your browser, then put it on a phone number.'
                    }
                >
                    {newAgentButton}
                </EmptyState>
            ) : (
                <>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <Tabs value={filter} onValueChange={(v) => setFilter(v as AgentFilter)}>
                            <TabsList aria-label="Show">
                                {FILTERS.filter((f) => whatsapp || !f.whatsapp).map((f) => (
                                    <TabsTrigger key={f.value} value={f.value} className="px-3">
                                        {f.label}
                                    </TabsTrigger>
                                ))}
                            </TabsList>
                        </Tabs>
                        {newAgentButton}
                    </div>
                    {agents.length === 0 ? (
                        <p className="text-muted-foreground py-8 text-center text-sm">{EMPTY_FILTER[filter]}</p>
                    ) : (
                        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                            {agents.map(({ agent, places }) => (
                                <VoiceAgentCard
                                    key={agent._id}
                                    agent={agent}
                                    places={places}
                                    onDelete={() => askDelete(agent)}
                                />
                            ))}
                        </div>
                    )}
                </>
            )}
            <CreateVoiceAgentDialog />
            <DeleteAgentDialog
                open={!!toDelete}
                onOpenChange={onDeleteOpenChange}
                name={toDelete?.name ?? ''}
                onNumbers={toDeleteOnNumbers}
                onConfirm={() => void confirmDelete()}
                deleting={deleting}
            />
        </>
    );
}
