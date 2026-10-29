import 'server-only';

import type { MongoObjectId } from '@aixellabs/backend/db';
import type { ContentLabAiKeyDoc, ContentLabAiKeyView, ContentLabAiProvider } from '@aixellabs/backend/db/types';
import { contentLabProfilesCollection } from '@/server/content-lab/collections';
import { openSecret } from '@/server/voice-agent/engine';

/**
 * Content Lab's own AI key (`ContentLabProfileDoc.aiKeys`), separate from Voice agent's keys: the
 * owner adds it under Content Lab > Settings, where it is checked with the provider and sealed.
 *
 * `loadContentLabAiKey` is the one place that decides which key a Content Lab generation runs on:
 * the Write route, "Check my idea" rewrites and scheduled board runs all call it. A later "use
 * Aixel Labs credits" option would be chosen here.
 */

export const CONTENT_LAB_AI_KEY_MISSING =
    'Add your Gemini API key first, under Content Lab > Settings. Writing runs on your own key.';

/** The view when no key is saved. */
export const noContentLabAiKey = (provider: ContentLabAiProvider = 'gemini'): ContentLabAiKeyView => ({
    provider,
    set: false,
    last4: null,
    status: null,
    statusMessage: null,
    checkedAt: null,
});

export function toContentLabAiKeyView(
    key: Omit<ContentLabAiKeyDoc, 'keySealed'> | null | undefined,
    provider: ContentLabAiProvider = 'gemini',
): ContentLabAiKeyView {
    if (!key) return noContentLabAiKey(provider);
    return {
        provider,
        set: true,
        last4: key.last4,
        status: key.status,
        statusMessage: key.statusMessage ?? null,
        checkedAt: key.checkedAt.toISOString(),
    };
}

/** The owner's Content Lab key for `provider`, unsealed (server only), or null when they have not added one. */
export async function loadContentLabAiKey(
    userId: MongoObjectId,
    provider: ContentLabAiProvider = 'gemini',
): Promise<string | null> {
    const profiles = await contentLabProfilesCollection();
    const doc = await profiles.findOne({ userId }, { projection: { [`aiKeys.${provider}.keySealed`]: 1 } });
    const sealed = doc?.aiKeys?.[provider]?.keySealed;
    return sealed ? openSecret(sealed) : null;
}

/** Whether the owner has a Content Lab key for `provider` (the key stays sealed). */
export async function hasContentLabAiKey(userId: MongoObjectId, provider: ContentLabAiProvider = 'gemini'): Promise<boolean> {
    const profiles = await contentLabProfilesCollection();
    return (await profiles.countDocuments({ userId, [`aiKeys.${provider}`]: { $type: 'object' } }, { limit: 1 })) > 0;
}

/** What the settings page shows for the owner's key (never the key). */
export async function loadContentLabAiKeyView(
    userId: MongoObjectId,
    provider: ContentLabAiProvider = 'gemini',
): Promise<ContentLabAiKeyView> {
    const profiles = await contentLabProfilesCollection();
    const doc = await profiles.findOne({ userId }, { projection: { [`aiKeys.${provider}.keySealed`]: 0, connections: 0 } });
    return toContentLabAiKeyView(doc?.aiKeys?.[provider], provider);
}
