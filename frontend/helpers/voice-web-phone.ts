/**
 * The browser phone (Web dialer page): number checks, the TwiML a Twilio call dials with, and why a
 * call ended, in plain words. Client-safe and import-free, so `voice-web-phone.test.mjs` runs it
 * with plain `node --test`.
 */

const E164 = /^\+[1-9]\d{7,14}$/;

/** "+1 (415) 555-0123" or "0014155550123" → "+14155550123"; null without a country code. */
export function toE164(input: string): string | null {
    const compact = input
        .trim()
        .replace(/[\s().-]/g, '')
        .replace(/^00/, '+');
    return E164.test(compact) ? compact : null;
}

export const NEEDS_COUNTRY_CODE = 'Enter the number with its country code, for example +14155550123 or +919876543210.';

/** What Twilio runs when the browser calls: ring `to` from the owner's number (both E.164, checked by the caller). */
export function dialTwiml(callerId: string, to: string): string {
    return `<?xml version="1.0" encoding="UTF-8"?><Response><Dial callerId="${callerId}" answerOnBridge="true"><Number>${to}</Number></Dial></Response>`;
}

/** How a call ended, as the SDKs report it. `sipCode` / `cause` are Telnyx's; Twilio gives neither. */
export type WebPhoneCallEnd = {
    /** "Telnyx" or "Twilio". */
    providerLabel: string;
    /** The other side picked up. */
    answered: boolean;
    sipCode?: number | null;
    cause?: string | null;
};

const BUSY = new Set(['USER_BUSY']);
const NO_ANSWER = new Set(['NO_ANSWER', 'NO_USER_RESPONSE', 'RECOVERY_ON_TIMER_EXPIRE']);
const NO_SUCH_NUMBER = new Set(['UNALLOCATED_NUMBER', 'INVALID_NUMBER_FORMAT', 'NO_ROUTE_DESTINATION']);

/** Why a call the owner did not hang up ended, or null when it simply ended after talking. */
export function describeCallEnd({ providerLabel, answered, sipCode, cause }: WebPhoneCallEnd): string | null {
    if (answered) return null;
    const code = cause?.toUpperCase() ?? '';
    if (BUSY.has(code) || sipCode === 486) return 'The line is busy. Try again later.';
    if (NO_ANSWER.has(code) || sipCode === 480 || sipCode === 408) return 'Nobody answered.';
    if (NO_SUCH_NUMBER.has(code) || sipCode === 404 || sipCode === 484) {
        return 'That number does not exist. Check it, with its country code.';
    }
    return `${providerLabel} did not put the call through. On a ${providerLabel} trial account you can only call numbers you have verified in ${providerLabel}, and calls abroad need that country allowed in your ${providerLabel} account.`;
}

/** Microphone errors from `getUserMedia`, in plain words. */
export function describeMicError(error: unknown): string {
    const name = error instanceof Error ? error.name : '';
    if (name === 'NotAllowedError' || name === 'SecurityError') {
        return 'Allow this site to use your microphone (the icon at the left of the address bar), then call again.';
    }
    if (name === 'NotFoundError' || name === 'OverconstrainedError')
        return 'No microphone found. Plug one in, then call again.';
    if (name === 'NotReadableError') return 'Another app is using your microphone. Close it, then call again.';
    return 'Could not use your microphone. Check it works, then call again.';
}
