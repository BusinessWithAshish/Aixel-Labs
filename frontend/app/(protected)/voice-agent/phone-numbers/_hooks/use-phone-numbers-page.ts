'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { VoiceAgentCallType, VoiceProvider, type VoiceGeminiKeyView } from '@aixellabs/backend/db/types';
import type { VoiceAgentOption } from '@/app/actions/voice-agent-actions';
import { removeNumber, type VoiceNumberListItem } from '@/app/actions/voice-number-actions';

export type PhoneNumbersPageData = {
    numbers: VoiceNumberListItem[];
    agents: VoiceAgentOption[];
    loadError: string | null;
    /** The owner's Gemini API key: answering and placing calls run on it. */
    geminiKey: VoiceGeminiKeyView;
};

/** The provider setup guide dialog: which guide, the step it opened at, and whether it is showing. */
export type SetupGuideState = { provider: VoiceProvider; stepId: string | null; open: boolean };

export function usePhoneNumbersPage(data: PhoneNumbersPageData) {
    const [numbers, setNumbers] = useState<VoiceNumberListItem[]>(data.numbers);
    const [connectOpen, setConnectOpen] = useState(false);
    /** The number whose Change dialog is open (kept while it animates closed); `opened` counts openings, so each starts fresh. */
    const [jobDialog, setJobDialog] = useState({ numberId: null as string | null, open: false, opened: 0 });
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

    const openJobDialog = (number: VoiceNumberListItem) =>
        setJobDialog((prev) => ({ numberId: number._id ?? null, open: true, opened: prev.opened + 1 }));
    const closeJobDialog = () => setJobDialog((prev) => ({ ...prev, open: false }));
    /** Read from the list, so the dialog sees each step's result as it lands. */
    const jobNumber = numbers.find((n) => n._id === jobDialog.numberId) ?? null;

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
        replaceNumber,
        jobNumber,
        jobDialog,
        openJobDialog,
        closeJobDialog,
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
