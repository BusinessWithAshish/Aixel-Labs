import { convertToModelMessages, Output, streamText } from 'ai';
import type { LanguageModel, UIMessage } from 'ai';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { z } from 'zod';
import { NL_CHAT_MAX_TURNS } from '@/hooks/use-nl-chat/constants';
import { buildSystemPrompt, TASK_REGISTRY, type NlChatModule, type ServerPhase, type TurnModelOutput } from './registry';

export type AgentRequest = {
    key: NlChatModule;
    messages: UIMessage[];
    draft: Record<string, unknown>;
};

export type AgentResponse = {
    message: string;
    draft: Record<string, unknown>;
    phase: ServerPhase;
    issues: string[];
};

function validationIssues(schema: z.ZodTypeAny, draft: Record<string, unknown>): string[] {
    const result = schema.safeParse(draft);
    return result.success ? [] : result.error.issues.map((i) => i.message);
}

function deepMerge(
    base: Record<string, unknown>,
    patch: Record<string, unknown> | undefined | null,
): Record<string, unknown> {
    if (!patch) return base;
    const next = { ...base };
    for (const [k, v] of Object.entries(patch)) {
        if (v === undefined) continue;
        if (v === null) {
            delete next[k];
            continue;
        }
        if (
            typeof v === 'object' &&
            !Array.isArray(v) &&
            typeof next[k] === 'object' &&
            next[k] !== null &&
            !Array.isArray(next[k])
        ) {
            next[k] = deepMerge(next[k] as Record<string, unknown>, v as Record<string, unknown>);
        } else {
            next[k] = v;
        }
    }
    return next;
}

function reconcilePhase(
    schema: z.ZodTypeAny,
    draft: Record<string, unknown>,
    modelStatus: ServerPhase,
): { phase: ServerPhase; issues: string[] } {
    const issues = validationIssues(schema, draft);
    const isValid = issues.length === 0;

    if (!isValid) return { phase: 'collecting', issues };
    if (modelStatus === 'ready') return { phase: 'ready', issues: [] };
    return { phase: 'collecting', issues: [] };
}

const openrouter = createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY });

/**
 * Ordered list of models to try. Each failed attempt moves to the next one,
 * so a rate-limited free model automatically falls over to the backup.
 */
const MODEL_CHAIN: LanguageModel[] = [
    openrouter.chat('moonshotai/kimi-k2.6:free'),
    openrouter.chat('google/gemini-2.0-flash-exp:free'),
    openrouter.chat('meta-llama/llama-3.3-70b-instruct:free'),
];

async function callModel(
    system: string,
    messages: UIMessage[],
    schema: z.ZodTypeAny,
    model: LanguageModel,
): Promise<TurnModelOutput> {
    const modelMessages = await convertToModelMessages(messages);
    const result = await streamText({
        model,
        system,
        messages: modelMessages,
        output: Output.object({ schema }),
        temperature: 0.3,
    });
    // result.output is PromiseLike — await it so rejections propagate into the retry catch
    return (await result.output) as TurnModelOutput;
}

const FALLBACK_MESSAGE =
    "I'm having a little trouble understanding that. Could you rephrase? I'm here to help you set up your search.";

export async function runAgentTurn(req: AgentRequest): Promise<AgentResponse> {
    const config = TASK_REGISTRY[req.key];

    if (!config.implemented) {
        return {
            message: 'This module does not support natural language chat yet. Please use the form instead.',
            draft: req.draft,
            phase: 'collecting',
            issues: [],
        };
    }

    const turnsUsed = Math.ceil(req.messages.length / 2);
    const preIssues = validationIssues(config.requestSchema, req.draft);
    const systemPrompt = buildSystemPrompt(
        config.label,
        config.description,
        req.draft,
        preIssues,
        turnsUsed,
        NL_CHAT_MAX_TURNS,
    );

    let output: TurnModelOutput | null = null;

    for (let i = 0; i < MODEL_CHAIN.length; i++) {
        try {
            output = await callModel(systemPrompt, req.messages, config.turnSchema, MODEL_CHAIN[i]);
            break;
        } catch (err) {
            const label = (MODEL_CHAIN[i] as { modelId?: string }).modelId ?? `model[${i}]`;
            console.error(`[nl-chat] model[${i}] ${label} failed:`, err);
        }
    }

    if (!output) {
        return {
            message: FALLBACK_MESSAGE,
            draft: req.draft,
            phase: 'collecting',
            issues: preIssues,
        };
    }

    const mergedDraft = deepMerge(req.draft, output.draftUpdates as Record<string, unknown>);
    const { phase, issues } = reconcilePhase(config.requestSchema, mergedDraft, output.status);

    return {
        message: output.message,
        draft: mergedDraft,
        phase,
        issues,
    };
}
