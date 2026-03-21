'use client';

import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, isToolUIPart, getToolName, type UIMessage } from 'ai';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { AIInput } from '@/components/ui/ai-input';
import { cn } from '@/lib/utils';
import { CheckCircle2, RotateCcw, User, AlertCircle, MessageSquareWarning } from 'lucide-react';
import { ShimmeringText } from '../ui/shimmering-text';
import { AppLogo } from './AppLogo';
import { toast } from 'sonner';

// ---- conversation limits (keep in sync with route.ts) ----------------------
const MAX_MESSAGES = 15;
const WARNING_THRESHOLD = 24; // show "running out of messages" warning

export type ConfirmResult = {
    success: boolean;
    message?: string;
    resetChat?: boolean;
};

type BaseChatInterfaceProps = {
    taskType: string;
    assistantName?: string;
    placeholder?: string;
    className?: string;
    emptyStateMessage?: string;
};

type AutoConfirmProps = {
    confirmMode?: 'auto';
    onConfirm?: (data: object) => void | Promise<void>;
};

type ManualConfirmProps = {
    confirmMode: 'manual';
    onConfirm?: (data: object) => ConfirmResult | Promise<ConfirmResult>;
};

// Props for the ChatInterface component
export type ChatInterfaceProps = BaseChatInterfaceProps & (AutoConfirmProps | ManualConfirmProps);

export function ChatInterface({
    taskType,
    assistantName = 'AI Assistant',
    placeholder = 'Type your message...',
    className,
    emptyStateMessage = 'Start a conversation to get started',
    onConfirm,
    confirmMode = 'auto',
}: ChatInterfaceProps) {
    const [input, setInput] = useState('');
    const [isConfirming, setIsConfirming] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);

    const transport = useMemo(
        () => new DefaultChatTransport({ api: '/api/nl-chat', body: { taskType } }),
        [taskType],
    );

    const { messages, sendMessage, setMessages, status, error, stop } = useChat({
        id: `nl-chat-${taskType}`,
        transport,
    });

    const isBusy = status === 'submitted' || status === 'streaming' || isConfirming;

    const messagesRemaining = MAX_MESSAGES - messages.length;
    const isNearLimit = messages.length >= WARNING_THRESHOLD && messages.length < MAX_MESSAGES;
    const isAtLimit = messages.length >= MAX_MESSAGES;

    // Auto-scroll when messages change
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, status]);

    const handleSubmit = useCallback(
        (e?: React.FormEvent) => {
            e?.preventDefault();
            if (!input.trim() || isBusy || isAtLimit) return;
            sendMessage({ text: input });
            setInput('');
        },
        [input, isBusy, isAtLimit, sendMessage],
    );

    const handleReset = useCallback(() => {
        stop();
        setMessages([]);
        setInput('');
    }, [stop, setMessages]);

    // Extract submitted data from the latest submitLeadData tool call
    const submittedData = useMemo(() => {
        for (let i = messages.length - 1; i >= 0; i--) {
            const message = messages[i];
            if (message.role !== 'assistant') continue;
            for (const part of message.parts) {
                if (!isToolUIPart(part)) continue;
                if (getToolName(part) !== 'submitLeadData') continue;
                if (part.state === 'input-available' || part.state === 'output-available') {
                    return {
                        data: part.input as Record<string, unknown>,
                        toolCallId: part.toolCallId,
                    };
                }
            }
        }
        return null;
    }, [messages]);

    const handleConfirm = useCallback(async () => {
        if (!onConfirm || !submittedData) return;
        setIsConfirming(true);
        try {
            if (confirmMode === 'manual') {
                const result = await onConfirm(submittedData.data);

                if (!result) {
                    // Caller chose to handle all UX themselves.
                    return;
                }

                if (result.success) {
                    if (result.message) {
                        toast.success(result.message);
                    }

                    if (result.resetChat) {
                        handleReset();
                    }
                } else if (result.message) {
                    toast.error(result.message);
                }
            } else {
                await onConfirm(submittedData.data);
                toast.success(
                    'Your request was submitted successfully. Resetting the chat.',
                    { duration: 8_000 },
                );
                handleReset();
            }
        } catch (err) {
            console.error('Error while confirming:', err);
            toast.error(
                err instanceof Error ? err.message : 'Something went wrong while confirming. Please try again.',
            );
        } finally {
            setIsConfirming(false);
        }
    }, [confirmMode, handleReset, onConfirm, submittedData]);

    return (
        <Card className={cn('flex flex-col h-full w-full', className)}>
            <ChatHeader assistantName={assistantName} onReset={handleReset} />

            <CardContent className="flex flex-col h-full">
                <ScrollArea ref={scrollRef} className="flex-1">
                    <div className="space-y-4">
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

                        {status === 'submitted' && <LoadingIndicator />}

                        {submittedData && onConfirm && (
                            <ConfirmationPrompt
                                extractedData={submittedData.data}
                                onConfirm={handleConfirm}
                                onReset={handleReset}
                                isConfirming={isConfirming}
                            />
                        )}

                        {isAtLimit && (
                            <LimitReachedBanner onReset={handleReset} />
                        )}

                        {isNearLimit && !isAtLimit && (
                            <NearLimitWarning remaining={messagesRemaining} />
                        )}

                        {error && <ErrorDisplay error={error} onRetry={handleReset} />}
                    </div>
                </ScrollArea>
            </CardContent>

            <CardFooter>
                <ChatInputArea
                    inputValue={input}
                    setInputValue={setInput}
                    handleSubmit={handleSubmit}
                    placeholder={isAtLimit ? 'Message limit reached — please start over' : placeholder}
                    isLoading={isBusy}
                    disabled={isBusy || isAtLimit}
                />
            </CardFooter>
        </Card>
    );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ChatHeader({ assistantName, onReset }: { assistantName: string; onReset: () => void }) {
    return (
        <CardHeader>
            <CardTitle className="flex items-center gap-3">
                <AppLogo />
                <div className="flex-1">
                    <h3 className="font-semibold text-foreground">{assistantName}</h3>
                </div>
            </CardTitle>
            <CardAction>
                <Button variant="outline" size="icon" onClick={onReset} title="Start over">
                    <RotateCcw className="w-4 h-4" />
                </Button>
            </CardAction>
        </CardHeader>
    );
}

function EmptyState({ assistantName, message }: { assistantName: string; message: string }) {
    return (
        <div className="flex flex-col items-center justify-center h-full min-h-[300px] text-center animate-in fade-in duration-500">
            <AppLogo />
            <h4 className="font-medium text-foreground mt-2">{assistantName}</h4>
            <p className="text-sm text-muted-foreground mt-1 max-w-xs">{message}</p>
        </div>
    );
}

function LoadingIndicator() {
    return (
        <div className="flex items-center gap-3 animate-in slide-in-from-bottom-2 fade-in duration-300">
            <AppLogo />
            <ShimmeringText text="Thinking..." className="text-sm" duration={0.6} repeatDelay={1} />
        </div>
    );
}

function ErrorDisplay({ error, onRetry }: { error: Error; onRetry: () => void }) {
    return (
        <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg animate-in fade-in duration-300">
            <div className="flex items-center gap-2 mb-2">
                <AlertCircle className="w-4 h-4 text-destructive" />
                <p className="text-sm font-medium text-destructive">Something went wrong</p>
            </div>
            <p className="text-sm text-destructive/80 mb-3">{error.message}</p>
            <Button variant="outline" size="sm" onClick={onRetry}>
                Start Over
            </Button>
        </div>
    );
}

function LimitReachedBanner({ onReset }: { onReset: () => void }) {
    return (
        <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg animate-in fade-in duration-300">
            <div className="flex items-center gap-2 mb-2">
                <AlertCircle className="w-4 h-4 text-destructive" />
                <p className="text-sm font-medium text-destructive">Conversation limit reached</p>
            </div>
            <p className="text-sm text-destructive/80 mb-3">
                This conversation has reached the maximum of {MAX_MESSAGES} messages. Please start a new chat to continue.
            </p>
            <Button variant="outline" size="sm" onClick={onReset}>
                Start New Chat
            </Button>
        </div>
    );
}

function NearLimitWarning({ remaining }: { remaining: number }) {
    return (
        <div className="px-3 py-2 bg-amber-500/10 border border-amber-500/20 rounded-lg animate-in fade-in duration-300 flex items-center gap-2">
            <MessageSquareWarning className="w-4 h-4 text-amber-600 shrink-0" />
            <p className="text-xs text-amber-700 dark:text-amber-400">
                {remaining} message{remaining !== 1 ? 's' : ''} remaining — try to finalize your request soon.
            </p>
        </div>
    );
}

function ConfirmationPrompt({
    extractedData,
    onConfirm,
    onReset,
    isConfirming,
}: {
    extractedData: Record<string, unknown>;
    onConfirm: () => void | Promise<void>;
    onReset: () => void;
    isConfirming?: boolean;
}) {
    const showDetails = process.env.NEXT_PUBLIC_NODE_ENV === 'development';

    return (
        <div className="animate-in slide-in-from-bottom-2 fade-in duration-300 p-4 bg-primary/5 border border-primary/20 rounded-lg">
            <div className="flex items-center gap-2 mb-3">
                <CheckCircle2 className="w-5 h-5 text-primary" />
                <p className="font-medium text-foreground">Ready to proceed?</p>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
                I have all the information I need. Would you like me to start the process?
            </p>
            {showDetails && (
                <pre className="text-xs bg-muted p-2 rounded mb-4 overflow-x-auto">
                    {JSON.stringify(extractedData, null, 2)}
                </pre>
            )}
            <div className="flex items-center gap-2">
                <Button onClick={onConfirm} size="sm" disabled={isConfirming}>
                    {isConfirming ? 'Processing...' : 'Start Now'}
                </Button>
                <Button onClick={onReset} variant="outline" size="sm" disabled={isConfirming}>
                    Start Over
                </Button>
            </div>
        </div>
    );
}

type ChatInputAreaProps = {
    inputValue: string;
    setInputValue: (value: string) => void;
    handleSubmit: () => void;
    placeholder: string;
    isLoading: boolean;
    disabled: boolean;
};

function ChatInputArea({ inputValue, setInputValue, handleSubmit, placeholder, isLoading, disabled }: ChatInputAreaProps) {
    return (
        <AIInput
            variant="textarea"
            value={inputValue}
            onChange={setInputValue}
            onSubmit={handleSubmit}
            placeholder={placeholder}
            disabled={disabled}
            isLoading={isLoading}
            helperText="Press ⌘/Ctrl + Enter to send"
        />
    );
}

/** Renders a single chat message using the AI SDK UIMessage parts. */
function MessageBubble({ message, isLatest }: { message: UIMessage; isLatest: boolean }) {
    const isUser = message.role === 'user';

    const textContent = message.parts
        .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
        .map((p) => p.text)
        .join('');

    if (!textContent) return null;

    return (
        <div
            className={cn(
                'flex items-start gap-3',
                isUser && 'flex-row-reverse',
                isLatest && 'animate-in slide-in-from-bottom-2 fade-in duration-300',
            )}
        >
            {isUser ? (
                <Avatar className="w-8 h-8 shrink-0">
                    <AvatarImage src="https://ui.shadcn.com/avatars/shadcn.jpg" alt="User" />
                    <AvatarFallback className="bg-secondary text-secondary-foreground text-xs">
                        <User className="w-4 h-4 text-secondary-foreground" />
                    </AvatarFallback>
                </Avatar>
            ) : (
                <AppLogo />
            )}

            <div
                className={cn(
                    'max-w-[80%] px-4 py-3 rounded-2xl',
                    isUser
                        ? 'bg-primary text-primary-foreground rounded-tr-sm'
                        : 'bg-muted text-foreground rounded-tl-sm',
                )}
            >
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{textContent}</p>
            </div>
        </div>
    );
}
