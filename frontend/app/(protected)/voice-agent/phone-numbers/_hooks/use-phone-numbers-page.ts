'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { VoiceAgentCallType, VoiceProvider, type VoiceGeminiKeyView } from '@aixellabs/backend/db/types';
import type { VoiceAgentOption } from '@/app/actions/voice-agent-actions';
import { removeNumber, setNumberAgent, type VoiceNumberListItem } from '@/app/actions/voice-number-actions';

export type PhoneNumbersPageData = {
    numbers: VoiceNumberListItem[];
    agents: VoiceAgentOption[];
    loadError: string | null;
    /** The owner's Gemini API key: answering and placing calls run on it. */
    geminiKey: VoiceGeminiKeyView;
};

/**
 * What a number does: answers calls, makes calls, or nothing yet. `null` = numbers set up before a
 * number did one job only, with both an answering and a calling agent, until the owner picks one.
 */
export type NumberJob = VoiceAgentCallType | 'NONE';

export function numberJob(number: VoiceNumberListItem): NumberJob | null {
    if (number.inboundAgentId && number.outboundAgentId) return null;
    if (number.inboundAgentId) return VoiceAgentCallType.INBOUND;
    if (number.outboundAgentId) return VoiceAgentCallType.OUTBOUND;
    return 'NONE';
}

export type NumberBadge = { label: string; variant: 'green' | 'blue' | 'secondary' | 'yellow' };

/** What the number does today, in the words the row shows. */
export function numberBadge(number: VoiceNumberListItem): NumberBadge {
    switch (numberJob(number)) {
        case VoiceAgentCallType.INBOUND:
            return { label: 'Answers calls', variant: 'green' };
        case VoiceAgentCallType.OUTBOUND:
            return { label: 'Makes calls', variant: 'blue' };
        case 'NONE':
            return { label: 'Not used yet', variant: 'secondary' };
        default:
            return { label: 'Pick one job', variant: 'yellow' };
    }
}

/** The provider setup guide dialog: which guide, the step it opened at, and whether it is showing. */
export type SetupGuideState = { provider: VoiceProvider; stepId: string | null; open: boolean };

export function usePhoneNumbersPage(data: PhoneNumbersPageData) {
    const [numbers, setNumbers] = useState<VoiceNumberListItem[]>(data.numbers);
    const [connectOpen, setConnectOpen] = useState(false);
    /** The number whose job or agent is being saved. */
    const [saving, setSaving] = useState<string | null>(null);
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

    /** Gives the number one job (`callType`) with `agentId`, or none (`null`): the server undoes the old job. */
    const changeNumberAgent = async (
        number: VoiceNumberListItem,
        callType: VoiceAgentCallType | null,
        agentId: string | null,
    ) => {
        if (!number._id) return;
        const current = callType === VoiceAgentCallType.INBOUND ? number.inboundAgentId : number.outboundAgentId;
        if (numberJob(number) === (callType ?? 'NONE') && (callType === null || current === agentId)) return;
        setSaving(number._id);
        const res = await setNumberAgent(number._id, callType, agentId);
        setSaving(null);
        if (!res.success || !res.data) {
            toast.error(res.error ?? `Could not change what ${number.phoneNumber} does`);
            return;
        }
        const updated = res.data;
        replaceNumber(updated);
        if (callType === VoiceAgentCallType.INBOUND) {
            toast.success(`${updated.inboundAgentName} now answers every call to ${number.phoneNumber}`);
        } else if (callType === VoiceAgentCallType.OUTBOUND) {
            toast.success(`${updated.outboundAgentName} now makes the calls from ${number.phoneNumber}`);
        } else {
            toast.success(`The AI is off for ${number.phoneNumber}. Calls to it ring the way they did before.`);
        }
    };

    /** Picks the number's job, keeping its agent for that job when it has one, else the first agent made for it. */
    const chooseJob = (number: VoiceNumberListItem, job: NumberJob) => {
        if (job === 'NONE') return changeNumberAgent(number, null, null);
        const inbound = job === VoiceAgentCallType.INBOUND;
        const agentId =
            (inbound ? number.inboundAgentId : number.outboundAgentId) ?? (inbound ? inboundAgents : outboundAgents)[0]?.id;
        if (agentId) return changeNumberAgent(number, job, agentId);
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
        agents: data.agents,
        inboundAgents,
        outboundAgents,
        loadError: data.loadError,
        geminiKey: data.geminiKey,
        hasGeminiKey: data.geminiKey.set,
        connectOpen,
        setConnectOpen,
        addImported,
        saving,
        chooseJob,
        changeNumberAgent,
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
