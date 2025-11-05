'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChatState, TWhatsAppChat } from '@/app/messaging/types';
import { MessageCirclePlus } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

type ChatListProps = {
    chats: TWhatsAppChat[];
    selectedId: string | null;
    newChatPhone: string;
    isAddChatOpen: boolean;
    templates: Array<{ sid: string; friendlyName: string }>;
    templatesLoading: boolean;
    messagesLoading: boolean;
    setSelectedId: (id: string) => void;
    setNewChatPhone: (phone: string) => void;
    setIsAddChatOpen: (open: boolean) => void;
    setChats: React.Dispatch<React.SetStateAction<TWhatsAppChat[]>>;
    fetchTemplates: () => void;
};

export function ChatList({
    chats,
    selectedId,
    newChatPhone,
    isAddChatOpen,
    templates,
    templatesLoading,
    messagesLoading,
    setSelectedId,
    setNewChatPhone,
    setIsAddChatOpen,
    setChats,
    fetchTemplates,
}: ChatListProps) {
    return (
        <Card className="p-3 flex flex-col gap-3 col-span-2 h-full overflow-hidden">
            <CardHeader className="drop-shadow-md border-b shrink-0">
                <CardTitle className="text-base">Customer Chats</CardTitle>
                <CardAction>
                    <Popover
                        open={isAddChatOpen}
                        onOpenChange={(v) => {
                            setIsAddChatOpen(v);
                            if (v) fetchTemplates();
                        }}
                    >
                        <PopoverTrigger>
                            <MessageCirclePlus
                                onClick={() => setIsAddChatOpen(true)}
                                className="cursor-pointer hover:text-green-500"
                            />
                        </PopoverTrigger>
                        <PopoverContent className="w-64 p-3 space-y-2">
                            <Input
                                placeholder="Enter phone number (E.164)"
                                value={newChatPhone}
                                onChange={(e) => setNewChatPhone(e.target.value)}
                            />
                            <Button
                                className="w-full"
                                onClick={() => {
                                    const phone = newChatPhone.trim();
                                    if (!phone) return;

                                    const exists = chats.some((c) => c.customerPhone === phone);
                                    if (!exists) {
                                        const draftChat: TWhatsAppChat = {
                                            id: phone,
                                            customerPhone: phone,
                                            messages: [],
                                            state: ChatState.NEW,
                                        };
                                        setChats((prev) => [...prev, draftChat]);
                                    }
                                    setSelectedId(phone);
                                    setNewChatPhone('');
                                    setIsAddChatOpen(false);
                                }}
                            >
                                Add Chat
                            </Button>
                            <div className="text-xs text-muted-foreground">Available templates</div>
                            <div className="flex flex-col gap-2 max-h-40 overflow-auto">
                                {templatesLoading && <div className="text-sm">Loading templates...</div>}
                                {!templatesLoading && templates.length === 0 && (
                                    <div className="text-xs text-gray-500">No templates found</div>
                                )}
                                {templates.map((t) => (
                                    <div key={t.sid} className="text-sm p-2 rounded border">
                                        <div className="font-medium">{t.friendlyName}</div>
                                    </div>
                                ))}
                            </div>
                        </PopoverContent>
                    </Popover>
                </CardAction>
            </CardHeader>
            <CardContent className="flex-1 space-y-3 overflow-y-auto min-h-0">
                {chats.map((chat) => {
                    const lastMsg = chat.messages.slice(-1)[0]?.body || 'No messages';
                    const messageCount = chat.messages.length;
                    return (
                        <Button
                            key={chat.id}
                            variant="ghost"
                            onClick={() => {
                                setSelectedId(chat.id);
                                if (chat.state === ChatState.NEW || chat.state === ChatState.EXPIRED) {
                                    fetchTemplates();
                                }
                            }}
                            className={cn(
                                'flex h-fit w-full cursor-pointer flex-col items-start gap-1 text-left rounded-lg p-2',
                                chat.id === selectedId ? 'bg-primary text-primary-foreground' : 'hover:bg-muted',
                                (chat.messages.length === 0 || chat.state === ChatState.NEW) && 'bg-amber-200',
                            )}
                        >
                            <div className="flex items-center justify-between w-full">
                                <div className="flex items-center gap-2">
                                    <p className="font-medium">{chat.customerPhone}</p>
                                    {chat.state === ChatState.NEW && (
                                        <span className="text-xs px-2 py-0.5 bg-amber-300 rounded">New</span>
                                    )}
                                    {chat.state === ChatState.EXPIRED && (
                                        <span className="text-xs px-2 py-0.5 bg-yellow-200 rounded">Expired</span>
                                    )}
                                </div>
                                <span className="text-xs text-gray-500">({messageCount})</span>
                            </div>
                            <p className="text-xs truncate w-full">{lastMsg}</p>
                        </Button>
                    );
                })}
                {chats.length === 0 && !messagesLoading && (
                    <div className="text-center text-gray-500 py-8">No customer chats found</div>
                )}
            </CardContent>
        </Card>
    );
}
