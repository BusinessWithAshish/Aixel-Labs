import 'server-only';

// ============================================================================
// GEMINI CLIENT - Google Gemini AI client management
// ============================================================================

import { GoogleGenAI } from '@google/genai';

let geminiClient: GoogleGenAI | null = null;

/**
 * Get or create the Gemini client singleton
 */
export function getGeminiClient(apiKey?: string): GoogleGenAI {
    if (geminiClient) return geminiClient;

    const key = apiKey || process.env.GEMINI_API_KEY;
    if (!key) {
        throw new Error('Gemini API key not found. Please set GEMINI_API_KEY');
    }

    geminiClient = new GoogleGenAI({ apiKey: key });
    return geminiClient;
}

/**
 * Reset the Gemini client (useful for testing)
 */
export function resetGeminiClient(): void {
    geminiClient = null;
}
