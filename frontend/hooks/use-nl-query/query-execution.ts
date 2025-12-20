// ============================================================================
// QUERY EXECUTION - AI query execution and response parsing
// ============================================================================

import { getGeminiClient } from './gemini-client';
import { buildUserPrompt } from './prompt-builder';
import type { QueryResult, ValidationResult } from './types';

/**
 * Generate transform function from natural language using Gemini
 */
export async function generateQueryResult(
    query: string,
    systemPrompt: string,
    debug: boolean = false,
): Promise<QueryResult> {
    const client = getGeminiClient();
    const userPrompt = buildUserPrompt(query);
    const fullPrompt = `${systemPrompt}\n\n---\n\n${userPrompt}`;

    if (debug) {
        console.log('[useNLQuery] Sending prompt to Gemini:', fullPrompt);
    }

    try {
        const response = await client.models.generateContent({
            model: 'gemini-2.0-flash',
            contents: fullPrompt,
            config: {
                temperature: 0.1,
                maxOutputTokens: 1024,
            },
        });

        const responseText = response.text || '';

        if (debug) {
            console.log('[useNLQuery] Gemini response:', responseText);
        }

        // Parse JSON response
        const parsed = parseJsonResponse(responseText);
        return parsed;
    } catch (error) {
        console.error('[useNLQuery] Error generating transform function:', error);
        throw new Error('Failed to generate query. Please try rephrasing your request.');
    }
}

/**
 * Parse JSON from AI response
 */
export function parseJsonResponse(text: string): QueryResult {
    let cleanedText = text.trim();

    // Remove Markdown code blocks
    if (cleanedText.startsWith('```json')) {
        cleanedText = cleanedText.slice(7);
    } else if (cleanedText.startsWith('```')) {
        cleanedText = cleanedText.slice(3);
    }
    if (cleanedText.endsWith('```')) {
        cleanedText = cleanedText.slice(0, -3);
    }

    cleanedText = cleanedText.trim();

    // Find JSON object
    const jsonMatch = cleanedText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
        throw new Error('No valid JSON found in AI response');
    }

    try {
        const parsed = JSON.parse(jsonMatch[0]);

        // Support both old "filterFunction" and new "transformFunction" for compatibility
        const transformFunction = parsed.transformFunction || parsed.filterFunction;

        if (!transformFunction || typeof transformFunction !== 'string') {
            throw new Error('Response missing valid "transformFunction" field');
        }

        return {
            transformFunction,
            explanation: parsed.explanation || 'Query applied',
        };
    } catch (error) {
        console.error('[useNLQuery] JSON parse error:', error);
        throw new Error('AI returned invalid response format');
    }
}

/**
 * Validate AI-generated transform function code to prevent unsafe patterns
 */
export function validateTransformFunction(code: string): ValidationResult {
    const forbidden = [
        /\bimport\b/,
        /\brequire\b/,
        /\beval\b/,
        /\bFunction\s*\(/,
        /\bnew\s+Function\b/,
        /\bfetch\b/,
        /\bXMLHttpRequest\b/,
        /\bsetTimeout\b/,
        /\bsetInterval\b/,
        /\bwhile\s*\(/,
        /\bfor\s*\(/,
        /\.__proto__\b/,
        /\bprototype\b/,
        /\bwindow\b/,
        /\bdocument\b/,
        /\bprocess\b/,
        /\bglobal\b/,
        /\bglobalThis\b/,
        /\bconstructor\s*\[/,
        /\bconstructor\s*\(/,
        /\(a\+\)\+/,
        /\(a\*\)\*/,
        /\blocalStorage\b/,
        /\bsessionStorage\b/,
        /\bindexedDB\b/,
        /\blocation\b/,
        /\bhistory\b/,
        /\bnavigator\b/,
        /\bpostMessage\b/,
        /\bWorker\b/,
        /\bSharedWorker\b/,
        /\bcrypto\b/,
        /\$\{/,
        /\btry\s*\{/,
        /\bcatch\s*\(/,
        /\bawait\b/,
        /\basync\b/,
    ];

    // First check: ensure it starts with (data) =>
    if (!code.trim().startsWith('(data)')) {
        return { valid: false, error: 'Transform function must start with (data) =>' };
    }

    // Check forbidden patterns
    for (const pattern of forbidden) {
        if (pattern.test(code)) {
            return { valid: false, error: 'Forbidden pattern detected in generated function' };
        }
    }

    // Check for allowed array methods and reasonable structure
    const allowedMethods = ['.slice()', '.sort(', '.filter(', '.map(', '.find(', '.some(', '.every('];
    const hasArrayMethod = allowedMethods.some((method) => code.includes(method));
    const isPassThrough = code.includes('=> data') && !code.includes('.'); // Simple pass-through

    if (!hasArrayMethod && !isPassThrough) {
        // Allow if it's just returning data
        if (!code.match(/=>\s*data\s*$/)) {
            return { valid: false, error: 'Function must use array methods like .filter(), .sort(), etc.' };
        }
    }

    // Length check - allow slightly longer for combined operations
    if (code.length > 800) {
        return { valid: false, error: 'Generated function is too long (max 800 characters)' };
    }

    return { valid: true };
}
