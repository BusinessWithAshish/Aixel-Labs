'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { ChatState, MessageType, TWhatsAppChat } from '@/app/messaging/types';

type ChatWindowProps = {
    currentChat: TWhatsAppChat | null;
    draft: string;
    templates: Array<{ sid: string; friendlyName: string }>;
    templatesLoading: boolean;
    setDraft: (draft: string) => void;
    sendMessage: () => void;
    sendTemplate: (sid: string) => void;
    handleKeyPress: (e: React.KeyboardEvent<HTMLInputElement>) => void;
};

export function ChatWindow({
    currentChat,
    draft,
    templates,
    templatesLoading,
    setDraft,
    sendMessage,
    sendTemplate,
    handleKeyPress,
}: ChatWindowProps) {
    if (!currentChat) {
        return (
            <Card className="col-span-4 flex flex-col gap-3 h-full">
                <CardContent className="flex-1 flex items-center justify-center">
                    <div className="text-center">
                        <p className="text-lg mb-2">No chat selected</p>
                        <p className="text-sm text-gray-500">Select a customer chat from the left panel</p>
                    </div>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className="col-span-4 flex flex-col gap-3 h-full overflow-hidden">
            <CardHeader className="border-b drop-shadow-md flex-shrink-0">
                <CardTitle className="flex items-center justify-between">
                    <span>Chat with: {currentChat.customerPhone}</span>
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                        <span>{currentChat.messages.length} messages</span>
                        <span
                            className={cn(
                                'px-2 py-1 rounded text-xs',
                                currentChat.state === ChatState.ACTIVE && 'bg-green-100 text-green-800',
                                currentChat.state === ChatState.EXPIRED && 'bg-yellow-100 text-yellow-800',
                                currentChat.state === ChatState.NEW && 'bg-blue-100 text-blue-800',
                            )}
                        >
                            {currentChat.state}
                        </span>
                    </div>
                </CardTitle>
            </CardHeader>

            <CardContent className="flex-1 overflow-y-auto p-4 min-h-0">
                {currentChat.messages.length === 0 ? (
                    <div className="text-center text-gray-500 py-8">No messages yet. Start the conversation!</div>
                ) : (
                    <div className="space-y-3">
                        {currentChat.messages.map((msg) => {
                            const isOutbound =
                                msg.direction === MessageType.OUTBOUND_API ||
                                msg.direction === MessageType.OUTBOUND_REPLY;
                            return (
                                <div
                                    key={msg.sid}
                                    className={cn('flex', isOutbound ? 'justify-end' : 'justify-start')}
                                >
                                    <div
                                        className={cn(
                                            'max-w-xs px-4 py-2 rounded-lg wrap-break-word',
                                            isOutbound
                                                ? 'bg-green-500 text-white rounded-br-none'
                                                : 'bg-gray-200 text-gray-900 rounded-bl-none',
                                        )}
                                    >
                                        <div>{msg.body}</div>
                                        <div
                                            className={cn(
                                                'text-xs mt-1',
                                                isOutbound ? 'text-blue-100' : 'text-gray-500',
                                            )}
                                        >
                                            {new Date(msg.dateCreated).toLocaleTimeString()}
                                            {isOutbound && ' • You'}
                                            {!isOutbound && ' • Customer'}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </CardContent>

            <CardFooter className="border-t flex-shrink-0">
                {currentChat.state === ChatState.NEW || currentChat.state === ChatState.EXPIRED ? (
                    <div className="w-full flex flex-col gap-3">
                        <div className="text-sm text-gray-600">
                            This chat requires an approved template to start or restart the conversation. Choose one:
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {templatesLoading && <div className="text-sm">Loading templates...</div>}
                            {!templatesLoading && templates.length === 0 && (
                                <div className="text-xs text-gray-500">No templates available</div>
                            )}
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
                            <div className="text-sm text-gray-600">Send one of templated messages?</div>
                            <div className="flex flex-wrap gap-2">
                                {templatesLoading && <div className="text-sm">Loading templates...</div>}
                                {!templatesLoading && templates.length === 0 && (
                                    <div className="text-xs text-gray-500">No templates available</div>
                                )}
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
            </CardFooter>
        </Card>
    );
}
