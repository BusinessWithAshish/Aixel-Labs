'use client';

import { useCallback, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { z } from 'zod';
import {
    VOICE_DEFAULT_STACK,
    VoiceKeyProvider,
    VoiceStackKind,
    type VoiceGeminiKeyTier,
    type VoiceProviderKey,
    type VoiceStack,
    type VoiceStackPartName,
} from '@aixellabs/backend/db/types';
import {
    addVoiceKey,
    makeDefaultVoiceKey,
    recheckVoiceKey,
    removeVoiceKey,
    saveVoiceStack,
    setGeminiKeyTier,
    type VoiceStackSettings,
} from '@/app/actions/voice-settings-actions';
import { voiceKeyInputSchema, type VoiceKeyInput } from '@/helpers/voice-schemas';
import { defaultStackPart, PIPELINE_PARTS, stackModel, VOICE_KEY_PROVIDERS } from '@/helpers/voice-stack';

/** How often the open page asks each provider about its keys again. The checks are free. */
const KEY_PING_MS = 10 * 60_000;

/** A Select item cannot have the empty value: this one means "the provider's default key". */
export const DEFAULT_KEY = 'default';

const partForm = z.object({ model: z.string().min(1, 'Pick a model'), keyId: z.string() });
const stackFormSchema = z.object({
    kind: z.nativeEnum(VoiceStackKind),
    realtime: partForm,
    stt: partForm,
    llm: partForm,
    tts: partForm,
});
export type StackFormValues = z.infer<typeof stackFormSchema>;

/** Every part filled in, so switching stacks keeps a sensible pick for the other one. */
function stackFormValues(stack: VoiceStack<string> | null): StackFormValues {
    const s = stack ?? (VOICE_DEFAULT_STACK as VoiceStack<string>);
    const part = (name: VoiceStackPartName) => {
        const saved =
            s.kind === VoiceStackKind.REALTIME ? (name === 'realtime' ? s : null) : name === 'realtime' ? null : s[name];
        const { model, keyId } = saved ?? defaultStackPart(name);
        return { model, keyId: keyId ?? DEFAULT_KEY };
    };
    return { kind: s.kind, realtime: part('realtime'), stt: part('stt'), llm: part('llm'), tts: part('tts') };
}

function toStack(values: StackFormValues): VoiceStack<string> {
    const part = (name: VoiceStackPartName) => {
        const { model, keyId } = values[name];
        return {
            provider: stackModel(name, model)?.provider ?? VoiceKeyProvider.GEMINI,
            model,
            keyId: keyId === DEFAULT_KEY ? null : keyId,
        };
    };
    if (values.kind === VoiceStackKind.REALTIME) return { kind: values.kind, ...part('realtime') };
    return { kind: values.kind, stt: part('stt'), llm: part('llm'), tts: part('tts') };
}

export type VoiceSettingsPageData = VoiceStackSettings;

/**
 * Voice settings: the stack the agents run on (Save / Discard), and the owner's API keys: add
 * (checked with the provider first), make default, Gemini tier, check now (and every 10 minutes while
 * the page is open), remove.
 */
export function useVoiceSettingsPage({ keys: initialKeys, stack }: VoiceSettingsPageData) {
    const [keys, setKeys] = useState(initialKeys);

    // --- Stack ---
    const stackForm = useForm<StackFormValues>({
        resolver: zodResolver(stackFormSchema),
        defaultValues: stackFormValues(stack),
    });
    const saveStack = stackForm.handleSubmit(async (values) => {
        const res = await saveVoiceStack(toStack(values));
        if (!res.success || !res.data) {
            toast.error(res.error ?? 'Could not save the stack');
            return;
        }
        stackForm.reset(stackFormValues(res.data));
        toast.success('Saved. New calls use this stack.');
    });
    const discardStack = () => stackForm.reset();

    // A model from another provider cannot run on the key picked before: back to that provider's default.
    useEffect(() => {
        const sub = stackForm.watch((form, { name }) => {
            const part = name?.endsWith('.model') ? (name.split('.')[0] as VoiceStackPartName) : null;
            if (!part || !form[part]) return;
            const provider = stackModel(part, form[part].model ?? '')?.provider;
            const keyId = form[part].keyId;
            if (keyId !== DEFAULT_KEY && !keys.some((k) => k._id === keyId && k.provider === provider)) {
                stackForm.setValue(`${part}.keyId`, DEFAULT_KEY, { shouldDirty: true });
            }
        });
        return () => sub.unsubscribe();
    }, [stackForm, keys]);

    /** Providers the picked stack needs a key for and has none. */
    const values = stackForm.watch();
    const parts: VoiceStackPartName[] = values.kind === VoiceStackKind.REALTIME ? ['realtime'] : [...PIPELINE_PARTS];
    const missingKeys = [
        ...new Set(parts.map((part) => stackModel(part, values[part].model)?.provider).filter((p) => p !== undefined)),
    ].filter((provider) => !keys.some((key) => key.provider === provider));

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
        stackForm,
        saveStack,
        discardStack,
        savingStack: stackForm.formState.isSubmitting,
        stackDirty: stackForm.formState.isDirty,
        missingKeys,
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
