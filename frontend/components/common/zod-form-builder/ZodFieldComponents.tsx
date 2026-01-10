import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldContent, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import { SearchableMultiSelect } from '@/components/ui/searchable-multi-select';
import { OptionType } from '@/components/ui/searchable-select';
import { Select, SelectItem, SelectContent, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { FieldError as ReactHookFormFieldError } from 'react-hook-form';
import { generateFieldLabel } from './helpers';

type BaseZodFieldProps = {
    name: string;
    description?: string;
    invalid?: boolean;
    errors?: ReactHookFormFieldError;
    required?: boolean;
};

type ZodCheckboxFieldProps = BaseZodFieldProps & {
    value?: boolean;
    onChange?: (value: boolean) => void;
};

export const ZodCheckboxField = ({
    name,
    description,
    value,
    invalid,
    errors,
    onChange,
    required,
}: ZodCheckboxFieldProps) => (
    <Field orientation="horizontal" data-invalid={invalid}>
        <FieldContent>
            <FieldLabel required={required} htmlFor={name}>
                {generateFieldLabel(name)}
            </FieldLabel>
            {description && <FieldDescription>{description}</FieldDescription>}
        </FieldContent>
        <Checkbox id={name} name={name} checked={value} onCheckedChange={onChange} />
        {invalid && errors && <FieldError errors={[errors]} />}
    </Field>
);

type ZodSwitchFieldProps = BaseZodFieldProps & {
    value?: boolean;
    onChange?: (value: boolean) => void;
};

export const ZodSwitchField = ({ name, description, value, invalid, errors, onChange, required }: ZodSwitchFieldProps) => (
    <Field orientation="horizontal" data-invalid={invalid}>
        <FieldContent>
            <FieldLabel required={required} htmlFor={name}>
                {generateFieldLabel(name)}
            </FieldLabel>
            {description && <FieldDescription>{description}</FieldDescription>}
        </FieldContent>
        <Switch id={name} name={name} checked={value} onCheckedChange={onChange} />
        {invalid && errors && <FieldError errors={[errors]} />}
    </Field>
);

type ZodSelectFieldProps = BaseZodFieldProps & {
    value?: string;
    onChange?: (value: string) => void;
    options: string[];
};

export const ZodSelectField = ({
    name,
    description,
    value,
    invalid,
    errors,
    onChange,
    options,
    required,
}: ZodSelectFieldProps) => {
    const fieldLabel = generateFieldLabel(name);
    return (
        <Field orientation="horizontal" data-invalid={invalid}>
            <FieldContent>
                <FieldLabel required={required} htmlFor={name}>
                    {fieldLabel}
                </FieldLabel>
                {description && <FieldDescription>{description}</FieldDescription>}
            </FieldContent>
            <Select name={name} value={value} onValueChange={onChange}>
                <SelectTrigger>
                    <SelectValue placeholder={`Select ${fieldLabel.toLowerCase()}`} />
                </SelectTrigger>
                <SelectContent>
                    {options.map((option) => (
                        <SelectItem key={option} value={option.toLowerCase()}>
                            {option}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
            {invalid && errors && <FieldError errors={[errors]} />}
        </Field>
    );
};

type ZodSearchableMultiSelectFieldProps = BaseZodFieldProps & {
    values?: string[];
    onChange?: (value: string[]) => void;
    options: OptionType[];
};

export const ZodSearchableMultiSelectField = ({
    name,
    description,
    values,
    invalid,
    errors,
    onChange,
    options,
    required,
}: ZodSearchableMultiSelectFieldProps) => (
    <Field orientation="horizontal" data-invalid={invalid}>
        <FieldContent>
            <FieldLabel required={required} htmlFor={name}>
                {generateFieldLabel(name)}
            </FieldLabel>
            {description && <FieldDescription>{description}</FieldDescription>}
        </FieldContent>
        <SearchableMultiSelect options={options} values={values} onChange={onChange} />
        {invalid && errors && <FieldError errors={[errors]} />}
    </Field>
);
