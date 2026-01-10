'use client';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * ZodFormBuilder is a component that renders a form based on a Zod schema.
 * It is a client component that uses the useForm hook from react-hook-form to manage the form state.
 */

import { zodResolver } from '@hookform/resolvers/zod';
import { z, ZodTypeAny } from 'zod';
import { FormProvider, useFieldArray, useForm, useFormContext } from 'react-hook-form';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardAction } from '../../ui/card';
import {
    Field,
    FieldContent,
    FieldDescription,
    FieldError,
    FieldGroup,
    FieldLabel,
    FieldLegend,
    FieldSet,
} from '../../ui/field';
import { enumToTitleCase, getFieldSingularLabel } from '@/helpers/string-helpers';
import { Textarea } from '../../ui/textarea';
import { cn } from '@/lib/utils';
import { ZodCheckboxField, ZodSelectField, ZodSwitchField, ZodSearchableMultiSelectField } from './ZodFieldComponents';
import { ZodMetaType } from './zod-meta-types';
import { OptionType } from '@/components/ui/searchable-select';
import { generateFieldLabel } from './helpers';
import { FieldController } from './FieldController';

type ZodFormFieldProps = {
    name: string;
    fieldInfo: ZodTypeAny;
    description?: string;
    isRequired?: boolean; // Allow overriding required status for unwrapped optional fields
};

// Helper to extract metadata from description
const extractMetadata = (description?: string) => {
    if (!description) return { cleanDescription: '', metadata: null };

    const metadataPattern = Object.values(ZodMetaType).join('|');
    const metadataMatch = description.match(new RegExp(`(${metadataPattern})`));
    const metadata = metadataMatch?.[1] as ZodMetaType | null;
    const cleanDescription = metadata ? description.replace(new RegExp(`${metadata},?\\s*`, 'g'), '').trim() : description;

    return { cleanDescription, metadata };
};

// Helper function to get default values for different field types
const getDefaultValue = (schema: ZodTypeAny): any => {
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

    // Handle ZodArray - check if it has a default, otherwise return empty array
    if (typeName === 'ZodArray') {
        // For arrays, we want to return an empty array by default
        // The user can add items using the "Add" button
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

// Helper to recursively get default values for object schemas
const getObjectDefaults = (schema: z.ZodObject<any>): Record<string, any> =>
    Object.keys(schema.shape).reduce((acc, key) => ({ ...acc, [key]: getDefaultValue(schema.shape[key]) }), {});

// Helper to render enum select field (reusable for both ZodEnum and ZodDefault with ZodEnum inner type)
const renderEnumField = (name: string, fieldInfo: ZodTypeAny, cleanDescription: string, isRequired: boolean) => {
    const options = fieldInfo._def.values.map((value: string) => enumToTitleCase(value));

    return (
        <FieldController
            name={name}
            render={({ value, invalid, errors, onChange }) => (
                <ZodSelectField
                    name={name}
                    description={cleanDescription}
                    value={value}
                    invalid={invalid}
                    errors={errors}
                    onChange={onChange}
                    options={options}
                    required={isRequired}
                />
            )}
        />
    );
};

const ZodArrayField = ({ name, fieldInfo, description }: ZodFormFieldProps) => {
    const { control } = useFormContext();
    const { fields, append, remove } = useFieldArray({ control, name });

    // Unwrap ZodDefault if present
    let unwrappedFieldInfo = fieldInfo;
    if (fieldInfo?._def?.typeName === 'ZodDefault') {
        unwrappedFieldInfo = fieldInfo._def.innerType;
    }

    const isRequired = !fieldInfo?.isOptional();
    const elementSchema = unwrappedFieldInfo?._def?.type;
    const elementTypeName = elementSchema?._def?.typeName;
    const { cleanDescription, metadata } = extractMetadata(description);

    // Handle array of enums with searchable multi-select
    if (elementTypeName === 'ZodEnum' && metadata === ZodMetaType.SEARCHABLE_MULTI_SELECT) {
        const options: OptionType[] = elementSchema._def.values.map((value: string) => ({
            value: value.toLowerCase(),
            label: enumToTitleCase(value),
        }));

        return (
            <FieldController
                name={name}
                render={({ value, invalid, errors, onChange }) => (
                    <ZodSearchableMultiSelectField
                        name={name}
                        description={cleanDescription}
                        values={value || []}
                        invalid={invalid}
                        errors={errors}
                        onChange={onChange}
                        options={options}
                        required={isRequired}
                    />
                )}
            />
        );
    }

    // Handle array of objects
    if (elementTypeName === 'ZodObject') {
        // Unwrap the element schema if it's wrapped in ZodDefault
        let unwrappedElementSchema = elementSchema;
        if (elementSchema?._def?.typeName === 'ZodDefault') {
            unwrappedElementSchema = elementSchema._def.innerType;
        }

        const objectShape = unwrappedElementSchema?.shape;

        // Safety check: ensure shape exists
        if (!objectShape || Object.keys(objectShape).length === 0) {
            return null;
        }

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

const ZodDefaultField = ({ name, fieldInfo, description }: ZodFormFieldProps) => {
    const fieldType = fieldInfo._def?.typeName;
    const isRequired = !fieldInfo?.isOptional();
    const { cleanDescription, metadata } = extractMetadata(description);

    switch (fieldType) {
        case 'ZodEnum':
            return renderEnumField(name, fieldInfo, cleanDescription, isRequired);

        case 'ZodBoolean': {
            const BooleanComponent = metadata === ZodMetaType.CHECKBOX ? ZodCheckboxField : ZodSwitchField;
            return (
                <FieldController
                    name={name}
                    render={({ value, invalid, errors, onChange }) => (
                        <BooleanComponent
                            name={name}
                            description={cleanDescription}
                            value={value}
                            invalid={invalid}
                            errors={errors}
                            onChange={onChange}
                            required={isRequired}
                        />
                    )}
                />
            );
        }

        case 'ZodArray':
            return <ZodArrayField name={name} fieldInfo={fieldInfo} description={description} />;

        default:
            // For other types (ZodString, ZodNumber, etc.), delegate to ZodFormField
            // This ensures that fields with defaults still render correctly
            return <ZodFormField name={name} fieldInfo={fieldInfo} description={description} isRequired={isRequired} />;
    }
};

const ZodFormField = ({ name, fieldInfo, description, isRequired: isRequiredProp }: ZodFormFieldProps) => {
    const fieldType = fieldInfo?._def?.typeName;
    const fieldDescription = description ?? fieldInfo?.description;
    const innerType = fieldInfo?._def?.innerType;
    const { cleanDescription, metadata } = extractMetadata(fieldDescription);
    const isRequired = isRequiredProp ?? !fieldInfo?.isOptional();

    switch (fieldType) {
        case 'ZodString': {
            const maxLength = (fieldInfo as any).maxLength;
            const isTextarea = maxLength && maxLength > 100;
            const fieldLabel = generateFieldLabel(name);

            return (
                <FieldController
                    name={name}
                    render={({ value, invalid, errors, onChange }) => (
                        <Field data-invalid={invalid}>
                            <FieldLabel required={isRequired} htmlFor={name}>
                                {fieldLabel}
                            </FieldLabel>
                            {cleanDescription && <FieldDescription>{cleanDescription}</FieldDescription>}
                            {isTextarea ? (
                                <Textarea
                                    value={value}
                                    onChange={onChange}
                                    className="min-h-10"
                                    id={name}
                                    aria-invalid={invalid}
                                    placeholder={`Type ${fieldLabel.toLowerCase()}`}
                                    required={isRequired}
                                />
                            ) : (
                                <Input
                                    value={value}
                                    onChange={onChange}
                                    id={name}
                                    aria-invalid={invalid}
                                    placeholder={`Type ${fieldLabel.toLowerCase()}`}
                                    required={isRequired}
                                />
                            )}
                            {invalid && <FieldError errors={[errors]} />}
                        </Field>
                    )}
                />
            );
        }

        case 'ZodNumber': {
            const fieldLabel = generateFieldLabel(name);
            return (
                <FieldController
                    name={name}
                    render={({ value, invalid, errors, onChange }) => (
                        <Field data-invalid={invalid}>
                            <FieldLabel required={isRequired} htmlFor={name}>
                                {fieldLabel}
                            </FieldLabel>
                            {cleanDescription && <FieldDescription>{cleanDescription}</FieldDescription>}
                            <Input
                                value={value}
                                onChange={(e) => onChange(e.target.valueAsNumber)}
                                type="number"
                                id={name}
                                aria-invalid={invalid}
                                placeholder={`Type ${fieldLabel.toLowerCase()}`}
                                required={isRequired}
                            />
                            {invalid && <FieldError errors={[errors]} />}
                        </Field>
                    )}
                />
            );
        }

        case 'ZodBoolean': {
            const BooleanComponent = metadata === ZodMetaType.CHECKBOX ? ZodCheckboxField : ZodSwitchField;
            return (
                <FieldController
                    name={name}
                    render={({ value, invalid, errors, onChange }) => (
                        <BooleanComponent
                            name={name}
                            description={cleanDescription}
                            value={value}
                            invalid={invalid}
                            errors={errors}
                            onChange={onChange}
                            required={isRequired}
                        />
                    )}
                />
            );
        }

        case 'ZodEnum':
            return renderEnumField(name, fieldInfo, cleanDescription, isRequired);

        case 'ZodDefault':
            return <ZodDefaultField name={name} fieldInfo={innerType} description={fieldDescription} />;

        case 'ZodOptional':
            return <ZodFormField name={name} fieldInfo={innerType} isRequired={false} />;

        case 'ZodArray':
            return <ZodArrayField name={name} fieldInfo={fieldInfo} description={fieldDescription} />;

        default:
            return null;
    }
};

type ZodFormBuilderProps<T extends z.ZodObject<z.ZodRawShape>> = {
    schema: T;
    formName: string;
    className?: string;
    onSubmit: (data: z.infer<T>) => void;
};

export const ZodFormBuilder = <T extends z.ZodObject<z.ZodRawShape>>({
    schema,
    formName,
    className,
    onSubmit,
}: ZodFormBuilderProps<T>) => {
    const form = useForm<z.infer<T>>({
        resolver: zodResolver(schema),
        defaultValues: getObjectDefaults(schema) as any,
    });

    return (
        <FormProvider {...form}>
            <form
                className={cn('space-y-3 h-full w-full p-1', className)}
                id={formName}
                onSubmit={form.handleSubmit(onSubmit)}
            >
                {Object.entries(schema.shape).map(([key, value]) => (
                    <ZodFormField key={key} name={key} fieldInfo={value} />
                ))}
                <div className="flex gap-3">
                    <Button type="button" variant="outline" onClick={() => form.reset()} className="flex-1 sm:flex-none">
                        Reset
                    </Button>
                    <Button type="submit" className="flex-1 sm:flex-none">
                        Submit
                    </Button>
                </div>
            </form>
        </FormProvider>
    );
};
