import { ZodTypeAny } from 'zod';
import { Input } from '../../ui/input';
import { Textarea } from '../../ui/textarea';
import { Field, FieldDescription, FieldError, FieldLabel } from '../../ui/field';
import { FieldController } from './FieldController';
import { generateFieldLabel } from './helpers';
import {
    ZodCheckboxField,
    ZodSelectField,
    ZodSwitchField,
    ZodSearchableMultiSelectField,
    ZodSearchableSelectField,
} from './ZodFieldComponents';
import { ZodMetaType } from './zod-meta-types';
import { OptionType } from '@/components/ui/searchable-select';
import { enumToTitleCase } from '@/helpers/string-helpers';

type FieldRenderProps = {
    name: string;
    fieldInfo: ZodTypeAny;
    cleanDescription: string;
    metadata: ZodMetaType | null;
    isRequired: boolean;
};

/**
 * Renders a string field (input or textarea based on maxLength)
 */
export const renderStringField = ({ name, fieldInfo, cleanDescription, isRequired }: FieldRenderProps) => {
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
};

/**
 * Renders a number field
 */
export const renderNumberField = ({ name, cleanDescription, isRequired }: FieldRenderProps) => {
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
};

/**
 * Renders a boolean field (checkbox or switch based on metadata)
 */
export const renderBooleanField = ({ name, cleanDescription, metadata, isRequired }: FieldRenderProps) => {
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
};

/**
 * Renders an enum field as a select dropdown
 */
export const renderEnumField = ({ name, fieldInfo, cleanDescription, isRequired }: FieldRenderProps) => {
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

/**
 * Renders a searchable select field for strings with options
 */
export const renderSearchableSelectField = ({
    name,
    cleanDescription,
    isRequired,
    options,
}: FieldRenderProps & { options: OptionType[] }) => {
    return (
        <FieldController
            name={name}
            render={({ value, invalid, errors, onChange }) => (
                <ZodSearchableSelectField
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

/**
 * Renders a searchable multi-select field for arrays
 */
export const renderSearchableMultiSelectField = ({
    name,
    cleanDescription,
    isRequired,
    options,
}: FieldRenderProps & { options: OptionType[] }) => {
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
};
