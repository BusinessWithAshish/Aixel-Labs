'use client';

import { Bot, Plus } from 'lucide-react';
import type { AgentScope } from '@/helpers/voice-agent-channels';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/common/EmptyState';
import { usePage } from '@/contexts/PageStore';
import type { UseVoiceAgentsPageReturn } from '../_hooks/use-voice-agents-page';
import { CreateVoiceAgentDialog } from './CreateVoiceAgentDialog';
import { VoiceAgentCard } from './VoiceAgentCard';

const EMPTY: Record<AgentScope, { title: string; description: string; button: string }> = {
    phone: {
        title: 'No voice agents yet',
        description:
            'An agent is a voice, a prompt and a few notes. Inbound agents answer your number’s calls; outbound agents make calls. Make one, talk to it in your browser, then put it on a phone number.',
        button: 'New agent',
    },
    whatsapp: {
        title: 'No WhatsApp agents yet',
        description:
            'A WhatsApp agent answers the chats, voice notes and calls on your WhatsApp number, and remembers each person. Make one, chat with it here, then put it on your WhatsApp number. Your API keys are the same as for voice agents.',
        button: 'New WhatsApp agent',
    },
};

export function VoiceAgentsList() {
    const { agents, scope, openCreate } = usePage<UseVoiceAgentsPageReturn>();
    const words = EMPTY[scope];
    const newAgentButton = (
        <Button onClick={openCreate} data-testid="new-voice-agent">
            <Plus className="size-4" />
            {words.button}
        </Button>
    );

    return (
        <>
            {agents.length === 0 ? (
                <EmptyState
                    icon={<Bot />}
                    title={words.title}
                    description={words.description}
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
                            <VoiceAgentCard key={agent._id} agent={agent} />
                        ))}
                    </div>
                </>
            )}
            <CreateVoiceAgentDialog />
        </>
    );
}
