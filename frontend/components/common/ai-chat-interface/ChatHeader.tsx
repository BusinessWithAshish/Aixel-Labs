import { Button } from '@/components/ui/button';
import { CardAction, CardHeader, CardTitle } from '@/components/ui/card';
import { SquarePen, SidebarIcon } from 'lucide-react';
import { AppLogo } from '../AppLogo';

export type ChatHeaderProps = {
    assistantName: string;
    onReset: () => void;
    onOpenSidebar: () => void;
};

export function ChatHeader({ assistantName, onReset, onOpenSidebar }: ChatHeaderProps) {
    return (
        <CardHeader>
            <CardTitle className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                    <Button variant="ghost" size="icon" title="Chat history" onClick={onOpenSidebar}>
                        <SidebarIcon className="w-4 h-4" />
                    </Button>
                    <AppLogo />
                </div>
                <div className="flex-1">
                    <h3 className="font-semibold text-foreground">{assistantName}</h3>
                </div>
            </CardTitle>
            <CardAction>
                <Button variant="outline" size="sm" onClick={onReset} title="Start a new chat session">
                    <SquarePen className="w-3.5 h-3.5" />
                    New Chat
                </Button>
            </CardAction>
        </CardHeader>
    );
}
