import {
    VOICE_BOOKING_LIMITS,
    VOICE_TIME_PATTERN,
    type VoiceAgentBookingTool,
    type VoiceBookingDestination,
    type VoiceBookingHours,
    type VoiceWeekday,
} from '@aixellabs/backend/db/types';
import { DEFAULT_VOICE_BOOKING_HOURS, defaultVoiceBookingTool } from '@/helpers/voice-agent-defaults';
import { voiceCalendarProviderInfo } from '@/helpers/voice-calendar-providers';
import { FALLBACK_TIMEZONE, minutesOf, VOICE_WEEKDAY_OPTIONS } from '@/helpers/voice-time';

/** One day in the editor. A closed day keeps its times, so switching it back on restores them. */
export type BookingDayDraft = { open: boolean; from: string; to: string };

/** The booking settings as the editor holds them (days ahead stays text while it is typed). */
export type BookingDraft = {
    enabled: boolean;
    timezone: string;
    slotMinutes: number;
    maxDaysAhead: string;
    days: Record<VoiceWeekday, BookingDayDraft>;
    /** Null = the built-in calendar. */
    destination: VoiceBookingDestination | null;
};

export function bookingToDraft(booking: VoiceAgentBookingTool | null, timezone = FALLBACK_TIMEZONE): BookingDraft {
    const source = booking ?? defaultVoiceBookingTool(timezone);
    const days = Object.fromEntries(
        VOICE_WEEKDAY_OPTIONS.map(({ key }) => {
            const hours = source.hours[key];
            const fallback = DEFAULT_VOICE_BOOKING_HOURS.mon ?? { open: '09:00', close: '17:00' };
            return [key, { open: !!hours, from: hours?.open ?? fallback.open, to: hours?.close ?? fallback.close }];
        }),
    ) as Record<VoiceWeekday, BookingDayDraft>;
    return {
        enabled: source.enabled,
        timezone: source.timezone,
        slotMinutes: source.slotMinutes,
        maxDaysAhead: String(source.maxDaysAhead),
        days,
        destination: source.destination ?? null,
    };
}

/** What gets saved: open days only. */
export function draftToBooking(draft: BookingDraft): VoiceAgentBookingTool {
    const hours: VoiceBookingHours = {};
    for (const { key } of VOICE_WEEKDAY_OPTIONS) {
        const day = draft.days[key];
        if (day.open) hours[key] = { open: day.from, close: day.to };
    }
    return {
        enabled: draft.enabled,
        timezone: draft.timezone,
        slotMinutes: draft.slotMinutes,
        maxDaysAhead: Number(draft.maxDaysAhead.trim() || NaN),
        hours,
        destination: draft.destination,
    };
}

export function sameBooking(a: BookingDraft, b: BookingDraft): boolean {
    return JSON.stringify(draftToBooking(a)) === JSON.stringify(draftToBooking(b));
}

/** The first problem with the settings, in the words the server would use, or null. */
export function bookingDraftError(draft: BookingDraft): string | null {
    const days = Number(draft.maxDaysAhead);
    if (
        !/^\d+$/.test(draft.maxDaysAhead.trim()) ||
        days < VOICE_BOOKING_LIMITS.maxDaysAheadMin ||
        days > VOICE_BOOKING_LIMITS.maxDaysAheadMax
    ) {
        return `Callers can book from ${VOICE_BOOKING_LIMITS.maxDaysAheadMin} to ${VOICE_BOOKING_LIMITS.maxDaysAheadMax} days ahead`;
    }
    for (const { key, label } of VOICE_WEEKDAY_OPTIONS) {
        const day = draft.days[key];
        if (!day.open) continue;
        if (!VOICE_TIME_PATTERN.test(day.from) || !VOICE_TIME_PATTERN.test(day.to)) {
            return `Enter ${label}'s opening and closing times`;
        }
        const open = minutesOf(day.from);
        const close = minutesOf(day.to);
        if (close <= open) return `${label} has to close after it opens`;
        if (close - open < draft.slotMinutes) {
            return `${label}'s hours are shorter than one ${draft.slotMinutes}-minute appointment`;
        }
    }
    if (draft.enabled && VOICE_WEEKDAY_OPTIONS.every(({ key }) => !draft.days[key].open)) {
        return 'Open at least one day so callers can book';
    }
    if (draft.destination && !draft.destination.calendarId) {
        return `Choose the ${voiceCalendarProviderInfo(draft.destination.provider).targetNoun.toLowerCase()} bookings go to`;
    }
    return null;
}
