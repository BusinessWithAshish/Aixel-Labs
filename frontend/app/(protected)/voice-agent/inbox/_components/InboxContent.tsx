'use client';

import Link from 'next/link';
import { Bot, Hand, MessageCircleMore, Undo2 } from 'lucide-react';
import { VOICE_AGENT_SUB_MODULES } from '@aixellabs/backend/db/types';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { SubModuleUrls } from '@/config/app-config';
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
        body: 'Open a chat and press Take over. Chats marked Needs you are the ones where the AI asked for a person. From then on the AI stays quiet.',
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
        <div className="flex h-full flex-col items-center justify-center gap-6 rounded-xl border bg-[#f0f2f5] p-8 dark:bg-[#222e35]">
            <span className="flex size-16 items-center justify-center rounded-full bg-[#00a884] text-white">
                <MessageCircleMore className="size-8" aria-hidden />
            </span>
            <div className="max-w-lg text-center">
                <h2 className="text-lg font-semibold">Your WhatsApp, answered by AI, with you one click away</h2>
                <p className="text-muted-foreground mt-1 text-sm">
                    {hasThreads ? 'Pick a conversation on the left.' : 'Conversations appear here as soon as someone writes to your WhatsApp number.'}
                </p>
            </div>
            <ol className="grid w-full max-w-3xl gap-3 sm:grid-cols-3">
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
                    <Link href={SubModuleUrls[VOICE_AGENT_SUB_MODULES.PHONE_NUMBERS]}>Connect a WhatsApp number</Link>
                </Button>
            ) : null}
            <p className="text-muted-foreground max-w-lg text-center text-xs">
                WhatsApp lets a business reply freely for 24 hours after the person&rsquo;s last message.
            </p>
        </div>
    );
}

/** WhatsApp Web's layout: the conversations on the left, the open chat on the right (one at a time on a phone). */
export function InboxContent() {
    const { thread, allCount, loadError } = usePage<UseInboxPageReturn>();
    return (
        <div className="flex h-[calc(100dvh-7.5rem)] min-h-[32rem] flex-col gap-3">
            {loadError ? (
                <Alert variant="destructive">
                    <AlertDescription>{loadError}</AlertDescription>
                </Alert>
            ) : null}
            <div className="grid min-h-0 flex-1 gap-3 md:grid-cols-[minmax(18rem,22rem)_1fr]">
                <div className={cn('min-h-0', thread && 'hidden md:block')}>
                    <ThreadList />
                </div>
                <div className={cn('min-h-0', !thread && 'hidden md:block')}>
                    {thread ? <ThreadPane /> : <TakeoverGuide hasThreads={allCount > 0} />}
                </div>
            </div>
        </div>
    );
}
