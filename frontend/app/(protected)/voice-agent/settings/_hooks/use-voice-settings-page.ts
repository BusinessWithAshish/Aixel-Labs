'use client';

import { useCallback, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { VoiceKeyProvider, type VoiceGeminiKeyTier, type VoiceProviderKey } from '@aixellabs/backend/db/types';
import {
    addVoiceKey,
    makeDefaultVoiceKey,
    recheckVoiceKey,
    removeVoiceKey,
    setGeminiKeyTier,
} from '@/app/actions/voice-settings-actions';
import { voiceKeyInputSchema, type VoiceKeyInput } from '@/helpers/voice-schemas';
import { VOICE_KEY_PROVIDERS } from '@/helpers/voice-stack';

/** How often the open page asks each provider about its keys again. The checks are free. */
const KEY_PING_MS = 10 * 60_000;

export type VoiceSettingsPageData = { keys: VoiceProviderKey[] };

/**
 * Voice settings: the owner's API keys (several per provider): add (checked with the provider first),
 * make default, Gemini tier, check now (and every 10 minutes while the page is open), remove. Each agent
 * picks its models and which of these keys they run on, in its own Agent stack section.
 */
export function useVoiceSettingsPage({ keys: initialKeys }: VoiceSettingsPageData) {
    const [keys, setKeys] = useState(initialKeys);

    // --- Keys ---
    const [addOpen, setAddOpen] = useState(false);
    const addForm = useForm<VoiceKeyInput>({
        resolver: zodResolver(voiceKeyInputSchema),
        defaultValues: { provider: VoiceKeyProvider.GEMINI, label: '', apiKey: '', tier: 'paid' },
    });
    const adding = addForm.formState.isSubmitting;

    const openAdd = (provider: VoiceKeyProvider = VoiceKeyProvider.GEMINI) => {
        addForm.reset({ provider, label: '', apiKey: '', tier: 'paid' });
        setAddOpen(true);
    };
    const onAddOpenChange = (open: boolean) => {
        if (!open && adding) return;
        setAddOpen(open);
    };

    /** The provider's answer shows under the field when it refuses the key. */
    const add = addForm.handleSubmit(async (input) => {
        const res = await addVoiceKey(input);
        if (!res.success || !res.data) {
            addForm.setError('apiKey', { message: res.error ?? 'Could not save the key' });
            return;
        }
        setKeys(res.data);
        setAddOpen(false);
        toast.success(`${VOICE_KEY_PROVIDERS[input.provider].name} key saved`);
    });

    const [busyKeyId, setBusyKeyId] = useState<string | null>(null);
    const replaceKey = (key: VoiceProviderKey) => setKeys((all) => all.map((k) => (k._id === key._id ? key : k)));

    /** `quiet`: the timed check, which only updates the list. */
    const check = useCallback(async (keyId: string, quiet: boolean) => {
        if (!quiet) setBusyKeyId(keyId);
        const res = await recheckVoiceKey(keyId).catch(() => null);
        if (!quiet) setBusyKeyId(null);
        if (!res?.success || !res.data) {
            if (!quiet) toast.error(res?.error ?? 'Could not check the key');
            return;
        }
        setKeys((all) => all.map((k) => (k._id === res.data!._id ? res.data! : k)));
        if (quiet) return;
        const { name } = VOICE_KEY_PROVIDERS[res.data.provider];
        if (res.data.statusMessage) toast.error(`${name} refuses the key`);
        else toast.success(`${name} accepts the key`);
    }, []);

    const keyIds = keys.map((k) => k._id).join(',');
    useEffect(() => {
        if (!keyIds) return;
        const timer = setInterval(() => {
            if (document.visibilityState !== 'visible') return;
            for (const id of keyIds.split(',')) void check(id, true);
        }, KEY_PING_MS);
        return () => clearInterval(timer);
    }, [keyIds, check]);

    const changeTier = async (key: VoiceProviderKey, tier: VoiceGeminiKeyTier) => {
        if (tier === key.tier) return;
        setBusyKeyId(key._id);
        const res = await setGeminiKeyTier(key._id, tier);
        setBusyKeyId(null);
        if (!res.success || !res.data) {
            toast.error(res.error ?? 'Could not save the tier');
            return;
        }
        replaceKey(res.data);
        toast.success(tier === 'free' ? 'Saved: free tier' : 'Saved: paid tier');
    };

    const makeDefault = async (key: VoiceProviderKey) => {
        setBusyKeyId(key._id);
        const res = await makeDefaultVoiceKey(key._id);
        setBusyKeyId(null);
        if (!res.success || !res.data) {
            toast.error(res.error ?? 'Could not change the default key');
            return;
        }
        setKeys(res.data);
        toast.success(`${key.label} is now your default ${VOICE_KEY_PROVIDERS[key.provider].name} key`);
    };

    const [removing, setRemoving] = useState<VoiceProviderKey | null>(null);
    const [removeBusy, setRemoveBusy] = useState(false);
    const remove = async () => {
        if (!removing) return;
        setRemoveBusy(true);
        const res = await removeVoiceKey(removing._id);
        setRemoveBusy(false);
        if (!res.success || !res.data) {
            toast.error(res.error ?? 'Could not remove the key');
            return;
        }
        setKeys(res.data);
        setRemoving(null);
        toast.success('Key removed');
    };

    return {
        keys,
        addOpen,
        openAdd,
        onAddOpenChange,
        addForm,
        adding,
        add,
        busyKeyId,
        checkNow: (keyId: string) => void check(keyId, false),
        changeTier,
        makeDefault,
        removing,
        setRemoving,
        removeBusy,
        remove,
    };
}

export type UseVoiceSettingsPageReturn = ReturnType<typeof useVoiceSettingsPage>;
