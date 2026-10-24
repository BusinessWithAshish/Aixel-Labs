import Link from 'next/link';
import { KeyRound } from 'lucide-react';
import { VoiceKeyStatus, type VoiceGeminiKeyView } from '@aixellabs/backend/db/types';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import { GEMINI_KEY_URL } from '@/helpers/voice-routes';
import { GEMINI_ALWAYS } from '@/helpers/voice-stack';

type GeminiKeyNoticeProps = {
    view: VoiceGeminiKeyView;
    /** What the key is needed for, e.g. "talk to this agent". */
    action: string;
    className?: string;
};

/**
 * Says why something that runs a call is blocked (no Gemini key, which every call needs) or may fail (Google
 * refused it),
 * with a link to the key in voice settings. Renders nothing while the key is fine.
 */
export function GeminiKeyNotice({ view, action, className }: GeminiKeyNoticeProps) {
    if (view.set && view.status === VoiceKeyStatus.OK) return null;
    return (
        <Alert variant={view.set ? 'destructive' : 'default'} className={cn(className)} data-testid="gemini-key-notice">
            <KeyRound className="size-4" aria-hidden />
            <AlertDescription>
                <p>
                    {view.set
                        ? `Google refused your Gemini API key${view.statusMessage ? `: ${view.statusMessage}` : '.'}`
                        : `Your agents need a Gemini API key to ${action}: ${GEMINI_ALWAYS}.`}{' '}
                    <Link className="text-primary font-medium underline-offset-4 hover:underline" href={GEMINI_KEY_URL}>
                        {view.set ? 'Check it in Settings' : 'Add it in Settings'}
                    </Link>
                </p>
            </AlertDescription>
        </Alert>
    );
}
