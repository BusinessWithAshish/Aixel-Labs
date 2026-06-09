import { Button } from '@/components/ui/button';
import { NL_CHAT_MAX_TURNS } from '@/hooks/use-nl-chat/constants';
import { AlertCircle, MessageSquareWarning } from 'lucide-react';

export type LimitReachedBannerProps = {
    onReset: () => void;
};

export function LimitReachedBanner({ onReset }: LimitReachedBannerProps) {
    return (
        <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg animate-in fade-in duration-300">
            <div className="flex items-center gap-2 mb-2">
                <AlertCircle className="w-4 h-4 text-destructive" />
                <p className="text-sm font-medium text-destructive">Conversation limit reached</p>
            </div>
            <p className="text-sm text-destructive/80 mb-3">
                This conversation has reached the maximum of {NL_CHAT_MAX_TURNS} turns. Please start a new chat to continue.
            </p>
            <Button variant="outline" size="sm" onClick={onReset}>
                Start New Chat
            </Button>
        </div>
    );
}

export type NearLimitWarningProps = {
    remaining: number;
};

export function NearLimitWarning({ remaining }: NearLimitWarningProps) {
    return (
        <div className="px-3 py-2 bg-amber-500/10 border border-amber-500/20 rounded-lg animate-in fade-in duration-300 flex items-center gap-2">
            <MessageSquareWarning className="w-4 h-4 text-amber-600 shrink-0" />
            <p className="text-xs text-amber-700 dark:text-amber-400">
                {remaining} turn{remaining !== 1 ? 's' : ''} left — confirm your search or start over soon.
            </p>
        </div>
    );
}
