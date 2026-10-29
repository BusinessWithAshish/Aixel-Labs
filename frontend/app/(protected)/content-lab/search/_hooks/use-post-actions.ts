'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import type { CONTENT_LAB_CREATOR } from '@aixellabs/backend/content-lab/types';
import { addContentLabWatch, createContentLabBoard } from '@/app/actions/content-lab-actions';
import { contentLabBoardRoute } from '@/config/app-config';
import { contentLabApi } from '@/helpers/content-lab-api';
import type { ContentLabBoardTemplateId } from '../../_constants';
import { creatorHandle, creatorLabel } from '../_utils/format';

/** Template a single post seeds: any post vs its creator's usual → what to copy → your version. */
export const POST_BOARD_TEMPLATE: ContentLabBoardTemplateId = 'why-it-won';
/** Template a topic seeds: the niche's outliers → hooks → your reel. */
export const TOPIC_BOARD_TEMPLATE: ContentLabBoardTemplateId = 'reel-from-outliers';

/**
 * "Watch creator" and "Use on a board", shared by explore, breakdown and check. `busy` names the
 * action in flight (`watch:<creator id>` / `board:<seed>`) so only that button spins.
 */
export function usePostActions(country: string) {
    const router = useRouter();
    const [busy, setBusy] = useState<string | null>(null);

    const watchCreator = useCallback(
        async (creator: CONTENT_LAB_CREATOR) => {
            const handle = creatorHandle(creator);
            setBusy(`watch:${creator.id}`);
            try {
                const profile = await contentLabApi.creator({ platform: creator.platform, handle, country });
                if (!profile.success || !profile.data) {
                    toast.error(profile.error ?? 'Could not load this creator');
                    return;
                }
                const added = await addContentLabWatch({ platform: creator.platform, handle, creator: profile.data });
                if (added.success) toast.success(`Watching ${creatorLabel(creator)}`);
                else toast.error(added.error ?? 'Could not watch this creator');
            } finally {
                setBusy(null);
            }
        },
        [country],
    );

    const startBoard = useCallback(
        async (templateId: ContentLabBoardTemplateId, seed: { url?: string; query?: string }) => {
            setBusy(`board:${seed.url ?? seed.query ?? ''}`);
            const created = await createContentLabBoard({ templateId, seed });
            if (created.success && created.data) {
                router.push(contentLabBoardRoute(created.data.id));
                return;
            }
            setBusy(null);
            toast.error(created.error ?? 'Could not create the board');
        },
        [router],
    );

    return { busy, watchCreator, startBoard };
}

export type UsePostActionsReturn = ReturnType<typeof usePostActions>;
