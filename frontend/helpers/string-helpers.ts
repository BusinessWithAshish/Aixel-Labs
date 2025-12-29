export const enumToPascalCase = (enumValue: string) => {
    return enumValue.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
};

export const enumToCamelCase = (enumValue: string) => {
    return enumValue.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toLowerCase());
};

export const enumToSnakeCase = (enumValue: string) => {
    return enumValue.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toLowerCase());
};

export const enumToKebabCase = (enumValue: string) => {
    return enumValue.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toLowerCase());
};

export const enumToTitleCase = (enumValue: string) => {
    return enumValue.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
};

export const enumToSentenceCase = (enumValue: string) => {
    return enumValue.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toLowerCase());
};

export const enumToLowerCase = (enumValue: string) => {
    return enumValue.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toLowerCase());
};

export const enumToUpperCase = (enumValue: string) => {
    return enumValue.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
};
