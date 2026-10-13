import { cloneElement, ReactElement } from 'react';
import { Controller, useFormContext, FieldError as ReactHookFormFieldError } from 'react-hook-form';

/* eslint-disable @typescript-eslint/no-explicit-any */
export type FieldControllerRenderProps = {
    value: any;
    invalid: boolean;
    errors?: ReactHookFormFieldError;
    onChange: (value: any) => void;
};

type FieldControllerProps = {
    name: string;
    render: (props: FieldControllerRenderProps) => ReactElement;
};

/** Zod issue codes an empty required value fails with; their default wording is developer-facing. */
const EMPTY_VALUE_ERROR_TYPES = new Set(['too_small', 'invalid_type']);
const REQUIRED_FIELD_MESSAGE = 'This field is required';

function isEmptyValue(value: unknown): boolean {
    return value == null || value === '' || (Array.isArray(value) && value.length === 0);
}

function toDisplayError(error: ReactHookFormFieldError | undefined, value: unknown) {
    if (!error || !isEmptyValue(value) || !EMPTY_VALUE_ERROR_TYPES.has(String(error.type))) return error;
    return { ...error, message: REQUIRED_FIELD_MESSAGE };
}

/**
 * HOC wrapper component that eliminates redundant Controller wrapping
 * Provides a clean interface for field components with standardized props
 */
export const FieldController = ({ name, render }: FieldControllerProps) => {
    const { control } = useFormContext();

    return (
        <Controller
            name={name}
            control={control}
            render={({ field, fieldState }) => {
                const FieldComponent = render({
                    value: field.value,
                    invalid: fieldState.invalid,
                    errors: toDisplayError(fieldState.error, field.value),
                    onChange: field.onChange,
                });
                return cloneElement(FieldComponent, { key: name });
            }}
        />
    );
};
