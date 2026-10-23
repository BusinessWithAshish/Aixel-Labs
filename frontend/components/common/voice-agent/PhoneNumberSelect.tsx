'use client';

import type { VoiceProvider } from '@aixellabs/backend/db/types';
import { FieldController } from '@/components/common/zod-form-builder/FieldController';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatPhone } from '@/helpers/voice-campaign-contacts';
import { numberProviderInfo } from '@/helpers/voice-number-providers';
import { cn } from '@/lib/utils';
import { NumberProviderLogo } from './NumberProviderLogo';

/** One of the owner's numbers as a picker lists it. */
export type PhoneNumberOption = {
    id: string;
    phoneNumber: string;
    provider: VoiceProvider;
    /** A second line under it (what it does now, why it cannot be picked). */
    detail?: string | null;
    disabled?: boolean;
};

/** The `noneLabel` option's value: Radix Select items cannot have an empty one. */
const NONE = 'none';

/** "[logo] Telnyx · +1 217 858 0121", with its detail underneath. */
export function PhoneNumberLine({ number }: { number: PhoneNumberOption }) {
    return (
        <span className="flex min-w-0 items-center gap-2.5 text-left">
            <NumberProviderLogo provider={number.provider} />
            <span className="flex min-w-0 flex-col">
                <span className="tabular-nums">
                    {numberProviderInfo(number.provider).label} · {formatPhone(number.phoneNumber)}
                </span>
                {number.detail ? (
                    <span className="text-muted-foreground text-xs whitespace-normal">{number.detail}</span>
                ) : null}
            </span>
        </span>
    );
}

type PhoneNumberSelectProps = {
    numbers: PhoneNumberOption[];
    value: string | null;
    onChange: (id: string | null) => void;
    id?: string;
    placeholder?: string;
    /** Offers "none" first, under this label. */
    noneLabel?: string;
    disabled?: boolean;
    invalid?: boolean;
    className?: string;
    'aria-label'?: string;
    'data-testid'?: string;
};

/** Picks one of the owner's numbers: provider logo, provider and number on every option and the picked one. */
export function PhoneNumberSelect({
    numbers,
    value,
    onChange,
    id,
    placeholder = 'Pick one of your numbers',
    noneLabel,
    disabled,
    invalid,
    className,
    ...rest
}: PhoneNumberSelectProps) {
    return (
        <Select
            value={value ?? ''}
            // Radix calls this only for a different pick, so choosing the current number does nothing.
            onValueChange={(next) => onChange(next === NONE ? null : next)}
            disabled={disabled}
        >
            <SelectTrigger
                id={id}
                aria-invalid={invalid}
                className={cn('w-full data-[size=default]:h-auto data-[size=default]:min-h-9 py-1.5', className)}
                {...rest}
            >
                <SelectValue placeholder={placeholder} />
            </SelectTrigger>
            <SelectContent>
                {noneLabel ? (
                    <SelectItem value={NONE}>
                        <span className="text-muted-foreground">{noneLabel}</span>
                    </SelectItem>
                ) : null}
                {numbers.map((n) => (
                    <SelectItem key={n.id} value={n.id} disabled={n.disabled}>
                        <PhoneNumberLine number={n} />
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}

type PhoneNumberControlledFieldProps = {
    name: string;
    id: string;
    label: string;
    numbers: PhoneNumberOption[];
    description?: string;
    placeholder?: string;
};

/** The number picker as a react-hook-form field, with its label, description and error. */
export function PhoneNumberControlledField({
    name,
    id,
    label,
    numbers,
    description,
    placeholder,
}: PhoneNumberControlledFieldProps) {
    return (
        <FieldController
            name={name}
            render={({ value, invalid, errors, onChange }) => (
                <Field data-invalid={invalid}>
                    <FieldLabel htmlFor={id}>{label}</FieldLabel>
                    {description ? <FieldDescription className="text-xs">{description}</FieldDescription> : null}
                    <PhoneNumberSelect
                        id={id}
                        numbers={numbers}
                        value={value || null}
                        onChange={(next) => onChange(next ?? '')}
                        placeholder={placeholder}
                        invalid={invalid}
                    />
                    {invalid && errors ? <FieldError errors={[errors]} /> : null}
                </Field>
            )}
        />
    );
}
