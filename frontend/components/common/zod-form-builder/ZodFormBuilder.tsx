'use client';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * ZodFormBuilder is a component that renders a form based on a Zod schema.
 * It is a client component that uses the useForm hook from react-hook-form to manage the form state.
 */

import { zodResolver } from '@hookform/resolvers/zod';
import { z, ZodTypeAny } from 'zod';
import { FormProvider, useForm } from 'react-hook-form';
import { Button } from '../../ui/button';
import { cn } from '@/lib/utils';
import { extractMetadata, parseOptionsFromDescription, getObjectDefaults, unwrapDefault } from './schema-utils';
import { ZodMetaType } from './zod-meta-types';
import {
    SearchableSelectControlledField,
    StringControlledField,
    NumberControlledField,
    BooleanControlledField,
    EnumControlledField,
    StringArrayControlledField,
} from './ZodControlledFields';
import { ZodArrayField } from './ZodArrayField';
import { enumToTitleCase } from '@/helpers/string-helpers';

type ZodFormFieldProps = {
    name: string;
    fieldInfo: ZodTypeAny;
    description?: string;
    isRequired?: boolean; // Allow overriding required status for unwrapped optional fields
};

/**
 * Handles fields wrapped in ZodDefault
 * Delegates to appropriate renderer based on inner type
 */
const ZodDefaultField = ({ name, fieldInfo, description }: ZodFormFieldProps) => {
    const fieldType = fieldInfo._def?.typeName;
    const isRequired = !fieldInfo?.isOptional();
    const { cleanDescription, metadata } = extractMetadata(description);

    const renderProps = { name, fieldInfo, cleanDescription, metadata, isRequired };

    switch (fieldType) {
        case 'ZodEnum':
            const options = fieldInfo._def.values.map((value: string) => enumToTitleCase(value));
            return <EnumControlledField {...renderProps} options={options} metadata={metadata} />;

        case 'ZodBoolean':
            return <BooleanControlledField {...renderProps} />;

        case 'ZodArray':
            return <ZodArrayField name={name} fieldInfo={fieldInfo} description={description} />;

        default:
            // For other types (ZodString, ZodNumber, etc.), delegate to ZodFormField
            return <ZodFormField name={name} fieldInfo={fieldInfo} description={description} isRequired={isRequired} />;
    }
};

/**
 * Main field renderer that delegates to appropriate field type renderer
 * Handles all Zod field types and wrapper types (Optional, Default, Array)
 */
export const ZodFormField = ({ name, fieldInfo, description, isRequired: isRequiredProp }: ZodFormFieldProps) => {
    const fieldType = fieldInfo?._def?.typeName;
    const fieldDescription = description ?? fieldInfo?.description;
    const innerType = fieldInfo?._def?.innerType;
    const { cleanDescription, metadata } = extractMetadata(fieldDescription);
    const isRequired = isRequiredProp ?? !fieldInfo?.isOptional();

    const renderProps = { name, fieldInfo, cleanDescription, metadata, isRequired };

    switch (fieldType) {
        case 'ZodString': {
            if (metadata === ZodMetaType.SEARCHABLE_SELECT) {
                const options = parseOptionsFromDescription(fieldDescription);
                if (options) return <SearchableSelectControlledField {...renderProps} options={options} />;
            }
            return <StringControlledField {...renderProps} />;
        }

        case 'ZodNumber':
            return <NumberControlledField {...renderProps} />;

        case 'ZodBoolean':
            return <BooleanControlledField {...renderProps} />;

        case 'ZodEnum':
            const options = fieldInfo._def.values.map((value: string) => enumToTitleCase(value));
            return <EnumControlledField {...renderProps} options={options} metadata={metadata} />;

        case 'ZodDefault':
            return <ZodDefaultField name={name} fieldInfo={innerType} description={fieldDescription} />;

        case 'ZodOptional':
            return <ZodFormField name={name} fieldInfo={innerType} isRequired={false} />;

        case 'ZodArray': {
            const unwrappedFieldInfo = unwrapDefault(fieldInfo);
            const elementSchema = unwrappedFieldInfo?._def?.type;
            const elementTypeName = elementSchema?._def?.typeName;

            // Use StringArrayControlledField for arrays of strings
            if (elementTypeName === 'ZodString') {
                return <StringArrayControlledField {...renderProps} />;
            }

            // Fall back to ZodArrayField for other array types (objects, enums with multi-select, etc.)
            return <ZodArrayField name={name} fieldInfo={fieldInfo} description={fieldDescription} />;
        }

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
