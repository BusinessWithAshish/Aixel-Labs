'use client';

import { useEffect, useRef, useState } from 'react';
import { useProgressRouter } from '@/hooks/use-progress-router';
import { toast } from 'sonner';
import type { VoiceCalendarProvider } from '@aixellabs/backend/db/types';
import { confirmVoiceAppConnection, startVoiceAppConnection } from '@/app/actions/voice-calendar-actions';
import { voiceCalendarProviderLabel } from '@/helpers/voice-calendar-providers';
import { VOICE_AGENTS_URL, voiceAgentUrl } from '@/helpers/voice-routes';

export type ConnectedAppCallbackData = {
    /** The sign-in's `connected_account_id`; null when none came back. */
    connectedAccountId: string | null;
    /** The sign-in's `status` (`success` / `failed`). */
    composioStatus: string | null;
    /** The agent the owner connected from (where they go back to), already checked to be an id. */
    agentId: string | null;
    /** That agent's name, for "Back to Maya"; null when it could not be read. */
    agentName: string | null;
    /** The app being connected, for the wording only (the server checks the attempt itself). */
    provider: VoiceCalendarProvider | null;
};

/** Long enough to read "connected" before going back. */
const RETURN_AFTER_MS = 1500;

/**
 * Confirms the connection once, in the browser, so the page can say what it is doing meanwhile: checking,
 * then connected (and back to the agent, which says so too), or why not, with a retry.
 */
export function useConnectedAppCallbackPage({
    connectedAccountId,
    composioStatus,
    agentId,
    agentName,
    provider,
}: ConnectedAppCallbackData) {
    const router = useProgressRouter();
    const appLabel = provider ? voiceCalendarProviderLabel(provider) : 'your app';
    const back = agentId ? voiceAgentUrl(agentId) : VOICE_AGENTS_URL;
    const backName = agentId ? (agentName ?? 'the agent') : 'your agents';
    const signedIn = !!connectedAccountId && composioStatus !== 'failed';
    const [error, setError] = useState<string | null>(
        connectedAccountId ? null : `The sign-in did not finish, so ${appLabel} is not connected. Try again.`,
    );
    /** Connected: where it goes back to, and the account it connected (an email, mostly). */
    const [done, setDone] = useState<{ href: string; account: string | null } | null>(null);
    const [retrying, setRetrying] = useState(false);
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
            const { label } = result.connection;
            if (!agentId) toast.success(`${result.providerLabel} connected${label ? ` as ${label}` : ''}`);
            const href = agentId ? `${back}?connected=${result.connection._id}` : back;
            setDone({ href, account: label ?? null });
            window.setTimeout(() => router.replace(href), RETURN_AFTER_MS);
        })();
        // Once: the confirmation is not repeatable.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    /** Starts the same app's sign-in again, back to the same agent. */
    const retry = async () => {
        if (!provider) return;
        setRetrying(true);
        const response = await startVoiceAppConnection(provider, agentId).catch(() => null);
        if (!response?.success || !response.data) {
            setRetrying(false);
            toast.error(response?.error ?? 'Could not start connecting');
            return;
        }
        window.location.assign(response.data.redirectUrl);
    };

    return { provider, appLabel, back, backName, signedIn, error, done, retry, retrying };
}

export type UseConnectedAppCallbackPageReturn = ReturnType<typeof useConnectedAppCallbackPage>;
