'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import type { ContentLabProfile, VoiceGeminiKeyView } from '@aixellabs/backend/db/types';
import { saveContentLabProfile, type ContentLabProfileInput } from '@/app/actions/content-lab-actions';

export type ContentLabSettingsPageData = { profile: ContentLabProfile; geminiKey: VoiceGeminiKeyView };

const toForm = (profile: ContentLabProfile): ContentLabProfileInput => ({
    handles: { youtube: profile.handles.youtube ?? '', instagram: profile.handles.instagram ?? '' },
    betaHandles: { x: profile.betaHandles?.x ?? '', linkedin: profile.betaHandles?.linkedin ?? '' },
    country: profile.country,
    language: profile.language,
});

/** Content Lab settings: own handles per platform, default country and language; the Gemini key is read-only here. */
export function useContentLabSettingsPage({ profile, geminiKey }: ContentLabSettingsPageData) {
    const [form, setForm] = useState(() => toForm(profile));
    const [saving, setSaving] = useState(false);

    const setHandle = (group: 'handles' | 'betaHandles', platform: string, value: string) =>
        setForm((current) => ({ ...current, [group]: { ...current[group], [platform]: value } }));

    const save = async () => {
        setSaving(true);
        const response = await saveContentLabProfile(form);
        setSaving(false);
        if (!response.success || !response.data) {
            toast.error(response.error ?? 'Could not save your settings');
            return;
        }
        setForm(toForm(response.data));
        toast.success('Settings saved');
    };

    return {
        form,
        setHandle,
        setCountry: (country: string) => setForm((current) => ({ ...current, country })),
        setLanguage: (language: string) => setForm((current) => ({ ...current, language })),
        saving,
        save,
        geminiKey,
    };
}

export type UseContentLabSettingsPageReturn = ReturnType<typeof useContentLabSettingsPage>;
