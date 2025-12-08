'use client';

import PageLayout from '@/components/common/PageLayout';
import { withPageHandler } from '@/components/hocs/with-page-handler';
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
        sending,
        setSelectedId,
        setDraft,
        setNewChatPhone,
        setIsAddChatOpen,
        setChats,
        fetchTemplates,
        sendMessage,
        sendTemplate,
        handleKeyPress,
    } = usePage<UseWhatsAppPageReturn>();

    return (
        <PageLayout
            className="grid grid-cols-6 gap-3 h-full overflow-hidden"
            title={`WhatsApp - Business Number: ${twilioWhatsAppNumber}`}
        >
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
                sending={sending}
                setDraft={setDraft}
                sendMessage={sendMessage}
                sendTemplate={sendTemplate}
                handleKeyPress={handleKeyPress}
            />
        </PageLayout>
    );
}

function WhatsAppPage() {
    return (
        <PageProvider usePageHook={useWhatsAppPage}>
            <WhatsAppPageContent />
        </PageProvider>
    );
}

export default withPageHandler(WhatsAppPage);
