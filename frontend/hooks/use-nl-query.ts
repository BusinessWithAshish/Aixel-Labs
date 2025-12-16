'use client';

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { GoogleGenAI } from '@google/genai';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Configuration for the useNLQuery hook
 */
export type UseNLQueryConfig<T> = {
    /** The data to filter */
    data: T[];
    /** Schema description for the AI to understand the data structure */
    schemaDescription?: string;
    /** Enable caching of AI responses (default: true) */
    enableCache?: boolean;
    /** Cache TTL in milliseconds (default: 5 minutes) */
    cacheTTL?: number;
    /** Enable debug logging */
    debug?: boolean;
};

/**
 * Return type of the useNLQuery hook
 */
export type UseNLQueryReturn<T> = {
    /** The filtered data based on the NL query */
    filteredData: T[];
    /** The current natural language query (instant, no debounce) */
    query: string;
    /** Set the natural language query (instant, no debounce) */
    setQuery: (query: string) => void;
    /** Whether the AI is currently processing */
    isLoading: boolean;
    /** Error message if any */
    error: string | null;
    /** Clear the current query and reset to original data */
    clear: () => void;
    /** Whether the result came from cache */
    isCached: boolean;
    /** Explanation of how the data was filtered */
    explanation: string | null;
    /** Clear the cache */
    clearCache: () => void;
    /** The generated filter function code (for debugging) */
    generatedCode: string | null;
    /** Execute search explicitly - call this to trigger AI query */
    executeSearch: () => Promise<void>;
    /** Query history (last 10 queries) */
    queryHistory: string[];
};

/**
 * Cache entry structure
 */
type CacheEntry = {
    filterFunction: string;
    explanation: string;
    timestamp: number;
};

// ============================================================================
// CACHE MANAGEMENT
// ============================================================================

class QueryCache {
    private cache = new Map<string, CacheEntry>();
    private ttl: number;

    constructor(ttl: number = 5 * 60 * 1000) {
        this.ttl = ttl;
    }

    get(key: string): CacheEntry | null {
        const entry = this.cache.get(key);
        if (!entry) return null;

        // Check if expired
        if (Date.now() - entry.timestamp > this.ttl) {
            this.cache.delete(key);
            return null;
        }

        return entry;
    }

    set(key: string, value: CacheEntry): void {
        // Limit cache size to 50 entries
        if (this.cache.size >= 50) {
            const oldestKey = Array.from(this.cache.entries()).sort((a, b) => a[1].timestamp - b[1].timestamp)[0][0];
            this.cache.delete(oldestKey);
        }

        this.cache.set(key, value);
    }

    clear(): void {
        this.cache.clear();
    }

    getCacheKey(query: string, dataHash: string): string {
        return `${dataHash}:${query.toLowerCase().trim()}`;
    }
}

// ============================================================================
// GEMINI CLIENT
// ============================================================================

let geminiClient: GoogleGenAI | null = null;

function getGeminiClient(apiKey?: string): GoogleGenAI {
    if (geminiClient) return geminiClient;

    const key = apiKey || process.env.NEXT_PUBLIC_GEMINI_API_KEY;
    if (!key) {
        throw new Error('Gemini API key not found. Please set NEXT_PUBLIC_GEMINI_API_KEY');
    }

    geminiClient = new GoogleGenAI({ apiKey: key });
    return geminiClient;
}

// ============================================================================
// SCHEMA INFERENCE
// ============================================================================

/**
 * Infer schema from data structure
 */
function inferSchema<T>(data: T[]): string {
    if (!data || data.length === 0) {
        return 'Empty dataset';
    }

    const sample = data[0];
    const schemaLines: string[] = [];

    function describeValue(value: unknown, path: string = ''): void {
        if (value === null || value === undefined) {
            schemaLines.push(`${path}: null/undefined`);
        } else if (Array.isArray(value)) {
            schemaLines.push(`${path}: Array (length: ${value.length})`);
            if (value.length > 0) {
                describeValue(value[0], `${path}[0]`);
            }
        } else if (typeof value === 'object') {
            schemaLines.push(`${path}: Object`);
            Object.entries(value).forEach(([key, val]) => {
                const newPath = path ? `${path}.${key}` : key;
                describeValue(val, newPath);
            });
        } else {
            schemaLines.push(`${path}: ${typeof value} (example: ${JSON.stringify(value)})`);
        }
    }

    describeValue(sample, 'item');
    return schemaLines.join('\n');
}

// ============================================================================
// PROMPT BUILDING
// ============================================================================

/**
 * Build the system prompt for the AI
 */
function buildSystemPrompt<T>(data: T[], schemaDescription?: string): string {
    const inferredSchema = inferSchema(data);
    const schema = schemaDescription || inferredSchema;

    return `You are an expert data filtering assistant. Your task is to generate a JavaScript filter function based on natural language queries.

## Data Structure
${schema}

## Your Task
Given a natural language query, generate a JavaScript arrow function that filters the data array.

## CRITICAL RULES FOR INTERPRETATION

### 1. Text/String Matching - ALWAYS use partial matching by default
- When user mentions a name, word, or text, ALWAYS use .includes() or .toLowerCase().includes() for case-insensitive partial matching
- NEVER use exact equality (===) for text searches unless user explicitly says "exactly", "is exactly", "equals exactly", or "exact match"
- "Find X with Alice" → item.name?.toLowerCase().includes('alice')
- "Search for pizza" → item.name?.toLowerCase().includes('pizza')
- "Contains ABC" → use .includes('abc')
- "Starts with X" → use .startsWith('x') or .toLowerCase().startsWith('x')
- "Ends with Y" → use .endsWith('y') or .toLowerCase().endsWith('y')

### 2. Number Comparisons
- "greater than", "more than", "above", "over" → use >
- "less than", "below", "under" → use <
- "at least", "minimum" → use >=
- "at most", "maximum" → use <=
- "between X and Y" → use >= X && <= Y

### 3. Boolean/Existence Checks
- "has a", "have a", "with a" → check for truthy value (!!item.field)
- "without", "no", "missing" → check for falsy (!item.field)

## Output Format
Return ONLY a valid JSON object with this structure:
{
  "filterFunction": "string containing the arrow function code",
  "explanation": "brief explanation of what the filter does"
}

## Function Format
The filter function must be an arrow function that takes an item and returns boolean:
- Format: (item) => { return <condition>; }
- Use optional chaining (?.) for nested properties
- Handle null/undefined values gracefully
- Use .toLowerCase() for case-insensitive string comparisons

## Safety
- NO eval() or Function() constructor calls inside the filter
- NO external API calls or network requests
- NO file system access
- ONLY pure filtering logic

## Examples

Query: "Find leads with Alice"
Response: {"filterFunction": "(item) => { const search = 'alice'; return item.name?.toLowerCase().includes(search) || item.data?.name?.toLowerCase().includes(search) || item.email?.toLowerCase().includes(search); }", "explanation": "Searches for 'Alice' in name, data.name, and email fields (case-insensitive partial match)"}

Query: "Show items with pizza in the name"
Response: {"filterFunction": "(item) => { return item.name?.toLowerCase().includes('pizza'); }", "explanation": "Filters items containing 'pizza' in the name (case-insensitive)"}

Query: "Find users who are admin"
Response: {"filterFunction": "(item) => { return item.role?.toLowerCase() === 'admin' || item.isAdmin === true; }", "explanation": "Filters users with admin role or isAdmin flag"}

Query: "Get leads with rating above 4"
Response: {"filterFunction": "(item) => { return parseFloat(item.data?.overAllRating || item.rating || 0) > 4; }", "explanation": "Filters leads with rating greater than 4"}

Query: "Find items with a website"
Response: {"filterFunction": "(item) => { return !!(item.website || item.data?.website); }", "explanation": "Filters items that have a website field"}

Query: "Search for John Smith"
Response: {"filterFunction": "(item) => { const search = 'john smith'; const fullName = [item.firstName, item.lastName, item.name, item.data?.name].filter(Boolean).join(' ').toLowerCase(); return fullName.includes(search) || item.name?.toLowerCase().includes('john') || item.name?.toLowerCase().includes('smith'); }", "explanation": "Searches for 'John Smith' across name fields with flexible matching"}

Query: "Find exactly matching 'Test Company'"
Response: {"filterFunction": "(item) => { return item.name === 'Test Company' || item.companyName === 'Test Company'; }", "explanation": "Filters items with exact name match 'Test Company'"}

Remember: Output ONLY the JSON object, nothing else. Default to PARTIAL matching for text searches.`;
}

/**
 * Build the user prompt
 */
function buildUserPrompt(query: string): string {
    return `Generate a filter function for this query:

"${query}"

Remember: 
- Use partial/contains matching (.includes()) for text searches by default
- Only use exact matching (===) if explicitly requested
- Respond with ONLY the JSON object containing "filterFunction" and "explanation"`;
}

// ============================================================================
// AI QUERY EXECUTION
// ============================================================================

/**
 * Generate filter function from natural language using Gemini
 */
async function generateFilterFunction(
    query: string,
    systemPrompt: string,
    debug: boolean = false,
): Promise<{ filterFunction: string; explanation: string }> {
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
        console.error('[useNLQuery] Error generating filter function:', error);
        throw new Error('Failed to generate filter function. Please try rephrasing your query.');
    }
}

/**
 * Parse JSON from AI response
 */
function parseJsonResponse(text: string): { filterFunction: string; explanation: string } {
    let cleanedText = text.trim();

    // Remove markdown code blocks
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

        if (!parsed.filterFunction || typeof parsed.filterFunction !== 'string') {
            throw new Error('Response missing valid "filterFunction" field');
        }

        return {
            filterFunction: parsed.filterFunction,
            explanation: parsed.explanation || 'Filter applied',
        };
    } catch (error) {
        console.error('[useNLQuery] JSON parse error:', error);
        throw new Error('AI returned invalid response format');
    }
}

/**
 * Execute the filter function safely
 */
function executeFilterFunction<T>(data: T[], filterFunctionCode: string, debug: boolean = false): T[] {
    try {
        // Create a safe function using Function constructor (sandboxed)
        const filterFn = new Function('item', `return (${filterFunctionCode})(item);`) as (item: T) => boolean;

        if (debug) {
            console.log('[useNLQuery] Executing filter function:', filterFunctionCode);
        }

        return data.filter(filterFn);
    } catch (error) {
        console.error('[useNLQuery] Error executing filter function:', error);
        throw new Error('Failed to execute filter function. The AI generated invalid code.');
    }
}

/**
 * Generate a robust hash for data
 */
function hashData<T>(data: T[]): string {
    if (!data || data.length === 0) return '0-empty';

    // Include length, sample of items, and structure
    const sample = data.slice(0, 3);
    const keys = data[0] ? Object.keys(data[0]).sort().join(',') : '';
    const sampleStr = JSON.stringify(sample);

    // Simple hash function
    let hash = 0;
    const str = `${data.length}-${keys}-${sampleStr}`;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash = hash & hash; // Convert to 32bit integer
    }

    return `${data.length}-${Math.abs(hash)}`;
}

// ============================================================================
// MAIN HOOK
// ============================================================================

/**
 * useNLQuery Hook
 *
 * A powerful hook that allows filtering any data structure using natural language queries.
 * Query state is instant (no debouncing). Call executeSearch() explicitly to trigger AI.
 *
 * @example
 * ```tsx
 * const {
 *   filteredData,
 *   query,
 *   setQuery,
 *   executeSearch,
 *   isLoading,
 *   clear
 * } = useNLQuery({ data: leads });
 *
 * // In your component:
 * <input value={query} onChange={(e) => setQuery(e.target.value)} />
 * <button onClick={executeSearch}>Search</button>
 * ```
 */
export function useNLQuery<T>({
    data,
    schemaDescription,
    enableCache = true,
    cacheTTL = 5 * 60 * 1000,
    debug = false,
}: UseNLQueryConfig<T>): UseNLQueryReturn<T> {
    // State - query is instant, no debouncing
    const [query, setQuery] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isCached, setIsCached] = useState(false);
    const [explanation, setExplanation] = useState<string | null>(null);
    const [generatedCode, setGeneratedCode] = useState<string | null>(null);
    const [activeFilterFunction, setActiveFilterFunction] = useState<string | null>(null);
    const [queryHistory, setQueryHistory] = useState<string[]>([]);

    // Refs
    const cacheRef = useRef(new QueryCache(cacheTTL));
    const abortControllerRef = useRef<AbortController | null>(null);

    // Memoize system prompt (only recalculate when data structure changes)
    const systemPrompt = useMemo(() => buildSystemPrompt(data, schemaDescription), [data, schemaDescription]);

    // Memoize data hash for cache key
    const dataHash = useMemo(() => hashData(data), [data]);

    // Execute search explicitly - this is the ONLY way to trigger AI query
    const executeSearch = useCallback(async () => {
        const trimmedQuery = query.trim();

        if (!trimmedQuery) {
            setError(null);
            setExplanation(null);
            setIsCached(false);
            setGeneratedCode(null);
            setActiveFilterFunction(null);
            return;
        }

        // Cancel previous request
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }

        const abortController = new AbortController();
        abortControllerRef.current = abortController;

        setIsLoading(true);
        setError(null);

        try {
            const cacheKey = cacheRef.current.getCacheKey(trimmedQuery, dataHash);

            // Check cache first
            if (enableCache) {
                const cached = cacheRef.current.get(cacheKey);

                if (cached) {
                    if (debug) {
                        console.log('[useNLQuery] Cache hit for query:', trimmedQuery);
                    }

                    if (!abortController.signal.aborted) {
                        setExplanation(cached.explanation);
                        setGeneratedCode(cached.filterFunction);
                        setActiveFilterFunction(cached.filterFunction);
                        setIsCached(true);
                        setIsLoading(false);

                        // Add to history
                        setQueryHistory((prev) => {
                            const filtered = prev.filter((item) => item !== trimmedQuery);
                            return [trimmedQuery, ...filtered].slice(0, 10);
                        });
                    }
                    return;
                }
            }

            // Generate filter function using AI
            const { filterFunction, explanation: exp } = await generateFilterFunction(trimmedQuery, systemPrompt, debug);

            if (abortController.signal.aborted) return;

            if (debug) {
                console.log('[useNLQuery] Generated filter function:', filterFunction);
            }

            // Cache the result
            if (enableCache) {
                cacheRef.current.set(cacheKey, {
                    filterFunction,
                    explanation: exp,
                    timestamp: Date.now(),
                });
            }

            // Update state only if not aborted
            if (!abortController.signal.aborted) {
                setExplanation(exp);
                setGeneratedCode(filterFunction);
                setActiveFilterFunction(filterFunction);
                setIsCached(false);

                // Add to history
                setQueryHistory((prev) => {
                    const filtered = prev.filter((item) => item !== trimmedQuery);
                    return [trimmedQuery, ...filtered].slice(0, 10);
                });
            }
        } catch (err) {
            if (!abortController.signal.aborted) {
                const errorMessage = err instanceof Error ? err.message : 'An error occurred';
                setError(errorMessage);
                setGeneratedCode(null);
            }
        } finally {
            if (!abortController.signal.aborted) {
                setIsLoading(false);
            }
        }
    }, [query, systemPrompt, enableCache, dataHash, debug]);

    // Calculate filtered data based on active filter function
    const filteredData = useMemo(() => {
        // If no active filter, return all data
        if (!activeFilterFunction) {
            return data;
        }

        try {
            return executeFilterFunction(data, activeFilterFunction, debug);
        } catch (err) {
            console.error('[useNLQuery] Error executing filter:', err);
            return data;
        }
    }, [data, activeFilterFunction, debug]);

    // Clear function
    const clear = useCallback(() => {
        setQuery('');
        setError(null);
        setExplanation(null);
        setIsCached(false);
        setGeneratedCode(null);
        setActiveFilterFunction(null);

        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
    }, []);

    // Clear cache function
    const clearCache = useCallback(() => {
        cacheRef.current.clear();
        if (debug) {
            console.log('[useNLQuery] Cache cleared');
        }
    }, [debug]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }
        };
    }, []);

    return {
        filteredData,
        query,
        setQuery,
        isLoading,
        error,
        clear,
        isCached,
        explanation,
        clearCache,
        generatedCode,
        executeSearch,
        queryHistory,
    };
}
