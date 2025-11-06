'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { ChatState, MessageType, TMessageTemplates, TWhatsAppChat } from '@/app/messaging/types';
import { TWILIO_FUNCTIONS_URL } from '@/app/messaging/constants';

// Add your Twilio number here - this should be your purchased Twilio WhatsApp number
const TWILIO_WHATSAPP_NUMBER = '+16466814490';

export type UseWhatsAppPageReturn = {
    // State
    chats: TWhatsAppChat[];
    selectedId: string | null;
    draft: string;
    newChatPhone: string;
    messagesLoading: boolean;
    isAddChatOpen: boolean;
    templates: TMessageTemplates[];
    templatesLoading: boolean;
    currentChat: TWhatsAppChat | null;
    twilioWhatsAppNumber: string;
    sending: boolean;

    // Actions
    setSelectedId: (id: string | null) => void;
    setDraft: (draft: string) => void;
    setNewChatPhone: (phone: string) => void;
    setIsAddChatOpen: (isOpen: boolean) => void;
    setChats: React.Dispatch<React.SetStateAction<TWhatsAppChat[]>>;
    fetchMessages: () => Promise<void>;
    fetchTemplates: () => Promise<void>;
    sendMessage: () => Promise<void>;
    sendTemplate: (templateSid: string) => Promise<void>;
    handleKeyPress: (e: React.KeyboardEvent) => void;
};

export const useWhatsAppPage = (): UseWhatsAppPageReturn => {
    const [chats, setChats] = useState<TWhatsAppChat[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [draft, setDraft] = useState('');
    const [newChatPhone, setNewChatPhone] = useState('');
    const [messagesLoading, setMessagesLoading] = useState<boolean>(false);
    const [isAddChatOpen, setIsAddChatOpen] = useState(false);
    const [templates, setTemplates] = useState<TMessageTemplates[]>([]);
    const [templatesLoading, setTemplatesLoading] = useState(false);
    const [sending, setSending] = useState(false);

    const fetchMessages = useCallback(async () => {
        try {
            setMessagesLoading(true);
            const res = await axios.get<TWhatsAppChat[]>(`${TWILIO_FUNCTIONS_URL}/list-whatsapp`);
            const allChats = res.data || [];

            setChats(allChats);
        } catch (e) {
            console.error('❌ Failed to load messages:', e);
        } finally {
            setMessagesLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchMessages();
    }, [fetchMessages]);

    // Periodic refresh every 10 seconds when a chat is selected
    useEffect(() => {
        if (!selectedId) return;
        const interval = setInterval(fetchMessages, 10000);
        return () => clearInterval(interval);
    }, [selectedId, fetchMessages]);

    // fetch templates (available-templates)
    const fetchTemplates = useCallback(async () => {
        try {
            setTemplatesLoading(true);
            const res = await axios.get(`${TWILIO_FUNCTIONS_URL}/msg-templates`);
            setTemplates(res.data || []);
        } catch (e) {
            console.error('❌ Failed to load templates:', e);
        } finally {
            setTemplatesLoading(false);
        }
    }, []);

    const currentChat = useMemo(() => {
        return chats.find((c) => c.id === selectedId) ?? null;
    }, [chats, selectedId]);

    // send WhatsApp message (freeform) with optimistic UI
    const sendMessage = useCallback(async () => {
        if (!draft.trim() || !currentChat) return;

        const tempSid = `temp-${Date.now()}`;
        const optimisticMessage = {
            sid: tempSid,
            body: draft.trim(),
            from: `whatsapp:${TWILIO_WHATSAPP_NUMBER}`,
            to: `whatsapp:${currentChat.customerPhone}`,
            dateCreated: new Date().toISOString(),
            direction: MessageType.OUTBOUND_API,
            isOptimistic: true,
            status: 'sending' as const,
            isFromBusiness: true,
            isFromCustomer: false,
        };

        // Add optimistic message to UI immediately
        setChats((prev) =>
            prev.map((chat) =>
                chat.id === currentChat.id ? { ...chat, messages: [...chat.messages, optimisticMessage] } : chat
            )
        );

        const sentBody = draft.trim();
        setDraft('');
        setSending(true);

        try {
            const res = await axios.post(`${TWILIO_FUNCTIONS_URL}/send-whatsapp`, {
                to: currentChat.customerPhone,
                body: sentBody,
            });

            const sid = res.data.sid;
            // Update optimistic message with real SID and success status
            setChats((prev) =>
                prev.map((chat) =>
                    chat.id === currentChat.id
                        ? {
                              ...chat,
                              messages: chat.messages.map((m) =>
                                  m.sid === tempSid ? { ...m, sid, isOptimistic: false, status: 'sent' as const } : m
                              ),
                          }
                        : chat
                )
            );
            console.log('✅ Message sent successfully');
        } catch (e: any) {
            console.error('❌ Failed to send message:', e);
            // Mark message as failed
            setChats((prev) =>
                prev.map((chat) =>
                    chat.id === currentChat.id
                        ? {
                              ...chat,
                              messages: chat.messages.map((m) =>
                                  m.sid === tempSid ? { ...m, status: 'failed' as const } : m
                              ),
                          }
                        : chat
                )
            );
        } finally {
            setSending(false);
        }
    }, [draft, currentChat, setChats, setSending]);

    // send a template (used for new/expired chats)
    const sendTemplate = useCallback(
        async (templateSid: string) => {
            if (!currentChat) return;
            setTemplatesLoading(true);
            try {
                await axios.post(`${TWILIO_FUNCTIONS_URL}/send-whatsapp`, {
                    to: currentChat.customerPhone,
                    contentSid: templateSid,
                });
                console.log('✅ Template message sent');
                await fetchMessages(); // Wait for refresh
            } catch (e: any) {
                console.error('❌ Failed to send template:', e);
            } finally {
                setTemplatesLoading(false);
            }
        },
        [currentChat, fetchMessages],
    );

    // Handle enter key press for sending messages
    const handleKeyPress = useCallback(
        (e: React.KeyboardEvent) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        },
        [sendMessage],
    );

    return {
        // State
        chats,
        selectedId,
        draft,
        newChatPhone,
        messagesLoading,
        isAddChatOpen,
        templates,
        templatesLoading,
        currentChat,
        twilioWhatsAppNumber: TWILIO_WHATSAPP_NUMBER,
        sending,

        // Actions
        setSelectedId,
        setDraft,
        setNewChatPhone,
        setIsAddChatOpen,
        setChats,
        fetchMessages,
        fetchTemplates,
        sendMessage,
        sendTemplate,
        handleKeyPress,
    };
};
