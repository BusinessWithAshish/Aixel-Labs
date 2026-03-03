// ============================================================================
// PROMPT BUILDER - Build system and user prompts for the AI
// ============================================================================

import { inferSchema } from './schema-inference';
import { NLQuerySystemPrompt, NLQuerySystemPromptPlaceholders } from './system-prompt';

/**
 * Build the system prompt for the AI
 * Generates a single transform function that handles sorting AND filtering
 */
export function buildSystemPrompt<T>(data: T[]): string {
    const schemaDescription = inferSchema(data);
    const sampleData = data
        .slice(0, 2)
        .map((item) => JSON.stringify(item, null, 2))
        .join('\n\n');

    const systemPrompt = NLQuerySystemPrompt.replace(
        NLQuerySystemPromptPlaceholders.SCHEMA_DESCRIPTION,
        schemaDescription,
    ).replace(NLQuerySystemPromptPlaceholders.SAMPLE_DATA, sampleData);

    return systemPrompt;
}

const userPrompt = `Transform the data based on this request:

"${NLQuerySystemPromptPlaceholders.USER_QUERY}"

Think about:
1. Does the user want to FILTER (find specific items)?
2. Does the user want to SORT (order items)?
3. What field names from the schema match the user's intent?

Return ONLY the JSON object with "transformFunction" and "explanation".`;

/**
 * Build the user prompt
 */
export function buildUserPrompt(query: string): string {
    return userPrompt.replace(NLQuerySystemPromptPlaceholders.USER_QUERY, query);
}
