import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { User } from 'lucide-react';
import type { UIMessage } from 'ai';
import { AppLogo } from '../AppLogo';

export type MessageBubbleProps = {
    message: UIMessage;
    isLatest: boolean;
};

export function MessageBubble({ message, isLatest }: MessageBubbleProps) {
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
