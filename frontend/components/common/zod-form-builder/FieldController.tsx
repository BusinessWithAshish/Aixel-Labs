import { ReactElement } from 'react';
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
            render={({ field, fieldState }) =>
                render({
                    value: field.value,
                    invalid: fieldState.invalid,
                    errors: fieldState.error,
                    onChange: field.onChange,
                })
            }
        />
    );
};
