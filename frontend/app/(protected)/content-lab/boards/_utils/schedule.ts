import { VOICE_WEEKDAYS, type ContentLabBoardSchedule, type VoiceWeekday } from '@aixellabs/backend/db/types';

/**
 * When a scheduled board runs next, and the schedule in plain words. Pure, so the server (which
 * stores `nextRunAt`) and the Schedule sheet (which previews it) agree. Times are wall-clock times
 * in the schedule's own timezone, found with `Intl` (no tz library).
 */

export const DEFAULT_BOARD_SCHEDULE: ContentLabBoardSchedule = {
    repeat: 'off',
    time: '09:00',
    days: ['mon', 'tue', 'wed', 'thu', 'fri'],
    everyHours: 6,
    timezone: 'UTC',
    paused: false,
};

const HOUR_MS = 3_600_000;
/** `Date#getUTCDay()` order. */
const SUNDAY_FIRST: VoiceWeekday[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

type WallClock = { year: number; month: number; day: number; hour: number; minute: number };

/** The wall clock in `timezone` at `instant`. */
function wallClock(instant: number, timezone: string): WallClock {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        hourCycle: 'h23',
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
    }).formatToParts(new Date(instant));
    const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value ?? 0);
    return { year: get('year'), month: get('month') - 1, day: get('day'), hour: get('hour') % 24, minute: get('minute') };
}

/** How far `timezone` is ahead of UTC at `instant`, in ms. */
function offsetAt(instant: number, timezone: string): number {
    const clock = wallClock(instant, timezone);
    const asUtc = Date.UTC(clock.year, clock.month, clock.day, clock.hour, clock.minute);
    return asUtc - Math.floor(instant / 60_000) * 60_000;
}

/** The instant when the clock in `timezone` reads this date and time (the later guess wins across a DST change). */
function zonedInstant(year: number, month: number, day: number, hour: number, minute: number, timezone: string): number {
    const guess = Date.UTC(year, month, day, hour, minute);
    const first = guess - offsetAt(guess, timezone);
    return guess - offsetAt(first, timezone);
}

const parseTime = (time: string): [number, number] => {
    const [hour, minute] = time.split(':').map(Number);
    return [Number.isFinite(hour) ? hour : 9, Number.isFinite(minute) ? minute : 0];
};

/** The next run strictly after `from`, or null when the schedule is off or paused. */
export function nextScheduledRun(schedule: ContentLabBoardSchedule, from: Date): Date | null {
    if (schedule.repeat === 'off' || schedule.paused) return null;
    if (schedule.repeat === 'weekdays' && schedule.days.length === 0) return null;
    const now = from.getTime();
    const today = wallClock(now, schedule.timezone);

    if (schedule.repeat === 'hours') {
        const every = Math.max(1, schedule.everyHours);
        // Slots from local midnight: 00:00, 06:00, 12:00, 18:00 for every 6 hours.
        for (let dayOffset = 0; dayOffset <= 1; dayOffset++) {
            for (let hour = 0; hour < 24; hour += every) {
                const at = zonedInstant(today.year, today.month, today.day + dayOffset, hour, 0, schedule.timezone);
                if (at > now) return new Date(at);
            }
        }
        return new Date(now + every * HOUR_MS);
    }

    const [hour, minute] = parseTime(schedule.time);
    for (let dayOffset = 0; dayOffset <= 7; dayOffset++) {
        const weekday = SUNDAY_FIRST[new Date(Date.UTC(today.year, today.month, today.day + dayOffset)).getUTCDay()];
        if (schedule.repeat === 'weekdays' && !schedule.days.includes(weekday)) continue;
        const at = zonedInstant(today.year, today.month, today.day + dayOffset, hour, minute, schedule.timezone);
        if (at > now) return new Date(at);
    }
    return null;
}

/** "9:00 AM", "6 PM". */
export function clockLabel(time: string): string {
    const [hour, minute] = parseTime(time);
    const h12 = hour % 12 === 0 ? 12 : hour % 12;
    const suffix = hour < 12 ? 'AM' : 'PM';
    return minute ? `${h12}:${String(minute).padStart(2, '0')} ${suffix}` : `${h12} ${suffix}`;
}

const DAY_SHORT: Record<VoiceWeekday, string> = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };

function daysLabel(days: VoiceWeekday[]): string {
    const set = new Set(days);
    if (set.size === 7) return 'every day';
    if (set.size === 5 && !set.has('sat') && !set.has('sun')) return 'Monday to Friday';
    if (set.size === 2 && set.has('sat') && set.has('sun')) return 'weekends';
    return VOICE_WEEKDAYS.filter((day) => set.has(day))
        .map((day) => DAY_SHORT[day])
        .join(', ');
}

/** "Every day at 9 AM", "Mon, Wed, Fri at 6:30 PM", "Every 6 hours", "Not scheduled". */
export function describeSchedule(schedule: ContentLabBoardSchedule): string {
    switch (schedule.repeat) {
        case 'off':
            return 'Not scheduled';
        case 'daily':
            return `Every day at ${clockLabel(schedule.time)}`;
        case 'weekdays': {
            const days = daysLabel(schedule.days);
            return `${days === 'every day' ? 'Every day' : days.charAt(0).toUpperCase() + days.slice(1)} at ${clockLabel(schedule.time)}`;
        }
        case 'hours':
            return schedule.everyHours === 1 ? 'Every hour' : `Every ${schedule.everyHours} hours`;
    }
}
