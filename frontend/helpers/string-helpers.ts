export const enumToTitleCase = (enumValue: string) => {
    return enumValue
        .split('_')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
};

export const toTitleCase = (string: string) => {
    return string.charAt(0).toUpperCase() + string.slice(1).toLowerCase();
};

// Helper to detect the casing format of a string
const detectCase = (str: string): 'snake' | 'kebab' | 'camel' | 'pascal' | 'title' | 'unknown' => {
    if (str.includes('_')) return 'snake'; // snake_case
    if (str.includes('-')) return 'kebab'; // kebab-case
    if (str.includes(' ')) return 'title'; // Title Case or space separated
    if (/^[A-Z]/.test(str) && /[a-z]/.test(str) && /[A-Z].*[A-Z]/.test(str)) return 'pascal'; // PascalCase
    if (/^[a-z]/.test(str) && /[A-Z]/.test(str)) return 'camel'; // camelCase
    return 'unknown';
};

// Helper to split a string based on its casing format
const splitByCasing = (str: string): string[] => {
    const caseType = detectCase(str);

    switch (caseType) {
        case 'snake':
            return str.split('_');
        case 'kebab':
            return str.split('-');
        case 'title':
            return str.split(' ');
        case 'camel':
        case 'pascal':
            // Split on capital letters, keeping the capital with the following word
            return str.split(/(?=[A-Z])/).filter(Boolean);
        default:
            return [str];
    }
};

// Convert any casing format to Title Case
export const caseConverter = (str: string): string => {
    const words = splitByCasing(str);
    return words.map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ');
};

/**
 * Extract the last part of a dotted field path and convert to singular title case
 * Useful for generating "Add" button labels from field paths
 *
 * @example
 * getFieldSingularLabel('socialAccounts') => 'Social Account'
 * getFieldSingularLabel('users.0.posts') => 'Post'
 * getFieldSingularLabel('items.5.subItems') => 'Sub Item'
 */
export const getFieldSingularLabel = (fieldPath: string): string => {
    const parts = fieldPath.split('.');
    const lastPart = parts[parts.length - 1];
    const singular = lastPart.replace(/s$/, '');
    return caseConverter(singular);
};
