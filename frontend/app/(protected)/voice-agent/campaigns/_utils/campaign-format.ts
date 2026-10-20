import {
    VoiceCampaignContactStatus,
    VoiceCampaignRetryOutcome,
    VoiceCampaignStatus,
    type VoiceCampaignDay,
    type VoiceCampaignWindow,
} from '@aixellabs/backend/db/types';
import type { VoiceCampaignStats } from '@/app/actions/voice-campaign-actions';
import { endedByLabel } from '../../call-logs/_utils/call-format';

type BadgeVariant = 'secondary' | 'green' | 'yellow' | 'red' | 'blue' | 'orange' | 'purple' | 'outline';

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

export const DAYS: { key: VoiceCampaignDay; short: string }[] = [
    { key: 'mon', short: 'Mon' },
    { key: 'tue', short: 'Tue' },
    { key: 'wed', short: 'Wed' },
    { key: 'thu', short: 'Thu' },
    { key: 'fri', short: 'Fri' },
    { key: 'sat', short: 'Sat' },
    { key: 'sun', short: 'Sun' },
];

export const RETRY_OUTCOMES: { value: VoiceCampaignRetryOutcome; label: string }[] = [
    { value: VoiceCampaignRetryOutcome.NO_ANSWER, label: 'No answer' },
    { value: VoiceCampaignRetryOutcome.BUSY, label: 'Busy' },
    { value: VoiceCampaignRetryOutcome.VOICEMAIL, label: 'Voicemail' },
];

export const RETRY_DELAYS: { minutes: number; label: string }[] = [
    { minutes: 15, label: '15 minutes' },
    { minutes: 30, label: '30 minutes' },
    { minutes: 60, label: '1 hour' },
    { minutes: 120, label: '2 hours' },
    { minutes: 240, label: '4 hours' },
    { minutes: 1440, label: '1 day' },
];

export function delayLabel(minutes: number): string {
    const known = RETRY_DELAYS.find((d) => d.minutes === minutes);
    if (known) return known.label;
    return minutes % 60 === 0 ? `${minutes / 60} hours` : `${minutes} minutes`;
}

/** "Mon–Fri" for a run of days, else "Mon, Wed, Sat"; "Every day" for all seven. */
export function daysLabel(days: VoiceCampaignDay[]): string {
    const idx = DAYS.map((d, i) => (days.includes(d.key) ? i : -1)).filter((i) => i >= 0);
    if (idx.length === 7) return 'Every day';
    if (idx.length === 0) return 'No days';
    const contiguous = idx.length > 2 && idx.every((v, i) => i === 0 || v === idx[i - 1] + 1);
    if (contiguous) return `${DAYS[idx[0]].short}–${DAYS[idx[idx.length - 1]].short}`;
    return idx.map((i) => DAYS[i].short).join(', ');
}

export function windowLabel(window: VoiceCampaignWindow): string {
    return `${daysLabel(window.days)}, ${window.start}–${window.end} ${window.timezone.replace(/_/g, ' ')}`;
}

/** Whether calls may start now (the engine decides the same way: campaigns.in_window). */
export function isWindowOpen(window: VoiceCampaignWindow, at = new Date()): boolean {
    try {
        const parts = new Intl.DateTimeFormat('en-US', {
            timeZone: window.timezone,
            weekday: 'short',
            hour: '2-digit',
            minute: '2-digit',
            hourCycle: 'h23',
        }).formatToParts(at);
        const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
        const day = get('weekday').toLowerCase().slice(0, 3) as VoiceCampaignDay;
        const minutes = Number(get('hour')) * 60 + Number(get('minute'));
        const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));
        return window.days.includes(day) && minutes >= toMin(window.start) && minutes < toMin(window.end);
    } catch {
        return false;
    }
}

/** Share of contacts that are settled (answered, not reached, failed, skipped or cancelled), 0-100. */
export function progressPercent(stats: VoiceCampaignStats): number {
    if (!stats.total) return 0;
    const done = stats.total - stats.pending - stats.calling;
    return Math.round((done / stats.total) * 100);
}

const OUTCOME_LABELS: Record<string, string> = {
    dnc_list: 'On the do-not-call list',
    invalid_number: 'Not a valid number',
    interrupted: 'Interrupted',
};

export function outcomeLabel(outcome: string | null): string | null {
    if (!outcome) return null;
    return OUTCOME_LABELS[outcome] ?? endedByLabel(outcome);
}

export function formatDateTime(iso: string): string {
    return new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}
