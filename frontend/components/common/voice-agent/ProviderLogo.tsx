import Image from 'next/image';
import { VoiceKeyProvider, type VoiceProvider } from '@aixellabs/backend/db/types';
import { numberProviderInfo } from '@/helpers/voice-number-providers';
import { VOICE_KEY_PROVIDERS } from '@/helpers/voice-stack';
import { cn } from '@/lib/utils';

type ProviderLogoProps = {
    /** A phone provider (Telnyx, Twilio, VoiceLink) or a model provider (Gemini, OpenAI, Deepgram…). */
    provider: VoiceProvider | VoiceKeyProvider;
    className?: string;
};

const isKeyProvider = (p: string): p is VoiceKeyProvider => (Object.values(VoiceKeyProvider) as string[]).includes(p);

/** A provider's own mark. Decorative: the provider's name is always written beside it. */
export function ProviderLogo({ provider, className }: ProviderLogoProps) {
    const model = isKeyProvider(provider) ? VOICE_KEY_PROVIDERS[provider] : null;
    return (
        <Image
            src={model?.logo ?? numberProviderInfo(provider as VoiceProvider).logo}
            alt=""
            width={20}
            height={20}
            className={cn('size-5 shrink-0 object-contain', model?.mono && 'dark:invert', className)}
            data-testid={`${model ? 'model' : 'number'}-provider-logo-${provider}`}
        />
    );
}
