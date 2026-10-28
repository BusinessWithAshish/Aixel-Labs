'use client';

import { ArrowLeft, Bot, Hand, Loader2, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePage } from '@/contexts/PageStore';
import { formatPhone } from '@/helpers/voice-campaign-contacts';
import { InboxStatus, type InboxItem, type InboxThreadView } from '@/helpers/voice-inbox';
import { cn } from '@/lib/utils';
import {
    WhatsAppBubble,
    WhatsAppCallPill,
    WhatsAppComposer,
    WhatsAppFrame,
    WhatsAppPill,
    whatsappDay,
    whatsappTime,
} from '@/components/common/voice-agent/whatsapp/WhatsAppChat';
import type { UseInboxPageReturn } from '../_hooks/use-inbox-page';
import { InboxStatusChip } from './InboxStatusChip';

/** The AI as the inbox names it: "AI", and which agent in brackets. */
function aiName(thread: InboxThreadView): string {
    return thread.agentName ? `AI (${thread.agentName})` : 'AI';
}

function sideOf(item: InboxItem): 'in' | 'out' | 'call' {
    return item.kind === 'call' ? 'call' : item.role === 'caller' ? 'in' : 'out';
}

/** The conversation as WhatsApp shows it: a day pill when the day changes, the tail on the first bubble of a run. */
function Messages({ thread }: { thread: InboxThreadView }) {
    return (
        <>
            {thread.items.map((item, i) => {
                const previous = thread.items[i - 1];
                const newDay = !previous || whatsappDay(previous.at) !== whatsappDay(item.at);
                const tail = newDay || !previous || sideOf(previous) !== sideOf(item);
                return (
                    <div key={`${item.kind}-${item.at}-${i}`}>
                        {newDay ? <WhatsAppPill>{whatsappDay(item.at)}</WhatsAppPill> : null}
                        {item.kind === 'call' ? (
                            <WhatsAppCallPill at={item.at} durationSec={item.durationSec} summary={item.summary} inbound={item.inbound} />
                        ) : (
                            <WhatsAppBubble
                                side={item.role === 'caller' ? 'in' : 'out'}
                                text={item.text}
                                time={whatsappTime(item.at)}
                                voice={item.voice}
                                tail={tail}
                                sender={
                                    item.role === 'agent'
                                        ? { name: aiName(thread), ai: true }
                                        : item.role === 'human'
                                          ? { name: item.by ?? 'You', ai: false }
                                          : null
                                }
                            />
                        )}
                    </div>
                );
            })}
        </>
    );
}

/** Who answers this chat now, and the one button that changes it. */
function TakeoverBar({ thread }: { thread: InboxThreadView }) {
    const { busy, takeOver, handBack } = usePage<UseInboxPageReturn>();
    const tone = {
        [InboxStatus.AI]: 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100',
        [InboxStatus.NEEDS_YOU]: 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100',
        [InboxStatus.HUMAN]: 'border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-100',
    }[thread.status];
    const Icon = { [InboxStatus.AI]: Bot, [InboxStatus.NEEDS_YOU]: Hand, [InboxStatus.HUMAN]: UserRound }[thread.status];
    const words = {
        [InboxStatus.AI]: `${aiName(thread)} is answering this chat.`,
        [InboxStatus.NEEDS_YOU]: `The AI asked for a person${thread.statusDetail ? `: ${thread.statusDetail}` : ''}. It stays quiet until you take over.`,
        [InboxStatus.HUMAN]: thread.statusDetail
            ? `${thread.statusDetail} is answering. The AI is paused for this chat.`
            : 'You’re answering. The AI is paused for this chat.',
    }[thread.status];

    return (
        <div className={cn('flex flex-wrap items-center gap-3 border-t px-4 py-2.5 text-sm', tone)} role="status">
            <Icon className="size-4 shrink-0" aria-hidden />
            <p className="min-w-0 flex-1">{words}</p>
            {thread.status === InboxStatus.HUMAN ? (
                <Button size="sm" variant="outline" onClick={() => void handBack()} disabled={!!busy}>
                    {busy === 'back' ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Bot className="size-4" aria-hidden />}
                    Hand back to AI
                </Button>
            ) : (
                <Button size="sm" onClick={() => void takeOver()} disabled={!!busy}>
                    {busy === 'take' ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Hand className="size-4" aria-hidden />}
                    Take over
                </Button>
            )}
        </div>
    );
}

export function ThreadPane() {
    const { thread, openThread, draft, setDraft, busy, send, voiceNote } = usePage<UseInboxPageReturn>();
    if (!thread) return null;
    const mine = thread.status === InboxStatus.HUMAN;

    return (
        <WhatsAppFrame
            className="h-full"
            scrollKey={`${thread.key}:${thread.items.length}`}
            title={thread.name ?? formatPhone(thread.phone)}
            actions={
                <>
                    <InboxStatusChip status={thread.status} name={mine ? thread.statusDetail : null} />
                    <Button
                        size="icon"
                        variant="ghost"
                        className="text-white hover:bg-white/10 hover:text-white md:hidden"
                        onClick={() => void openThread(null)}
                        aria-label="Back to conversations"
                    >
                        <ArrowLeft className="size-5" aria-hidden />
                    </Button>
                </>
            }
            banner={<TakeoverBar thread={thread} />}
            footer={
                // Only the person who took the chat over writes in it; until then the bar above offers "Take over".
                mine ? (
                    <WhatsAppComposer
                        value={draft}
                        onChange={setDraft}
                        onSend={() => void send()}
                        disabled={!thread.windowOpen}
                        sending={busy === 'send'}
                        placeholder={thread.windowOpen ? 'Type a message' : 'Over 24 hours since they last wrote: reply when they write again'}
                        voiceNote={thread.windowOpen ? voiceNote : undefined}
                    />
                ) : null
            }
        >
            <Messages thread={thread} />
        </WhatsAppFrame>
    );
}
