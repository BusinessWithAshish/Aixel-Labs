'use client';

import { Thumbmark } from '@thumbmarkjs/thumbmarkjs';
import {
    isDeviceFingerprintSkipped,
    LOCAL_DEV_FINGERPRINT_PLACEHOLDER,
} from '@/lib/auth/device-fingerprint-config';

/**
 * Browser device fingerprint via ThumbmarkJS free OSS (`thumbmark` hash).
 * Must run in the browser only.
 *
 * Skipped when `NEXT_PUBLIC_SKIP_DEVICE_FINGERPRINT=true` in development.
 *
 * TODO: when enabling Thumbmark Free API, pass `api_key` and prefer `visitorId ?? thumbmark`.
 */
export async function getDeviceFingerprint(): Promise<string> {
    if (isDeviceFingerprintSkipped()) {
        return LOCAL_DEV_FINGERPRINT_PLACEHOLDER;
    }

    const tm = new Thumbmark();
    const result = await tm.get();
    const thumbmark = result.thumbmark?.trim();
    if (!thumbmark) {
        throw new Error('Could not identify this device. Refresh the page and try again.');
    }
    return thumbmark;
}
