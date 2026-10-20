import Image from 'next/image';
import type { VoiceCalendarProvider } from '@aixellabs/backend/db/types';
import { voiceCalendarProviderInfo } from '@/helpers/voice-calendar-providers';
import { cn } from '@/lib/utils';

type CalendarProviderLogoProps = {
    provider: VoiceCalendarProvider;
    className?: string;
};

/** A booking app's own mark. Decorative: the app's name is always written beside it. */
export function CalendarProviderLogo({ provider, className }: CalendarProviderLogoProps) {
    return (
        <Image
            src={voiceCalendarProviderInfo(provider).logo}
            alt=""
            width={20}
            height={20}
            className={cn('size-5 shrink-0 object-contain', className)}
            data-testid={`provider-logo-${provider}`}
        />
    );
}
