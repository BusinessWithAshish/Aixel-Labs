export const enumToTitleCase = (enumValue: string) => {
    return enumValue
        .split('_')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
};
