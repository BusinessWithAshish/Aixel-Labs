import { VOICE_CALL_RATES, type VoiceProvider } from '@aixellabs/backend/db/types';
import { countryOfE164, formatPhone } from '@/helpers/voice-campaign-contacts';
import { toE164 } from '@/helpers/voice-web-phone';

/** What was dialled, grouped ("+1 415 555 0123") once it is a whole number of a known country, else as typed. */
export function displayNumber(dialed: string): string {
    const e164 = toE164(dialed);
    const country = e164 ? countryOfE164(e164) : null;
    return e164 && country?.lengths.includes(e164.length - 1 - country.dial.length) ? formatPhone(e164) : dialed;
}

/**
 * A browser call's list rate a minute (`VOICE_CALL_RATES`): the provider's outbound rate to that
 * country when it has one (`OUTBOUND_IN`: Twilio to India), else its general outbound rate. No
 * stream or recording extras: the browser call has neither. Null when the provider publishes none.
 */
export function webCallUsdPerMinute(provider: VoiceProvider, to: string | null): number | null {
    const rates = (VOICE_CALL_RATES.providers as Record<string, { usdPerMinute: Record<string, number> } | undefined>)[
        provider
    ]?.usdPerMinute;
    if (!rates) return null;
    const country = to ? countryOfE164(to)?.code : null;
    return (country && rates[`OUTBOUND_${country}`]) || rates.OUTBOUND;
}
