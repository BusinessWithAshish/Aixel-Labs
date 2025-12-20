// ============================================================================
// UTILITIES - Helper functions for the NL Query system
// ============================================================================

/**
 * Generate a robust hash for data to use as a cache key part
 */
export function hashData<T>(data: T[]): string {
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

/**
 * Truncate a string to a maximum length with ellipsis
 */
export function truncate(str: string, maxLength: number): string {
    if (str.length <= maxLength) return str;
    return str.slice(0, maxLength - 3) + '...';
}

/**
 * Debounce a function call
 */
export function debounce<T extends (...args: Parameters<T>) => ReturnType<T>>(
    func: T,
    wait: number,
): (...args: Parameters<T>) => void {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    return (...args: Parameters<T>): void => {
        if (timeoutId) {
            clearTimeout(timeoutId);
        }

        timeoutId = setTimeout(() => {
            func(...args);
        }, wait);
    };
}

/**
 * Check if a query likely contains sorting intent
 */
export function detectSortingIntent(query: string): boolean {
    const sortKeywords = [
        'sort',
        'order',
        'arrange',
        'rank',
        'highest',
        'lowest',
        'ascending',
        'descending',
        'asc',
        'desc',
        'top',
        'bottom',
        'first',
        'last',
        'from high to low',
        'from low to high',
        'a to z',
        'z to a',
        'newest',
        'oldest',
        'most',
        'least',
        'smallest',
        'largest',
        'biggest',
        'alphabetically',
        'chronologically',
    ];

    const lowerQuery = query.toLowerCase();
    return sortKeywords.some((keyword) => lowerQuery.includes(keyword));
}

/**
 * Check if a query is likely a complex query (filter + sort)
 */
export function isComplexQuery(query: string): boolean {
    const lowerQuery = query.toLowerCase();

    // Check for multiple operations
    const hasFilter =
        lowerQuery.includes('find') ||
        lowerQuery.includes('show') ||
        lowerQuery.includes('get') ||
        lowerQuery.includes('who') ||
        lowerQuery.includes('where') ||
        lowerQuery.includes('with');

    const hasSort = detectSortingIntent(query);

    // Check for multiple conditions
    const hasMultipleConditions = (lowerQuery.match(/\b(and|or|but|also|then)\b/g) || []).length > 0;

    return (hasFilter && hasSort) || hasMultipleConditions;
}
