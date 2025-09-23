"use client";

import PageLayout from "@/components/common/PageLayout";
import {useCallback, useEffect, useMemo, useState} from "react";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {cn} from "@/lib/utils";
import axios from "axios";
import {Card, CardAction, CardContent, CardFooter, CardHeader, CardTitle} from "@/components/ui/card";
import {ChatState, MessageType, TMessageTemplates, TWhatsAppChat} from "@/app/messaging/types";
import {TWILIO_FUNCTIONS_URL} from "@/app/messaging/constants";
import {LoaderCircle, MessageCirclePlus, RefreshCw} from "lucide-react";
import {Popover, PopoverContent, PopoverTrigger} from "@/components/ui/popover";

// Add your Twilio number here - this should be your purchased Twilio WhatsApp number
const TWILIO_WHATSAPP_NUMBER = "+16466814490";

export default function WhatsAppPage() {
    const [chats, setChats] = useState<TWhatsAppChat[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [draft, setDraft] = useState("");
    const [newChatPhone, setNewChatPhone] = useState("");
    const [messagesLoading, setMessagesLoading] = useState<boolean>(false);
    const [isAddChatOpen, setIsAddChatOpen] = useState(false);
    const [templates, setTemplates] = useState<TMessageTemplates[]>([]);
    const [templatesLoading, setTemplatesLoading] = useState(false);

    const fetchMessages = useCallback(async () => {
        try {
            setMessagesLoading(true);
            const res = await axios.get<TWhatsAppChat[]>(`${TWILIO_FUNCTIONS_URL}/list-whatsapp`);
            const allChats = res.data || [];

            setChats(allChats);

        } catch (e) {
            console.error("fetchMessages error", e);
        } finally {
            setMessagesLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchMessages();
    }, [fetchMessages]);

    // fetch templates (available-templates)
    const fetchTemplates = useCallback(async () => {
        try {
            setTemplatesLoading(true);
            const res = await axios.get(`${TWILIO_FUNCTIONS_URL}/msg-templates`);
            setTemplates(res.data || []);
        } catch (e) {
            console.error("fetch templates error", e);
        } finally {
            setTemplatesLoading(false);
        }
    }, []);

    const currentChat = useMemo(() => {
        return chats.find((c) => c.id === selectedId) ?? null;
    }, [chats, selectedId]); // Fixed dependencies

    // send WhatsApp message (freeform)
    async function sendMessage() {
        if (!draft.trim() || !currentChat) return;
        try {
            await axios.post(`${TWILIO_FUNCTIONS_URL}/send-whatsapp`, {
                to: currentChat.customerPhone,
                body: draft.trim(),
            });
            setDraft("");
            await fetchMessages(); // Wait for refresh
        } catch (e) {
            console.error("sendMessage error", e);
        }
    }

    // send a template (used for new/expired chats)
    async function sendTemplate(templateSid: string) {
        if (!currentChat) return;
        try {
            await axios.post(`${TWILIO_FUNCTIONS_URL}/send-whatsapp`, {
                to: currentChat.customerPhone,
                contentSid: templateSid,
            });
            await fetchMessages(); // Wait for refresh
        } catch (e) {
            console.error("sendTemplate error", e);
        }
    }

    // Handle enter key press for sending messages
    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    };

    return (
        <PageLayout
            className='grid relative grid-cols-6 gap-3'
            title={
                <div className='flex w-full justify-between items-center '>
                    <p>WhatsApp - Business Number: {TWILIO_WHATSAPP_NUMBER}</p>
                    <p className='flex items-center justify-between gap-2'>
                        Refresh: <RefreshCw
                        className={cn('cursor-pointer', messagesLoading ? 'animate-spin' : '')}
                        onClick={() => fetchMessages()} size={16}/>
                    </p>
                </div>
            }
        >

            {messagesLoading &&
                <div className='absolute z-[5] h-full w-full flex items-center justify-center backdrop-blur-xs'>
                    <LoaderCircle className='animate-spin'/>
                </div>}

            <Card className='p-3 flex flex-col gap-3 col-span-2'>
                <CardHeader className='drop-shadow-md border-b'>
                    <CardTitle className='text-base'>Customer Chats</CardTitle>
                    <CardAction>
                        <Popover open={isAddChatOpen} onOpenChange={(v) => {
                            setIsAddChatOpen(v);
                            if (v) fetchTemplates();
                        }}>
                            <PopoverTrigger>
                                <MessageCirclePlus onClick={() => setIsAddChatOpen(true)}
                                                   className='cursor-pointer hover:text-green-500'/>
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
                                        setNewChatPhone("");
                                        setIsAddChatOpen(false);
                                    }}
                                >
                                    Add Chat
                                </Button>
                                <div className="text-xs text-muted-foreground">Available templates</div>
                                <div className="flex flex-col gap-2 max-h-40 overflow-auto">
                                    {templatesLoading && <div className="text-sm">Loading templates...</div>}
                                    {!templatesLoading && templates.length === 0 &&
                                        <div className="text-xs text-gray-500">No templates found</div>}
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
                <CardContent className='flex-1 space-y-3 overflow-auto'>
                    {chats.map((chat) => {
                        const lastMsg = chat.messages.slice(-1)[0]?.body || "No messages";
                        const messageCount = chat.messages.length;
                        return (
                            <Button
                                key={chat.id} // Added key prop
                                variant="ghost"
                                onClick={() => {
                                    setSelectedId(chat.id);
                                    // optionally fetch templates when selecting expired/new chat
                                    if (chat.state === ChatState.NEW || chat.state === ChatState.EXPIRED) {
                                        fetchTemplates();
                                    }
                                }}
                                className={cn(
                                    "flex h-fit w-full cursor-pointer flex-col items-start gap-1 text-left rounded-lg p-2",
                                    chat.id === selectedId
                                        ? "bg-primary text-primary-foreground"
                                        : "hover:bg-muted",
                                    (chat.messages.length === 0 || chat.state === ChatState.NEW) && "bg-amber-200"
                                )}
                            >
                                <div className="flex items-center justify-between w-full">
                                    <div className="flex items-center gap-2">
                                        <p className="font-medium">{chat.customerPhone}</p>
                                        {chat.state === ChatState.NEW &&
                                            <span className="text-xs px-2 py-0.5 bg-amber-300 rounded">New</span>}
                                        {chat.state === ChatState.EXPIRED &&
                                            <span className="text-xs px-2 py-0.5 bg-yellow-200 rounded">Expired</span>}
                                    </div>
                                    <span className="text-xs text-gray-500">({messageCount})</span>
                                </div>
                                <p className="text-xs truncate w-full">{lastMsg}</p>
                            </Button>
                        );
                    })}
                    {chats.length === 0 && !messagesLoading && (
                        <div className="text-center text-gray-500 py-8">
                            No customer chats found
                        </div>
                    )}
                </CardContent>
            </Card>

            <Card className='col-span-4 flex flex-col gap-3'>
                {!currentChat && <CardContent className='flex-1 flex items-center justify-center'>
                    <div className="text-center">
                        <p className="text-lg mb-2">No chat selected</p>
                        <p className="text-sm text-gray-500">Select a customer chat from the left panel</p>
                    </div>
                </CardContent>}

                {currentChat && (
                    <>
                        <CardHeader className='border-b drop-shadow-md'>
                            <CardTitle className="flex items-center justify-between">
                                <span>Chat with: {currentChat.customerPhone}</span>
                                <div className="flex items-center gap-2 text-sm text-gray-600">
                                    <span>{currentChat.messages.length} messages</span>
                                    <span className={cn(
                                        "px-2 py-1 rounded text-xs",
                                        currentChat.state === ChatState.ACTIVE && "bg-green-100 text-green-800",
                                        currentChat.state === ChatState.EXPIRED && "bg-yellow-100 text-yellow-800",
                                        currentChat.state === ChatState.NEW && "bg-blue-100 text-blue-800"
                                    )}>
                                        {currentChat.state}
                                    </span>
                                </div>
                            </CardTitle>
                        </CardHeader>

                        <CardContent className='flex-1 overflow-auto p-4'>
                            {currentChat.messages.length === 0 ? (
                                <div className="text-center text-gray-500 py-8">
                                    No messages yet. Start the conversation!
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {currentChat.messages.map((msg) => {
                                        const isOutbound = (msg.direction === MessageType.OUTBOUND_API || msg.direction === MessageType.OUTBOUND_REPLY);
                                        return (
                                            <div
                                                key={msg.sid}
                                                className={cn(
                                                    "flex",
                                                    isOutbound ? "justify-end" : "justify-start"
                                                )}
                                            >
                                                <div
                                                    className={cn(
                                                        "max-w-xs px-4 py-2 rounded-lg break-words",
                                                        isOutbound
                                                            ? "bg-green-500 text-white rounded-br-none"
                                                            : "bg-gray-200 text-gray-900 rounded-bl-none"
                                                    )}
                                                >
                                                    <div>{msg.body}</div>
                                                    <div className={cn(
                                                        "text-xs mt-1",
                                                        isOutbound ? "text-blue-100" : "text-gray-500"
                                                    )}>
                                                        {new Date(msg.dateCreated).toLocaleTimeString()}
                                                        {isOutbound && " • You"}
                                                        {!isOutbound && " • Customer"}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </CardContent>

                        <CardFooter className="border-t">
                            {currentChat && (
                                <>
                                    {(currentChat.state === ChatState.NEW || currentChat.state === ChatState.EXPIRED) ? (
                                        <div className="w-full flex flex-col gap-3">
                                            <div className="text-sm text-gray-600">
                                                This chat requires an approved template to start or restart the
                                                conversation. Choose one:
                                            </div>
                                            <div className="flex flex-wrap gap-2">
                                                {templatesLoading &&
                                                    <div className="text-sm">Loading templates...</div>}
                                                {!templatesLoading && templates.length === 0 &&
                                                    <div className="text-xs text-gray-500">No templates available</div>}
                                                {templates.map((t) => (
                                                    <Button
                                                        key={t.sid}
                                                        onClick={() => sendTemplate(t.sid)}
                                                        className="bg-green-600 hover:bg-green-700 text-white"
                                                    >
                                                        {t.friendlyName}
                                                    </Button>
                                                ))}
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="w-full flex flex-col gap-3">

                                            <div className="w-full flex flex-col gap-3">
                                                <div className="text-sm text-gray-600">
                                                    Send one of templated messages?
                                                </div>
                                                <div className="flex flex-wrap gap-2">
                                                    {templatesLoading &&
                                                        <div className="text-sm">Loading templates...</div>}
                                                    {!templatesLoading && templates.length === 0 &&
                                                        <div className="text-xs text-gray-500">No templates
                                                            available</div>}
                                                    {templates.map((t) => (
                                                        <Button
                                                            key={t.sid}
                                                            onClick={() => sendTemplate(t.sid)}
                                                            className="bg-green-600 hover:bg-green-700 text-white"
                                                        >
                                                            {t.friendlyName}
                                                        </Button>
                                                    ))}
                                                </div>
                                            </div>

                                            <Input
                                                placeholder="Type a message..."
                                                value={draft}
                                                onChange={(e) => setDraft(e.target.value)}
                                                onKeyDown={handleKeyPress}
                                                className="flex-1"
                                            />
                                            <Button
                                                onClick={sendMessage}
                                                disabled={!draft.trim()}
                                                className="bg-green-600 hover:bg-green-700"
                                            >
                                                Send
                                            </Button>
                                        </div>
                                    )}
                                </>
                            )}
                        </CardFooter>
                    </>
                )}
            </Card>
        </PageLayout>
    );
}