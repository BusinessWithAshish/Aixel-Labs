'use client';

import { useCallback, useState } from 'react';
import { useProgressRouter } from '@/hooks/use-progress-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { type VoiceAgent, VoiceAgentCallType } from '@aixellabs/backend/db/types';
import { createVoiceAgent } from '@/app/actions/voice-agent-actions';
import { DEFAULT_VOICE_AGENT_NAME } from '@/helpers/voice-agent-defaults';
import type { AgentChannels } from '@/helpers/voice-agent-channels';
import { voiceAgentUrl } from '@/helpers/voice-routes';
import { voiceAgentSchema } from '@/helpers/voice-schemas';

/** What the create dialog asks for; the rest (voice included) starts from the server's defaults. */
const newAgentSchema = voiceAgentSchema.pick({ callType: true, name: true });
const NEW_AGENT = {
    callType: VoiceAgentCallType.INBOUND,
    name: DEFAULT_VOICE_AGENT_NAME,
};

export function useVoiceAgentsPage({ agents, channels }: { agents: VoiceAgent[]; channels: Record<string, AgentChannels> }) {
    const router = useProgressRouter();
    const [createOpen, setCreateOpen] = useState(false);
    const createForm = useForm({ resolver: zodResolver(newAgentSchema), defaultValues: NEW_AGENT, mode: 'onChange' });
    /** Set once the agent exists, while the browser goes to it. */
    const [opening, setOpening] = useState(false);
    const creating = createForm.formState.isSubmitting || opening;

    const openCreate = useCallback(() => {
        createForm.reset(NEW_AGENT);
        setCreateOpen(true);
    }, [createForm]);

    const onCreateOpenChange = useCallback(
        (open: boolean) => {
            if (!open && creating) return;
            setCreateOpen(open);
        },
        [creating],
    );

    const createAgent = createForm.handleSubmit(async (values) => {
        const response = await createVoiceAgent(values);
        if (!response.success || !response.data?._id) {
            toast.error(response.error ?? 'Could not create the agent');
            return;
        }
        setOpening(true);
        toast.success('Agent created');
        router.push(voiceAgentUrl(response.data._id));
    });

    return {
        channels,
        agents,
        createOpen,
        openCreate,
        onCreateOpenChange,
        createForm,
        creating,
        createAgent,
    };
}

export type UseVoiceAgentsPageReturn = ReturnType<typeof useVoiceAgentsPage>;
