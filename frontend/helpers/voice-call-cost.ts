import {
    VOICE_CALL_RATES,
    VOICE_DEFAULT_STACK,
    VoiceKeyProvider,
    VoiceStackKind,
    type VoiceStack,
    type VoiceStackCatalogue,
    type VoiceStackPartName,
    type VoiceAgentCallType,
    type VoiceCallCost,
    type VoiceProvider,
} from '@aixellabs/backend/db/types';
import { conversationUsdPerMinute, PIPELINE_PARTS, stackModel, VOICE_STACK_PART_LABELS } from '@/helpers/voice-stack';

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

const COST_PART_LABELS: Record<string, string> = {
    geminiUsd: 'Gemini',
    providerUsd: 'Phone',
    analysisUsd: 'Call analysis',
    sttUsd: 'Speech to text',
    llmUsd: 'Language model',
    ttsUsd: 'Voice',
};

/** "Gemini", "Phone", "Call analysis"; a part the engine adds later reads as its key without "Usd". */
export function costPartLabel(part: string): string {
    return COST_PART_LABELS[part] ?? part.replace(/Usd$/, '');
}

/** What a call's cost is made of, as kept: every `<part>Usd` amount but the total (the same rule as Analytics). */
export function costParts(cost: VoiceCallCost): { part: string; usd: number }[] {
    return Object.entries(cost).flatMap(([part, usd]) =>
        part !== 'totalUsd' && part.endsWith('Usd') && typeof usd === 'number' ? [{ part, usd }] : [],
    );
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
 * (a call out) or the number called (a call in); without one, the US rate; a softphone's `sip:` its SIP rate. The engine prices calls
 * the same way (backend/voice/costs.py).
 */
export function providerUsdPerMinute(provider: VoiceProvider, callType: VoiceAgentCallType, phone?: string): number | null {
    const rates = (VOICE_CALL_RATES.providers as Record<string, ProviderRates | undefined>)[provider];
    const country = phone ? rateCountry(phone) : 'US';
    const key = phone?.startsWith('sip:') ? 'SIP' : country === 'US' ? callType : country === 'IN' ? `${callType}_IN` : null;
    const rate = rates && key ? rates.usdPerMinute[key] : undefined;
    return rate === undefined ? null : rate + (rates?.extrasUsdPerMinute ?? 0);
}

/** A tool the agent has on, as the estimate prices it: booking, or a custom tool and the text it sends. */
export type CostTool = { kind: 'booking' } | { kind: 'custom'; name: string; chars: number };

/** One line of the bill: the voice model, or one part of a pipeline. */
export type AgentCostLine = { label: string; detail: string; usdPerMinute: number };

export type AgentCostEstimate = {
    /** Prompt tokens read every turn: the agent's words plus the engine's own sections (tools apart). */
    promptTokens: number;
    /** What the voice stack costs: a realtime model's talk time, conversation and prompt, or a pipeline's three parts. */
    stack: AgentCostLine[];
    /** One row per tool: what it adds every turn plus its uses, spread over a typical call. */
    tools: { tool: CostTool; tokens: number; usesPerCall: number; usdPerMinute: number }[];
    /** One row per provider the agent is on; `usdPerMinute` null when its rate is not published. */
    providers: { provider: VoiceProvider; usdPerMinute: number | null }[];
    /** Every line together, with the dearest known provider. */
    usdPerMinute: number;
    typicalCallMinutes: number;
    /** A realtime model re-reads the whole conversation every turn: longer calls cost more a minute. */
    growsWithLength: boolean;
};

/**
 * What a minute with an agent should cost before any call, as a bill: the voice stack (a realtime
 * model's talk time, the conversation so far and its prompt, both read again every turn, on a typical
 * call; or a pipeline's speech to text, thinking
 * and text to speech), each tool (its text every turn, and its uses: the answer read as text and the
 * line held open while it runs), and the phone at the providers' list rates. Gemini parts are free
 * on a free-tier key.
 */
export function estimateAgentCost(input: {
    /** The prompt as written. */
    promptChars: number;
    /** The agent's Gemini key is on Google's free tier. */
    freeTier: boolean;
    callType: VoiceAgentCallType;
    providers: VoiceProvider[];
    /** Where the calls go (or the number called); the US when unknown. */
    phone?: string;
    /** The tools that are on. Absent: not counted. */
    tools?: CostTool[];
    /** What its calls run on. Absent: the default (Gemini Live). */
    stack?: VoiceStack<unknown>;
    /** Where the stack's models are priced. Absent: voice-call-rates.json's models. */
    catalogue?: VoiceStackCatalogue;
}): AgentCostEstimate {
    const model = VOICE_CALL_RATES.estimate;
    const per = model.tools;
    const { usdPerMillionTokens } = VOICE_CALL_RATES.gemini;
    const stack = input.stack ?? VOICE_DEFAULT_STACK;
    const paid = (provider: VoiceKeyProvider) => (input.freeTier && provider === VoiceKeyProvider.GEMINI ? 0 : 1);
    const providers = [...new Set(input.providers)].map((provider) => ({
        provider,
        usdPerMinute: providerUsdPerMinute(provider, input.callType, input.phone),
    }));
    const phoneUsdPerMinute = Math.max(0, ...providers.map((p) => p.usdPerMinute ?? 0));

    const tokens = (chars: number) => Math.ceil(chars / model.charsPerToken);
    const promptTokens = tokens(input.promptChars) + model.engineTokens;
    const name = (part: VoiceStackPartName, id: string) => stackModel(part, id, input.catalogue)?.name ?? id;
    const rate = (part: VoiceStackPartName, id: string) => stackModel(part, id, input.catalogue)?.usdPerMinute ?? 0;

    // What one prompt token read every turn costs a minute, on the model that reads it.
    let thinker: VoiceKeyProvider;
    let tokenUsdPerMinute: number;
    let lines: AgentCostLine[];
    if (stack.kind === VoiceStackKind.REALTIME) {
        thinker = stack.provider;
        // Measured on Gemini 3.8 Live; another live model reads its prompt at its own text-in price.
        const price = stackModel('realtime', stack.model, input.catalogue)?.price;
        const textIn =
            price && 'usdPerMillionTokens' in price && 'textIn' in price.usdPerMillionTokens
                ? price.usdPerMillionTokens.textIn
                : usdPerMillionTokens.textIn;
        tokenUsdPerMinute = (paid(thinker) * model.geminiUsdPerPromptTokenMinute * textIn) / usdPerMillionTokens.textIn;
        lines = [
            {
                label: name('realtime', stack.model),
                detail: paid(thinker) ? 'talk time' : 'free-tier key',
                usdPerMinute: paid(thinker) * rate('realtime', stack.model),
            },
            {
                label: 'Conversation so far',
                detail: 're-read every turn',
                usdPerMinute: paid(thinker) * conversationUsdPerMinute(stackModel('realtime', stack.model, input.catalogue)),
            },
            {
                label: 'Prompt',
                detail: `${promptTokens.toLocaleString('en-US')} tokens, read every turn`,
                usdPerMinute: promptTokens * tokenUsdPerMinute,
            },
        ];
    } else {
        thinker = stack.llm.provider;
        // shortcut: an LLM's list rate assumes llmTokensPerTurn read a turn; scaled linearly by the prompt. Upgrade with per-token prices.
        tokenUsdPerMinute = (paid(thinker) * rate('llm', stack.llm.model)) / model.llmTokensPerTurn;
        lines = PIPELINE_PARTS.map((part) => {
            const { provider, model: id } = stack[part];
            const llm = part === 'llm';
            return {
                label: VOICE_STACK_PART_LABELS[part].title,
                detail: `${name(part, id)}${llm ? `, ${promptTokens.toLocaleString('en-US')} tokens a turn` : ''}${paid(provider) ? '' : ', free-tier key'}`,
                usdPerMinute: llm ? promptTokens * tokenUsdPerMinute : paid(provider) * rate(part, id),
            };
        });
    }
    const stackUsdPerMinute = lines.reduce((sum, line) => sum + line.usdPerMinute, 0);

    const useTextUsd =
        (paid(thinker) *
            (per.useTextInTokens * usdPerMillionTokens.textIn + per.useTextOutTokens * usdPerMillionTokens.textOut)) /
        1e6;
    const tools = (input.tools ?? []).map((tool) => {
        const kind = tool.kind;
        const toolTokens = tokens(kind === 'booking' ? per.bookingChars : per.toolBaseChars + tool.chars);
        // Each use: its text, and the seconds the line is held open (the stack and the phone both run).
        const useUsd = useTextUsd + (per.useSeconds[kind] / 60) * (stackUsdPerMinute + phoneUsdPerMinute);
        return {
            tool,
            tokens: toolTokens,
            usesPerCall: per.usesPerCall[kind],
            usdPerMinute: toolTokens * tokenUsdPerMinute + (per.usesPerCall[kind] * useUsd) / model.typicalCallMinutes,
        };
    });
    return {
        promptTokens,
        stack: lines,
        tools,
        providers,
        usdPerMinute: stackUsdPerMinute + tools.reduce((sum, t) => sum + t.usdPerMinute, 0) + phoneUsdPerMinute,
        typicalCallMinutes: model.typicalCallMinutes,
        growsWithLength: stack.kind === VoiceStackKind.REALTIME,
    };
}

/** What the post-call analysis should cost a call on the owner's key: a typical call's tokens at list price, 0 on a free-tier key. */
export function estimateAnalysisCost(freeTier: boolean): number {
    if (freeTier) return 0;
    const { usdPerMillionTokens: price, estimateTokens: tokens } = VOICE_CALL_RATES.analysis;
    return (tokens.textIn * price.textIn + tokens.textOut * price.textOut) / 1e6;
}
