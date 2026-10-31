import { VoiceCallChannel } from '@aixellabs/backend/db/types';
import { safeTimezone } from '@/helpers/voice-time';

/** "Sat 18 Oct" (plus the year when it is not this year) in `timeZone`. */
export function formatDayIn(iso: string, timeZone: string): string {
    const zone = safeTimezone(timeZone);
    const date = new Date(iso);
    const sameYear =
        new Intl.DateTimeFormat('en-US', { year: 'numeric', timeZone: zone }).format(date) ===
        new Intl.DateTimeFormat('en-US', { year: 'numeric', timeZone: zone }).format(new Date());
    return date.toLocaleDateString('en-GB', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        ...(sameYear ? {} : { year: 'numeric' }),
        timeZone: zone,
    });
}

/** "2:00 PM" in `timeZone` (ICU's narrow no-break space becomes a plain one, so server and browser agree). */
export function formatTimeIn(iso: string, timeZone: string): string {
    return new Date(iso)
        .toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: safeTimezone(timeZone) })
        .replace(/\s/g, ' ');
}

/** "Sat 18 Oct, 2:00 – 2:30 PM" in `timeZone` (the end's day is left out when it is the same day). */
export function formatSlotIn(startIso: string, endIso: string, timeZone: string): string {
    const day = formatDayIn(startIso, timeZone);
    const start = formatTimeIn(startIso, timeZone);
    const end = formatTimeIn(endIso, timeZone);
    if (formatDayIn(endIso, timeZone) !== day) return `${day}, ${start} – ${formatDayIn(endIso, timeZone)}, ${end}`;
    const [startClock, startHalf] = start.split(' ');
    const [, endHalf] = end.split(' ');
    return startHalf === endHalf ? `${day}, ${startClock} – ${end}` : `${day}, ${start} – ${end}`;
}

/** "Asia/Kolkata" -> "Kolkata time"; "UTC" stays "UTC". */
export function zoneLabel(timeZone: string): string {
    if (!timeZone || timeZone === 'UTC' || timeZone === 'Etc/UTC') return 'UTC';
    const city = timeZone.split('/').pop() ?? timeZone;
    return `${city.replace(/_/g, ' ')} time`;
}

export function channelLabel(channel: VoiceCallChannel): string {
    if (channel === VoiceCallChannel.WHATSAPP) return 'WhatsApp chat';
    return channel === VoiceCallChannel.PLAYGROUND ? 'Playground' : 'Phone call';
}
