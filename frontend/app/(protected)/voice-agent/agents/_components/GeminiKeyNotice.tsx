import Link from 'next/link';
import { KeyRound } from 'lucide-react';
import { VoiceGeminiKeyStatus, type VoiceGeminiKeyView } from '@aixellabs/backend/db/types';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import { GEMINI_KEY_URL } from '../_utils/voice-agent-routes';

type GeminiKeyNoticeProps = {
    view: VoiceGeminiKeyView;
    /** What the key is needed for, e.g. "talk to this agent". */
    action: string;
    className?: string;
};

/**
 * Says why something that runs a call is blocked (no key) or may fail (Google refused the key),
 * with a link to the key card. Renders nothing while the key is fine.
 */
export function GeminiKeyNotice({ view, action, className }: GeminiKeyNoticeProps) {
    if (view.set && view.status === VoiceGeminiKeyStatus.OK) return null;
    return (
        <Alert variant={view.set ? 'destructive' : 'default'} className={cn(className)} data-testid="gemini-key-notice">
            <KeyRound className="size-4" aria-hidden />
            <AlertDescription>
                <p>
                    {view.set
                        ? `Google refused your Gemini API key${view.statusMessage ? `: ${view.statusMessage}` : '.'}`
                        : `Add your Gemini API key to ${action}. Your agents run on your own Google Gemini key.`}{' '}
                    <Link className="text-primary font-medium underline-offset-4 hover:underline" href={GEMINI_KEY_URL}>
                        {view.set ? 'Check your key' : 'Add your key'}
                    </Link>
                </p>
            </AlertDescription>
        </Alert>
    );
}
