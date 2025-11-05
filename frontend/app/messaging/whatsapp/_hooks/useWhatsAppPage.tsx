'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { ChatState, TMessageTemplates, TWhatsAppChat } from '@/app/messaging/types';
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

    const fetchMessages = useCallback(async () => {
        try {
            setMessagesLoading(true);
            const res = await axios.get<TWhatsAppChat[]>(`${TWILIO_FUNCTIONS_URL}/list-whatsapp`);
            const allChats = res.data || [];

            setChats(allChats);
        } catch (e) {
            console.error('fetchMessages error', e);
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
            console.error('fetch templates error', e);
        } finally {
            setTemplatesLoading(false);
        }
    }, []);

    const currentChat = useMemo(() => {
        return chats.find((c) => c.id === selectedId) ?? null;
    }, [chats, selectedId]);

    // send WhatsApp message (freeform)
    const sendMessage = useCallback(async () => {
        if (!draft.trim() || !currentChat) return;
        try {
            await axios.post(`${TWILIO_FUNCTIONS_URL}/send-whatsapp`, {
                to: currentChat.customerPhone,
                body: draft.trim(),
            });
            setDraft('');
            await fetchMessages(); // Wait for refresh
        } catch (e) {
            console.error('sendMessage error', e);
        }
    }, [draft, currentChat, fetchMessages]);

    // send a template (used for new/expired chats)
    const sendTemplate = useCallback(
        async (templateSid: string) => {
            if (!currentChat) return;
            try {
                await axios.post(`${TWILIO_FUNCTIONS_URL}/send-whatsapp`, {
                    to: currentChat.customerPhone,
                    contentSid: templateSid,
                });
                await fetchMessages(); // Wait for refresh
            } catch (e) {
                console.error('sendTemplate error', e);
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
