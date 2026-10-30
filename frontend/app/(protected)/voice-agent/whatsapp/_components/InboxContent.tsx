'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useDefaultLayout } from 'react-resizable-panels';
import { Bot, Hand, MessageCircleMore, Undo2 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { VOICE_PHONE_NUMBERS_URL } from '@/helpers/voice-routes';
import { usePage } from '@/contexts/PageStore';
import { cn } from '@/lib/utils';
import type { UseInboxPageReturn } from '../_hooks/use-inbox-page';
import { ThreadList } from './ThreadList';
import { ThreadPane } from './ThreadPane';

const STEPS = [
    {
        icon: Bot,
        title: 'The AI answers',
        body: 'Every message and call to your WhatsApp number is answered by its agent, day and night, and it remembers each person.',
    },
    {
        icon: Hand,
        title: 'Take over',
        body: 'Open a chat and press Take over. Chats marked Waiting are the ones where the AI asked for a person. From then on the AI stays quiet.',
    },
    {
        icon: Undo2,
        title: 'Hand back',
        body: 'Reply as yourself from your WhatsApp number, then press Hand back to AI. It picks up from the next message, knowing what you said.',
    },
];

/** The empty right side: how a person steps in, in three steps. */
function TakeoverGuide({ hasThreads }: { hasThreads: boolean }) {
    return (
        <div className="@container flex h-full flex-col items-center justify-center gap-6 overflow-y-auto rounded-xl border bg-[#f0f2f5] p-8 dark:bg-[#222e35]">
            <span className="flex size-16 items-center justify-center rounded-full bg-[#00a884] text-white">
                <MessageCircleMore className="size-8" aria-hidden />
            </span>
            <div className="max-w-lg text-center">
                <h2 className="text-lg font-semibold">Your WhatsApp, answered by AI, with you one click away</h2>
                <p className="text-muted-foreground mt-1 text-sm">
                    {hasThreads ? 'Pick a conversation on the left.' : 'Conversations appear here as soon as someone writes to your WhatsApp number.'}
                </p>
            </div>
            <ol className="grid w-full max-w-3xl gap-3 @xl:grid-cols-3">
                {STEPS.map((step, i) => (
                    <li key={step.title} className="rounded-xl border bg-white p-4 dark:bg-[#111b21]">
                        <span className="flex items-center gap-2 text-sm font-semibold">
                            <span className="flex size-6 items-center justify-center rounded-full bg-[#00a884] text-xs text-white">{i + 1}</span>
                            <step.icon className="size-4 text-[#00a884]" aria-hidden />
                            {step.title}
                        </span>
                        <p className="text-muted-foreground mt-2 text-sm">{step.body}</p>
                    </li>
                ))}
            </ol>
            {!hasThreads ? (
                <Button asChild variant="outline">
                    <Link href={VOICE_PHONE_NUMBERS_URL}>Connect a WhatsApp number</Link>
                </Button>
            ) : null}
            <p className="text-muted-foreground max-w-lg text-center text-xs">
                WhatsApp lets a business reply freely for 24 hours after the person&rsquo;s last message.
            </p>
        </div>
    );
}

/** The inbox's own width (not the screen's: a tablet with the sidebar open is narrow too), from which both panes fit
 * side by side. Same 42rem as the `@2xl/inbox` the first render lays out with, so nothing moves when this takes over. */
const SIDE_BY_SIDE_PX = 672;

function useSideBySide() {
    const ref = useRef<HTMLDivElement>(null);
    const [sideBySide, setSideBySide] = useState<boolean | null>(null);
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const observer = new ResizeObserver(([entry]) => setSideBySide(entry.contentRect.width >= SIDE_BY_SIDE_PX));
        observer.observe(el);
        return () => observer.disconnect();
    }, []);
    return { ref, sideBySide };
}

/** Both panes with a handle between them; the width you drag the chats to is kept for next time. */
function ResizableInbox({ list, chat }: { list: ReactNode; chat: ReactNode }) {
    const { defaultLayout, onLayoutChanged } = useDefaultLayout({
        id: 'whatsapp-inbox',
        onlySaveAfterUserInteractions: true,
    });
    return (
        <ResizablePanelGroup
            id="whatsapp-inbox"
            defaultLayout={defaultLayout}
            onLayoutChanged={onLayoutChanged}
            className="min-h-0 flex-1"
        >
            <ResizablePanel
                id="chats"
                defaultSize="22rem"
                minSize="16rem"
                maxSize="50%"
                groupResizeBehavior="preserve-pixel-size"
                className="h-full"
            >
                {list}
            </ResizablePanel>
            <ResizableHandle
                withHandle
                aria-label="Resize the chat list"
                className="mx-1.5 bg-transparent hover:bg-border"
            />
            <ResizablePanel id="chat" minSize="24rem" className="h-full">
                {chat}
            </ResizablePanel>
        </ResizablePanelGroup>
    );
}

/** WhatsApp Web's layout: the conversations on the left, the open chat on the right, resizable. One pane at a time when
 * the inbox is narrow (a phone, or a tablet with the sidebar open). The server render lays the panes out with container
 * queries; once the width is measured, a wide inbox switches to the resizable panes at the same sizes. */
export function InboxContent() {
    const { thread, allCount, loadError } = usePage<UseInboxPageReturn>();
    const { ref, sideBySide } = useSideBySide();
    const list = <ThreadList />;
    const chat = thread ? <ThreadPane /> : <TakeoverGuide hasThreads={allCount > 0} />;
    return (
        <div ref={ref} className="@container/inbox flex h-[calc(100dvh-7.5rem)] min-h-[32rem] flex-col gap-3">
            {loadError ? (
                <Alert variant="destructive">
                    <AlertDescription>{loadError}</AlertDescription>
                </Alert>
            ) : null}
            {sideBySide ? (
                <ResizableInbox list={list} chat={chat} />
            ) : (
                <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] gap-3 @2xl/inbox:grid-cols-[minmax(18rem,22rem)_minmax(0,1fr)]">
                    <div className={cn('min-h-0', thread && 'hidden @2xl/inbox:block')}>{list}</div>
                    <div className={cn('min-h-0', !thread && 'hidden @2xl/inbox:block')}>{chat}</div>
                </div>
            )}
        </div>
    );
}
