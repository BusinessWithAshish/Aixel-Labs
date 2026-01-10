'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { z, ZodTypeAny } from 'zod';
import { Controller, FormProvider, useFieldArray, useForm, useFormContext } from 'react-hook-form';
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
import { enumToTitleCase, caseConverter } from '@/helpers/string-helpers';
import { Textarea } from '../../ui/textarea';
import { cn } from '@/lib/utils';
import { ZodCheckboxField, ZodSelectField, ZodSwitchField, ZodSearchableMultiSelectField } from './ZodFieldComponents';
import { ZodMetaType } from './zod-meta-types';
import { OptionType } from '@/components/ui/searchable-select';
import { generateFieldLabel } from './helpers';

type ZodFormFieldProps = {
    name: string;
    fieldInfo: ZodTypeAny;
    description?: string;
    isRequired?: boolean; // Allow overriding required status for unwrapped optional fields
};

// Helper to extract metadata from description
const extractMetadata = (description?: string) => {
    if (!description) return { cleanDescription: '', metadata: null };

    const metadataMatch = description.match(new RegExp(`(${Object.values(ZodMetaType).join('|')})`));
    const metadata = metadataMatch ? (metadataMatch[1] as ZodMetaType) : null;
    const cleanDescription = description.replace(new RegExp(`${metadata},?\\s*`, 'g'), '').trim();

    return { cleanDescription, metadata };
};

// Helper to recursively get default values for object schemas
// Reusable logic for both nested objects and form initialization
const getObjectDefaults = (schema: z.ZodObject<any>): Record<string, any> => {
    return Object.keys(schema.shape).reduce((acc, key) => {
        acc[key] = getDefaultValue(schema.shape[key]);
        return acc;
    }, {} as any);
};

// Helper function to get default values for different field types
const getDefaultValue = (schema: ZodTypeAny): any => {
    if (!schema) return '';

    const typeName = schema?._def?.typeName;

    switch (typeName) {
        case 'ZodString':
            return '';
        case 'ZodNumber':
            return 0;
        case 'ZodBoolean':
            return false;
        case 'ZodEnum':
            return schema._def.values[0];
        case 'ZodDefault':
            return schema._def.defaultValue();
        case 'ZodArray':
            return [];
        case 'ZodObject':
            return getObjectDefaults(schema as z.ZodObject<any>);
        default:
            return '';
    }
};

// Helper to render enum select field (reusable for both ZodEnum and ZodDefault with ZodEnum inner type)
const renderEnumField = (
    name: string,
    fieldInfo: ZodTypeAny,
    cleanDescription: string,
    form: ReturnType<typeof useFormContext>,
    isRequired: boolean,
) => {
    const options = fieldInfo._def.values.map((value: string) => enumToTitleCase(value));

    return (
        <Controller
            name={name}
            control={form.control}
            render={({ field, fieldState }) => (
                <ZodSelectField
                    name={name}
                    description={cleanDescription}
                    value={field.value}
                    invalid={fieldState.invalid}
                    errors={fieldState.error}
                    onChange={field.onChange}
                    options={options}
                    required={isRequired}
                />
            )}
        />
    );
};

const ZodArrayField = (props: ZodFormFieldProps) => {
    const { name, fieldInfo, description } = props;
    const form = useFormContext();

    const isRequired = !fieldInfo?.isOptional();

    // Get the schema for individual array elements
    const elementSchema = fieldInfo?._def?.type;
    const elementTypeName = elementSchema?._def?.typeName;
    const { cleanDescription, metadata } = extractMetadata(description);

    const { fields, append, remove } = useFieldArray({
        control: form.control,
        name: name,
    });

    // Handle array of enums with searchable multi-select
    if (elementTypeName === 'ZodEnum' && metadata === ZodMetaType.SEARCHABLE_MULTI_SELECT) {
        const options: OptionType[] = elementSchema._def.values.map((value: string) => ({
            value: value.toLowerCase(),
            label: enumToTitleCase(value),
        }));

        return (
            <Controller
                name={name}
                control={form.control}
                render={({ field, fieldState }) => (
                    <ZodSearchableMultiSelectField
                        name={name}
                        description={cleanDescription}
                        values={field.value || []}
                        invalid={fieldState.invalid}
                        errors={fieldState.error}
                        onChange={field.onChange}
                        options={options}
                        required={isRequired}
                    />
                )}
            />
        );
    }

    // Handle array of objects
    if (elementTypeName === 'ZodObject') {
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
                                    {Object.entries(elementSchema.shape).map(([key, value]) => (
                                        <ZodFormField
                                            key={key}
                                            name={`${name}.${index}.${key}`}
                                            fieldInfo={value as ZodTypeAny}
                                        />
                                    ))}
                                </FieldGroup>
                            </CardContent>
                        </Card>
                    ))}
                    <Button
                        type="button"
                        variant="secondary"
                        onClick={() => append(getDefaultValue(elementSchema))}
                        className="w-full"
                    >
                        + Add {caseConverter(name.replace(/s$/, ''))}
                    </Button>
                </FieldContent>
            </FieldSet>
        );
    }

    // Default array handling for primitives (string, number, boolean)
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

const ZodDefaultField = (props: ZodFormFieldProps) => {
    const { name, fieldInfo, description } = props;
    const form = useFormContext();

    const fieldType = fieldInfo._def?.typeName;
    const isRequired = !fieldInfo?.isOptional();
    const { cleanDescription, metadata } = extractMetadata(description);

    switch (fieldType) {
        case 'ZodEnum':
            return renderEnumField(name, fieldInfo, cleanDescription, form, isRequired);

        case 'ZodBoolean':
            if (metadata === ZodMetaType.CHECKBOX) {
                return (
                    <Controller
                        name={name}
                        control={form.control}
                        render={({ field, fieldState }) => (
                            <ZodCheckboxField
                                name={name}
                                description={cleanDescription}
                                value={field.value}
                                invalid={fieldState.invalid}
                                errors={fieldState.error}
                                onChange={field.onChange}
                                required={isRequired}
                            />
                        )}
                    />
                );
            }

            return (
                <Controller
                    name={name}
                    control={form.control}
                    render={({ field, fieldState }) => (
                        <ZodSwitchField
                            name={name}
                            description={cleanDescription}
                            value={field.value}
                            invalid={fieldState.invalid}
                            errors={fieldState.error}
                            onChange={field.onChange}
                            required={isRequired}
                        />
                    )}
                />
            );

        case 'ZodArray':
            return <ZodArrayField name={name} fieldInfo={fieldInfo} description={description} />;

        default:
            return null;
    }
};

const ZodFormField = (props: ZodFormFieldProps) => {
    const { name, fieldInfo, isRequired: isRequiredProp } = props;

    const form = useFormContext();

    const fieldType = fieldInfo?._def?.typeName;
    const fieldDescription = fieldInfo?.description;
    const innerType = fieldInfo?._def?.innerType;
    const { cleanDescription, metadata } = extractMetadata(fieldDescription);

    // Use provided isRequired prop if available, otherwise calculate from fieldInfo
    const isRequired = isRequiredProp !== undefined ? isRequiredProp : !fieldInfo?.isOptional();

    switch (fieldType) {
        case 'ZodString':
            const maxLength = (fieldInfo as any).maxLength;
            const isTextarea = maxLength && maxLength > 100;
            const fieldLabel = generateFieldLabel(name);

            return (
                <Controller
                    name={name}
                    control={form.control}
                    render={({ field, fieldState }) => (
                        <Field data-invalid={fieldState.invalid}>
                            <FieldLabel required={isRequired} htmlFor={name}>
                                {fieldLabel}
                            </FieldLabel>
                            {cleanDescription && <FieldDescription>{cleanDescription}</FieldDescription>}
                            {isTextarea ? (
                                <Textarea
                                    {...field}
                                    className="min-h-10"
                                    id={name}
                                    aria-invalid={fieldState.invalid}
                                    placeholder={`Type ${fieldLabel.toLowerCase()}`}
                                    required={isRequired}
                                />
                            ) : (
                                <Input
                                    {...field}
                                    id={name}
                                    aria-invalid={fieldState.invalid}
                                    placeholder={`Type ${fieldLabel.toLowerCase()}`}
                                    required={isRequired}
                                />
                            )}
                            {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                        </Field>
                    )}
                />
            );

        case 'ZodNumber':
            return (
                <Controller
                    name={name}
                    control={form.control}
                    render={({ field, fieldState }) => (
                        <Field data-invalid={fieldState.invalid}>
                            <FieldLabel required={isRequired} htmlFor={name}>
                                {generateFieldLabel(name)}
                            </FieldLabel>
                            {cleanDescription && <FieldDescription>{cleanDescription}</FieldDescription>}
                            <Input
                                {...field}
                                type="number"
                                id={name}
                                aria-invalid={fieldState.invalid}
                                placeholder={`Type ${generateFieldLabel(name).toLowerCase()}`}
                                required={isRequired}
                                onChange={(e) => field.onChange(e.target.valueAsNumber)}
                            />
                            {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                        </Field>
                    )}
                />
            );

        case 'ZodBoolean':
            const BooleanComponent = metadata === ZodMetaType.CHECKBOX ? ZodCheckboxField : ZodSwitchField;

            return (
                <Controller
                    name={name}
                    control={form.control}
                    render={({ field, fieldState }) => (
                        <BooleanComponent
                            name={name}
                            description={cleanDescription}
                            value={field.value}
                            invalid={fieldState.invalid}
                            errors={fieldState.error}
                            onChange={field.onChange}
                            required={isRequired}
                        />
                    )}
                />
            );

        case 'ZodEnum':
            return renderEnumField(name, fieldInfo, cleanDescription, form, isRequired);

        case 'ZodDefault':
            return <ZodDefaultField name={name} fieldInfo={innerType} description={fieldDescription} />;

        case 'ZodOptional':
            // Unwrap the optional type and render the inner field, preserving the optional status
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

export const ZodFormBuilder = <T extends z.ZodObject<z.ZodRawShape>>(props: ZodFormBuilderProps<T>) => {
    const { schema, formName, className, onSubmit } = props;
    const form = useForm<z.infer<T>>({
        resolver: zodResolver(schema),
        // Reuse the same logic as getObjectDefaults
        defaultValues: getObjectDefaults(schema) as any,
    });

    const formFields = schema.shape;

    return (
        <FormProvider {...form}>
            <form className={cn('space-y-3 h-full w-full', className)} id={formName} onSubmit={form.handleSubmit(onSubmit)}>
                {Object.entries(formFields).map(([key, value]) => {
                    return <ZodFormField key={key} name={key} fieldInfo={value} />;
                })}
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
