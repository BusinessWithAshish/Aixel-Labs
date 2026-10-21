'use client';

import { Bot, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/common/EmptyState';
import { usePage } from '@/contexts/PageStore';
import type { UseVoiceAgentsPageReturn } from '../_hooks/use-voice-agents-page';
import { CreateVoiceAgentDialog } from './CreateVoiceAgentDialog';
import { VoiceAgentCard } from './VoiceAgentCard';

export function VoiceAgentsList() {
    const { agents, geminiKey, openCreate } = usePage<UseVoiceAgentsPageReturn>();
    const newAgentButton = (
        <Button onClick={openCreate} data-testid="new-voice-agent">
            <Plus className="size-4" />
            New agent
        </Button>
    );

    return (
        <>
            {agents.length === 0 ? (
                <EmptyState
                    icon={<Bot />}
                    title="No voice agents yet"
                    description="An agent is a voice, a prompt and a few notes. Inbound agents answer your number’s calls; outbound agents make calls. Make one, talk to it in your browser, then put it on a phone number."
                >
                    {newAgentButton}
                </EmptyState>
            ) : (
                <>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="text-muted-foreground text-sm">
                            {agents.length} {agents.length === 1 ? 'agent' : 'agents'}. Open one to edit it or try it in the
                            playground.
                        </p>
                        {newAgentButton}
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                        {agents.map((agent) => (
                            <VoiceAgentCard key={agent._id} agent={agent} geminiKey={geminiKey} />
                        ))}
                    </div>
                </>
            )}
            <CreateVoiceAgentDialog />
        </>
    );
}
