/**
 * When true in local development, skip ThumbmarkJS and device uniqueness checks.
 * Set in `.env.local`: NEXT_PUBLIC_SKIP_DEVICE_FINGERPRINT=true
 *
 * Ignored in production builds even if the public env is set.
 */
export function isDeviceFingerprintSkipped(): boolean {
    return (
        process.env.NODE_ENV === 'development' &&
        process.env.NEXT_PUBLIC_SKIP_DEVICE_FINGERPRINT === 'true'
    );
}

/** Placeholder the client sends when fingerprinting is skipped (server rewrites to per-uid). */
export const LOCAL_DEV_FINGERPRINT_PLACEHOLDER = 'local-dev-skip';
