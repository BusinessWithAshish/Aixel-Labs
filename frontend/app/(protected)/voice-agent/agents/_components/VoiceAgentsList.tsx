'use client';

import { Bot, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { usePage } from '@/contexts/PageStore';
import type { UseVoiceAgentsPageReturn } from '../_hooks/use-voice-agents-page';
import { CreateVoiceAgentDialog } from './CreateVoiceAgentDialog';
import { VoiceAgentCard } from './VoiceAgentCard';

export function VoiceAgentsList() {
    const { agents, openCreate } = usePage<UseVoiceAgentsPageReturn>();

    return (
        <div className="flex flex-col gap-4 p-1">
            {agents.length === 0 ? (
                <Empty className="border">
                    <EmptyHeader>
                        <EmptyMedia variant="icon">
                            <Bot />
                        </EmptyMedia>
                        <EmptyTitle>No voice agents yet</EmptyTitle>
                        <EmptyDescription>
                            An agent is a voice, a prompt and a few notes. Inbound agents answer your number&rsquo;s calls;
                            outbound agents make calls. Make one, talk to it in your browser, then put it on a phone number.
                        </EmptyDescription>
                    </EmptyHeader>
                    <EmptyContent>
                        <Button onClick={openCreate} data-testid="new-voice-agent">
                            <Plus className="size-4" />
                            New agent
                        </Button>
                    </EmptyContent>
                </Empty>
            ) : (
                <>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="text-muted-foreground text-sm">
                            {agents.length} {agents.length === 1 ? 'agent' : 'agents'}. Open one to edit it or try it in the
                            playground.
                        </p>
                        <Button onClick={openCreate} data-testid="new-voice-agent">
                            <Plus className="size-4" />
                            New agent
                        </Button>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                        {agents.map((agent) => (
                            <VoiceAgentCard key={agent._id} agent={agent} />
                        ))}
                    </div>
                </>
            )}
            <CreateVoiceAgentDialog />
        </div>
    );
}
