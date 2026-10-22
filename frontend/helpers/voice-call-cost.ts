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

type ProviderRates = { usdPerMinute: Record<string, number | undefined>; extrasUsdPerMinute: number };

/** The countries the list rates cover, in words. */
export const RATE_COUNTRY_NAME = { US: 'the US', IN: 'India' } as const;

/** The countries the list rates cover, by the number's prefix: the US (+1) and India (+91); null for any other. */
export function rateCountry(phone: string): keyof typeof RATE_COUNTRY_NAME | null {
    const digits = phone.replace(/[^\d+]/g, '');
    if (digits.startsWith('+1')) return 'US';
    if (digits.startsWith('+91')) return 'IN';
    return null;
}

/**
 * A provider's list rate a minute, or null when it publishes none. `phone` is where the call goes
 * (a call out) or the number called (a call in); without one, the US rate. The engine prices calls
 * the same way (backend/voice/costs.py).
 */
export function providerUsdPerMinute(provider: VoiceProvider, callType: VoiceAgentCallType, phone?: string): number | null {
    const rates = (VOICE_CALL_RATES.providers as Record<string, ProviderRates | undefined>)[provider];
    const country = phone ? rateCountry(phone) : 'US';
    const key = country === 'US' ? callType : country === 'IN' ? `${callType}_IN` : null;
    const rate = rates && key ? rates.usdPerMinute[key] : undefined;
    return rate === undefined ? null : rate + (rates?.extrasUsdPerMinute ?? 0);
}

/** A tool the agent has on, as the estimate prices it: booking, or a custom tool and the text it sends. */
export type CostTool = { kind: 'booking' } | { kind: 'custom'; name: string; chars: number };

export type AgentCostEstimate = {
    /** Prompt tokens Gemini reads every turn: the agent's words plus the engine's own sections (tools apart). */
    promptTokens: number;
    /** Gemini's talk time, before the prompt: nothing on a free-tier key. */
    geminiUsdPerMinute: number;
    /** What reading the prompt every turn adds. */
    promptUsdPerMinute: number;
    /** One row per tool: what it adds every turn plus its uses, spread over a typical call. */
    tools: { tool: CostTool; tokens: number; usesPerCall: number; usdPerMinute: number }[];
    /** One row per provider the agent is on; `usdPerMinute` null when its rate is not published. */
    providers: { provider: VoiceProvider; usdPerMinute: number | null }[];
    /** Every line together, with the dearest known provider. */
    usdPerMinute: number;
    typicalCallMinutes: number;
};

/**
 * What a minute with an agent should cost before any call, as a bill: Gemini's talk time, the prompt
 * (read again every turn), each tool (its text every turn, and its uses: the answer read as text and
 * the line held open while it runs), and the phone at the providers' list rates. Gemini parts are
 * free on a free-tier key.
 */
export function estimateAgentCost(input: {
    /** The prompt as written. */
    promptChars: number;
    freeTier: boolean;
    callType: VoiceAgentCallType;
    providers: VoiceProvider[];
    /** Where the calls go (or the number called); the US when unknown. */
    phone?: string;
    /** The tools that are on. Absent: not counted. */
    tools?: CostTool[];
}): AgentCostEstimate {
    const model = VOICE_CALL_RATES.estimate;
    const per = model.tools;
    const { usdPerMillionTokens } = VOICE_CALL_RATES.gemini;
    const gemini = input.freeTier ? 0 : 1;
    const providers = [...new Set(input.providers)].map((provider) => ({
        provider,
        usdPerMinute: providerUsdPerMinute(provider, input.callType, input.phone),
    }));
    const phoneUsdPerMinute = Math.max(0, ...providers.map((p) => p.usdPerMinute ?? 0));

    const tokens = (chars: number) => Math.ceil(chars / model.charsPerToken);
    const promptTokens = tokens(input.promptChars) + model.engineTokens;
    const geminiUsdPerMinute = gemini * model.geminiUsdPerMinute;
    const promptUsdPerMinute = gemini * promptTokens * model.geminiUsdPerPromptTokenMinute;
    const useTextUsd =
        (per.useTextInTokens * usdPerMillionTokens.textIn + per.useTextOutTokens * usdPerMillionTokens.textOut) / 1e6;
    const tools = (input.tools ?? []).map((tool) => {
        const kind = tool.kind;
        const toolTokens = tokens(kind === 'booking' ? per.bookingChars : per.toolBaseChars + tool.chars);
        // Each use: its text, and the seconds the line is held open (Gemini and the phone both run).
        const useUsd =
            gemini * useTextUsd +
            (per.useSeconds[kind] / 60) * (geminiUsdPerMinute + promptUsdPerMinute + phoneUsdPerMinute);
        return {
            tool,
            tokens: toolTokens,
            usesPerCall: per.usesPerCall[kind],
            usdPerMinute:
                gemini * toolTokens * model.geminiUsdPerPromptTokenMinute +
                (per.usesPerCall[kind] * useUsd) / model.typicalCallMinutes,
        };
    });
    return {
        promptTokens,
        geminiUsdPerMinute,
        promptUsdPerMinute,
        tools,
        providers,
        usdPerMinute:
            geminiUsdPerMinute + promptUsdPerMinute + tools.reduce((sum, t) => sum + t.usdPerMinute, 0) + phoneUsdPerMinute,
        typicalCallMinutes: model.typicalCallMinutes,
    };
}

/** What the post-call analysis should cost a call on the owner's key: a typical call's tokens at list price, 0 on a free-tier key. */
export function estimateAnalysisCost(freeTier: boolean): number {
    if (freeTier) return 0;
    const { usdPerMillionTokens: price, estimateTokens: tokens } = VOICE_CALL_RATES.analysis;
    return (tokens.textIn * price.textIn + tokens.textOut * price.textOut) / 1e6;
}
