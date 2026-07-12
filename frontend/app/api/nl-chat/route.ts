import { NextResponse } from 'next/server';
import { getAppSession } from '@/lib/auth/session';
import { NL_CHAT_MAX_TURNS, NL_CHAT_MODULES } from '@/hooks/use-nl-chat/constants';
import { checkRateLimit } from './rate-limiter';
import { runAgentTurn, type AgentRequest } from './agent';

export const maxDuration = 60;

function isAgentRequest(body: unknown): body is AgentRequest {
    if (!body || typeof body !== 'object') return false;
    const o = body as Record<string, unknown>;
    return (
        typeof o.key === 'string' &&
        NL_CHAT_MODULES.has(o.key as AgentRequest['key']) &&
        Array.isArray(o.messages) &&
        o.messages.length > 0 &&
        (o.messages[o.messages.length - 1] as { role?: string } | undefined)?.role === 'user' &&
        typeof o.draft === 'object' &&
        o.draft !== null
    );
}

export async function POST(req: Request) {
    const session = await getAppSession();
    if (!session?.user?.id) return new NextResponse('Unauthorized', { status: 401 });

    const rl = checkRateLimit(session.user.id);
    if (!rl.allowed) {
        return NextResponse.json(
            { error: `Too many requests. Wait ${Math.ceil(rl.retryAfterMs / 1000)}s.` },
            { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) } },
        );
    }

    const body = await req.json().catch(() => null);
    if (!isAgentRequest(body)) {
        return new NextResponse('Invalid request body', { status: 400 });
    }

    const turnsUsed = Math.ceil(body.messages.length / 2);
    if (turnsUsed > NL_CHAT_MAX_TURNS) {
        return NextResponse.json({ error: 'Turn limit reached. Start a new chat.' }, { status: 400 });
    }

    const result = await runAgentTurn(body);
    return NextResponse.json(result);
}
