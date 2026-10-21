'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { z } from 'zod';
import type { VoiceGeminiKeyView } from '@aixellabs/backend/db/types';
import { recheckGeminiKey, removeGeminiKey, saveGeminiKey } from '@/app/actions/voice-settings-actions';

const keySchema = z.object({ apiKey: z.string().trim().min(1, 'Paste your Gemini API key') });

/** The Gemini API key card: add / replace (checked with Google first), check again, remove. */
export function useGeminiKeyCard(initial: VoiceGeminiKeyView) {
    const [view, setView] = useState(initial);
    const [editOpen, setEditOpen] = useState(false);
    const keyForm = useForm({ resolver: zodResolver(keySchema), defaultValues: { apiKey: '' } });
    const saving = keyForm.formState.isSubmitting;
    const [checking, setChecking] = useState(false);
    const [removeOpen, setRemoveOpen] = useState(false);
    const [removing, setRemoving] = useState(false);

    const openEdit = () => {
        keyForm.reset();
        setEditOpen(true);
    };

    const onEditOpenChange = (open: boolean) => {
        if (!open && saving) return;
        setEditOpen(open);
    };

    /** Google's answer shows under the field when it refuses the key. */
    const save = keyForm.handleSubmit(async ({ apiKey }) => {
        const res = await saveGeminiKey(apiKey);
        if (!res.success || !res.data) {
            keyForm.setError('apiKey', { message: res.error ?? 'Could not save the key' });
            return;
        }
        setView(res.data);
        setEditOpen(false);
        toast.success('Gemini API key saved. Your agents now run on it.');
    });

    const recheck = async () => {
        setChecking(true);
        const res = await recheckGeminiKey();
        setChecking(false);
        if (!res.success || !res.data) {
            toast.error(res.error ?? 'Could not check the key');
            return;
        }
        setView(res.data);
        if (res.data.statusMessage) toast.error('Google still refuses the key');
        else toast.success('Google accepts the key');
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
        recheck,
        removeOpen,
        setRemoveOpen,
        removing,
        remove,
    };
}

export type UseGeminiKeyCardReturn = ReturnType<typeof useGeminiKeyCard>;
