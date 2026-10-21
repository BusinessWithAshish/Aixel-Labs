'use server';

import { cookies } from 'next/headers';
import { DISPLAY_CURRENCY_COOKIE_KEY } from '@/helpers/voice-call-cost';

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/** Remembers the currency the owner wants costs in (an ISO code; unknown ones fall back to dollars on read). */
export async function setDisplayCurrencyAction(code: string): Promise<void> {
    if (!/^[A-Z]{3}$/.test(code)) return;
    (await cookies()).set(DISPLAY_CURRENCY_COOKIE_KEY, code, { path: '/', maxAge: ONE_YEAR_SECONDS, sameSite: 'lax' });
}
