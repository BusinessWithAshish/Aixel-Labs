import { useCallback, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Trash2, X } from 'lucide-react';
import { ChatHistorySidebarEmptyState } from './ChatStates';
import type { ChatSession } from '@/hooks/use-nl-chat/types';

type ChatHistorySidebarProps = {
    isSidebarOpen: boolean;
    setIsSidebarOpen: (isOpen: boolean) => void;
    chatHistory: ChatSession[];
    activeSessionId: string;
    onSessionClick: (sessionId: string) => void;
    onDeleteSession: (sessionId: string) => void;
};

const TIME_OPTS: Intl.DateTimeFormatOptions = {
    hour: '2-digit',
    minute: '2-digit',
};

function formatSessionDate(timestamp: number): string {
    const date = new Date(timestamp);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    const isYesterday =
        date.toDateString() === new Date(now.getTime() - 86_400_000).toDateString();

    const time = date.toLocaleTimeString([], TIME_OPTS);

    if (isToday) return `Today, ${time}`;
    if (isYesterday) return `Yesterday, ${time}`;
    return `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })} · ${time}`;
}

function countUserMessages(session: ChatSession): number {
    let count = 0;
    for (const m of session.messages) if (m.role === 'user') count++;
    return count;
}

type ChatHistorySidebarSessionRowProps = {
    session: ChatSession;
    isActive: boolean;
    onSelect: () => void;
    onRequestDelete: () => void;
};

function ChatHistorySidebarSessionRow({
    session,
    isActive,
    onSelect,
    onRequestDelete,
}: ChatHistorySidebarSessionRowProps) {
    const msgCount = countUserMessages(session);

    return (

        <div
            onClick={onSelect}
            className={cn(
                'group cursor-pointer relative flex w-full rounded-md p-2',
                isActive && 'bg-muted/40 border-primary border-l-4 hover:bg-muted',
            )}
        >

            <div className="flex w-full flex-1 justify-between p-1">
                <div className="flex flex-col gap-2">
                    <span className="text-sm font-medium">{session.title || 'Chat'}</span>
                    <span className="text-xs text-muted-foreground">{formatSessionDate(session.updatedAt)}</span>
                </div>

                <div className="flex flex-col justify-end items-end gap-2">
                    <Badge >{msgCount} {msgCount === 1 ? 'msg' : 'msgs'}</Badge>
                    <Trash2
                        aria-label={`Delete "${session.title || 'Chat'}"`}
                        className={cn(
                            'size-4 shrink-0 cursor-pointer rounded-md',
                            'text-muted-foreground hover:text-destructive hover:bg-destructive/10',
                        )}
                        onClick={(e) => {
                            e.stopPropagation();
                            onRequestDelete();
                        }}
                    />
                </div>
            </div>
        </div>

    );
}

export const ChatHistorySidebar = ({
    isSidebarOpen,
    setIsSidebarOpen,
    chatHistory,
    activeSessionId,
    onSessionClick,
    onDeleteSession,
}: ChatHistorySidebarProps) => {
    // chatHistory arrives pre-sorted (newest-first) from useNlChat
    const sorted = chatHistory;

    // Session the user has requested to delete (null = dialog closed).
    const [deleteTarget, setDeleteTarget] = useState<ChatSession | null>(null);

    const closeDeleteDialog = useCallback(() => setDeleteTarget(null), []);
    const confirmDelete = useCallback(() => {
        if (!deleteTarget) return;
        onDeleteSession(deleteTarget.sessionId);
        setDeleteTarget(null);
    }, [deleteTarget, onDeleteSession]);

    const historyDescription =
        chatHistory.length === 0
            ? 'No sessions yet'
            : `${chatHistory.length} session${chatHistory.length !== 1 ? 's' : ''} · Tap to open`;

    return (
        <>
            <Card
                className={cn(
                    'absolute z-20 top-0 left-0 w-1/2 md:w-1/3 h-full',
                    'border-r',
                    'transition-transform duration-300 ease-out',
                    isSidebarOpen ? 'translate-x-0' : '-translate-x-full',
                )}
            >
                <CardHeader className="shrink-0 space-y-1">
                    <CardTitle className="text-base">Chat history</CardTitle>
                    <CardDescription className="text-xs">
                        {historyDescription}
                    </CardDescription>
                    <CardAction
                        onClick={() => setIsSidebarOpen(false)}
                    >
                        <X className="w-4 h-4 cursor-pointer hover:text-muted-foreground" />
                    </CardAction>
                </CardHeader>

                <CardContent className="flex flex-col flex-1 overflow-y-auto">
                    {sorted.length === 0 ? (
                        <ChatHistorySidebarEmptyState />
                    ) : (

                        <>
                            {sorted.map((session) => (
                                <ChatHistorySidebarSessionRow
                                    key={session.sessionId}
                                    session={session}
                                    isActive={session.sessionId === activeSessionId}
                                    onSelect={() => {
                                        onSessionClick(session.sessionId);
                                        setIsSidebarOpen(false);
                                    }}
                                    onRequestDelete={() => setDeleteTarget(session)}
                                />
                            ))
                            }
                        </>

                    )}
                </CardContent>
            </Card>

            <Dialog
                open={deleteTarget !== null}
                onOpenChange={(open) => {
                    if (!open) closeDeleteDialog();
                }}
            >
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Delete chat?</DialogTitle>
                        <DialogDescription>
                            {deleteTarget
                                ? `This will permanently remove "${deleteTarget.title || 'Chat'}" and its ${countUserMessages(deleteTarget)} message${countUserMessages(deleteTarget) === 1 ? '' : 's'} from this device. This action cannot be undone.`
                                : null}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={closeDeleteDialog}>
                            Cancel
                        </Button>
                        <Button variant="destructive" onClick={confirmDelete}>
                            <Trash2 className="h-4 w-4" />
                            Delete
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
};