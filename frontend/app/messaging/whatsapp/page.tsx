'use client';

import PageLayout from '@/components/common/PageLayout';
import { cn } from '@/lib/utils';
import { LoaderCircle, RefreshCw } from 'lucide-react';
import { PageProvider, usePage } from '@/contexts/PageStore';
import { useWhatsAppPage, type UseWhatsAppPageReturn } from './_hooks';
import { ChatList } from './_components/ChatList';
import { ChatWindow } from './_components/ChatWindow';

function WhatsAppPageContent() {
    const {
        chats,
        selectedId,
        draft,
        newChatPhone,
        messagesLoading,
        isAddChatOpen,
        templates,
        templatesLoading,
        currentChat,
        twilioWhatsAppNumber,
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
    } = usePage<UseWhatsAppPageReturn>();

    return (
        <PageLayout
            className="grid grid-cols-6 gap-3 h-full overflow-hidden"
            title={
                <div className="flex w-full justify-between items-center ">
                    <p>WhatsApp - Business Number: {twilioWhatsAppNumber}</p>
                    <p className="flex items-center justify-between gap-2">
                        Refresh:{' '}
                        <RefreshCw
                            className={cn('cursor-pointer', messagesLoading ? 'animate-spin' : '')}
                            onClick={() => fetchMessages()}
                            size={16}
                        />
                    </p>
                </div>
            }
        >
            {messagesLoading && (
                <div className="absolute z-5 h-full w-full flex items-center justify-center backdrop-blur-xs">
                    <LoaderCircle className="animate-spin" />
                </div>
            )}

            <ChatList
                chats={chats}
                selectedId={selectedId}
                newChatPhone={newChatPhone}
                isAddChatOpen={isAddChatOpen}
                templates={templates}
                templatesLoading={templatesLoading}
                messagesLoading={messagesLoading}
                setSelectedId={setSelectedId}
                setNewChatPhone={setNewChatPhone}
                setIsAddChatOpen={setIsAddChatOpen}
                setChats={setChats}
                fetchTemplates={fetchTemplates}
            />

            <ChatWindow
                currentChat={currentChat}
                draft={draft}
                templates={templates}
                templatesLoading={templatesLoading}
                setDraft={setDraft}
                sendMessage={sendMessage}
                sendTemplate={sendTemplate}
                handleKeyPress={handleKeyPress}
            />
        </PageLayout>
    );
}

export default function WhatsAppPage() {
    return (
        <PageProvider usePageHook={useWhatsAppPage}>
            <WhatsAppPageContent />
        </PageProvider>
    );
}
