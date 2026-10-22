import type { VoiceAnalyticsRange } from '@/app/actions/voice-analytics-actions';

/** The periods Analytics can look back over (`?range=`). */
export const ANALYTICS_RANGES: { value: VoiceAnalyticsRange; label: string }[] = [
    { value: '7', label: 'Last 7 days' },
    { value: '30', label: 'Last 30 days' },
    { value: '90', label: 'Last 90 days' },
    { value: '365', label: 'Last 12 months' },
    { value: 'all', label: 'All time' },
];

export const DEFAULT_ANALYTICS_RANGE: VoiceAnalyticsRange = '30';
