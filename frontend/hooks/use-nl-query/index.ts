// ============================================================================
// USE NL QUERY - Natural Language Query Hook
// ============================================================================
// A powerful hook for filtering and sorting data using natural language queries.
// The AI generates a single transform function that handles both operations.
//
// Supports queries like:
// - "find all leads from tech companies"
// - "sort by score high to low"
// - "show users with rating above 4 ordered by name"
// - "get active items from newest to oldest"
// ============================================================================

// Main hook
export { useNLQuery } from './use-nl-query';

// Types
export type { UseNLQueryConfig, UseNLQueryReturn, QueryResult, CacheEntry, ValidationResult } from './types';

// Utilities (exported for advanced usage)
export { hashData, detectSortingIntent, isComplexQuery, debounce, truncate } from './utils';

// Schema inference (exported for advanced usage)
export { inferSchema, extractSortableFields, getFieldInfo } from './schema-inference';

// Validation (exported for testing/advanced usage)
export { validateTransformFunction } from './query-execution';

// Cache (exported for advanced usage)
export { QueryCache } from './cache';
