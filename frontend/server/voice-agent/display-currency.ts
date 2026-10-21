import 'server-only';

import { cookies, headers } from 'next/headers';
import { VOICE_CALL_RATES } from '@aixellabs/backend/db/types';
import { DISPLAY_CURRENCY_COOKIE_KEY, USD_DISPLAY, type DisplayCurrency } from '@/helpers/voice-call-cost';

/** Today's dollar rates (`VOICE_CALL_RATES.currency`: free, no key). Next keeps the answer a day, so pages do not wait on it. */
const ONE_DAY_SECONDS = 60 * 60 * 24;
const FETCH_TIMEOUT_MS = 3000;

type UsdRates = { date: string; usd: Record<string, number> };

async function usdRates(): Promise<UsdRates | null> {
    for (const url of VOICE_CALL_RATES.currency.usdRatesUrls) {
        try {
            const res = await fetch(url, {
                next: { revalidate: ONE_DAY_SECONDS },
                signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
            });
            if (!res.ok) continue;
            const body = (await res.json()) as Partial<UsdRates>;
            if (body.date && body.usd) return { date: body.date, usd: body.usd };
        } catch {
            // the next source, else dollars
        }
    }
    return null;
}

/** The browser's region, from Accept-Language ("en-IN,en;q=0.9" -> "IN"). */
function browserRegion(acceptLanguage: string | null): string | null {
    const first = acceptLanguage?.split(',')[0]?.trim();
    if (!first) return null;
    try {
        return new Intl.Locale(first).maximize().region ?? null;
    } catch {
        return null;
    }
}

// shortcut: only India gets a currency of its own by default; everyone else starts in dollars and picks theirs.
const REGION_CURRENCY: Record<string, string> = { IN: 'INR' };

/** The currency the owner sees costs in: their pick, else a guess from the browser's language, else dollars. */
export async function getDisplayCurrency(): Promise<DisplayCurrency> {
    const [cookieStore, headerList, rates] = await Promise.all([cookies(), headers(), usdRates()]);
    if (!rates) return USD_DISPLAY;
    const codes = Intl.supportedValuesOf('currency').filter((code) => rates.usd[code.toLowerCase()] > 0);
    const wanted =
        cookieStore.get(DISPLAY_CURRENCY_COOKIE_KEY)?.value ??
        REGION_CURRENCY[browserRegion(headerList.get('accept-language')) ?? ''] ??
        'USD';
    const code = codes.includes(wanted) ? wanted : 'USD';
    return { code, perUsd: code === 'USD' ? 1 : rates.usd[code.toLowerCase()], ratesDate: rates.date, codes };
}
