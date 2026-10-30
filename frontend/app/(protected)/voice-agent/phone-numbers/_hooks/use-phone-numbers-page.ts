'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import type { ALApiResponse } from '@aixellabs/backend/api/types';
import { VoiceProvider, type VoiceGeminiKeyView } from '@aixellabs/backend/db/types';
import type { VoiceAgentOption } from '@/app/actions/voice-agent-actions';
import {
    removeNumber,
    setNumberAgent,
    unlinkAgentNumber,
    type VoiceNumberListItem,
} from '@/app/actions/voice-number-actions';
import { numberKind } from '@/helpers/voice-agent-channels';

export type PhoneNumbersPageData = {
    numbers: VoiceNumberListItem[];
    agents: VoiceAgentOption[];
    loadError: string | null;
    /** The owner's Gemini API key: answering and placing calls run on it. */
    geminiKey: VoiceGeminiKeyView;
    /** Whether the owner may use WhatsApp: without it, WhatsApp numbers and their slots stay out of the page. */
    whatsapp: boolean;
};

/** One number as the owner thinks of it: its phone line, its WhatsApp, or both (the same digits connected twice). */
export type NumberLine = { phoneNumber: string; phone: VoiceNumberListItem | null; whatsapp: VoiceNumberListItem | null };

/** The provider setup guide dialog: which guide, the step it opened at, and whether it is showing. */
export type SetupGuideState = { provider: VoiceProvider; stepId: string | null; open: boolean };

export function usePhoneNumbersPage(data: PhoneNumbersPageData) {
    const [allNumbers, setNumbers] = useState<VoiceNumberListItem[]>(data.numbers);
    const numbers = data.whatsapp ? allNumbers : allNumbers.filter((n) => numberKind(n.provider) === 'phone');
    // Newest first, as the numbers come; a number's phone line and WhatsApp share its row.
    const lines: NumberLine[] = [];
    for (const n of numbers) {
        let line = lines.find((l) => l.phoneNumber === n.phoneNumber);
        if (!line) lines.push((line = { phoneNumber: n.phoneNumber, phone: null, whatsapp: null }));
        line[numberKind(n.provider)] = n;
    }
    /** The number whose agent is changing. */
    const [assigning, setAssigning] = useState<string | null>(null);
    /** `opened` counts openings, so each starts with an empty form. */
    const [connect, setConnect] = useState({
        provider: VoiceProvider.TELNYX,
        open: false,
        opened: 0,
    });
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

    /**
     * Puts an agent in the number's slot for its type (answering or placing calls), or takes `holder` off the number
     * (agentId null): the other slot keeps its agent.
     */
    const assignAgent = async (number: VoiceNumberListItem, agentId: string | null, holder: string | null) => {
        setAssigning(number._id);
        const change = agentId ? setNumberAgent(number._id, agentId) : unlinkAgentNumber(holder ?? '', number._id);
        const res = await change.catch((e: Error): ALApiResponse<VoiceNumberListItem> => ({
            success: false,
            error: e.message,
        }));
        setAssigning(null);
        if (!res.success || !res.data) return void toast.error(res.error ?? 'Could not change the agent');
        const updated = res.data;
        setNumbers((prev) => prev.map((n) => (n._id === updated._id ? updated : n)));
        const name = agentId ? (data.agents.find((a) => a.id === agentId)?.name ?? 'The agent') : null;
        toast.success(name ? `${name} is on ${updated.phoneNumber}` : `Took the agent off ${updated.phoneNumber}`);
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
        whatsapp: data.whatsapp,
        numbers,
        lines,
        assigning,
        assignAgent,
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
