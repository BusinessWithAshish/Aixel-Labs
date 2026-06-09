'use client';

import { useCallback, useState } from 'react';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useNlChat } from '@/hooks/use-nl-chat/use-nl-chat';
import type { UseNlChatOptions } from '@/hooks/use-nl-chat/types';
import { ChatHeader } from '@/components/common/ai-chat-interface/ChatHeader';
import { MessageBubble } from '@/components/common/ai-chat-interface/MessageBubble';
import { LimitReachedBanner, NearLimitWarning } from '@/components/common/ai-chat-interface/ChatLimits';
import {
    ConfirmationPrompt,
    EmptyState,
    ErrorDisplay,
    LoadingIndicator,
    SubmittedSessionBanner,
} from '@/components/common/ai-chat-interface/ChatStates';
import { ChatInputArea } from '@/components/common/ai-chat-interface/ChatInput';
import { ChatHistorySidebar } from './ChatHistorySidebar';

export type { UseNlChatOptions } from '@/hooks/use-nl-chat/types';

function attachAutoScroll(node: HTMLDivElement | null) {
    if (!node) return;
    node.scrollTop = node.scrollHeight;
    const observer = new MutationObserver(() => {
        node.scrollTop = node.scrollHeight;
    });
    observer.observe(node, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
}

export function ChatInterface({
    name,
    assistantName = 'AI Assistant',
    placeholder = 'Type your message...',
    className,
    emptyStateMessage = 'Start a conversation to get started',
    onConfirm,
    isConfirming = false,
}: UseNlChatOptions) {
    const {
        input,
        setInput,
        messages,
        status,
        error,
        isBusy,
        turnsRemaining,
        isNearLimit,
        isAtLimit,
        isSubmitted,
        showConfirm,
        draft,
        chatHistory,
        activeSessionId,
        sendTurn,
        newChat,
        switchSession,
        deleteSession,
        confirm,
    } = useNlChat({ name, onConfirm, isConfirming });

    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const closeSidebar = useCallback(() => setIsSidebarOpen(false), []);
    const openSidebar = useCallback(() => setIsSidebarOpen(true), []);

    const isInputDisabled = isBusy || isAtLimit || isSubmitted;
    const inputPlaceholder = isAtLimit
        ? 'Turn limit reached — please start a new chat'
        : isSubmitted
            ? 'Action already initiated — start a new chat to continue'
            : placeholder;

    return (
        <Card className={cn('h-full w-full flex flex-col overflow-hidden relative', className)}>
            <section className="flex-1 h-full flex flex-row">

                <ChatHistorySidebar
                    isSidebarOpen={isSidebarOpen}
                    setIsSidebarOpen={setIsSidebarOpen}
                    chatHistory={chatHistory}
                    activeSessionId={activeSessionId}
                    onSessionClick={switchSession}
                    onDeleteSession={deleteSession}
                />

                <div
                    onClick={closeSidebar}
                    className={cn(
                        'absolute inset-0 z-9 bg-black/50 transition-opacity duration-300',
                        isSidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none',
                    )}
                />

                <section className="flex flex-col flex-1">
                    <ChatHeader
                        onOpenSidebar={openSidebar}
                        assistantName={assistantName}
                        onReset={newChat}
                    />

                    <CardContent ref={attachAutoScroll} className="flex flex-col space-y-4 flex-1 overflow-y-auto">
                        {messages.length === 0 && (
                            <EmptyState assistantName={assistantName} message={emptyStateMessage} />
                        )}

                        {messages.map((message, index) => (
                            <MessageBubble
                                key={message.id}
                                message={message}
                                isLatest={index === messages.length - 1}
                            />
                        ))}

                        {status === 'loading' && <LoadingIndicator />}

                        {showConfirm && onConfirm && (
                            <ConfirmationPrompt
                                extractedData={draft}
                                onConfirm={confirm}
                                onReset={newChat}
                                isConfirming={isConfirming}
                            />
                        )}

                        {isSubmitted && <SubmittedSessionBanner onReset={newChat} />}

                        {isAtLimit && !isSubmitted && <LimitReachedBanner onReset={newChat} />}

                        {isNearLimit && !isAtLimit && !isSubmitted && (
                            <NearLimitWarning remaining={turnsRemaining} />
                        )}

                        {error && <ErrorDisplay error={error} onRetry={newChat} />}
                    </CardContent>

                    <CardFooter className="pb-4 pt-0">
                        <ChatInputArea
                            inputValue={input}
                            setInputValue={setInput}
                            handleSubmit={sendTurn}
                            placeholder={inputPlaceholder}
                            isLoading={isBusy || isConfirming}
                            disabled={isInputDisabled}
                        />
                    </CardFooter>
                </section>
            </section>
        </Card>
    );
}
