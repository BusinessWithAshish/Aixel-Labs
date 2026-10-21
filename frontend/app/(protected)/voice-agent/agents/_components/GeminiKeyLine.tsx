import Link from 'next/link';
import { KeyRound } from 'lucide-react';
import { VoiceGeminiKeyStatus, type VoiceGeminiKeyView } from '@aixellabs/backend/db/types';
import { cn } from '@/lib/utils';
import { GEMINI_KEY_URL } from '@/helpers/voice-routes';

type GeminiKeyLineProps = {
    view: VoiceGeminiKeyView;
    /** Links to the key card; off inside something that is already a link (the agent cards). */
    link?: boolean;
    className?: string;
};

/** One line saying which Gemini key an agent runs on, or why it cannot run. Every agent uses the owner's one key. */
export function GeminiKeyLine({ view, link = false, className }: GeminiKeyLineProps) {
    const ok = view.set && view.status === VoiceGeminiKeyStatus.OK;
    const text = !view.set
        ? 'No Gemini key yet: it cannot take or make calls'
        : ok
          ? `Runs on your Gemini key ending ${view.last4} · ${view.tier ?? 'paid'} tier`
          : `Runs on your Gemini key ending ${view.last4}, which Google refused: calls fail until you fix it`;

    return (
        <span
            className={cn(
                'inline-flex items-center gap-1.5 text-xs',
                ok ? 'text-muted-foreground' : 'text-amber-700 dark:text-amber-400',
                className,
            )}
            data-testid="gemini-key-line"
        >
            <KeyRound className="size-3.5 shrink-0" aria-hidden />
            {link ? (
                <Link href={GEMINI_KEY_URL} className="underline-offset-4 hover:underline">
                    {text}
                </Link>
            ) : (
                text
            )}
        </span>
    );
}
