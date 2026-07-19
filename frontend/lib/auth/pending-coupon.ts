/** sessionStorage key for a coupon captured on login / from ?coupon= */
export const PENDING_COUPON_STORAGE_KEY = 'aixel.pendingCouponCode';

export function storePendingCouponCode(code: string): void {
    const trimmed = code.trim();
    if (!trimmed || typeof window === 'undefined') return;
    try {
        sessionStorage.setItem(PENDING_COUPON_STORAGE_KEY, trimmed);
    } catch {
        // Ignore quota / private mode failures.
    }
}

export function readPendingCouponCode(): string | null {
    if (typeof window === 'undefined') return null;
    try {
        const value = sessionStorage.getItem(PENDING_COUPON_STORAGE_KEY);
        return value?.trim() || null;
    } catch {
        return null;
    }
}

export function clearPendingCouponCode(): void {
    if (typeof window === 'undefined') return;
    try {
        sessionStorage.removeItem(PENDING_COUPON_STORAGE_KEY);
    } catch {
        // Ignore.
    }
}
