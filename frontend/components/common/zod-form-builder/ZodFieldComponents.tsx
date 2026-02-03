import React from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldContent, FieldDescription, FieldError, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field';
import { SearchableMultiSelect } from '@/components/ui/searchable-multi-select';
import { SearchableSelect, OptionType } from '@/components/ui/searchable-select';
import { Select, SelectItem, SelectContent, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { FieldError as ReactHookFormFieldError } from 'react-hook-form';
import { generateFieldLabel } from './helpers';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export type BaseZodFieldProps = {
    name: string;
    label?: string;
    description?: string;
    invalid?: boolean;
    errors?: ReactHookFormFieldError;
    required?: boolean;
    disabled?: boolean;
    className?: string;
    classNames?: {
        label?: string;
        input?: string;
        description?: string;
        error?: string;
    };
};

export type ZodStringFieldProps = BaseZodFieldProps & {
    value?: string;
    onChange?: (value: string) => void;
};

export const ZodStringField = ({ name, label, description, value, invalid, errors, onChange, required, disabled, className, classNames }: ZodStringFieldProps) => {

    return (
        <Field data-invalid={invalid} className={className} data-disabled={disabled}>
            <FieldLabel required={required} htmlFor={name} className={classNames?.label}>
                {label ?? generateFieldLabel(name)}
            </FieldLabel>
            {description && <FieldDescription className={classNames?.description}>{description}</FieldDescription>}
            <Input
                value={value}
                onChange={(e) => onChange?.(e.target.value)}
                id={name}
                aria-invalid={invalid}
                placeholder={`Type ${label?.toLowerCase()}`}
                required={required}
                className={classNames?.input}
                disabled={disabled}
                aria-disabled={disabled}
            />
            {invalid && <FieldError errors={[errors]} className={classNames?.error} />}
        </Field>
    );
};

export type ZodTextAreaFieldProps = BaseZodFieldProps & {
    value?: string;
    onChange?: (value: string) => void;
};

export const ZodTextAreaField = ({ name, label, description, value, invalid, errors, onChange, required, disabled, className, classNames }: ZodTextAreaFieldProps) => {
    return (
        <Field data-invalid={invalid} className={className} data-disabled={disabled}>
            <FieldLabel required={required} htmlFor={name} className={classNames?.label}>
                {label ?? generateFieldLabel(name)}
            </FieldLabel>
            {description && <FieldDescription className={classNames?.description}>{description}</FieldDescription>}
            <Textarea
                value={value}
                onChange={(e) => onChange?.(e.target.value)}
                id={name}
                aria-invalid={invalid}
                placeholder={`Type ${label?.toLowerCase()}`}
                required={required}
                className="min-h-10"
                disabled={disabled}
                aria-disabled={disabled}
            />
            {invalid && <FieldError errors={[errors]} className={classNames?.error} />}
        </Field>
    );
};

export type ZodNumberFieldProps = BaseZodFieldProps & {
    value?: number;
    onChange?: (value: number) => void;
};

export const ZodNumberField = ({ name, label, description, value, invalid, errors, onChange, required, disabled, className, classNames }: ZodNumberFieldProps) => {
    return (
        <Field data-invalid={invalid} className={className} data-disabled={disabled}>
            <FieldLabel required={required} htmlFor={name} className={classNames?.label}>
                {label ?? generateFieldLabel(name)}
            </FieldLabel>
            {description && <FieldDescription className={classNames?.description}>{description}</FieldDescription>}
            <Input
                value={value}
                onChange={(e) => onChange?.(e.target.valueAsNumber)}
                type="number"
                id={name}
                aria-invalid={invalid}
                placeholder={`Type ${label?.toLowerCase()}`}
                required={required}
                disabled={disabled}
                aria-disabled={disabled}
            />
            {invalid && <FieldError errors={[errors]} className={classNames?.error} />}
        </Field>
    );
};

export type ZodColorPickerFieldProps = BaseZodFieldProps & {
    value?: string;
    onChange?: (value: string) => void;
};

const clampChannel = (value: number) => Math.min(255, Math.max(0, value));

const hexToRgb = (hex: string): { r: number; g: number; b: number } | null => {
    const match = hex.trim().match(/^#([0-9a-fA-F]{6})$/);
    if (!match) return null;
    const intVal = parseInt(match[1], 16);
    const r = (intVal >> 16) & 255;
    const g = (intVal >> 8) & 255;
    const b = intVal & 255;
    return { r, g, b };
};

const rgbToHex = (r: number, g: number, b: number): string => {
    const toHex = (v: number) => v.toString(16).padStart(2, '0');
    return `#${toHex(clampChannel(r))}${toHex(clampChannel(g))}${toHex(clampChannel(b))}`;
};

export const ZodColorPicker = ({
    name,
    label,
    description,
    value,
    invalid,
    errors,
    onChange,
    required,
    disabled,
    className,
    classNames,
}: ZodColorPickerFieldProps) => {
    const fallbackHex = '#4f46e5'; // sensible default accent
    const colorValue = value || fallbackHex;
    const rgb = hexToRgb(colorValue) ?? hexToRgb(fallbackHex)!;

    const handleHexChange = (next: string) => {
        if (!onChange) return;
        // Allow partial input while typing, but only commit valid 7-char hex
        if (/^#([0-9a-fA-F]{0,6})$/.test(next)) {
            if (next.length === 7) {
                onChange(next);
            } else {
                onChange(next);
            }
        }
    };

    const handleChannelChange = (channel: 'r' | 'g' | 'b', nextValue: string) => {
        if (!onChange) return;
        const numeric = Number(nextValue);
        if (Number.isNaN(numeric)) return;
        const clamped = clampChannel(numeric);
        const current = hexToRgb(colorValue) ?? rgb;
        const updated = {
            ...current,
            [channel]: clamped,
        };
        onChange(rgbToHex(updated.r, updated.g, updated.b));
    };

    const fieldLabel = label ?? generateFieldLabel(name);

    return (
        <Field data-invalid={invalid} className={className} data-disabled={disabled}>
            <FieldContent>
                <FieldLabel required={required} htmlFor={name} className={classNames?.label}>
                    {fieldLabel}
                </FieldLabel>
                {description && <FieldDescription className={classNames?.description}>{description}</FieldDescription>}
            </FieldContent>

            <Popover>
                <PopoverTrigger asChild>
                    <Button
                        type="button"
                        variant="outline"
                        className={`w-full justify-between gap-3 ${classNames?.input ?? ''}`}
                        disabled={disabled}
                        aria-disabled={disabled}
                    >
                        <span className="flex items-center gap-3">
                            <span
                                className="h-6 w-6 rounded-md border border-border shadow-sm"
                                style={{ backgroundColor: colorValue }}
                            />
                            <span className="font-mono text-xs text-muted-foreground uppercase">{colorValue}</span>
                        </span>
                        <span className="text-xs text-muted-foreground">Change</span>
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="space-y-4">
                    <Input
                        type="color"
                        id={name}
                        value={colorValue}
                        onChange={(e) => onChange?.(e.target.value)}
                        className="h-10 rounded-2xl w-16 cursor-pointer border-none bg-transparent p-0"
                        disabled={disabled}
                        aria-disabled={disabled}
                    />

                    <div className="grid grid-cols-[auto,1fr] items-center gap-2">
                        <span className="text-xs text-muted-foreground">HEX</span>
                        <Input
                            value={colorValue}
                            onChange={(e) => handleHexChange(e.target.value)}
                            className="font-mono text-xs"
                            disabled={disabled}
                            aria-disabled={disabled}
                        />
                    </div>

                    <div className="grid grid-cols-[auto,1fr] items-center gap-2">
                        <span className="text-xs text-muted-foreground">R</span>
                        <Input
                            type="number"
                            min={0}
                            max={255}
                            value={rgb.r}
                            onChange={(e) => handleChannelChange('r', e.target.value)}
                            className="font-mono text-xs"
                            disabled={disabled}
                            aria-disabled={disabled}
                        />
                    </div>
                    <div className="grid grid-cols-[auto,1fr] items-center gap-2">
                        <span className="text-xs text-muted-foreground">G</span>
                        <Input
                            type="number"
                            min={0}
                            max={255}
                            value={rgb.g}
                            onChange={(e) => handleChannelChange('g', e.target.value)}
                            className="font-mono text-xs"
                            disabled={disabled}
                            aria-disabled={disabled}
                        />
                    </div>
                    <div className="grid grid-cols-[auto,1fr] items-center gap-2">
                        <span className="text-xs text-muted-foreground">B</span>
                        <Input
                            type="number"
                            min={0}
                            max={255}
                            value={rgb.b}
                            onChange={(e) => handleChannelChange('b', e.target.value)}
                            className="font-mono text-xs"
                            disabled={disabled}
                            aria-disabled={disabled}
                        />
                    </div>

                    <p className="text-xs text-muted-foreground">
                        Use the picker or adjust the RGB values to fine-tune your brand color.
                    </p>
                </PopoverContent>
            </Popover>

            {invalid && errors && <FieldError errors={[errors]} className={classNames?.error} />}
        </Field>
    );
};

export type ZodCheckboxFieldProps = BaseZodFieldProps & {
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
    disabled,
    className,
    classNames,
}: ZodCheckboxFieldProps) => (
    <Field orientation="horizontal" data-invalid={invalid} className={className} data-disabled={disabled}>
        <FieldContent>
            <FieldLabel required={required} htmlFor={name} className={classNames?.label}>
                {generateFieldLabel(name)}
            </FieldLabel>
            {description && <FieldDescription className={classNames?.description}>{description}</FieldDescription>}
        </FieldContent>
        <Checkbox id={name} name={name} checked={value} onCheckedChange={onChange} />
        {invalid && errors && <FieldError errors={[errors]} className={classNames?.error} />}
    </Field>
);

export type ZodSwitchFieldProps = BaseZodFieldProps & {
    value?: boolean;
    onChange?: (value: boolean) => void;
};

export const ZodSwitchField = ({ name, description, value, invalid, errors, onChange, required, disabled, className, classNames }: ZodSwitchFieldProps) => (
    <Field orientation="horizontal" data-invalid={invalid} className={className} data-disabled={disabled}>
        <FieldContent>
            <FieldLabel required={required} htmlFor={name} className={classNames?.label}>
                {generateFieldLabel(name)}
            </FieldLabel>
            {description && <FieldDescription className={classNames?.description}>{description}</FieldDescription>}
        </FieldContent>
        <Switch id={name} name={name} checked={value} onCheckedChange={onChange} />
        {invalid && errors && <FieldError errors={[errors]} className={classNames?.error} />}
    </Field>
);

export type ZodSelectFieldProps = BaseZodFieldProps & {
    value?: string;
    onChange?: (value: string) => void;
    options: OptionType[];
};

export const ZodSelectField = ({
    name,
    description,
    value,
    invalid,
    errors,
    label,
    onChange,
    options,
    required,
    disabled,
    className,
    classNames,
}: ZodSelectFieldProps) => {
    const fieldLabel = label ?? generateFieldLabel(name);
    return (
        <Field data-invalid={invalid} className={className} data-disabled={disabled}>
            <FieldContent>
                <FieldLabel required={required} htmlFor={name} className={classNames?.label}>
                    {fieldLabel}
                </FieldLabel>
                {description && <FieldDescription className={classNames?.description}>{description}</FieldDescription>}
            </FieldContent>
            <Select name={name} value={value} onValueChange={onChange} disabled={disabled} aria-disabled={disabled}>
                <SelectTrigger className={classNames?.input}>
                    <SelectValue placeholder={`Select ${fieldLabel.toLowerCase()}`} />
                </SelectTrigger>
                <SelectContent>
                    {options.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                            {option.label}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
            {invalid && errors && <FieldError errors={[errors]} className={classNames?.error} />}
        </Field>
    );
};

export type ZodSearchableSelectFieldProps = BaseZodFieldProps & {
    value?: string;
    onChange?: (value: string) => void;
    options: OptionType[];
};

export const ZodSearchableSelectField = ({
    name,
    description,
    value,
    invalid,
    errors,
    label,
    onChange,
    options,
    required,
    disabled,
    className,
    classNames,
}: ZodSearchableSelectFieldProps) => {
    const fieldLabel = label ?? generateFieldLabel(name);
    return (
        <Field data-invalid={invalid} className={className} data-disabled={disabled}>
            <FieldContent>
                <FieldLabel required={required} htmlFor={name} className={classNames?.label}>
                    {fieldLabel}
                </FieldLabel>
                {description && <FieldDescription className={classNames?.description}>{description}</FieldDescription>}
            </FieldContent>
            <SearchableSelect
                options={options}
                value={value}
                onChange={onChange}
                placeholder={`Select ${fieldLabel.toLowerCase()}`}
                disabled={disabled}
                aria-disabled={disabled}
            />
            {invalid && errors && <FieldError errors={[errors]} className={classNames?.error} />}
        </Field>
    );
};

export type ZodSearchableMultiSelectFieldProps = BaseZodFieldProps & {
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
    label,
    onChange,
    options,
    required,
    disabled,
    className,
    classNames,
}: ZodSearchableMultiSelectFieldProps) => {
    const fieldLabel = label ?? generateFieldLabel(name);
    return (
        <Field data-invalid={invalid} className={className} data-disabled={disabled}>
            <FieldContent>
                <FieldLabel required={required} htmlFor={name} className={classNames?.label}>
                    {fieldLabel}
                </FieldLabel>
                {description && <FieldDescription className={classNames?.description}>{description}</FieldDescription>}
            </FieldContent>
            <SearchableMultiSelect
                options={options}
                values={values}
                onChange={onChange}
                placeholder={`Select ${fieldLabel.toLowerCase()}`}
                disabled={disabled}
                aria-disabled={disabled}
                className={classNames?.input}
            />
            {invalid && errors && <FieldError errors={[errors]} className={classNames?.error} />}
        </Field>
    );
};

export type ZodStringArrayFieldProps = BaseZodFieldProps & {
    values?: string[];
    onChange?: (values: string[]) => void;
    renderItem?: (props: {
        index: number;
        itemName: string;
        value: string;
        placeholder: string;
        disabled?: boolean;
        onRemove: () => void;
    }) => React.ReactNode;
    onAdd?: () => void;
    onRemove?: (index: number) => void;
    // For controlled usage with useFieldArray - provides stable keys
    fieldKeys?: Array<string | number>;
};

export const ZodStringArrayField = ({
    name,
    description,
    label,
    required,
    values = [],
    onChange,
    invalid,
    errors,
    disabled,
    className,
    classNames,
    renderItem,
    onAdd,
    onRemove: onRemoveProp,
    fieldKeys,
}: ZodStringArrayFieldProps) => {
    const fieldLabel = label ?? generateFieldLabel(name);

    const handleItemChange = (index: number, newValue: string) => {
        if (!onChange) return;
        const newValues = [...values];
        newValues[index] = newValue;
        onChange(newValues);
    };

    const handleAdd = () => {
        if (onAdd) {
            onAdd();
        } else if (onChange) {
            onChange([...values, '']);
        }
    };

    const handleRemove = (index: number) => {
        if (onRemoveProp) {
            onRemoveProp(index);
        } else if (onChange) {
            const newValues = values.filter((_, i) => i !== index);
            onChange(newValues);
        }
    };

    // Validation: Check if last item is empty
    const lastItem = values.length > 0 ? values[values.length - 1] : null;
    const isLastItemEmpty = lastItem !== null && lastItem.trim().length === 0;
    
    // Disable "Add Item" button if:
    // 1. The whole field is disabled, OR
    // 2. The last item is empty (has 0 chars)
    const isAddButtonDisabled = disabled || isLastItemEmpty;

    return (
        <FieldSet className={className} data-invalid={invalid} data-disabled={disabled}>
            <FieldLegend variant="label">
                {fieldLabel}
                {required && <span className="text-destructive ml-1">*</span>}
            </FieldLegend>
            {description && <FieldDescription className={classNames?.description}>{description}</FieldDescription>}
            <FieldContent className="space-y-3">
                {values.map((value, index) => {
                    const itemName = `${name}.${index}`;
                    const placeholder = `Enter ${fieldLabel.toLowerCase()} item`;
                    // Use fieldKeys if provided (for stable React keys with useFieldArray), otherwise use index
                    const key = fieldKeys?.[index] ?? index;

                    return (
                        <div key={key} className="flex gap-2 items-end">
                            {renderItem ? (
                                // Custom render for controlled fields
                                renderItem({
                                    index,
                                    itemName,
                                    value,
                                    placeholder,
                                    disabled,
                                    onRemove: () => handleRemove(index),
                                })
                            ) : (
                                // Default plain input
                                <>
                                    <Input
                                        value={value}
                                        onChange={(e) => handleItemChange(index, e.target.value)}
                                        placeholder={placeholder}
                                        disabled={disabled}
                                        aria-disabled={disabled}
                                        className={classNames?.input}
                                    />
                                    <Button
                                        type="button"
                                        variant="destructive"
                                        size="sm"
                                        onClick={() => handleRemove(index)}
                                        disabled={!value.length}
                                    >
                                        Remove
                                    </Button>
                                </>
                            )}
                        </div>
                    );
                })}
                <Button
                    type="button"
                    variant="secondary"
                    onClick={handleAdd}
                    className="w-full"
                    disabled={isAddButtonDisabled}
                >
                    + Add Item
                </Button>
            </FieldContent>
            {invalid && errors && <FieldError errors={[errors]} className={classNames?.error} />}
        </FieldSet>
    );
};