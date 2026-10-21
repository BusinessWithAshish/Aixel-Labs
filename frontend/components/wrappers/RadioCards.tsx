'use client';

import { useId, type ComponentProps, type ReactNode } from 'react';
import { Field, FieldContent, FieldDescription, FieldLabel, FieldTitle } from '@/components/ui/field';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { cn } from '@/lib/utils';

export type RadioCardOption<T extends string> = {
    value: T;
    title: ReactNode;
    description?: ReactNode;
    /** Before the text, e.g. an icon tile. */
    media?: ReactNode;
};

type RadioCardsProps<T extends string> = Omit<
    ComponentProps<typeof RadioGroup>,
    'value' | 'defaultValue' | 'onValueChange'
> & {
    /** null = nothing picked yet. */
    value: T | null;
    onValueChange: (value: T) => void;
    options: readonly RadioCardOption<T>[];
    classNames?: { card?: string; description?: string };
};

/** One choice out of a few, each a bordered card (shadcn choice card: a label around a horizontal field). */
export function RadioCards<T extends string>({
    value,
    onValueChange,
    options,
    className,
    classNames,
    ...props
}: RadioCardsProps<T>) {
    const id = useId();
    return (
        <RadioGroup
            value={value ?? ''}
            onValueChange={(next) => onValueChange(next as T)}
            className={cn('gap-2 sm:grid-cols-2', className)}
            {...props}
        >
            {options.map((option) => (
                <FieldLabel key={option.value} htmlFor={`${id}-${option.value}`}>
                    <Field orientation="horizontal" className={classNames?.card}>
                        {option.media}
                        <FieldContent className="gap-0.5">
                            {/* One inline run of text: FieldTitle is a flex row, which would split a title made of several parts. */}
                            <FieldTitle>
                                <span>{option.title}</span>
                            </FieldTitle>
                            {option.description ? (
                                <FieldDescription className={cn('text-xs', classNames?.description)}>
                                    {option.description}
                                </FieldDescription>
                            ) : null}
                        </FieldContent>
                        <RadioGroupItem value={option.value} id={`${id}-${option.value}`} />
                    </Field>
                </FieldLabel>
            ))}
        </RadioGroup>
    );
}
