import type { CONTENT_LAB_CREATOR } from '@aixellabs/backend/content-lab/types';

const COMPACT = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });

export const compactNumber = (value: number | null | undefined): string => (value == null ? '–' : COMPACT.format(value));

/** "14x", "2.3x". */
export const formatMultiple = (multiple: number): string => `${multiple >= 10 ? Math.round(multiple) : Number(multiple.toFixed(1))}x`;

/** The multiple in words: "14 times their usual views", "about the same as usual", "half their usual likes". */
export function timesUsual(multiple: number, unit: 'views' | 'likes' = 'views'): string {
    if (multiple >= 1.5) return `${formatMultiple(multiple).slice(0, -1)} times their usual ${unit}`;
    if (multiple >= 0.8) return `About their usual ${unit}`;
    return `Below their usual ${unit}`;
}

/** "3 days ago", "2 weeks ago", "5 months ago"; null when the date is unknown. */
export function timeAgo(iso: string | null | undefined, now = Date.now()): string | null {
    const at = iso ? Date.parse(iso) : NaN;
    if (Number.isNaN(at)) return null;
    const days = Math.max(0, Math.floor((now - at) / 86_400_000));
    if (days === 0) return 'today';
    if (days === 1) return 'yesterday';
    if (days < 14) return `${days} days ago`;
    if (days < 60) return `${Math.floor(days / 7)} weeks ago`;
    if (days < 730) return `${Math.floor(days / 30)} months ago`;
    return `${Math.floor(days / 365)} years ago`;
}

/** 0:06, 11:42, 1:02:03. */
export function formatSeconds(total: number | null | undefined): string {
    if (total == null) return '–';
    const s = Math.max(0, Math.round(total));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = String(s % 60).padStart(2, '0');
    return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

export function creatorLabel(creator: CONTENT_LAB_CREATOR): string {
    if (creator.handle) return `@${creator.handle.replace(/^@/, '')}`;
    return creator.name ?? creator.id;
}

/** What a creator's handle is for the creator / watch APIs. */
export const creatorHandle = (creator: CONTENT_LAB_CREATOR): string => creator.handle?.replace(/^@/, '') ?? creator.id;
