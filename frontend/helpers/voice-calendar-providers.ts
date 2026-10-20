import { VoiceCalendarProvider } from '@aixellabs/backend/db/types';

/** What the UI says about each booking app an agent can book into (client-safe). */
export type VoiceCalendarProviderInfo = {
    provider: VoiceCalendarProvider;
    label: string;
    /** The app's own mark, under public/brand-logos. */
    logo: string;
    /** What one bookable target is called in that app. */
    targetNoun: 'Calendar' | 'Event type';
    /** One line under the connect button. */
    blurb: string;
};

export const VOICE_CALENDAR_PROVIDERS: readonly VoiceCalendarProviderInfo[] = [
    {
        provider: VoiceCalendarProvider.GOOGLE_CALENDAR,
        label: 'Google Calendar',
        logo: '/brand-logos/google-calendar.svg',
        targetNoun: 'Calendar',
        blurb: 'Checks your free/busy, adds a Google Meet link.',
    },
    {
        provider: VoiceCalendarProvider.OUTLOOK,
        label: 'Outlook',
        logo: '/brand-logos/outlook.svg',
        targetNoun: 'Calendar',
        blurb: 'Microsoft 365 or Outlook.com; Teams link on work accounts.',
    },
    {
        provider: VoiceCalendarProvider.CAL_COM,
        label: 'Cal.com',
        logo: '/brand-logos/cal-com.svg',
        targetNoun: 'Event type',
        blurb: 'Books your event type; callers give an email.',
    },
    {
        provider: VoiceCalendarProvider.CALENDLY,
        label: 'Calendly',
        logo: '/brand-logos/calendly.svg',
        targetNoun: 'Event type',
        blurb: 'Needs a paid Calendly plan to book; callers give an email.',
    },
];

export function voiceCalendarProviderInfo(provider: VoiceCalendarProvider): VoiceCalendarProviderInfo {
    return VOICE_CALENDAR_PROVIDERS.find((p) => p.provider === provider) ?? VOICE_CALENDAR_PROVIDERS[0];
}

export function voiceCalendarProviderLabel(provider: VoiceCalendarProvider): string {
    return voiceCalendarProviderInfo(provider).label;
}

/**
 * What a new connection books into unless the owner picks: the main calendar (Google, Outlook),
 * an event type (Cal.com, Calendly) only when there is just one; else null, for the owner to choose.
 */
export function defaultBookingTarget<T extends { primary: boolean }>(
    provider: VoiceCalendarProvider,
    options: T[],
): T | null {
    if (voiceCalendarProviderInfo(provider).targetNoun === 'Calendar')
        return options.find((o) => o.primary) ?? options[0] ?? null;
    return options.length === 1 ? options[0] : null;
}
