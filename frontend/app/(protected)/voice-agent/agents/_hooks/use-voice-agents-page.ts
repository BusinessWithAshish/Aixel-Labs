'use client';

import { useCallback, useState } from 'react';
import { useProgressRouter } from '@/hooks/use-progress-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { type VoiceAgent, VoiceAgentCallType, type VoiceProvider } from '@aixellabs/backend/db/types';
import { createVoiceAgent } from '@/app/actions/voice-agent-actions';
import type { VoiceNumberListItem } from '@/app/actions/voice-number-actions';
import { DEFAULT_VOICE_AGENT_NAME } from '@/helpers/voice-agent-defaults';
import { numberKind } from '@/helpers/voice-agent-channels';
import { voiceAgentUrl } from '@/helpers/voice-routes';
import { voiceAgentSchema } from '@/helpers/voice-schemas';

/** What the create dialog asks for; the rest (voice included) starts from the server's defaults. */
const newAgentSchema = voiceAgentSchema.pick({ callType: true, name: true });
const NEW_AGENT = {
    callType: VoiceAgentCallType.INBOUND,
    name: DEFAULT_VOICE_AGENT_NAME,
};

/** Which agents the list shows: all, those on a phone line, those on WhatsApp, or those on no number yet. */
export type AgentFilter = 'all' | 'calls' | 'whatsapp' | 'none';

/** One job an agent does on a number: answers its calls, places calls from it, or answers it on WhatsApp. */
export type AgentPlace = { phoneNumber: string; provider: VoiceProvider; job: 'answers' | 'calls' | 'whatsapp' };

export type VoiceAgentsPageData = {
    agents: VoiceAgent[];
    /** The owner's numbers: where each agent works comes from them. */
    numbers: VoiceNumberListItem[];
    /** Whether the owner may use WhatsApp (its filter shows only then). */
    whatsapp: boolean;
    /** The filter the page opens on (`?show=`). */
    show: AgentFilter;
};

const FILTER_MATCH: Record<AgentFilter, (places: AgentPlace[]) => boolean> = {
    all: () => true,
    calls: (places) => places.some((p) => p.job !== 'whatsapp'),
    whatsapp: (places) => places.some((p) => p.job === 'whatsapp'),
    none: (places) => places.length === 0,
};

export function useVoiceAgentsPage({ agents: allAgents, numbers, whatsapp, show }: VoiceAgentsPageData) {
    const router = useProgressRouter();
    const [filter, setFilter] = useState<AgentFilter>(show);
    const [createOpen, setCreateOpen] = useState(false);
    const createForm = useForm({ resolver: zodResolver(newAgentSchema), defaultValues: NEW_AGENT, mode: 'onChange' });
    /** Set once the agent exists, while the browser goes to it. */
    const [opening, setOpening] = useState(false);
    const creating = createForm.formState.isSubmitting || opening;

    const placesOf = (agentId: string): AgentPlace[] =>
        numbers.flatMap((n): AgentPlace[] => {
            const job =
                numberKind(n.provider) === 'whatsapp' ? 'whatsapp' : n.inboundAgentId === agentId ? 'answers' : 'calls';
            return [n.inboundAgentId, n.outboundAgentId].includes(agentId)
                ? [{ phoneNumber: n.phoneNumber, provider: n.provider, job }]
                : [];
        });
    const listed = allAgents.map((agent) => ({ agent, places: placesOf(agent._id ?? '') }));
    const agents = listed.filter(({ places }) => FILTER_MATCH[filter](places));

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
        total: allAgents.length,
        agents,
        whatsapp,
        filter,
        setFilter,
        createOpen,
        openCreate,
        onCreateOpenChange,
        createForm,
        creating,
        createAgent,
    };
}

export type UseVoiceAgentsPageReturn = ReturnType<typeof useVoiceAgentsPage>;
