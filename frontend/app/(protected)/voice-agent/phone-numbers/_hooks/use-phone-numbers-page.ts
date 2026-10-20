'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { VoiceAgentCallType, VoiceProvider, type VoiceGeminiKeyView } from '@aixellabs/backend/db/types';
import type { VoiceAgentOption } from '@/app/actions/voice-agent-actions';
import {
    removeNumber,
    setInboundAgent,
    setOutboundAgent,
    type VoiceNumberListItem,
} from '@/app/actions/voice-number-actions';

export type PhoneNumbersPageData = {
    numbers: VoiceNumberListItem[];
    agents: VoiceAgentOption[];
    loadError: string | null;
    /** The owner's Gemini API key: answering and placing calls run on it. */
    geminiKey: VoiceGeminiKeyView;
};

export type NumberBadge = { label: string; variant: 'green' | 'blue' | 'secondary' };

/** What the number does today, in the words the row shows. */
export function numberBadges(number: VoiceNumberListItem): NumberBadge[] {
    const badges: NumberBadge[] = [];
    if (number.inboundAgentId) badges.push({ label: 'AI answers calls', variant: 'green' });
    if (number.outboundAgentId) {
        badges.push({ label: number.inboundAgentId ? 'Places calls' : 'Outbound only', variant: 'blue' });
    }
    if (badges.length === 0) badges.push({ label: 'Not set up', variant: 'secondary' });
    return badges;
}

/** The provider setup guide dialog: which guide, the step it opened at, and whether it is showing. */
export type SetupGuideState = { provider: VoiceProvider; stepId: string | null; open: boolean };

/** Which save is running for a number, so only that control shows it. */
export type NumberSaving = { numberId: string; part: 'inbound' | 'outbound' };

export function usePhoneNumbersPage(data: PhoneNumbersPageData) {
    const [numbers, setNumbers] = useState<VoiceNumberListItem[]>(data.numbers);
    const [connectOpen, setConnectOpen] = useState(false);
    const [saving, setSaving] = useState<NumberSaving | null>(null);
    const [testCallNumber, setTestCallNumber] = useState<VoiceNumberListItem | null>(null);
    const [removeTarget, setRemoveTarget] = useState<VoiceNumberListItem | null>(null);
    const [removing, setRemoving] = useState(false);
    const [setupGuide, setSetupGuide] = useState<SetupGuideState>({
        provider: VoiceProvider.TELNYX,
        stepId: null,
        open: false,
    });

    const openSetupGuide = (provider: VoiceProvider = VoiceProvider.TELNYX, stepId: string | null = null) =>
        setSetupGuide({ provider, stepId, open: true });
    /** Keeps the provider, so the dialog does not change content while it animates closed. */
    const closeSetupGuide = () => setSetupGuide((prev) => ({ ...prev, open: false }));

    const inboundAgents = data.agents.filter((a) => a.callType === VoiceAgentCallType.INBOUND);
    const outboundAgents = data.agents.filter((a) => a.callType === VoiceAgentCallType.OUTBOUND);

    const addImported = (imported: VoiceNumberListItem[]) => {
        setNumbers((prev) => [...imported, ...prev.filter((n) => !imported.some((i) => i._id === n._id))]);
    };

    const replaceNumber = (updated: VoiceNumberListItem) => {
        setNumbers((prev) => prev.map((n) => (n._id === updated._id ? updated : n)));
    };

    /** `null` turns AI answering off; an agent turns it on, or swaps the agent while on. */
    const changeInboundAgent = async (number: VoiceNumberListItem, agentId: string | null) => {
        if (!number._id || (number.inboundAgentId ?? null) === agentId) return;
        const wasOn = !!number.inboundAgentId;
        setSaving({ numberId: number._id, part: 'inbound' });
        const res = await setInboundAgent(number._id, agentId);
        setSaving(null);
        if (!res.success || !res.data) {
            toast.error(res.error ?? 'Could not change who answers this number');
            return;
        }
        const updated = res.data;
        replaceNumber(updated);
        if (agentId === null) toast.success(`AI answering is off. ${number.phoneNumber} rings wherever it did before.`);
        else if (wasOn) toast.success(`${updated.inboundAgentName} now answers ${number.phoneNumber}`);
        else toast.success(`The AI now answers every call to ${number.phoneNumber}, as ${updated.inboundAgentName}`);
    };

    const toggleAiAnswering = (number: VoiceNumberListItem, on: boolean) => {
        if (!on) return changeInboundAgent(number, null);
        const first = inboundAgents[0];
        if (first) return changeInboundAgent(number, first.id);
    };

    const changeOutboundAgent = async (number: VoiceNumberListItem, agentId: string | null) => {
        if (!number._id || (number.outboundAgentId ?? null) === agentId) return;
        setSaving({ numberId: number._id, part: 'outbound' });
        const res = await setOutboundAgent(number._id, agentId);
        setSaving(null);
        if (!res.success || !res.data) {
            toast.error(res.error ?? 'Could not change the outbound agent');
            return;
        }
        const updated = res.data;
        replaceNumber(updated);
        if (agentId === null) toast.success(`${number.phoneNumber} has no outbound agent`);
        else toast.success(`${updated.outboundAgentName} now places calls from ${number.phoneNumber}`);
    };

    const confirmRemove = async () => {
        if (!removeTarget?._id) return;
        setRemoving(true);
        const res = await removeNumber(removeTarget._id);
        setRemoving(false);
        if (!res.success) {
            toast.error(res.error ?? 'Could not remove the number');
            return;
        }
        const removedId = removeTarget._id;
        setNumbers((prev) => prev.filter((n) => n._id !== removedId));
        toast.success(`${removeTarget.phoneNumber} removed`);
        setRemoveTarget(null);
    };

    return {
        numbers,
        inboundAgents,
        outboundAgents,
        loadError: data.loadError,
        geminiKey: data.geminiKey,
        hasGeminiKey: data.geminiKey.set,
        connectOpen,
        setConnectOpen,
        addImported,
        saving,
        toggleAiAnswering,
        changeInboundAgent,
        changeOutboundAgent,
        testCallNumber,
        setTestCallNumber,
        removeTarget,
        setRemoveTarget,
        removing,
        confirmRemove,
        setupGuide,
        openSetupGuide,
        closeSetupGuide,
    };
}

export type UsePhoneNumbersPageReturn = ReturnType<typeof usePhoneNumbersPage>;
