import { VOICE_WEEKDAYS, type VoiceWeekday } from '@aixellabs/backend/db/types';

/**
 * Days, clock times, timezones and dates as the voice pages and actions read and show them
 * (booking hours, campaign windows, call and booking times).
 */

/** Used until the browser's zone is known, so the server render and the first client render agree. */
export const FALLBACK_TIMEZONE = 'UTC';

const WEEKDAY_LABELS: Record<VoiceWeekday, string> = {
    mon: 'Monday',
    tue: 'Tuesday',
    wed: 'Wednesday',
    thu: 'Thursday',
    fri: 'Friday',
    sat: 'Saturday',
    sun: 'Sunday',
};

/** Monday first, the way a week reads on a business's door. */
export const VOICE_WEEKDAY_OPTIONS = VOICE_WEEKDAYS.map((key) => ({
    key,
    label: WEEKDAY_LABELS[key],
    short: WEEKDAY_LABELS[key].slice(0, 3),
}));

/** "HH:MM" (or "24:00") -> minutes after midnight. */
export function minutesOf(time: string): number {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
}

/** "30 minutes", "1 hour", "1.5 hours", "1 day". */
export function minutesLabel(minutes: number): string {
    if (minutes < 60) return `${minutes} minutes`;
    if (minutes % 1440 === 0) return minutes === 1440 ? '1 day' : `${minutes / 1440} days`;
    const hours = minutes / 60;
    return hours === 1 ? '1 hour' : `${Number.isInteger(hours) ? hours : hours.toFixed(1).replace(/\.0$/, '')} hours`;
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
        return canonicalTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone || FALLBACK_TIMEZONE);
    } catch {
        return FALLBACK_TIMEZONE;
    }
}

/** A zone name the engine takes ("Asia/Kolkata", "UTC"; not offsets like "+05:30") and this runtime knows. */
export function isIanaTimezone(zone: string): boolean {
    if (!/^[A-Za-z][A-Za-z0-9_+-]*(\/[A-Za-z0-9_+-]+){0,2}$/.test(zone)) return false;
    try {
        new Intl.DateTimeFormat('en-US', { timeZone: zone });
        return true;
    } catch {
        return false;
    }
}

/** A zone this runtime knows, else UTC (an agent could have been saved with a zone this browser lacks). */
export function safeTimezone(zone: string): string {
    return isIanaTimezone(zone) ? zone : FALLBACK_TIMEZONE;
}

/** "18 Oct, 2:00 pm" in the viewer's locale. */
export function formatShortDateTime(iso: string): string {
    return new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

/** "18 Oct 2026" in the viewer's locale. */
export function formatDay(iso: string): string {
    return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}
