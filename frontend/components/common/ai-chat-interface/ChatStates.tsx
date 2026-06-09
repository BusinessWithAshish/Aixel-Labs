import { Button } from '@/components/ui/button';
import { CheckCircle2, AlertCircle, MessageSquareIcon, Sparkles } from 'lucide-react';
import { ShimmeringText } from '@/components/ui/shimmering-text';
import { AppLogo } from '../AppLogo';

export type EmptyStateProps = {
    assistantName: string;
    message: string;
};

export function EmptyState({ assistantName, message }: EmptyStateProps) {
    return (
        <div className="flex flex-col items-center justify-center h-full min-h-[300px] text-center animate-in fade-in duration-500">
            <AppLogo />
            <h4 className="font-medium text-foreground mt-2">{assistantName}</h4>
            <p className="text-sm text-muted-foreground mt-1 max-w-xs">{message}</p>
        </div>
    );
}

export function ChatHistorySidebarEmptyState() {
    return (
        <div className="flex h-full flex-col items-center justify-center text-center px-3 gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full text-muted-foreground">
                <MessageSquareIcon className="h-5 w-5" />
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
                Conversations you save or your current thread will show up here.
            </p>
        </div>
    );
}

export function LoadingIndicator() {
    return (
        <div className="flex items-center gap-3 animate-in slide-in-from-bottom-2 fade-in duration-300">
            <AppLogo />
            <ShimmeringText text="Thinking..." className="text-sm" duration={0.6} repeatDelay={1} />
        </div>
    );
}

export type ErrorDisplayProps = {
    error: Error;
    onRetry: () => void;
};

export function ErrorDisplay({ error, onRetry }: ErrorDisplayProps) {
    return (
        <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg animate-in fade-in duration-300">
            <div className="flex items-center gap-2 mb-2">
                <AlertCircle className="w-4 h-4 text-destructive" />
                <p className="text-sm font-medium text-destructive">Something went wrong</p>
            </div>
            <p className="text-sm text-destructive/80 mb-3">{error.message}</p>
            <Button variant="outline" size="sm" onClick={onRetry}>
                Start Over
            </Button>
        </div>
    );
}

export type SubmittedSessionBannerProps = {
    onReset: () => void;
};

export function SubmittedSessionBanner({ onReset }: SubmittedSessionBannerProps) {
    return (
        <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg animate-in fade-in duration-300">
            <div className="flex items-center gap-2 mb-2">
                <Sparkles className="w-4 h-4 text-primary shrink-0" />
                <p className="text-sm font-medium text-foreground">Action already initiated</p>
            </div>
            <p className="text-sm text-muted-foreground mb-3">
                You&apos;ve already used this chat session to request an action. Sending more messages
                here would waste your AI tokens without any benefit. Please confirm the request
                above, or start a fresh chat to make a different one.
            </p>
            <Button variant="outline" size="sm" onClick={onReset}>
                Start New Chat
            </Button>
        </div>
    );
}

export type ConfirmationPromptProps = {
    extractedData: Record<string, unknown>;
    onConfirm: () => void | Promise<void>;
    onReset: () => void;
    isConfirming?: boolean;
};

export function ConfirmationPrompt({
    extractedData,
    onConfirm,
    onReset,
    isConfirming,
}: ConfirmationPromptProps) {
    const showDetails = process.env.NEXT_PUBLIC_NODE_ENV === 'development';

    return (
        <div className="animate-in slide-in-from-bottom-2 fade-in duration-300 p-4 bg-primary/5 border border-primary/20 rounded-lg">
            <div className="flex items-center gap-2 mb-3">
                <CheckCircle2 className="w-5 h-5 text-primary" />
                <p className="font-medium text-foreground">Ready to proceed?</p>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
                I have all the information I need. Would you like me to start the process?
            </p>
            {showDetails && (
                <pre className="text-xs bg-muted p-2 rounded mb-4 overflow-x-auto">
                    {JSON.stringify(extractedData, null, 2)}
                </pre>
            )}
            <div className="flex items-center gap-2">
                <Button onClick={onConfirm} size="sm" disabled={isConfirming}>
                    {isConfirming ? 'Processing...' : 'Start Now'}
                </Button>
                <Button onClick={onReset} variant="outline" size="sm" disabled={isConfirming}>
                    Start Over
                </Button>
            </div>
        </div>
    );
}
