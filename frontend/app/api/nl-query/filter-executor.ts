// ============================================================================
// TRANSFORM EXECUTOR - Safe execution of transform functions
// ============================================================================

/**
 * Execute the transform function safely
 * The function takes the full data array and returns the transformed result
 */
export function executeTransformFunction<T>(data: T[], transformFunctionCode: string, debug: boolean = false): T[] {
    try {
        if (debug) {
            console.log('[useNLQuery] Executing transform function:', transformFunctionCode);
        }

        // Create a safe function using Function constructor
        // The function receives 'data' as a parameter and should return transformed data
        const transformFn = new Function('data', `return (${transformFunctionCode})(data);`) as (data: T[]) => T[];

        // Execute with a copy of the data to prevent mutations
        const result = transformFn([...data]);

        // Validate the result is an array
        if (!Array.isArray(result)) {
            console.error('[useNLQuery] Transform function did not return an array');
            return data;
        }

        if (debug) {
            console.log('[useNLQuery] Transform result count:', result.length);
        }

        return result;
    } catch (error) {
        console.error('[useNLQuery] Error executing transform function:', error);
        // Return original data on error rather than throwing
        return data;
    }
}
