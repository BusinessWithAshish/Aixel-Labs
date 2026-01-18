import { ZodTypeAny } from 'zod';
import { useFieldArray, useFormContext } from 'react-hook-form';
import { Button } from '../../ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardAction } from '../../ui/card';
import { FieldSet, FieldLegend, FieldDescription, FieldContent, FieldGroup } from '../../ui/field';
import { generateFieldLabel } from './helpers';
import { getFieldSingularLabel } from '@/helpers/string-helpers';
import { extractMetadata, parseOptionsFromDescription, enumToOptions, unwrapDefault, getDefaultValue } from './schema-utils';
import { ZodMetaType } from './zod-meta-types';
import { renderSearchableMultiSelectField } from './field-renderers';

type ZodArrayFieldProps = {
    name: string;
    fieldInfo: ZodTypeAny;
    description?: string;
};

/**
 * Renders an array field with support for:
 * - Arrays of enums with searchable multi-select
 * - Arrays of strings with searchable multi-select
 * - Arrays of objects with nested fields
 * - Arrays of primitives with add/remove functionality
 */
export const ZodArrayField = ({ name, fieldInfo, description }: ZodArrayFieldProps) => {
    const { control } = useFormContext();
    const { fields, append, remove } = useFieldArray({ control, name });

    const unwrappedFieldInfo = unwrapDefault(fieldInfo);
    const isRequired = !fieldInfo?.isOptional();
    const elementSchema = unwrappedFieldInfo?._def?.type;
    const elementTypeName = elementSchema?._def?.typeName;
    const { cleanDescription, metadata } = extractMetadata(description);

    // Handle array of enums with searchable multi-select
    if (elementTypeName === 'ZodEnum' && metadata === ZodMetaType.SEARCHABLE_MULTI_SELECT) {
        const options = enumToOptions(elementSchema._def.values);
        return renderSearchableMultiSelectField({ name, fieldInfo, cleanDescription, metadata, isRequired, options });
    }

    // Handle array of strings with searchable multi-select
    if (elementTypeName === 'ZodString' && metadata === ZodMetaType.SEARCHABLE_MULTI_SELECT) {
        const options = parseOptionsFromDescription(description);
        if (options) {
            return renderSearchableMultiSelectField({ name, fieldInfo, cleanDescription, metadata, isRequired, options });
        }
    }

    // Handle array of objects
    if (elementTypeName === 'ZodObject') {
        const unwrappedElementSchema = unwrapDefault(elementSchema);
        const objectShape = (unwrappedElementSchema as any)?.shape;

        // Safety check: ensure shape exists
        if (!objectShape || Object.keys(objectShape).length === 0) {
            return null;
        }

        // Import ZodFormField dynamically to avoid circular dependency
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const ZodFormField = require('./ZodFormBuilder')?.ZodFormField;

        return (
            <FieldSet className="gap-4">
                <FieldLegend variant="label">{generateFieldLabel(name)}</FieldLegend>
                {cleanDescription && <FieldDescription>{cleanDescription}</FieldDescription>}
                <FieldContent className="space-y-4">
                    {fields.map((field, index) => (
                        <Card key={field.id}>
                            <CardHeader>
                                <CardTitle>
                                    {generateFieldLabel(name)} {index + 1}
                                </CardTitle>
                                <CardAction>
                                    <Button type="button" variant="destructive" size="sm" onClick={() => remove(index)}>
                                        Remove
                                    </Button>
                                </CardAction>
                            </CardHeader>
                            <CardContent>
                                <FieldGroup className="gap-4">
                                    {Object.entries(objectShape).map(([key, value]) => {
                                        const fieldInfo = value as ZodTypeAny;
                                        const fieldDescription = fieldInfo?.description;
                                        return (
                                            <ZodFormField
                                                key={key}
                                                name={`${name}.${index}.${key}`}
                                                fieldInfo={fieldInfo}
                                                description={fieldDescription}
                                            />
                                        );
                                    })}
                                </FieldGroup>
                            </CardContent>
                        </Card>
                    ))}
                    <Button
                        type="button"
                        variant="secondary"
                        onClick={() => append(getDefaultValue(unwrappedElementSchema))}
                        className="w-full"
                    >
                        + Add {getFieldSingularLabel(name)}
                    </Button>
                </FieldContent>
            </FieldSet>
        );
    }

    // Default array handling for primitives
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ZodFormField = require('./ZodFormBuilder')?.ZodFormField;

    return (
        <FieldSet className="gap-4">
            <FieldLegend variant="label">{generateFieldLabel(name)}</FieldLegend>
            {cleanDescription && <FieldDescription>{cleanDescription}</FieldDescription>}
            <FieldContent className="space-y-3">
                {fields.map((field, index) => (
                    <div key={field.id} className="flex gap-2 items-baseline-last">
                        <ZodFormField name={`${name}.${index}`} fieldInfo={elementSchema} />
                        <Button type="button" variant="destructive" size="sm" onClick={() => remove(index)}>
                            Remove
                        </Button>
                    </div>
                ))}
                <Button
                    type="button"
                    variant="secondary"
                    onClick={() => append(getDefaultValue(elementSchema))}
                    className="w-full"
                >
                    + Add Item
                </Button>
            </FieldContent>
        </FieldSet>
    );
};
