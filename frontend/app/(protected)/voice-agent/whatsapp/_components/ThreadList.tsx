'use client';

import { Phone } from 'lucide-react';
import { usePage } from '@/contexts/PageStore';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatPhone } from '@/helpers/voice-campaign-contacts';
import { InboxStatus, type InboxThread } from '@/helpers/voice-inbox';
import { cn } from '@/lib/utils';
import { whatsappDay, whatsappTime } from '@/components/common/voice-agent/whatsapp/WhatsAppChat';
import type { InboxFilter, UseInboxPageReturn } from '../_hooks/use-inbox-page';
import { InboxStatusChip } from './InboxStatusChip';

function when(iso: string): string {
    const day = whatsappDay(iso);
    return day === 'Today' ? whatsappTime(iso) : day;
}

function ThreadRow({ thread, selected, onOpen }: { thread: InboxThread; selected: boolean; onOpen: () => void }) {
    const title = thread.name ?? formatPhone(thread.phone);
    const prefix = thread.lastRole === 'agent' ? 'AI: ' : thread.lastRole === 'human' ? 'You: ' : '';
    return (
        <li>
            <button
                type="button"
                onClick={onOpen}
                aria-current={selected ? 'true' : undefined}
                className={cn(
                    'flex w-full items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-[#f5f6f6] dark:hover:bg-[#202c33]',
                    selected && 'bg-[#f0f2f5] dark:bg-[#2a3942]',
                    thread.status === InboxStatus.NEEDS_YOU && 'border-l-4 border-l-amber-400',
                )}
            >
                <span
                    aria-hidden
                    className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[#dfe5e7] text-sm font-semibold text-[#54656f]"
                >
                    {title.replace(/[^\p{L}\p{N}]/gu, '').slice(0, 2).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1 border-b border-[#e9edef] pb-3 dark:border-[#222d34]">
                    <span className="flex items-baseline justify-between gap-2">
                        <span className="truncate font-medium">{title}</span>
                        <span className={cn('shrink-0 text-xs', thread.unread ? 'font-semibold text-[#00a884]' : 'text-muted-foreground')}>
                            {when(thread.lastAt)}
                        </span>
                    </span>
                    <span className="mt-0.5 flex items-center justify-between gap-2">
                        <span className="text-muted-foreground flex min-w-0 items-center gap-1 text-sm">
                            {thread.lastRole === 'call' ? <Phone className="size-3.5 shrink-0" aria-hidden /> : null}
                            <span className="truncate">
                                {prefix}
                                {thread.lastText}
                            </span>
                        </span>
                        {thread.unread ? (
                            <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-[#25d366] text-[11px] font-semibold text-white">
                                {thread.unread}
                                <span className="sr-only"> unread</span>
                            </span>
                        ) : null}
                    </span>
                    <span className="mt-1.5 flex items-center gap-2">
                        <InboxStatusChip status={thread.status} name={thread.status === InboxStatus.HUMAN ? thread.statusDetail : null} />
                        <span className="text-muted-foreground truncate text-xs">to {formatPhone(thread.businessNumber)}</span>
                    </span>
                </span>
            </button>
        </li>
    );
}

const FILTERS: { value: InboxFilter; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'needs-you', label: 'Needs you' },
    { value: 'yours', label: 'Yours' },
    { value: 'ai', label: 'AI' },
];

/** The conversations, latest first, as WhatsApp lists chats; "Needs you" ones carry an amber edge. */
export function ThreadList() {
    const { threads, counts, filter, setFilter, selectedKey, openThread } = usePage<UseInboxPageReturn>();
    return (
        <aside className="flex min-h-0 flex-col overflow-hidden rounded-xl border bg-white dark:bg-[#111b21]" aria-label="Conversations">
            <div className="flex flex-col gap-3 border-b px-4 pt-4 pb-3">
                <h2 className="text-lg font-semibold">Chats</h2>
                <Tabs value={filter} onValueChange={(v) => setFilter(v as InboxFilter)}>
                    <TabsList className="w-full" aria-label="Show">
                        {FILTERS.map((f) => (
                            <TabsTrigger key={f.value} value={f.value} className="min-w-0 px-1.5 text-xs">
                                {f.label}
                                {f.value === 'needs-you' && counts['needs-you'] ? (
                                    <span className="rounded-full bg-amber-400 px-1.5 text-[10px] leading-4 font-semibold text-white">
                                        {counts['needs-you']}
                                    </span>
                                ) : null}
                            </TabsTrigger>
                        ))}
                    </TabsList>
                </Tabs>
            </div>
            {threads.length === 0 ? (
                <p className="text-muted-foreground p-6 text-center text-sm">
                    {filter === 'all' ? 'No WhatsApp conversations yet.' : 'Nothing here right now.'}
                </p>
            ) : (
                <ul className="min-h-0 flex-1 overflow-y-auto">
                    {threads.map((t) => (
                        <ThreadRow key={t.key} thread={t} selected={t.key === selectedKey} onOpen={() => void openThread(t.key)} />
                    ))}
                </ul>
            )}
        </aside>
    );
}
