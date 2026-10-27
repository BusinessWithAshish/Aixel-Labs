import 'server-only';

import {
    getCollection,
    MongoCollections,
    MongoObjectId,
    VOICE_CHAT_LIMITS,
    VoiceCallChannel,
    VoiceCallDirection,
    VoiceProvider,
    type UserDoc,
    type VoiceAgentDoc,
    type VoiceCallDoc,
    type VoiceCallTurn,
} from '@aixellabs/backend/db';
import { listItems } from '@/server/voice-agent/accounts';
import type { OwnedNumberDoc } from '@/server/voice-agent/number-provider';
import type { VoiceOwnerScope } from '@/server/voice-agent/owner-scope';
import { sendTextMessage } from '@/server/voice-agent/whatsapp';
import { whatsappAuthOf } from '@/server/voice-agent/whatsapp-numbers';
import { InboxStatus, type InboxItem, type InboxThread, type InboxThreadView } from '@/helpers/voice-inbox';

/**
 * The WhatsApp inbox: one conversation per person per WhatsApp number, made of that person's chats (voice_calls,
 * channel WHATSAPP, one document per stretch of messages, see the engine's whatsapp.py) and their WhatsApp calls
 * (channel PHONE on that number). The conversation's state lives on its latest chat:
 *
 * - AI      the number's agent answers (nothing set)
 * - NEEDS_YOU  the agent asked for a person (`chat.needsHuman`): it stays quiet until someone takes over
 * - HUMAN   a person took over (`chat.human`): only they answer, from here, until they hand it back
 *
 * The engine carries `human` and `needsHuman` to the person's next chat, so a takeover outlives the quiet spell
 * that closes a chat. Sending is a person's own reply through the number's Meta app, only inside WhatsApp's
 * 24-hour window after the person's last message.
 */

/** WhatsApp lets a business write freely for this long after the person's last message. */
const WINDOW_MS = 24 * 60 * 60 * 1000;
const THREADS_MAX = 200;
const THREAD_DOCS_MAX = 100;
const TEXT_MAX = 4096;

type ThreadRef = { numberId: MongoObjectId; phone: string };

async function callsCollection() {
    return getCollection<VoiceCallDoc>(MongoCollections.VOICE_CALLS);
}

async function whatsappNumbers(owner: VoiceOwnerScope): Promise<OwnedNumberDoc[]> {
    return (await listItems('numbers', owner.userId)).filter((n) => n.provider === VoiceProvider.WHATSAPP);
}

/** A thread key from the page, checked: the number must be one of the owner's WhatsApp numbers. */
export async function threadRef(owner: VoiceOwnerScope, key: string): Promise<ThreadRef & { number: OwnedNumberDoc }> {
    const [numberId, phone] = typeof key === 'string' ? key.split(':') : [];
    if (!numberId || !/^[0-9a-f]{24}$/i.test(numberId) || !/^\+[1-9]\d{6,14}$/.test(phone ?? '')) {
        throw new Error('That conversation does not exist');
    }
    const number = (await whatsappNumbers(owner)).find((n) => n._id.toString() === numberId);
    if (!number) throw new Error('That WhatsApp number is no longer connected');
    return { numberId: number._id, phone, number };
}

/** `statusDetail` names who took over only when it is someone else: the signed-in owner reads "You". */
function statusOf(
    doc: Pick<VoiceCallDoc, 'chat'> | null | undefined,
    owner: VoiceOwnerScope,
): Pick<InboxThread, 'status' | 'statusDetail'> {
    if (doc?.chat?.human) {
        const mine = doc.chat.human.userId.equals(owner.userId);
        return { status: InboxStatus.HUMAN, statusDetail: mine ? null : doc.chat.human.name };
    }
    if (doc?.chat?.needsHuman) return { status: InboxStatus.NEEDS_YOU, statusDetail: doc.chat.needsHuman.reason };
    return { status: InboxStatus.AI, statusDetail: null };
}

function lastOf(doc: VoiceCallDoc): Pick<InboxThread, 'lastText' | 'lastRole' | 'lastAt'> {
    if (doc.channel !== VoiceCallChannel.WHATSAPP) {
        return { lastText: 'WhatsApp call', lastRole: 'call', lastAt: doc.startedAt.toISOString() };
    }
    const turn = doc.turns.at(-1);
    return {
        lastText: turn ? (turn.voice ? `🎤 ${turn.text}` : turn.text) : '',
        lastRole: turn?.role ?? 'caller',
        lastAt: (doc.chat?.lastMessageAt ?? doc.endedAt).toISOString(),
    };
}

/** Every conversation on the owner's WhatsApp numbers, latest first. */
export async function listThreads(owner: VoiceOwnerScope): Promise<InboxThread[]> {
    const numbers = await whatsappNumbers(owner);
    if (numbers.length === 0) return [];
    const byId = new Map(numbers.map((n) => [n._id.toString(), n]));
    const calls = await callsCollection();
    const rows = await calls
        .aggregate<{ _id: { numberId: MongoObjectId; phone: string }; doc: VoiceCallDoc; chat: VoiceCallDoc | null; unread: number }>([
            {
                $match: {
                    userId: owner.userId,
                    numberId: { $in: numbers.map((n) => n._id) },
                    callerPhone: { $type: 'string' },
                    channel: { $in: [VoiceCallChannel.WHATSAPP, VoiceCallChannel.PHONE] },
                },
            },
            { $addFields: { lastAt: { $ifNull: ['$chat.lastMessageAt', '$startedAt'] } } },
            { $sort: { lastAt: -1 } },
            {
                $group: {
                    _id: { numberId: '$numberId', phone: '$callerPhone' },
                    doc: { $first: '$$ROOT' },
                    chat: { $first: { $cond: [{ $eq: ['$channel', VoiceCallChannel.WHATSAPP] }, '$$ROOT', null] } },
                    unread: { $sum: { $ifNull: ['$chat.unread', 0] } },
                },
            },
            { $sort: { 'doc.lastAt': -1 } },
            { $limit: THREADS_MAX },
            { $project: { 'doc.turns': { $slice: ['$doc.turns', -1] }, 'doc.channel': 1, 'doc.chat': 1, 'doc.startedAt': 1,
                'doc.endedAt': 1, 'chat.chat': 1, unread: 1 } },
        ])
        .toArray();
    // The state is on the latest chat; a thread whose latest item is a call takes it from its latest chat.
    const latestChats = await Promise.all(
        rows.map((row) =>
            row.doc.channel === VoiceCallChannel.WHATSAPP
                ? row.doc
                : calls.findOne(
                      { numberId: row._id.numberId, callerPhone: row._id.phone, channel: VoiceCallChannel.WHATSAPP },
                      { projection: { chat: 1 }, sort: { startedAt: -1 } },
                  ),
        ),
    );
    return rows.map((row, i) => ({
        key: `${row._id.numberId.toString()}:${row._id.phone}`,
        numberId: row._id.numberId.toString(),
        phone: row._id.phone,
        name: latestChats[i]?.chat?.name ?? null,
        businessNumber: byId.get(row._id.numberId.toString())?.phoneNumber ?? '',
        unread: row.unread,
        ...lastOf(row.doc),
        ...statusOf(latestChats[i], owner),
    }));
}

async function latestChat(ref: ThreadRef): Promise<VoiceCallDoc | null> {
    return (await callsCollection()).findOne(
        { numberId: ref.numberId, callerPhone: ref.phone, channel: VoiceCallChannel.WHATSAPP },
        { sort: { startedAt: -1 } },
    );
}

/** One conversation, oldest first, marked read. */
export async function getThread(owner: VoiceOwnerScope, key: string): Promise<InboxThreadView> {
    const ref = await threadRef(owner, key);
    const calls = await callsCollection();
    const match = { userId: owner.userId, numberId: ref.numberId, callerPhone: ref.phone };
    const docs = (await calls.find(match).sort({ startedAt: -1 }).limit(THREAD_DOCS_MAX).toArray()).reverse();
    if (docs.length === 0) throw new Error('That conversation does not exist');
    await calls.updateMany({ ...match, 'chat.unread': { $gt: 0 } }, { $set: { 'chat.unread': 0 } });

    const items: InboxItem[] = [];
    const myName = await personName(owner);
    let lastCallerAt: Date | null = null;
    for (const doc of docs) {
        if (doc.channel === VoiceCallChannel.WHATSAPP) {
            for (const turn of doc.turns) {
                const at = turn.at ?? doc.startedAt;
                if (turn.role === 'caller') lastCallerAt = at;
                items.push({ kind: 'message', role: turn.role, text: turn.text, at: at.toISOString(), voice: !!turn.voice, by: turn.by === myName ? null : (turn.by ?? null) });
            }
        } else if (doc._id) {
            items.push({
                kind: 'call',
                id: doc._id.toString(),
                at: doc.startedAt.toISOString(),
                durationSec: doc.durationSec,
                summary: doc.analysis?.summary ?? null,
                inbound: doc.direction === VoiceCallDirection.INBOUND,
            });
        }
    }
    items.sort((a, b) => a.at.localeCompare(b.at));
    const latest = docs.findLast((d) => d.channel === VoiceCallChannel.WHATSAPP) ?? null;
    const last = docs.at(-1)!;
    const agents = await getCollection<VoiceAgentDoc>(MongoCollections.VOICE_AGENTS);
    const agentId = ref.number.inboundAgentId ?? last.agentId;
    const agent = agentId ? await agents.findOne({ _id: agentId }, { projection: { name: 1 } }) : null;
    const windowEnds = lastCallerAt ? lastCallerAt.getTime() + WINDOW_MS : null;

    return {
        key,
        numberId: ref.numberId.toString(),
        phone: ref.phone,
        name: latest?.chat?.name ?? null,
        businessNumber: ref.number.phoneNumber,
        unread: 0,
        ...lastOf(last),
        ...statusOf(latest, owner),
        agentName: agent?.name ?? null,
        items,
        windowOpen: windowEnds !== null && windowEnds > Date.now(),
        windowEndsAt: windowEnds ? new Date(windowEnds).toISOString() : null,
    };
}

async function personName(owner: VoiceOwnerScope): Promise<string> {
    const users = await getCollection<UserDoc>(MongoCollections.USERS);
    const user = await users.findOne({ _id: owner.userId }, { projection: { name: 1, email: 1 } });
    return user?.name?.trim() || user?.email?.split('@')[0] || 'Team';
}

/** A person takes the conversation over: the AI stops answering it until they hand it back. */
export async function takeOver(owner: VoiceOwnerScope, key: string): Promise<void> {
    const ref = await threadRef(owner, key);
    const chat = await latestChat(ref);
    if (!chat?._id) throw new Error('There is no WhatsApp chat to take over yet: it starts when this person writes');
    const human = { since: new Date(), userId: owner.userId, name: await personName(owner) };
    await (await callsCollection()).updateOne({ _id: chat._id }, { $set: { 'chat.human': human, 'chat.needsHuman': null } });
}

/** The person hands the conversation back: the AI answers again from the next message. */
export async function handBack(owner: VoiceOwnerScope, key: string): Promise<void> {
    const ref = await threadRef(owner, key);
    await (await callsCollection()).updateMany(
        {
            userId: owner.userId,
            numberId: ref.numberId,
            callerPhone: ref.phone,
            channel: VoiceCallChannel.WHATSAPP,
            $or: [{ 'chat.human': { $type: 'object' } }, { 'chat.needsHuman': { $type: 'object' } }],
        },
        { $set: { 'chat.human': null, 'chat.needsHuman': null } },
    );
}

/**
 * A person's own reply, sent through the number's Meta app. Only after taking the conversation over, and only
 * inside the 24-hour window. It joins the open chat, or starts one (the engine closes and analyses it later).
 */
export async function sendReply(owner: VoiceOwnerScope, key: string, text: string): Promise<void> {
    const body = typeof text === 'string' ? text.trim() : '';
    if (!body) throw new Error('Write a message first');
    if (body.length > TEXT_MAX) throw new Error(`A WhatsApp message is at most ${TEXT_MAX} characters`);
    const view = await getThread(owner, key);
    if (view.status !== InboxStatus.HUMAN) throw new Error('Take the chat over first: the AI is answering it');
    if (!view.windowOpen) {
        throw new Error('More than 24 hours have passed since this person last wrote. You can reply once they write again.');
    }
    const ref = await threadRef(owner, key);
    await sendTextMessage(whatsappAuthOf(ref.number), ref.number.providerNumberId, ref.phone.slice(1), body);

    const calls = await callsCollection();
    const now = new Date();
    const chat = await latestChat(ref);
    const turn: VoiceCallTurn = { role: 'human', text: body, at: now, by: chat?.chat?.human?.name ?? (await personName(owner)) };
    const quietSince = new Date(now.getTime() - VOICE_CHAT_LIMITS.idleMinutes * 60_000);
    if (chat?._id && chat.chat?.open && chat.chat.lastMessageAt >= quietSince) {
        await calls.updateOne({ _id: chat._id }, { $push: { turns: turn }, $set: { 'chat.lastMessageAt': now, endedAt: now } });
        return;
    }
    // The last chat went quiet (and was closed): this reply starts the next one, keeping the conversation's state.
    const agentId = ref.number.inboundAgentId ?? chat?.agentId;
    if (!agentId || !chat) throw new Error('This number has no agent to keep the chat under. Give it one on the Phone numbers page.');
    await calls.insertOne({
        tenantId: owner.tenantId,
        userId: owner.userId,
        agentId,
        numberId: ref.numberId,
        channel: VoiceCallChannel.WHATSAPP,
        direction: VoiceCallDirection.INBOUND,
        from: ref.phone,
        to: ref.number.phoneNumber,
        voice: '',
        startedAt: now,
        endedAt: now,
        durationSec: 0,
        endedBy: 'chat_open',
        flags: [],
        turns: [turn],
        gapsMs: [],
        callerPhone: ref.phone,
        chat: {
            open: true,
            lastMessageAt: now,
            unread: 0,
            tokens: { textIn: 0, textOut: 0 },
            human: chat.chat?.human ?? null,
            ...(chat.chat?.name ? { name: chat.chat.name } : {}),
        },
    });
}
