// ============================================================================
// SCHEMA INFERENCE - Infer schema from data structure
// ============================================================================

/**
 * Field information for schema analysis
 */
export type FieldInfo = {
    path: string;
    type: string;
    isNumeric: boolean;
    isDate: boolean;
    isSortable: boolean;
    example: unknown;
};

/**
 * Infer schema from data structure with rich type information
 * The AI uses this to understand field types for sorting and filtering
 */
export function inferSchema<T>(data: T[]): string {
    if (!data || data.length === 0) {
        return 'Empty dataset';
    }

    const sample = data[0];
    const schemaLines: string[] = [];

    function describeValue(value: unknown, path: string = ''): void {
        if (value === null || value === undefined) {
            schemaLines.push(`${path}: null/undefined [not sortable]`);
        } else if (Array.isArray(value)) {
            schemaLines.push(`${path}: Array[${value.length}] [sortable by length, numeric]`);
            if (value.length > 0) {
                describeValue(value[0], `${path}[0]`);
            }
        } else if (typeof value === 'object') {
            Object.entries(value).forEach(([key, val]) => {
                const newPath = path ? `${path}.${key}` : key;
                describeValue(val, newPath);
            });
        } else if (typeof value === 'number') {
            schemaLines.push(`${path}: number = ${value} [sortable, numeric, use parseFloat for comparison]`);
        } else if (typeof value === 'string') {
            // Check if it looks like a date
            const isDateString =
                !isNaN(Date.parse(value)) && (value.includes('-') || value.includes('/') || value.includes('T'));
            // Check if it looks like a numeric string
            const isNumericString = !isNaN(parseFloat(value)) && isFinite(Number(value));

            if (isDateString) {
                schemaLines.push(`${path}: string (date) = "${value}" [sortable, date, use new Date() for comparison]`);
            } else if (isNumericString) {
                schemaLines.push(
                    `${path}: string (numeric) = "${value}" [sortable, numeric, use parseFloat for comparison]`,
                );
            } else {
                schemaLines.push(
                    `${path}: string = "${value.slice(0, 50)}${
                        value.length > 50 ? '...' : ''
                    }" [sortable, text, use localeCompare]`,
                );
            }
        } else if (typeof value === 'boolean') {
            schemaLines.push(`${path}: boolean = ${value} [sortable, true > false]`);
        }
    }

    describeValue(sample, 'item');
    return schemaLines.join('\n');
}

/**
 * Extract sortable fields from a data structure
 * Returns a list of fields that can be used for sorting
 */
export function extractSortableFields<T>(data: T[]): FieldInfo[] {
    if (!data || data.length === 0) {
        return [];
    }

    const fields: FieldInfo[] = [];
    const sample = data[0];

    function analyzeField(value: unknown, path: string): void {
        if (value === null || value === undefined) {
            return;
        }

        if (Array.isArray(value)) {
            fields.push({
                path,
                type: 'array',
                isNumeric: true, // Sort by length
                isDate: false,
                isSortable: true,
                example: value.length,
            });
        } else if (typeof value === 'object') {
            Object.entries(value).forEach(([key, val]) => {
                const newPath = path ? `${path}.${key}` : key;
                analyzeField(val, newPath);
            });
        } else if (typeof value === 'number') {
            fields.push({
                path,
                type: 'number',
                isNumeric: true,
                isDate: false,
                isSortable: true,
                example: value,
            });
        } else if (typeof value === 'string') {
            const isDateString =
                !isNaN(Date.parse(value)) && (value.includes('-') || value.includes('/') || value.includes('T'));
            const isNumericString = !isNaN(parseFloat(value)) && isFinite(Number(value));
            fields.push({
                path,
                type: 'string',
                isNumeric: isNumericString,
                isDate: isDateString,
                isSortable: true,
                example: value,
            });
        } else if (typeof value === 'boolean') {
            fields.push({
                path,
                type: 'boolean',
                isNumeric: false,
                isDate: false,
                isSortable: true,
                example: value,
            });
        }
    }

    analyzeField(sample, 'item');
    return fields;
}

/**
 * Get field info by path (used by filter executor to auto-detect isNumeric)
 */
export function getFieldInfo<T>(data: T[], fieldPath: string): FieldInfo | null {
    const fields = extractSortableFields(data);
    // Remove the 'item.' prefix if present for matching
    const normalizedPath = fieldPath.startsWith('item.') ? fieldPath : `item.${fieldPath}`;
    return fields.find((f) => f.path === normalizedPath || f.path === fieldPath) || null;
}
