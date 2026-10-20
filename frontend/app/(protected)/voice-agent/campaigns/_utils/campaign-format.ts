import type { VariantProps } from 'class-variance-authority';
import {
    VoiceCampaignContactStatus,
    VoiceCampaignRetryOutcome,
    VoiceCampaignStatus,
    type VoiceCampaignDay,
    type VoiceCampaignWindow,
} from '@aixellabs/backend/db/types';
import type { VoiceCampaignStats } from '@/app/actions/voice-campaign-actions';
import type { badgeVariants } from '@/components/ui/badge';
import { minutesOf, VOICE_WEEKDAY_OPTIONS } from '@/helpers/voice-time';

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
        return window.days.includes(day) && minutes >= minutesOf(window.start) && minutes < minutesOf(window.end);
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
