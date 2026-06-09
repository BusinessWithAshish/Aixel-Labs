import type { UIMessage } from 'ai';
import type { LEAD_GENERATION_SUB_MODULES } from '@aixellabs/backend/db/types';

// Server returns 'collecting' | 'ready'. Client-only adds 'submitted' after onConfirm.
export type ServerPhase = 'collecting' | 'ready';
export type ChatPhase = 'collecting' | 'ready' | 'submitted';

export type ChatSession = {
    sessionId: string;
    key: LEAD_GENERATION_SUB_MODULES;
    draft: Record<string, unknown>;
    phase: ChatPhase;
    messages: UIMessage[];
    inputDraft?: string;
    title: string;
    createdAt: number;
    updatedAt: number;
};

export type NlChatStore = {
    sessions: Record<string, ChatSession>; // keyed by sessionId
    order: string[]; // persisted IDs, newest first
    activeId: string; // may not be in sessions (brand-new empty session)
};

export type TurnRequest = {
    key: LEAD_GENERATION_SUB_MODULES;
    messages: UIMessage[];
    draft: Record<string, unknown>;
};

export type TurnResponse = {
    message: string;
    draft: Record<string, unknown>;
    phase: ServerPhase;
    issues: string[];
};

export type UseNlChatOptions = {
    name: LEAD_GENERATION_SUB_MODULES;
    assistantName?: string;
    placeholder?: string;
    className?: string;
    emptyStateMessage?: string;
    onConfirm?: (data: object) => void | Promise<void>;
    isConfirming?: boolean;
};
