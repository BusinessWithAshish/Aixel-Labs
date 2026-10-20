'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import type { VoiceAgent, VoiceAgentCallType, VoiceAgentVoice } from '@aixellabs/backend/db/types';
import { createVoiceAgent } from '@/app/actions/voice-agent-actions';
import { DEFAULT_VOICE_AGENT_NAME, DEFAULT_VOICE_AGENT_VOICE } from '@/helpers/voice-agent-defaults';
import { voiceAgentUrl } from '../_utils/voice-agent-routes';

export function useVoiceAgentsPage(initialAgents: VoiceAgent[]) {
    const router = useRouter();
    const [agents] = useState<VoiceAgent[]>(initialAgents);
    const [createOpen, setCreateOpen] = useState(false);
    /** null = the dialog's first step: pick inbound or outbound. */
    const [newCallType, setNewCallType] = useState<VoiceAgentCallType | null>(null);
    const [newName, setNewName] = useState(DEFAULT_VOICE_AGENT_NAME);
    const [newVoice, setNewVoice] = useState<VoiceAgentVoice>(DEFAULT_VOICE_AGENT_VOICE);
    const [creating, setCreating] = useState(false);

    const openCreate = useCallback(() => {
        setNewCallType(null);
        setNewName(DEFAULT_VOICE_AGENT_NAME);
        setNewVoice(DEFAULT_VOICE_AGENT_VOICE);
        setCreateOpen(true);
    }, []);

    const onCreateOpenChange = useCallback(
        (open: boolean) => {
            if (!open && creating) return;
            setCreateOpen(open);
        },
        [creating],
    );

    const createAgent = useCallback(async () => {
        if (!newCallType || !newName.trim() || creating) return;
        setCreating(true);
        const response = await createVoiceAgent({ callType: newCallType, name: newName, voice: newVoice });
        if (!response.success || !response.data?._id) {
            toast.error(response.error ?? 'Could not create the agent');
            setCreating(false);
            return;
        }
        toast.success('Agent created');
        router.push(voiceAgentUrl(response.data._id));
    }, [creating, newCallType, newName, newVoice, router]);

    return {
        agents,
        createOpen,
        openCreate,
        onCreateOpenChange,
        newCallType,
        setNewCallType,
        newName,
        setNewName,
        newVoice,
        setNewVoice,
        creating,
        createAgent,
    };
}

export type UseVoiceAgentsPageReturn = ReturnType<typeof useVoiceAgentsPage>;
