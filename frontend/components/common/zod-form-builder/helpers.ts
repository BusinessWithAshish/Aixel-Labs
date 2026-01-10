import { caseConverter } from '@/helpers/string-helpers';

/**
 * Generate user-friendly field labels based on field path
 * Handles simple fields, array primitives, and nested object properties
 */
export const generateFieldLabel = (fieldPath: string): string => {
    const parts = fieldPath.split('.');

    // Simple field: just convert case
    if (parts.length === 1) {
        return caseConverter(parts[0]);
    }

    // Array of primitives: "Field Name (Level 0)"
    if (parts.length === 2) {
        const [fieldName, index] = parts;
        return `${caseConverter(fieldName)} (Level ${index})`;
    }

    // Array of objects: just show property name
    if (parts.length === 3) {
        const [, , propertyName] = parts;
        return caseConverter(propertyName);
    }

    // Fallback for deeper nesting
    return caseConverter(parts[parts.length - 1]);
};