/** The periods Call logs and Analytics look back over (`?range=`): days back from now, or every call there is. */
export type VoiceCallRange = '7' | '30' | '90' | '365' | 'all';

export const CALL_RANGES: { value: VoiceCallRange; label: string }[] = [
    { value: '7', label: 'Last 7 days' },
    { value: '30', label: 'Last 30 days' },
    { value: '90', label: 'Last 90 days' },
    { value: '365', label: 'Last 12 months' },
    { value: 'all', label: 'All time' },
];

/** Analytics opens on the last 30 days; Call logs on all time. */
export const DEFAULT_ANALYTICS_RANGE: VoiceCallRange = '30';

export const DAY_MS = 24 * 60 * 60 * 1000;

/** A `?range=` value as sent, or null when it is not one. */
export function parseCallRange(value: unknown): VoiceCallRange | null {
    return CALL_RANGES.find((r) => r.value === value)?.value ?? null;
}

/** When the period starts; null for all time. */
export function rangeStart(range: VoiceCallRange): Date | null {
    return range === 'all' ? null : new Date(Date.now() - Number(range) * DAY_MS);
}
