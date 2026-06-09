import type { UIMessage } from 'ai';
import type { LEAD_GENERATION_SUB_MODULES } from '@aixellabs/backend/db/types';
import { NL_CHAT_MAX_SESSIONS } from './constants';
import type { ChatSession, NlChatStore } from './types';

// ─── ID generation ───────────────────────────────────────────────────────────

export function newId(): string {
    const c = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;
    return c?.randomUUID?.() ?? `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

// ─── Session helpers ──────────────────────────────────────────────────────────

const TITLE_MAX_WORDS = 5;
const TITLE_MAX_CHARS = 40;

function truncate(text: string): string {
    const words = text.split(/\s+/).filter(Boolean).slice(0, TITLE_MAX_WORDS).join(' ');
    return words.length > TITLE_MAX_CHARS ? `${words.slice(0, TITLE_MAX_CHARS).trimEnd()}…` : words;
}

export function deriveTitle(messages: UIMessage[], fallback = 'New chat'): string {
    for (const msg of messages) {
        if (msg.role !== 'user') continue;
        for (const part of msg.parts) {
            if (part.type === 'text' && part.text?.trim()) {
                return truncate(part.text.trim()) || fallback;
            }
        }
    }
    return fallback;
}

export function createSession(sessionId: string, key: LEAD_GENERATION_SUB_MODULES): ChatSession {
    const now = Date.now();
    return {
        sessionId,
        key,
        draft: {},
        phase: 'collecting',
        messages: [],
        title: 'New chat',
        createdAt: now,
        updatedAt: now,
    };
}

// ─── Store operations (all pure, O(1) or O(n) at most) ───────────────────────

export function createEmptyStore(): NlChatStore {
    return { sessions: {}, order: [], activeId: newId() };
}

export function upsertSession(store: NlChatStore, session: ChatSession): NlChatStore {
    const title = deriveTitle(session.messages);
    const stamped: ChatSession = { ...session, title, updatedAt: Date.now() };
    const isNew = !(session.sessionId in store.sessions);
    const order = isNew ? [session.sessionId, ...store.order].slice(0, NL_CHAT_MAX_SESSIONS) : store.order;
    return { ...store, sessions: { ...store.sessions, [session.sessionId]: stamped }, order };
}

export function removeSession(store: NlChatStore, id: string): NlChatStore {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { [id]: _dropped, ...sessions } = store.sessions;
    const order = store.order.filter((sid) => sid !== id);
    const activeId = store.activeId === id ? newId() : store.activeId;
    return { sessions, order, activeId };
}

// ─── Persistence / parse ──────────────────────────────────────────────────────

const VALID_PHASES = new Set(['collecting', 'ready', 'submitted']);

function isValidSession(raw: unknown): raw is ChatSession {
    if (!raw || typeof raw !== 'object') return false;
    const s = raw as ChatSession;
    return (
        typeof s.sessionId === 'string' &&
        typeof s.key === 'string' &&
        VALID_PHASES.has(s.phase) &&
        typeof s.draft === 'object' &&
        s.draft !== null &&
        Array.isArray(s.messages) &&
        typeof s.title === 'string' &&
        typeof s.createdAt === 'number' &&
        typeof s.updatedAt === 'number'
    );
}

export function parseStore(raw: string): NlChatStore {
    try {
        const value = JSON.parse(raw) as unknown;
        if (!value || typeof value !== 'object') return createEmptyStore();
        const c = value as Record<string, unknown>;

        if (typeof c.sessions !== 'object' || Array.isArray(c.sessions)) return createEmptyStore();
        const sessionsRaw = c.sessions as Record<string, unknown>;
        const sessions: Record<string, ChatSession> = {};
        for (const [k, v] of Object.entries(sessionsRaw)) {
            if (isValidSession(v)) sessions[k] = v;
        }

        const order = Array.isArray(c.order)
            ? (c.order as unknown[]).filter((id): id is string => typeof id === 'string' && id in sessions)
            : Object.keys(sessions);
        const activeId = typeof c.activeId === 'string' ? c.activeId : newId();

        return { sessions, order, activeId };
    } catch {
        return createEmptyStore();
    }
}

// ─── Sidebar helpers ──────────────────────────────────────────────────────────

export function getSessionList(store: NlChatStore): ChatSession[] {
    return store.order
        .map((id) => store.sessions[id])
        .filter((s): s is ChatSession => Boolean(s))
        .sort((a, b) => b.updatedAt - a.updatedAt);
}
