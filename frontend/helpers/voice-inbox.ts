import type { VoiceCallTurn } from '@aixellabs/backend/db/types';

/** The WhatsApp inbox's shapes, client-safe (the server side is `server/voice-agent/whatsapp-inbox.ts`). */

export enum InboxStatus {
    AI = 'AI',
    NEEDS_YOU = 'NEEDS_YOU',
    HUMAN = 'HUMAN',
}

export type InboxThread = {
    /** `<numberId>:<phone>`: what the page opens a conversation by. */
    key: string;
    numberId: string;
    phone: string;
    /** Their WhatsApp profile name, when Meta sent one. */
    name: string | null;
    businessNumber: string;
    lastText: string;
    lastRole: VoiceCallTurn['role'] | 'call';
    lastAt: string;
    unread: number;
    status: InboxStatus;
    /** Who has it (HUMAN), or why the AI asked for a person (NEEDS_YOU). */
    statusDetail: string | null;
};

export type InboxItem =
    | { kind: 'message'; role: VoiceCallTurn['role']; text: string; at: string; voice: boolean; by: string | null }
    | { kind: 'call'; id: string; at: string; durationSec: number; summary: string | null; inbound: boolean };

export type InboxThreadView = InboxThread & {
    agentName: string | null;
    items: InboxItem[];
    /** The person wrote in the last 24 hours: a free-form reply is allowed until `windowEndsAt`. */
    windowOpen: boolean;
    windowEndsAt: string | null;
};
