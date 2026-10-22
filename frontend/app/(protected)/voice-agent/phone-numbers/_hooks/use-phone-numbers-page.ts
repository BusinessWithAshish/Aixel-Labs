'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { VoiceProvider, type VoiceGeminiKeyView } from '@aixellabs/backend/db/types';
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
    /** `opened` counts openings, so each starts with an empty form. */
    const [connect, setConnect] = useState({ provider: VoiceProvider.TELNYX, open: false, opened: 0 });
    const [testCallNumber, setTestCallNumber] = useState<VoiceNumberListItem | null>(null);
    const [removeTarget, setRemoveTarget] = useState<VoiceNumberListItem | null>(null);
    const [removing, setRemoving] = useState(false);
    const [setupGuide, setSetupGuide] = useState<SetupGuideState>({
        provider: VoiceProvider.TELNYX,
        stepId: null,
        open: false,
    });

    const openConnect = (provider: VoiceProvider) =>
        setConnect((prev) => ({ provider, open: true, opened: prev.opened + 1 }));
    /** Keeps the provider, so the dialog does not change content while it animates closed. */
    const closeConnect = () => setConnect((prev) => ({ ...prev, open: false }));

    const openSetupGuide = (provider: VoiceProvider, stepId: string | null = null) =>
        setSetupGuide({ provider, stepId, open: true });
    const closeSetupGuide = () => setSetupGuide((prev) => ({ ...prev, open: false }));

    const addImported = (imported: VoiceNumberListItem[]) => {
        setNumbers((prev) => [...imported, ...prev.filter((n) => !imported.some((i) => i._id === n._id))]);
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
        loadError: data.loadError,
        geminiKey: data.geminiKey,
        hasGeminiKey: data.geminiKey.set,
        connect,
        openConnect,
        closeConnect,
        addImported,
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
