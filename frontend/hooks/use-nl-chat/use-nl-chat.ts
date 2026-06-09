'use client';

import { useCallback, useState } from 'react';
import type { UIMessage } from 'ai';
import useLocalStorageState from 'use-local-storage-state';
import { NL_CHAT_MAX_TURNS, NL_CHAT_WARNING_TURNS_LEFT, buildChatStorageKey } from './constants';
import type { NlChatStore, TurnRequest, TurnResponse, UseNlChatOptions } from './types';
import { createEmptyStore, createSession, getSessionList, newId, parseStore, removeSession, upsertSession } from './store';

// ─── Message factories ────────────────────────────────────────────────────────

function makeUserMessage(text: string): UIMessage {
    const id = typeof crypto !== 'undefined' ? (crypto.randomUUID?.() ?? `u_${Date.now()}`) : `u_${Date.now()}`;
    return { id, role: 'user', parts: [{ type: 'text', text }] };
}

function makeAssistantMessage(text: string): UIMessage {
    const id = typeof crypto !== 'undefined' ? (crypto.randomUUID?.() ?? `a_${Date.now()}`) : `a_${Date.now()}`;
    return { id, role: 'assistant', parts: [{ type: 'text', text }] };
}

// ─── API call ─────────────────────────────────────────────────────────────────

async function postTurn(body: TurnRequest): Promise<TurnResponse> {
    const res = await fetch('/api/nl-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    const payload: unknown = await res.json().catch(() => undefined);
    if (!res.ok) {
        const msg =
            payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string'
                ? payload.error
                : res.statusText || 'Request failed';
        throw new Error(msg);
    }
    return payload as TurnResponse;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useNlChat({ name, onConfirm, isConfirming }: UseNlChatOptions) {
    const [store, setStore] = useLocalStorageState<NlChatStore>(buildChatStorageKey(name), {
        defaultValue: createEmptyStore,
        serializer: { stringify: JSON.stringify, parse: parseStore },
    });

    // Local input state avoids localStorage writes on every keystroke.
    const [input, setInput] = useState('');
    const [status, setStatus] = useState<'ready' | 'loading' | 'error'>('ready');
    const [error, setError] = useState<Error | undefined>();

    // The active session may be a brand-new ID not yet in the store (lazy creation).
    const session = store.sessions[store.activeId] ?? createSession(store.activeId, name);
    const { messages, draft, phase } = session;

    const turns = messages.length / 2; // always even after a successful turn
    const isAtLimit = turns >= NL_CHAT_MAX_TURNS;
    const turnsRemaining = NL_CHAT_MAX_TURNS - turns;
    const isNearLimit = turnsRemaining <= NL_CHAT_WARNING_TURNS_LEFT && !isAtLimit;
    const isSubmitted = phase === 'submitted';
    const showConfirm = phase === 'ready';
    const isBusy = status === 'loading' || Boolean(isConfirming);

    // Patch the active session in the store (creates it if it didn't exist yet).
    const patchSession = useCallback(
        (patch: Partial<typeof session>) => {
            setStore((prev) => {
                const current = prev.sessions[prev.activeId] ?? createSession(prev.activeId, name);
                return upsertSession(prev, { ...current, ...patch });
            });
        },
        [setStore, name],
    );

    // ── Core actions ──────────────────────────────────────────────────────────

    const sendTurn = useCallback(
        async (e?: React.FormEvent) => {
            e?.preventDefault();
            const text = input.trim();
            if (!text || isBusy || isAtLimit || isSubmitted) return;

            const previousInput = input;
            setInput('');
            setStatus('loading');
            setError(undefined);

            const sentMessages = [...messages, makeUserMessage(text)];

            try {
                const data = await postTurn({ key: name, messages: sentMessages, draft });
                patchSession({
                    messages: [...sentMessages, makeAssistantMessage(data.message)],
                    draft: data.draft,
                    phase: data.phase,
                });
                setStatus('ready');
            } catch (err) {
                setInput(previousInput);
                setError(err instanceof Error ? err : new Error('Request failed'));
                setStatus('error');
            }
        },
        [input, isBusy, isAtLimit, isSubmitted, messages, draft, name, patchSession],
    );

    const confirm = useCallback(async () => {
        if (!onConfirm || !showConfirm) return;
        try {
            await onConfirm(draft);
            patchSession({ phase: 'submitted' });
        } catch {
            // caller handles errors; session stays in 'ready'
        }
    }, [onConfirm, showConfirm, draft, patchSession]);

    const newChat = useCallback(() => {
        setStatus('ready');
        setError(undefined);
        setInput('');
        setStore((prev) => ({ ...prev, activeId: newId() }));
    }, [setStore]);

    const switchSession = useCallback(
        (sessionId: string) => {
            if (sessionId === store.activeId) return;
            setStatus('ready');
            setError(undefined);
            setInput(store.sessions[sessionId]?.inputDraft ?? '');
            setStore((prev) => ({ ...prev, activeId: sessionId }));
        },
        [store.activeId, store.sessions, setStore],
    );

    const deleteSession = useCallback(
        (sessionId: string) => {
            const wasActive = sessionId === store.activeId;
            setStore((prev) => removeSession(prev, sessionId));
            if (wasActive) {
                setStatus('ready');
                setError(undefined);
                setInput('');
            }
        },
        [store.activeId, setStore],
    );

    return {
        // State
        input,
        setInput,
        messages,
        draft,
        phase,
        status,
        error,
        // Derived flags
        isBusy,
        isAtLimit,
        isNearLimit,
        isSubmitted,
        showConfirm,
        isConfirming,
        turnsRemaining,
        // Session management
        activeSessionId: store.activeId,
        chatHistory: getSessionList(store),
        // Actions
        sendTurn,
        confirm,
        newChat,
        switchSession,
        deleteSession,
    };
}

export type UseNlChatReturn = ReturnType<typeof useNlChat>;
