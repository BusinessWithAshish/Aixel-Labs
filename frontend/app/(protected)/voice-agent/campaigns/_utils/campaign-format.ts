import type { VariantProps } from 'class-variance-authority';
import {
    VOICE_WEEKDAYS,
    VoiceCampaignContactStatus,
    VoiceCampaignRetryOutcome,
    VoiceCampaignStatus,
    type VoiceCampaignDay,
    type VoiceCampaignRetry,
    type VoiceCampaignWindow,
} from '@aixellabs/backend/db/types';
import type { VoiceCampaignAction, VoiceCampaignListItem, VoiceCampaignStats } from '@/app/actions/voice-campaign-actions';
import type { badgeVariants } from '@/components/ui/badge';
import { formatShortDateTime, minutesLabel, minutesOf, VOICE_WEEKDAY_OPTIONS } from '@/helpers/voice-time';

type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>['variant']>;

export const CAMPAIGN_STATUS: Record<VoiceCampaignStatus, { label: string; variant: BadgeVariant }> = {
    [VoiceCampaignStatus.DRAFT]: { label: 'Draft', variant: 'secondary' },
    [VoiceCampaignStatus.RUNNING]: { label: 'Running', variant: 'green' },
    [VoiceCampaignStatus.PAUSED]: { label: 'Paused', variant: 'yellow' },
    [VoiceCampaignStatus.COMPLETED]: { label: 'Completed', variant: 'blue' },
    [VoiceCampaignStatus.CANCELLED]: { label: 'Cancelled', variant: 'outline' },
};

export const CONTACT_STATUS: Record<VoiceCampaignContactStatus, { label: string; variant: BadgeVariant }> = {
    [VoiceCampaignContactStatus.PENDING]: { label: 'Waiting', variant: 'secondary' },
    [VoiceCampaignContactStatus.CALLING]: { label: 'Calling', variant: 'blue' },
    [VoiceCampaignContactStatus.ANSWERED]: { label: 'Answered', variant: 'green' },
    [VoiceCampaignContactStatus.UNREACHED]: { label: 'Not reached', variant: 'orange' },
    [VoiceCampaignContactStatus.FAILED]: { label: 'Failed', variant: 'red' },
    [VoiceCampaignContactStatus.SKIPPED_DNC]: { label: 'Do not call', variant: 'purple' },
    [VoiceCampaignContactStatus.CANCELLED]: { label: 'Cancelled', variant: 'outline' },
};

export const RETRY_OUTCOMES: { value: VoiceCampaignRetryOutcome; label: string }[] = [
    { value: VoiceCampaignRetryOutcome.NO_ANSWER, label: 'No answer' },
    { value: VoiceCampaignRetryOutcome.BUSY, label: 'Busy' },
    { value: VoiceCampaignRetryOutcome.VOICEMAIL, label: 'Voicemail' },
];

/** The toast after each campaign action (list cards and the detail page). */
export const CAMPAIGN_ACTION_DONE: Record<VoiceCampaignAction, string> = {
    start: 'Campaign started',
    pause: 'Campaign paused. Calls already ringing will finish.',
    resume: 'Campaign resumed',
    cancel: 'Campaign cancelled',
};

/** The waits between retries the wizard offers. */
export const RETRY_DELAY_MINUTES = [15, 30, 60, 120, 240, 1440] as const;

/** "Mon–Fri" for a run of days, else "Mon, Wed, Sat"; "Every day" for all seven. */
export function daysLabel(days: VoiceCampaignDay[]): string {
    const week = VOICE_WEEKDAY_OPTIONS;
    const idx = week.map((d, i) => (days.includes(d.key) ? i : -1)).filter((i) => i >= 0);
    if (idx.length === 7) return 'Every day';
    if (idx.length === 0) return 'No days';
    const contiguous = idx.length > 2 && idx.every((v, i) => i === 0 || v === idx[i - 1] + 1);
    if (contiguous) return `${week[idx[0]].short}–${week[idx[idx.length - 1]].short}`;
    return idx.map((i) => week[i].short).join(', ');
}

/** "India Standard Time" for "Asia/Kolkata"; the zone itself where the runtime has no name for it. */
export function timezoneWords(zone: string): string {
    try {
        const name = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'long' })
            .formatToParts(new Date())
            .find((p) => p.type === 'timeZoneName')?.value;
        if (name && !/^GMT[+-]/.test(name)) return name;
    } catch {
        // An unknown zone: shown as saved.
    }
    return zone.replace(/_/g, ' ');
}

/** "Mon–Fri, 09:00–18:00 India Standard Time". */
export function windowLabel(window: VoiceCampaignWindow): string {
    return `${daysLabel(window.days)}, ${window.start}–${window.end} ${timezoneWords(window.timezone)}`;
}

/** The day (index in VOICE_WEEKDAYS) and minute of the day on the campaign's clock; null for an unknown zone. */
function zoneClock(timezone: string, at: Date): { day: number; minutes: number } | null {
    try {
        const parts = new Intl.DateTimeFormat('en-US', {
            timeZone: timezone,
            weekday: 'short',
            hour: '2-digit',
            minute: '2-digit',
            hourCycle: 'h23',
        }).formatToParts(at);
        const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
        const day = VOICE_WEEKDAYS.indexOf(get('weekday').toLowerCase().slice(0, 3) as VoiceCampaignDay);
        return day === -1 ? null : { day, minutes: Number(get('hour')) * 60 + Number(get('minute')) };
    } catch {
        return null;
    }
}

/** Whether calls may start now (the engine decides the same way: campaigns.in_window). */
export function isWindowOpen(window: VoiceCampaignWindow, at = new Date()): boolean {
    const now = zoneClock(window.timezone, at);
    return (
        !!now &&
        window.days.includes(VOICE_WEEKDAYS[now.day]) &&
        now.minutes >= minutesOf(window.start) &&
        now.minutes < minutesOf(window.end)
    );
}

/** When calls may next start, on the campaign's clock ("today at 09:00", "tomorrow at 09:00", "Monday at 09:00"); null while open. */
export function nextWindowLabel(window: VoiceCampaignWindow, at = new Date()): string | null {
    const now = zoneClock(window.timezone, at);
    if (!now || isWindowOpen(window, at)) return null;
    const start = minutesOf(window.start);
    for (let ahead = 0; ahead <= 7; ahead++) {
        const day = VOICE_WEEKDAY_OPTIONS[(now.day + ahead) % 7];
        if (!window.days.includes(day.key) || (ahead === 0 && now.minutes >= start)) continue;
        return `${ahead === 0 ? 'today' : ahead === 1 ? 'tomorrow' : day.label} at ${window.start}`;
    }
    return null;
}

/** "Up to 2 more calls on no answer or busy, 1 hour apart". */
export function retryLabel(retry: VoiceCampaignRetry): string {
    const on = RETRY_OUTCOMES.filter((o) => retry.on.includes(o.value)).map((o) => o.label.toLowerCase());
    if (retry.maxRetries === 0 || on.length === 0) return 'No retries: each contact is called once';
    const list = new Intl.ListFormat('en', { type: 'disjunction' }).format(on);
    return `Up to ${retry.maxRetries} more ${retry.maxRetries === 1 ? 'call' : 'calls'} on ${list}, ${minutesLabel(retry.delayMinutes)} apart`;
}

/** What a campaign is doing right now, in one line (the list cards and the detail page). */
export function campaignStateText(
    campaign: Pick<VoiceCampaignListItem, 'status' | 'window' | 'completedAt'>,
    at = new Date(),
): string {
    switch (campaign.status) {
        case VoiceCampaignStatus.DRAFT:
            return 'Draft: nobody is called until you start it.';
        case VoiceCampaignStatus.RUNNING: {
            const next = nextWindowLabel(campaign.window, at);
            return next ? `Outside its calling hours: calls start again ${next}.` : 'Calling now, inside its hours.';
        }
        case VoiceCampaignStatus.PAUSED:
            return 'Paused: no new calls until you resume.';
        case VoiceCampaignStatus.COMPLETED:
            return campaign.completedAt ? `Finished ${formatShortDateTime(campaign.completedAt)}.` : 'Finished.';
        default:
            return 'Cancelled: contacts not called yet were dropped.';
    }
}

/** Share of contacts that are settled (answered, not reached, failed, skipped or cancelled), 0-100. */
export function progressPercent(stats: VoiceCampaignStats): number {
    if (!stats.total) return 0;
    const done = stats.total - stats.pending - stats.calling;
    return Math.round((done / stats.total) * 100);
}
