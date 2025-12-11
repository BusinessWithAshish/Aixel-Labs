'use client';

import type React from 'react';
import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { Send, User } from 'lucide-react';
import { ShimmeringText } from '../ui/shimmering-text';
import Image from 'next/image';
import {CommonLoader} from "@/components/common/CommonLoader";
type Message = {
    id: string;
    role: 'user' | 'assistant';
    content: string;
};

type ChatInterfaceProps = {
    assistantName?: string;
    assistantDescription?: string;
    placeholder?: string;
    className?: string;
};

const dummyResponses = [
    'I found 15 businesses matching your search criteria in the area. Would you like me to extract their contact details?',
    "The scraping process is complete. I've extracted addresses, phone numbers, and ratings for all locations.",
    "I can help you gather data from Google Maps. Just tell me the location and business type you're looking for.",
    "Processing your request... I've identified 23 potential leads with verified contact information.",
    "The data export is ready. I've formatted everything in a clean spreadsheet format for you.",
];
const AixelLabsBotIcon = () => {
    return (
        <Image
            src="/aixellabs.svg"
            alt="Aixel Labs Bot Icon"
            width={32}
            height={32}
            className="border border-ring rounded-full p-1 bg-background text-foreground shrink-0"
            priority={true}
        />
    );
};

export function ChatInterface(props: ChatInterfaceProps) {
    const {
        assistantName = 'Google Maps Scraper',
        assistantDescription = 'Extract business data efficiently',
        placeholder = 'Type your message...',
        className,
    } = props;
    const [messages, setMessages] = useState<Message[]>([]);
    const [inputValue, setInputValue] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    // Auto-scroll to bottom when new messages arrive
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages]);

    // Auto-resize textarea
    useEffect(() => {
        if (inputRef.current) {
            inputRef.current.style.height = 'auto';
            inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 120)}px`;
        }
    }, [inputValue]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!inputValue.trim() || isLoading) return;

        const userMessage: Message = {
            id: Date.now().toString(),
            role: 'user',
            content: inputValue.trim(),
        };

        setMessages((prev) => [...prev, userMessage]);
        setInputValue('');
        setIsLoading(true);

        if (inputRef.current) {
            inputRef.current.style.height = 'auto';
        }

        // Simulate response delay
        await new Promise((resolve) => setTimeout(resolve, 4500));

        const randomResponse = dummyResponses[Math.floor(Math.random() * dummyResponses.length)];
        const assistantMessage: Message = {
            id: (Date.now() + 1).toString(),
            role: 'assistant',
            content: randomResponse,
        };

        setMessages((prev) => [...prev, assistantMessage]);
        setIsLoading(false);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit(e);
        }
    };

    return (
        <Card className={cn('flex flex-col h-full w-full border-border bg-card', className)}>
            <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-muted/30">
                <AixelLabsBotIcon />
                <h3 className="font-semibold text-foreground">{assistantName}</h3>
            </div>

            {/* Messages Area */}
            <ScrollArea ref={scrollRef} className="flex-1 p-4">
                <div className="space-y-4">
                    {messages.length === 0 && (
                        <div className="flex flex-col items-center justify-center h-full min-h-[300px] text-center animate-in fade-in duration-500">
                            <AixelLabsBotIcon />
                            <h4 className="font-medium text-foreground">{assistantName}</h4>
                            <p className="text-sm text-muted-foreground mt-1 max-w-xs">
                                Send a message to start extracting data from Google Maps
                            </p>
                        </div>
                    )}

                    {messages.map((message, index) => (
                        <ChatMessage
                            key={message.id}
                            role={message.role}
                            content={message.content}
                            isLatest={index === messages.length - 1}
                        />
                    ))}

                    {isLoading && (
                        <div className="flex items-center gap-3 animate-in slide-in-from-bottom-2 fade-in duration-300">
                            <AixelLabsBotIcon />
                            <ShimmeringText text="Processing..." className="text-sm" duration={0.6} repeatDelay={1} />
                        </div>
                    )}
                </div>
            </ScrollArea>

            {/* Input Area */}
            <form onSubmit={handleSubmit} className="p-4 border-t border-border bg-muted/20">
                <div className="flex items-end gap-2">
                    <div className="flex-1 relative">
                        <Textarea
                            ref={inputRef}
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder={placeholder}
                            disabled={isLoading}
                            rows={1}
                        />
                    </div>
                    <Button
                        type="submit"
                        size="icon"
                        disabled={!inputValue.trim() || isLoading}
                    >
                        {isLoading ? <CommonLoader size='sm' classNames={{  icon: 'border-white' }} /> : <Send className="w-5 h-5" />}
                    </Button>
                </div>
                <p className="text-xs text-muted-foreground text-center mt-2">
                    Press Enter to send, Shift+Enter for new line
                </p>
            </form>
        </Card>
    );
}

type ChatMessageProps = {
    role: 'user' | 'assistant';
    content: string;
    isLatest: boolean;
};

function ChatMessage({ role, content, isLatest }: ChatMessageProps) {
    const isUser = role === 'user';

    return (
        <div
            className={cn(
                'flex items-start gap-3',
                isUser && 'flex-row-reverse',
                isLatest && 'animate-in slide-in-from-bottom-2 fade-in duration-300',
            )}
        >
            {/* Avatar */}
            {isUser ? (
                <Avatar className="w-8 h-8 shrink-0">
                    <AvatarImage src="https://ui.shadcn.com/avatars/shadcn.jpg" alt="User" />
                    <AvatarFallback className="bg-secondary text-secondary-foreground text-xs">
                        <User className="w-4 h-4 text-secondary-foreground" />
                    </AvatarFallback>
                </Avatar>
            ) : (
                <AixelLabsBotIcon />
            )}

            {/* Message Bubble */}
            <div
                className={cn(
                    'max-w-[80%] px-4 py-3 rounded-2xl',
                    isUser ? 'bg-primary text-primary-foreground rounded-tr-sm' : 'bg-muted text-foreground rounded-tl-sm',
                )}
            >
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{content}</p>
            </div>
        </div>
    );
}
