'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import type { VoiceCalendarProvider } from '@aixellabs/backend/db/types';
import { confirmVoiceAppConnection } from '@/app/actions/voice-calendar-actions';
import { voiceCalendarProviderLabel } from '@/helpers/voice-calendar-providers';
import { VOICE_AGENTS_URL, voiceAgentUrl } from '@/helpers/voice-routes';

export type ConnectedAppCallbackData = {
    /** Composio's `connected_account_id`; null when it sent none. */
    connectedAccountId: string | null;
    /** Composio's `status` (`success` / `failed`). */
    composioStatus: string | null;
    /** The agent the owner connected from (where they go back to), already checked to be an id. */
    agentId: string | null;
    /** The app being connected, for the wording only (the server checks the attempt itself). */
    provider: VoiceCalendarProvider | null;
};

/**
 * Confirms the connection once, in the browser, so the page can say what it is doing meanwhile,
 * then replaces itself with the agent (which says it is connected). A failure stays on the page.
 */
export function useConnectedAppCallbackPage({
    connectedAccountId,
    composioStatus,
    agentId,
    provider,
}: ConnectedAppCallbackData) {
    const router = useRouter();
    const appLabel = provider ? voiceCalendarProviderLabel(provider) : 'your app';
    const back = agentId ? voiceAgentUrl(agentId) : VOICE_AGENTS_URL;
    const [error, setError] = useState<string | null>(
        connectedAccountId ? null : 'Composio did not say which account was connected. Try connecting again.',
    );
    const started = useRef(false);

    useEffect(() => {
        if (!connectedAccountId || started.current) return;
        started.current = true;
        void (async () => {
            const response = await confirmVoiceAppConnection(connectedAccountId, composioStatus, agentId).catch(() => null);
            const result = response?.success ? response.data : undefined;
            if (!result?.connection._id) {
                setError(response?.error ?? `${appLabel} was not connected. Try again.`);
                return;
            }
            if (!agentId) {
                const { label } = result.connection;
                toast.success(`${result.providerLabel} connected${label ? ` as ${label}` : ''}`);
            }
            router.replace(agentId ? `${back}?connected=${result.connection._id}` : back);
        })();
        // Once: the confirmation is not repeatable.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return { provider, appLabel, back, backLabel: agentId ? 'Back to the agent' : 'Back to agents', error };
}

export type UseConnectedAppCallbackPageReturn = ReturnType<typeof useConnectedAppCallbackPage>;
