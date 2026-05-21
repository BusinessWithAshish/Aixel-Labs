import { LOCAL_STORAGE_KEY_BASE } from '@/config/app-config';

const SEP = ':';

/**
 * Builds a namespaced localStorage key: `{base}:{segment1}:{segment2}:...`
 */
export function generateLocalStorageKey(...segments: string[]): string {
    return segments.length === 0 ? LOCAL_STORAGE_KEY_BASE : [LOCAL_STORAGE_KEY_BASE, ...segments].join(SEP);
}
