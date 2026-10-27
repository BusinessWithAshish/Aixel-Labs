import type { CONTENT_LAB_CREATOR } from '@aixellabs/backend/content-lab/types';

const COMPACT = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });

export const compactNumber = (value: number | null | undefined): string => (value == null ? '–' : COMPACT.format(value));

/** "14x", "2.3x". */
export const formatMultiple = (multiple: number): string => `${multiple >= 10 ? Math.round(multiple) : Number(multiple.toFixed(1))}x`;

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
