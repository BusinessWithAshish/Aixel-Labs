import type { VoiceAgentBookingTool, VoiceBookingDestination, VoiceBookingHours } from '@aixellabs/backend/db/types';
import {
    DEFAULT_VOICE_BOOKING_HOURS,
    defaultVoiceBookingTool,
    VOICE_BOOKING_DAYS,
    VOICE_BOOKING_LIMITS,
    VOICE_BOOKING_TIME_PATTERN,
    voiceBookingMinutes,
    type VoiceBookingDay,
} from '@/helpers/voice-agent-defaults';
import { voiceCalendarProviderInfo } from '@/helpers/voice-calendar-providers';

/** One day in the editor. A closed day keeps its times, so switching it back on restores them. */
export type BookingDayDraft = { open: boolean; from: string; to: string };

/** The booking settings as the editor holds them (days ahead stays text while it is typed). */
export type BookingDraft = {
    enabled: boolean;
    timezone: string;
    slotMinutes: number;
    maxDaysAhead: string;
    days: Record<VoiceBookingDay, BookingDayDraft>;
    /** Null = the built-in calendar. */
    destination: VoiceBookingDestination | null;
};

/** Used until the browser's zone is known, so the server render and the first client render agree. */
export const PLACEHOLDER_TIMEZONE = 'UTC';

export function bookingToDraft(booking: VoiceAgentBookingTool | null, timezone = PLACEHOLDER_TIMEZONE): BookingDraft {
    const source = booking ?? defaultVoiceBookingTool(timezone);
    const days = Object.fromEntries(
        VOICE_BOOKING_DAYS.map(({ key }) => {
            const hours = source.hours[key];
            const fallback = DEFAULT_VOICE_BOOKING_HOURS.mon ?? { open: '09:00', close: '17:00' };
            return [key, { open: !!hours, from: hours?.open ?? fallback.open, to: hours?.close ?? fallback.close }];
        }),
    ) as Record<VoiceBookingDay, BookingDayDraft>;
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
    for (const { key } of VOICE_BOOKING_DAYS) {
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
    for (const { key, label } of VOICE_BOOKING_DAYS) {
        const day = draft.days[key];
        if (!day.open) continue;
        if (!VOICE_BOOKING_TIME_PATTERN.test(day.from) || !VOICE_BOOKING_TIME_PATTERN.test(day.to)) {
            return `Enter ${label}'s opening and closing times`;
        }
        const open = voiceBookingMinutes(day.from);
        const close = voiceBookingMinutes(day.to);
        if (close <= open) return `${label} has to close after it opens`;
        if (close - open < draft.slotMinutes) {
            return `${label}'s hours are shorter than one ${draft.slotMinutes}-minute appointment`;
        }
    }
    if (draft.enabled && VOICE_BOOKING_DAYS.every(({ key }) => !draft.days[key].open)) {
        return 'Open at least one day so callers can book';
    }
    if (draft.destination && !draft.destination.calendarId) {
        return `Choose the ${voiceCalendarProviderInfo(draft.destination.provider).targetNoun.toLowerCase()} bookings go to`;
    }
    return null;
}

/** Old names some browsers still report (Chrome says "Asia/Calcutta"), mapped to today's IANA names. */
const RENAMED_TIMEZONES: Record<string, string> = {
    'America/Buenos_Aires': 'America/Argentina/Buenos_Aires',
    'America/Godthab': 'America/Nuuk',
    'Asia/Calcutta': 'Asia/Kolkata',
    'Asia/Katmandu': 'Asia/Kathmandu',
    'Asia/Rangoon': 'Asia/Yangon',
    'Asia/Saigon': 'Asia/Ho_Chi_Minh',
    'Atlantic/Faeroe': 'Atlantic/Faroe',
    'Europe/Kiev': 'Europe/Kyiv',
    'Pacific/Enderbury': 'Pacific/Kanton',
    'Pacific/Ponape': 'Pacific/Pohnpei',
    'Pacific/Truk': 'Pacific/Chuuk',
};

export function canonicalTimezone(zone: string): string {
    return RENAMED_TIMEZONES[zone] ?? zone;
}

/** The browser's IANA zone, e.g. "Asia/Kolkata". */
export function browserTimezone(): string {
    try {
        return canonicalTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone || PLACEHOLDER_TIMEZONE);
    } catch {
        return PLACEHOLDER_TIMEZONE;
    }
}

/** "30 minutes", "1 hour", "1.5 hours". */
export function slotLengthLabel(minutes: number): string {
    if (minutes < 60) return `${minutes} minutes`;
    const hours = minutes / 60;
    return hours === 1 ? '1 hour' : `${Number.isInteger(hours) ? hours : hours.toFixed(1).replace(/\.0$/, '')} hours`;
}
