import {
    VOICE_CALL_RATES,
    type VoiceAgentCallType,
    type VoiceCallCost,
    type VoiceProvider,
} from '@aixellabs/backend/db/types';

/**
 * Call costs in words (Call logs, call detail, the agent's estimate, test calls). Costs are kept in US
 * dollars (`VoiceCallCost`, `VOICE_CALL_RATES`) and shown in the owner's currency at today's rate.
 */

/** The owner's pick, kept per browser (like the theme colour). */
export const DISPLAY_CURRENCY_COOKIE_KEY = 'voice-currency';

/** A currency to show dollars in: `perUsd` units of it buy one dollar. */
export type DisplayCurrency = {
    code: string;
    perUsd: number;
    /** The day the rate is from; null for dollars or when no rate could be fetched. */
    ratesDate: string | null;
    /** Every currency there is a rate for, for the picker. */
    codes: string[];
};

export const USD_DISPLAY: DisplayCurrency = { code: 'USD', perUsd: 1, ratesDate: null, codes: ['USD'] };

/** "$0.045", "₹4.27", "€0.041", "¥7": three decimals under one unit (calls cost cents), two above. */
export function formatMoney(usd: number, currency: Pick<DisplayCurrency, 'code' | 'perUsd'> = USD_DISPLAY): string {
    const amount = usd * currency.perUsd;
    const small = Math.abs(amount) < 1 ? { minimumFractionDigits: 3, maximumFractionDigits: 3 } : {};
    // Fixed locales, so the server render and the browser agree; Indian grouping for rupees.
    return new Intl.NumberFormat(currency.code === 'INR' ? 'en-IN' : 'en-US', {
        style: 'currency',
        currency: currency.code,
        ...small,
    }).format(amount);
}

/** Dollars per minute of talk, or null for a call nobody heard. */
export function costPerMinute(totalUsd: number, durationSec: number): number | null {
    return durationSec > 0 ? totalUsd / (durationSec / 60) : null;
}

/** True while the phone part is minutes × the provider's list rate, not its own charge yet. */
export function isCostEstimated(cost: Pick<VoiceCallCost, 'provider' | 'providerExact'>): boolean {
    return !!cost.provider && !cost.providerExact;
}

type ProviderRates = { usdPerMinute: Record<string, number>; extrasUsdPerMinute: number };

/** A provider's list rate a minute for a direction, or null when it publishes none. */
export function providerUsdPerMinute(provider: VoiceProvider, callType: VoiceAgentCallType): number | null {
    const rates = (VOICE_CALL_RATES.providers as Record<string, ProviderRates | undefined>)[provider];
    if (!rates) return null;
    return rates.usdPerMinute[callType] + rates.extrasUsdPerMinute;
}

export type AgentCostEstimate = {
    /** Prompt tokens Gemini reads every turn: the agent's words plus the engine's own sections. */
    promptTokens: number;
    geminiUsdPerMinute: number;
    /** One row per provider the agent is on; `usdPerMinute` null when its rate is not published. */
    providers: { provider: VoiceProvider; usdPerMinute: number | null }[];
    /** Gemini plus the dearest known provider. */
    usdPerMinute: number;
    typicalCallMinutes: number;
};

/**
 * What a minute with an agent should cost before any call: Gemini grows with the prompt (it is read
 * again every turn), nothing on a free-tier key; the phone part is the providers' list rates.
 */
export function estimateAgentCost(input: {
    /** The prompt and call notes as written. */
    promptChars: number;
    freeTier: boolean;
    callType: VoiceAgentCallType;
    providers: VoiceProvider[];
}): AgentCostEstimate {
    const model = VOICE_CALL_RATES.estimate;
    const promptTokens = Math.ceil(input.promptChars / model.charsPerToken) + model.engineTokens;
    const geminiUsdPerMinute = input.freeTier
        ? 0
        : model.geminiUsdPerMinute + promptTokens * model.geminiUsdPerPromptTokenMinute;
    const providers = [...new Set(input.providers)].map((provider) => ({
        provider,
        usdPerMinute: providerUsdPerMinute(provider, input.callType),
    }));
    const dearest = Math.max(0, ...providers.map((p) => p.usdPerMinute ?? 0));
    return {
        promptTokens,
        geminiUsdPerMinute,
        providers,
        usdPerMinute: geminiUsdPerMinute + dearest,
        typicalCallMinutes: model.typicalCallMinutes,
    };
}
