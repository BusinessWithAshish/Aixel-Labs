import Image from 'next/image';
import type { VoiceProvider } from '@aixellabs/backend/db/types';
import { numberProviderInfo } from '@/helpers/voice-number-providers';
import { cn } from '@/lib/utils';

type NumberProviderLogoProps = {
    provider: VoiceProvider;
    className?: string;
};

/** A phone provider's own mark. Decorative: the provider's name is always written beside it. */
export function NumberProviderLogo({ provider, className }: NumberProviderLogoProps) {
    return (
        <Image
            src={numberProviderInfo(provider).logo}
            alt=""
            width={20}
            height={20}
            className={cn('size-5 shrink-0 object-contain', className)}
            data-testid={`number-provider-logo-${provider}`}
        />
    );
}
