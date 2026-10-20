'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import type { VoiceGeminiKeyView } from '@aixellabs/backend/db/types';
import { recheckGeminiKey, removeGeminiKey, saveGeminiKey } from '@/app/actions/voice-settings-actions';

/** The Gemini API key card: add / replace (checked with Google first), check again, remove. */
export function useGeminiKeyCard(initial: VoiceGeminiKeyView) {
    const [view, setView] = useState(initial);
    const [editOpen, setEditOpen] = useState(false);
    const [keyInput, setKeyInput] = useState('');
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [checking, setChecking] = useState(false);
    const [removeOpen, setRemoveOpen] = useState(false);
    const [removing, setRemoving] = useState(false);

    const openEdit = () => {
        setKeyInput('');
        setSaveError(null);
        setEditOpen(true);
    };

    const onEditOpenChange = (open: boolean) => {
        if (!open && saving) return;
        setEditOpen(open);
    };

    const save = async () => {
        if (!keyInput.trim() || saving) return;
        setSaving(true);
        setSaveError(null);
        const res = await saveGeminiKey(keyInput);
        setSaving(false);
        if (!res.success || !res.data) {
            setSaveError(res.error ?? 'Could not save the key');
            return;
        }
        setView(res.data);
        setKeyInput('');
        setEditOpen(false);
        toast.success('Gemini API key saved. Your agents now run on it.');
    };

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
        keyInput,
        setKeyInput,
        saving,
        saveError,
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
