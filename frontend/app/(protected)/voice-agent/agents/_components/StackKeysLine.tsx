import Link from 'next/link';
import { KeyRound } from 'lucide-react';
import {
    VoiceKeyProvider,
    VoiceKeyStatus,
    voiceKeyFor,
    type VoiceProviderKey,
    type VoiceStack,
} from '@aixellabs/backend/db/types';
import { cn } from '@/lib/utils';
import { GEMINI_KEY_URL } from '@/helpers/voice-routes';
import { providersLabel, stackProviders, VOICE_KEY_PROVIDERS } from '@/helpers/voice-stack';

type StackKeysLineProps = {
    stack: VoiceStack<string>;
    keys: VoiceProviderKey[];
    /** Links to the keys in voice settings. */
    link?: boolean;
    className?: string;
};

/** One line naming the keys an agent's stack runs on (one per provider), or the ones it still needs. */
export function StackKeysLine({ stack, keys, link = false, className }: StackKeysLineProps) {
    const used = stackProviders(stack).map(({ provider, keyId }) => ({
        provider,
        key: voiceKeyFor(keys, { provider, keyId }),
    }));
    const missing = used.filter((u) => !u.key).map((u) => u.provider);
    const refused = used.filter((u) => u.key && u.key.status !== VoiceKeyStatus.OK).map((u) => u.provider);
    const gemini = used.find((u) => u.provider === VoiceKeyProvider.GEMINI)?.key;
    const tier = gemini ? ` · ${used.length > 1 ? 'Gemini ' : ''}${gemini.tier ?? 'paid'} tier` : '';
    const text = missing.length
        ? `No ${providersLabel(missing)} API key yet: it cannot take or make calls`
        : `Runs on your ${used.map((u) => `${VOICE_KEY_PROVIDERS[u.provider].name} key ending ${u.key?.last4}`).join(' + ')}${
              refused.length ? `, which ${providersLabel(refused)} refused: calls fail until you fix it` : tier
          }`;
    const ok = !missing.length && !refused.length;

    return (
        <span
            className={cn(
                'inline-flex items-center gap-1.5 text-xs',
                ok ? 'text-muted-foreground' : 'text-amber-700 dark:text-amber-400',
                className,
            )}
            data-testid="stack-keys-line"
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
