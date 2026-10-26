'use server';

import { VOICE_AGENT_SUB_MODULES } from '@aixellabs/backend/db';
import { ALApiResponse } from '@aixellabs/backend/api/types';
import { runAuthenticatedAction } from '@/helpers/server-action-helpers';
import { assertRateLimit } from '@/server/rate-limit';
import { requireVoiceOwner } from '@/server/voice-agent/owner-scope';
import type { InboxThread, InboxThreadView } from '@/helpers/voice-inbox';
import { getThread, handBack, listThreads, sendReply, takeOver } from '@/server/voice-agent/whatsapp-inbox';

const SUB_MODULE = VOICE_AGENT_SUB_MODULES.INBOX;

/** Every WhatsApp conversation of the caller's numbers, latest first. */
export const listInboxThreads = async (): Promise<ALApiResponse<InboxThread[]>> =>
    runAuthenticatedAction(async function listInboxThreads(userId) {
        return listThreads(await requireVoiceOwner(userId, SUB_MODULE));
    });

/** One conversation, its chats and WhatsApp calls in order. Opening it marks it read. */
export const getInboxThread = async (key: string): Promise<ALApiResponse<InboxThreadView>> =>
    runAuthenticatedAction(async function getInboxThread(userId) {
        return getThread(await requireVoiceOwner(userId, SUB_MODULE), key);
    });

/** The caller takes the conversation over from the AI. */
export const takeOverInboxThread = async (key: string): Promise<ALApiResponse<InboxThreadView>> =>
    runAuthenticatedAction(async function takeOverInboxThread(userId) {
        const owner = await requireVoiceOwner(userId, SUB_MODULE);
        await takeOver(owner, key);
        return getThread(owner, key);
    });

/** The caller hands the conversation back to the AI. */
export const handBackInboxThread = async (key: string): Promise<ALApiResponse<InboxThreadView>> =>
    runAuthenticatedAction(async function handBackInboxThread(userId) {
        const owner = await requireVoiceOwner(userId, SUB_MODULE);
        await handBack(owner, key);
        return getThread(owner, key);
    });

/** The caller's own reply in a conversation they took over. */
export const sendInboxReply = async (key: string, text: string): Promise<ALApiResponse<InboxThreadView>> =>
    runAuthenticatedAction(async function sendInboxReply(userId) {
        const owner = await requireVoiceOwner(userId, SUB_MODULE);
        assertRateLimit(`voice-inbox-send:${owner.userId}`, 60);
        await sendReply(owner, key, text);
        return getThread(owner, key);
    });
