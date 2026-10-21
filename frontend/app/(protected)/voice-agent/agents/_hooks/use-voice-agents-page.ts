'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import type { VoiceAgent, VoiceAgentCallType } from '@aixellabs/backend/db/types';
import { createVoiceAgent } from '@/app/actions/voice-agent-actions';
import { DEFAULT_VOICE_AGENT_NAME, DEFAULT_VOICE_AGENT_VOICE } from '@/helpers/voice-agent-defaults';
import { voiceAgentUrl } from '@/helpers/voice-routes';
import { voiceAgentSchema } from '@/helpers/voice-schemas';

/** What the create dialog asks for once the call type is picked; the rest starts from that type's defaults. */
const newAgentSchema = voiceAgentSchema.pick({ name: true, voice: true });
const NEW_AGENT = { name: DEFAULT_VOICE_AGENT_NAME, voice: DEFAULT_VOICE_AGENT_VOICE };

export function useVoiceAgentsPage(agents: VoiceAgent[]) {
    const router = useRouter();
    const [createOpen, setCreateOpen] = useState(false);
    /** null = the dialog's first step: pick inbound or outbound. */
    const [newCallType, setNewCallType] = useState<VoiceAgentCallType | null>(null);
    const createForm = useForm({ resolver: zodResolver(newAgentSchema), defaultValues: NEW_AGENT, mode: 'onChange' });
    /** Set once the agent exists, while the browser goes to it. */
    const [opening, setOpening] = useState(false);
    const creating = createForm.formState.isSubmitting || opening;

    const openCreate = useCallback(() => {
        setNewCallType(null);
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
        if (!newCallType) return;
        const response = await createVoiceAgent({ callType: newCallType, ...values });
        if (!response.success || !response.data?._id) {
            toast.error(response.error ?? 'Could not create the agent');
            return;
        }
        setOpening(true);
        toast.success('Agent created');
        router.push(voiceAgentUrl(response.data._id));
    });

    return {
        agents,
        createOpen,
        openCreate,
        onCreateOpenChange,
        newCallType,
        setNewCallType,
        createForm,
        creating,
        createAgent,
    };
}

export type UseVoiceAgentsPageReturn = ReturnType<typeof useVoiceAgentsPage>;
