'use client';

import { useCallback, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { z } from 'zod';
import type { VoiceGeminiKeyTier, VoiceGeminiKeyView } from '@aixellabs/backend/db/types';
import { recheckGeminiKey, removeGeminiKey, saveGeminiKey, setGeminiKeyTier } from '@/app/actions/voice-settings-actions';

const keySchema = z.object({
    apiKey: z.string().trim().min(1, 'Paste your Gemini API key'),
    tier: z.enum(['free', 'paid']),
});

/** How often the open page asks Google about the key again. The check is free (it lists models). */
const KEY_PING_MS = 10 * 60_000;

/**
 * The Gemini API key card: add / replace (checked with Google first), its tier, check now (and every
 * 10 minutes while the page is open), remove. The view lives with the page so agent cards follow it.
 */
export function useGeminiKeyCard(view: VoiceGeminiKeyView, setView: (view: VoiceGeminiKeyView) => void) {
    const [editOpen, setEditOpen] = useState(false);
    const keyForm = useForm({
        resolver: zodResolver(keySchema),
        defaultValues: { apiKey: '', tier: 'paid' as VoiceGeminiKeyTier },
    });
    const saving = keyForm.formState.isSubmitting;
    const [checking, setChecking] = useState(false);
    const [savingTier, setSavingTier] = useState(false);
    const [removeOpen, setRemoveOpen] = useState(false);
    const [removing, setRemoving] = useState(false);

    const openEdit = () => {
        keyForm.reset({ apiKey: '', tier: view.tier ?? 'paid' });
        setEditOpen(true);
    };

    const onEditOpenChange = (open: boolean) => {
        if (!open && saving) return;
        setEditOpen(open);
    };

    /** Google's answer shows under the field when it refuses the key. */
    const save = keyForm.handleSubmit(async ({ apiKey, tier }) => {
        const res = await saveGeminiKey(apiKey, tier);
        if (!res.success || !res.data) {
            keyForm.setError('apiKey', { message: res.error ?? 'Could not save the key' });
            return;
        }
        setView(res.data);
        setEditOpen(false);
        toast.success('Gemini API key saved. Your agents now run on it.');
    });

    /** `quiet`: the timed check, which only updates the card. */
    const check = useCallback(
        async (quiet: boolean) => {
            setChecking(true);
            const res = await recheckGeminiKey().catch(() => null);
            setChecking(false);
            if (!res?.success || !res.data) {
                if (!quiet) toast.error(res?.error ?? 'Could not check the key');
                return;
            }
            setView(res.data);
            if (quiet) return;
            if (res.data.statusMessage) toast.error('Google refuses the key');
            else toast.success('Google accepts the key');
        },
        [setView],
    );

    useEffect(() => {
        if (!view.set) return;
        const timer = setInterval(() => {
            if (document.visibilityState === 'visible') void check(true);
        }, KEY_PING_MS);
        return () => clearInterval(timer);
    }, [view.set, check]);

    const changeTier = async (tier: VoiceGeminiKeyTier) => {
        if (tier === view.tier) return;
        setSavingTier(true);
        const res = await setGeminiKeyTier(tier);
        setSavingTier(false);
        if (!res.success || !res.data) {
            toast.error(res.error ?? 'Could not save the tier');
            return;
        }
        setView(res.data);
        toast.success(tier === 'free' ? 'Saved: free tier' : 'Saved: paid tier');
    };

    const remove = async () => {
        setRemoving(true);
        const res = await removeGeminiKey();
        setRemoving(false);
        if (!res.success || !res.data) {
            toast.error(res.error ?? 'Could not remove the key');
            return;
        }
        setView(res.data);
        setRemoveOpen(false);
        toast.success('Gemini API key removed');
    };

    return {
        view,
        editOpen,
        openEdit,
        onEditOpenChange,
        keyForm,
        saving,
        save,
        checking,
        checkNow: () => void check(false),
        savingTier,
        changeTier,
        removeOpen,
        setRemoveOpen,
        removing,
        remove,
    };
}

export type UseGeminiKeyCardReturn = ReturnType<typeof useGeminiKeyCard>;
