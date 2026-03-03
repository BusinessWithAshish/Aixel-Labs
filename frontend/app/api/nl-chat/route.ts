import { ToolLoopAgent, createAgentUIStreamResponse, tool, stepCountIs } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { auth } from '@/auth';
import { getTaskConfig } from './prompts';
import { checkRateLimit } from './rate-limiter';

const google = createGoogleGenerativeAI({
    apiKey: process.env.NEXT_PUBLIC_GEMINI_API_KEY,
});

export const maxDuration = 60;

// --- conversation limits ---------------------------------------------------
const MAX_MESSAGES = 30;
const URGENCY_THRESHOLD = 20;

const URGENCY_ADDENDUM = `

## URGENT — Conversation is too long
You have been chatting for too many turns. You MUST call the submitLeadData tool RIGHT NOW with whatever information you have collected so far.
- For any required field you still do not have, use an empty string ("") for text fields or an empty array ([]) for list fields.
- Do NOT ask any more questions. Submit immediately.`;

export async function POST(req: Request) {
    // ---- auth --------------------------------------------------------------
    const session = await auth();
    if (!session?.user?.id) {
        return new Response('Unauthorized', { status: 401 });
    }

    // ---- rate limit --------------------------------------------------------
    const rl = checkRateLimit(session.user.id);
    if (!rl.allowed) {
        return new Response(
            JSON.stringify({
                error: `Too many requests. Please wait ${Math.ceil(rl.retryAfterMs / 1000)}s and try again.`,
            }),
            { status: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) } },
        );
    }

    // ---- parse body --------------------------------------------------------
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
        return new Response('Invalid request body', { status: 400 });
    }

    const { messages, taskType } = body as { messages: unknown[]; taskType: string };

    // ---- task config -------------------------------------------------------
    const config = getTaskConfig(taskType);
    if (!config) {
        return new Response(`Unknown task type: ${taskType}`, { status: 400 });
    }

    // ---- conversation length guard (server-side hard limit) ----------------
    const messageCount = Array.isArray(messages) ? messages.length : 0;
    if (messageCount > MAX_MESSAGES) {
        return new Response(
            JSON.stringify({
                error: 'Conversation limit reached. Please start a new chat.',
            }),
            { status: 400, headers: { 'Content-Type': 'application/json' } },
        );
    }

    // ---- dynamic instructions — inject urgency when conversation is long ---
    let instructions = config.prompt;
    if (messageCount >= URGENCY_THRESHOLD) {
        instructions += URGENCY_ADDENDUM;
    }

    // ---- build agent -------------------------------------------------------
    const agent = new ToolLoopAgent({
        model: google('gemini-2.0-flash'),
        instructions,
        temperature: 0.3,
        tools: {
            submitLeadData: tool({
                description:
                    'Call this tool ONLY when you have collected ALL required information from the user and the user has confirmed the details. ' +
                    'Submits the structured lead generation parameters for processing.',
                inputSchema: config.schema,
            }),
        },
        stopWhen: stepCountIs(15),

        // Context window safety: if the model-level message array somehow grows
        // very large (shouldn't happen with the 30-message cap, but belt + suspenders),
        // keep the system message and the most recent turns.
        prepareStep: async ({ messages: modelMessages }) => {
            if (modelMessages.length > 40) {
                return {
                    messages: [
                        modelMessages[0],
                        ...modelMessages.slice(-20),
                    ],
                };
            }
            return {};
        },
    });

    // ---- stream response ---------------------------------------------------
    return createAgentUIStreamResponse({
        agent,
        uiMessages: messages,
        onError: (error) => {
            if (error instanceof Error) return error.message;
            if (typeof error === 'string') return error;
            return 'An unexpected error occurred. Please try again.';
        },
    });
}
