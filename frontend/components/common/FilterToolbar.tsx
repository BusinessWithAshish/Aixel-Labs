'use client';

import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

/**
 * A page's filters in one compact row (two columns on a phone), every control the same small height,
 * with "Clear" while any filter is not at its default. Filters drive the URL; this only lays them out.
 */
export function FilterToolbar({
    label,
    onClear,
    children,
    className,
}: {
    label: string;
    /** Shown while there is something to clear. */
    onClear?: (() => void) | null;
    children: ReactNode;
    className?: string;
}) {
    return (
        <div
            role="group"
            aria-label={label}
            className={cn('grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center', className)}
        >
            {children}
            {onClear ? (
                <Button variant="ghost" size="sm" onClick={onClear}>
                    <X aria-hidden />
                    Clear
                </Button>
            ) : null}
        </div>
    );
}

export type FilterOption = { value: string; label: string };

/** One filter: a small select named `label` for screen readers; the picked option says what it shows ("All agents"). */
export function FilterSelect({
    id,
    label,
    value,
    options,
    onChange,
    disabled,
    className,
    title,
}: {
    id?: string;
    label: string;
    value: string;
    options: FilterOption[];
    onChange: (value: string) => void;
    disabled?: boolean;
    className?: string;
    title?: string;
}) {
    return (
        <Select value={value} disabled={disabled} onValueChange={onChange}>
            <SelectTrigger
                id={id}
                size="sm"
                aria-label={label}
                title={title}
                className={cn('w-full sm:w-auto sm:min-w-32', className)}
            >
                <SelectValue />
            </SelectTrigger>
            <SelectContent>
                {options.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                        {option.label}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}

/** An on/off filter, boxed to the selects' height so the row lines up. */
export function FilterSwitch({
    id,
    label,
    checked,
    onChange,
    disabled,
}: {
    id: string;
    label: string;
    checked: boolean;
    onChange: (checked: boolean) => void;
    disabled?: boolean;
}) {
    return (
        <label
            htmlFor={id}
            className="border-input flex min-h-8 cursor-pointer items-center gap-2 rounded-md border px-2.5 py-1 text-sm leading-tight shadow-xs has-disabled:cursor-not-allowed has-disabled:opacity-50"
        >
            <Switch id={id} checked={checked} disabled={disabled} onCheckedChange={onChange} />
            {label}
        </label>
    );
}
