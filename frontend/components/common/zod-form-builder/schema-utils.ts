/* eslint-disable @typescript-eslint/no-explicit-any */
import { z, ZodTypeAny } from 'zod';
import { ZodMetaType } from './zod-meta-types';
import { OptionType } from '@/components/ui/searchable-select';
import { enumToTitleCase } from '@/helpers/string-helpers';

/**
 * Extracts metadata and clean description from a field description string
 * Removes both metadata tags and options from the description
 */
export const extractMetadata = (description?: string) => {
    if (!description) return { cleanDescription: '', metadata: null };

    const metadataPattern = Object.values(ZodMetaType).join('|');
    const metadataMatch = description.match(new RegExp(`(${metadataPattern})`));
    const metadata = metadataMatch?.[1] as ZodMetaType | null;
    
    // Remove metadata tag
    let cleanDescription = metadata ? description.replace(new RegExp(`${metadata},?\\s*`, 'g'), '').trim() : description;
    
    // Remove options part: "options: [...]"
    cleanDescription = cleanDescription.replace(/,?\s*options:\s*\[([^\]]+)\]/i, '').trim();
    
    // Clean up any leading/trailing commas or whitespace
    cleanDescription = cleanDescription.replace(/^,\s*|,\s*$/g, '').trim();

    return { cleanDescription, metadata };
};

/**
 * Parses options from description string in format: "options: [value1, value2, value3]"
 */
export const parseOptionsFromDescription = (description?: string): OptionType[] | null => {
    if (!description) return null;

    const optionsMatch = description.match(/options:\s*\[([^\]]+)\]/i);
    if (!optionsMatch) return null;

    const optionValues = optionsMatch[1].split(',').map((v) => v.trim());
    return optionValues.map((value) => ({
        value: value,
        label: enumToTitleCase(value),
    }));
};

/**
 * Converts enum values to OptionType array
 */
export const enumToOptions = (values: string[]): OptionType[] => {
    return values.map((value) => ({
        value: value.toLowerCase(),
        label: enumToTitleCase(value),
    }));
};

/**
 * Unwraps ZodDefault wrapper to get the inner type
 */
export const unwrapDefault = (fieldInfo: ZodTypeAny): ZodTypeAny => {
    if (fieldInfo?._def?.typeName === 'ZodDefault') {
        return fieldInfo._def.innerType;
    }
    return fieldInfo;
};

/**
 * Gets the default value for a field based on its schema type
 */
export const getDefaultValue = (schema: ZodTypeAny): any => {
    if (!schema) return '';

    const typeName = schema?._def?.typeName;

    // Handle ZodDefault first - it has the actual default
    if (typeName === 'ZodDefault') {
        return schema._def.defaultValue?.();
    }

    // Unwrap ZodOptional to check if there's a default inside
    if (typeName === 'ZodOptional') {
        const innerSchema = schema._def.innerType;
        if (innerSchema._def.typeName === 'ZodDefault') {
            return innerSchema._def.defaultValue?.();
        }
        // If no default inside optional, return the primitive default
        return getDefaultValue(innerSchema);
    }

    // Handle ZodObject recursively
    if (typeName === 'ZodObject') {
        const objectSchema = schema as z.ZodObject<any>;
        return Object.keys(objectSchema.shape).reduce(
            (acc, key) => ({ ...acc, [key]: getDefaultValue(objectSchema.shape[key]) }),
            {},
        );
    }

    // Handle ZodArray - return empty array by default
    if (typeName === 'ZodArray') {
        return [];
    }

    // Primitive defaults
    const defaultValueMap: Record<string, any> = {
        ZodString: '',
        ZodNumber: 0,
        ZodBoolean: false,
        ZodEnum: schema._def.values?.[0],
    };

    return defaultValueMap[typeName] ?? '';
};

/**
 * Recursively gets default values for object schemas
 */
export const getObjectDefaults = (schema: z.ZodObject<any>): Record<string, any> =>
    Object.keys(schema.shape).reduce((acc, key) => ({ ...acc, [key]: getDefaultValue(schema.shape[key]) }), {});
