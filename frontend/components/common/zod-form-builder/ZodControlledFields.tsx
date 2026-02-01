import { FieldController } from './FieldController';
import { generateFieldLabel } from './helpers';
import {
    ZodCheckboxField,
    ZodSelectField,
    ZodSwitchField,
    ZodSearchableMultiSelectField,
    ZodSearchableSelectField,
    ZodTextAreaField,
    ZodStringField,
    ZodStringFieldProps,
    ZodNumberFieldProps,
    ZodSelectFieldProps,
    ZodNumberField,
    ZodCheckboxFieldProps,
    ZodSwitchFieldProps,
    ZodSearchableSelectFieldProps,
    ZodSearchableMultiSelectFieldProps,
    ZodTextAreaFieldProps,
    ZodStringArrayField,
    ZodStringArrayFieldProps,
} from './ZodFieldComponents';
import { ZodMetaType } from './zod-meta-types';
import { useFormContext, useFieldArray, FieldError as ReactHookFormFieldError } from 'react-hook-form';
import { Button } from '@/components/ui/button';

type ControlledFieldBaseProps = {
    metadata?: ZodMetaType | null;
};
type ControlledFieldModifiedProps<T> = Omit<T, 'value' | 'onChange' | 'invalid' | 'errors'>

type StringControlledFieldProps = ControlledFieldBaseProps & ControlledFieldModifiedProps<ZodStringFieldProps | ZodTextAreaFieldProps>

export const StringControlledField = ({ name, description, required, label, disabled, className, classNames, metadata }: StringControlledFieldProps) => {
    const fieldLabel = label ?? generateFieldLabel(name);
    const Component = metadata === ZodMetaType.TEXT_AREA ? ZodTextAreaField : ZodStringField;
    return (
        <FieldController
            name={name}
            render={({ value, invalid, errors, onChange }) => (
                <Component
                    name={name}
                    label={fieldLabel}
                    description={description}
                    value={value}
                    invalid={invalid}
                    errors={errors}
                    onChange={onChange}
                    required={required}
                    disabled={disabled}
                    className={className}
                    classNames={classNames}
                />
            )}
        />
    );
}

type NumberControlledFieldProps = ControlledFieldBaseProps & ControlledFieldModifiedProps<ZodNumberFieldProps>

export const NumberControlledField = ({ name, description, required, label, disabled, className, classNames, metadata }: NumberControlledFieldProps) => {

    const fieldLabel = label ?? generateFieldLabel(name);
    return (
        <FieldController
            name={name}
            render={({ value, invalid, errors, onChange }) => (
                <ZodNumberField
                    name={name}
                    label={fieldLabel}
                    description={description}
                    value={value}
                    invalid={invalid}
                    errors={errors}
                    onChange={onChange}
                    required={required}
                    disabled={disabled}
                    className={className}
                    classNames={classNames}
                />
            )}
        />
    );
}

type BooleanControlledFieldProps = ControlledFieldBaseProps & ControlledFieldModifiedProps<ZodCheckboxFieldProps | ZodSwitchFieldProps>

export const BooleanControlledField = ({ name, description, required, label, disabled, className, classNames, metadata }: BooleanControlledFieldProps) => {

    const fieldLabel = label ?? generateFieldLabel(name);
    const BooleanComponent = metadata === ZodMetaType.CHECKBOX ? ZodCheckboxField : ZodSwitchField;
    return (
        <FieldController
            name={name}
            render={({ value, invalid, errors, onChange }) => (
                <BooleanComponent
                    name={name}
                    description={description}
                    label={fieldLabel}
                    value={value}
                    invalid={invalid}
                    errors={errors}
                    onChange={onChange}
                    required={required}
                    disabled={disabled}
                    className={className}
                    classNames={classNames}
                />
            )}
        />
    );
}

type EnumControlledFieldProps = ControlledFieldBaseProps & ControlledFieldModifiedProps<ZodSelectFieldProps>

export const EnumControlledField = ({ name, description, required, label, disabled, className, classNames, metadata, options }: EnumControlledFieldProps) => {

    const fieldLabel = label ?? generateFieldLabel(name);
    const Component = metadata === ZodMetaType.SEARCHABLE_SELECT ? ZodSearchableSelectField : ZodSelectField;
    return (
        <FieldController
            name={name}
            render={({ value, invalid, errors, onChange }) => (
                <Component
                    name={name}
                    label={fieldLabel}
                    description={description}
                    value={value}
                    invalid={invalid}
                    errors={errors}
                    onChange={onChange}
                    options={options}
                    required={required}
                    disabled={disabled}
                    className={className}
                    classNames={classNames}
                />
            )}
        />
    );
}

type SelectControlledFieldProps = ControlledFieldBaseProps & ControlledFieldModifiedProps<ZodSelectFieldProps>

export const SelectControlledField = ({ name, description, required, label, disabled, className, classNames, metadata, options }: SelectControlledFieldProps) => {
    const fieldLabel = label ?? generateFieldLabel(name);
    return (
        <FieldController
            name={name}
            render={({ value, invalid, errors, onChange }) => (
                <ZodSelectField
                    name={name}
                    label={fieldLabel}
                    description={description}
                    value={value}
                    invalid={invalid}
                    errors={errors}
                    onChange={onChange}
                    options={options}
                    required={required}
                    disabled={disabled}
                    className={className}
                    classNames={classNames}
                />
            )}
        />
    );
}

type SearchableSelectControlledFieldProps = ControlledFieldBaseProps & ControlledFieldModifiedProps<ZodSearchableSelectFieldProps>

export const SearchableSelectControlledField = ({ name, description, required, label, disabled, className, classNames, metadata, options }: SearchableSelectControlledFieldProps) => {

    const fieldLabel = label ?? generateFieldLabel(name);
    return (
        <FieldController
            name={name}
            render={({ value, invalid, errors, onChange }) => (
                <ZodSearchableSelectField
                    name={name}
                    label={fieldLabel}
                    description={description}
                    value={value}
                    invalid={invalid}
                    errors={errors}
                    onChange={onChange}
                    options={options}
                    required={required}
                    disabled={disabled}
                    className={className}
                    classNames={classNames}
                />
            )}
        />
    );
}

type SearchableMultiSelectControlledFieldProps = ControlledFieldBaseProps & ControlledFieldModifiedProps<ZodSearchableMultiSelectFieldProps>

export const SearchableMultiSelectControlledField = ({ name, description, required, label, disabled, className, classNames, metadata, options }: SearchableMultiSelectControlledFieldProps) => {

    const fieldLabel = label ?? generateFieldLabel(name);
    return (
        <FieldController
            name={name}
            render={({ value, invalid, errors, onChange }) => (
                <ZodSearchableMultiSelectField
                    name={name}
                    label={fieldLabel}
                    description={description}
                    values={value}
                    invalid={invalid}
                    errors={errors}
                    onChange={onChange}
                    options={options}
                    required={required}
                    disabled={disabled}
                    className={className}
                    classNames={classNames}
                />
            )}
        />
    );
}

type StringArrayControlledFieldProps = ControlledFieldBaseProps & ControlledFieldModifiedProps<ZodStringArrayFieldProps>

// Controlled version for use with React Hook Form - reuses StringControlledField!
export const StringArrayControlledField = ({
    name,
    description,
    required,
    label,
    disabled,
    className,
    classNames,
    metadata,
}: StringArrayControlledFieldProps) => {
    const fieldLabel = label ?? generateFieldLabel(name);
    const { control, formState, watch } = useFormContext();
    const { fields, append, remove } = useFieldArray({
        control,
        name,
    });

    // Get field state and values from form
    const fieldError = formState.errors[name] as ReactHookFormFieldError | undefined;
    const invalid = !!fieldError;
    const values = watch(name) as string[] | undefined;

    const handleAdd = () => {
        append('');
    };

    const handleRemove = (index: number) => {
        remove(index);
    };

    // Render with React Hook Form integration
    return (
        <ZodStringArrayField
            name={name}
            label={fieldLabel}
            description={description}
            required={required}
            disabled={disabled}
            className={className}
            classNames={classNames}
            invalid={invalid}
            errors={fieldError}
            values={values}
            onAdd={handleAdd}
            onRemove={handleRemove}
            // Provide stable keys from useFieldArray for proper React rendering
            fieldKeys={fields.map((field) => field.id)}
            // Custom renderItem that uses StringControlledField - reusing existing component!
            renderItem={({ itemName, placeholder, disabled: itemDisabled, onRemove }) => (
                <>
                    <StringControlledField
                        name={itemName}
                        label=""
                        disabled={itemDisabled}
                        className="flex-1"
                        classNames={{ input: classNames?.input, label: 'sr-only' }}
                    />
                    <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        onClick={onRemove}
                        disabled={itemDisabled}
                    >
                        Remove
                    </Button>
                </>
            )}
        />
    );
};