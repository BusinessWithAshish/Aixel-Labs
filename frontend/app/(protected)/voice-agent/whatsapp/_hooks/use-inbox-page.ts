'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ALApiResponse } from '@aixellabs/backend/api/types';
import {
    getInboxThread,
    handBackInboxThread,
    listInboxThreads,
    sendInboxReply,
    sendInboxVoiceNote,
    takeOverInboxThread,
} from '@/app/actions/voice-inbox-actions';
import { InboxStatus, type InboxThread, type InboxThreadView } from '@/helpers/voice-inbox';
import { useVoiceNoteRecorder } from './use-voice-note-recorder';

export type InboxPageData = {
    threads: InboxThread[];
    selectedKey: string | null;
    thread: InboxThreadView | null;
    loadError: string | null;
};

export type InboxFilter = 'all' | 'needs-you' | 'yours' | 'ai';

const FILTER_MATCH: Record<InboxFilter, (t: InboxThread) => boolean> = {
    all: () => true,
    'needs-you': (t) => t.status === InboxStatus.NEEDS_YOU,
    yours: (t) => t.status === InboxStatus.HUMAN,
    ai: (t) => t.status === InboxStatus.AI,
};

/** New messages show up without a reload: the open chat is asked often, the list a little less. */
const THREAD_POLL_MS = 3000;
const LIST_POLL_MS = 6000;

export function useInboxPage(data: InboxPageData) {
    const router = useRouter();
    const pathname = usePathname();
    const [threads, setThreads] = useState(data.threads);
    const [thread, setThread] = useState<InboxThreadView | null>(data.thread);
    const [selectedKey, setSelectedKey] = useState<string | null>(data.selectedKey);
    const [filter, setFilter] = useState<InboxFilter>('all');
    const [draft, setDraft] = useState('');
    const [busy, setBusy] = useState<'take' | 'back' | 'send' | null>(null);
    const keyRef = useRef(selectedKey);
    keyRef.current = selectedKey;

    const refreshList = useCallback(async () => {
        const res = await listInboxThreads();
        if (res.success && res.data) setThreads(res.data);
    }, []);

    const refreshThread = useCallback(async () => {
        const key = keyRef.current;
        if (!key) return;
        const res = await getInboxThread(key);
        if (res.success && res.data && keyRef.current === key) setThread(res.data);
    }, []);

    useEffect(() => {
        const list = setInterval(refreshList, LIST_POLL_MS);
        const open = setInterval(refreshThread, THREAD_POLL_MS);
        return () => {
            clearInterval(list);
            clearInterval(open);
        };
    }, [refreshList, refreshThread]);

    /** Opening a chat keeps it in the URL (`?c=`), so a reload or a shared link opens it again. */
    const openThread = useCallback(
        async (key: string | null) => {
            setSelectedKey(key);
            setDraft('');
            router.replace(key ? `${pathname}?c=${encodeURIComponent(key)}` : pathname, { scroll: false });
            if (!key) return setThread(null);
            setThread((current) => (current?.key === key ? current : null));
            const res = await getInboxThread(key);
            if (!res.success || !res.data) return void toast.error(res.error ?? 'Could not open the chat');
            setThread(res.data);
            setThreads((list) => list.map((t) => (t.key === key ? { ...t, unread: 0 } : t)));
        },
        [pathname, router],
    );

    const run = async (kind: 'take' | 'back' | 'send', action: () => Promise<ALApiResponse<InboxThreadView>>, done?: string) => {
        setBusy(kind);
        const res = await action();
        setBusy(null);
        if (!res.success || !res.data) {
            toast.error(res.error ?? 'Something went wrong');
            return false;
        }
        setThread(res.data);
        void refreshList();
        if (done) toast.success(done);
        return true;
    };

    const takeOver = () => thread && run('take', () => takeOverInboxThread(thread.key), 'You have this chat. The AI is paused.');
    const handBack = () => thread && run('back', () => handBackInboxThread(thread.key), 'The AI answers this chat again.');
    const send = async () => {
        if (!thread || !draft.trim()) return;
        const text = draft;
        setDraft('');
        if (!(await run('send', () => sendInboxReply(thread.key, text)))) setDraft(text);
    };

    const voiceNote = useVoiceNoteRecorder((audio) => {
        if (!thread) return;
        const form = new FormData();
        form.append('audio', audio, 'voice-note');
        void run('send', () => sendInboxVoiceNote(thread.key, form));
    });

    const visible = useMemo(() => threads.filter(FILTER_MATCH[filter]), [threads, filter]);
    const counts = useMemo(
        () => ({
            'needs-you': threads.filter(FILTER_MATCH['needs-you']).length,
            yours: threads.filter(FILTER_MATCH.yours).length,
        }),
        [threads],
    );

    return {
        threads: visible,
        allCount: threads.length,
        counts,
        filter,
        setFilter,
        selectedKey,
        thread,
        openThread,
        draft,
        setDraft,
        busy,
        takeOver,
        handBack,
        send,
        voiceNote,
        loadError: data.loadError,
    };
}

export type UseInboxPageReturn = ReturnType<typeof useInboxPage>;
