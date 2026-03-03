import { NextRequest, NextResponse } from 'next/server';
import { generateQueryResult, validateTransformFunction } from './query-execution';
import { buildSystemPrompt } from './prompt-builder';
import { z } from 'zod';
import { executeTransformFunction } from './filter-executor';
import { auth } from '@/auth';

const nlQueryAPIInputSchema = z.object({
    query: z.string().min(1),
    data: z.array(z.unknown()),
    debug: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
    try {
        const session = await auth();

        if (!session?.user?.id) {
            return NextResponse.json({ error: 'You must be logged in to use the NL Query API' }, { status: 401 });
        }

        const body = nlQueryAPIInputSchema.safeParse(await req.json());

        if (!body.success) {
            return NextResponse.json({ error: 'NL Query API input is invalid' }, { status: 400 });
        }

        const { query, data, debug } = body.data;

        const trimmedQuery = query.trim();
        if (!trimmedQuery) {
            return NextResponse.json({ error: 'Query must be a non-empty string' }, { status: 400 });
        }

        const systemPrompt = buildSystemPrompt(data);
        const result = await generateQueryResult(trimmedQuery, systemPrompt, Boolean(debug));

        const validation = validateTransformFunction(result.transformFunction);
        if (!validation.valid) {
            return NextResponse.json({ error: 'Failed to generate query. Please try again.' }, { status: 400 });
        }

        const transformedData = executeTransformFunction(data, result.transformFunction, debug);
        return NextResponse.json(transformedData, { status: 200 });
    } catch (error) {
        console.error('[api/nl-query] Error handling request', error);
        return NextResponse.json({ error: 'Failed to generate query. Please try again.' }, { status: 500 });
    }
}
