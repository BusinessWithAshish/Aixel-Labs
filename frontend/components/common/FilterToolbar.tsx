'use client';

import { createContext, useContext, useId, useState, type ReactNode } from 'react';
import { ListFilter, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetFooter,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

/** Set inside a `FilterSheet`: each filter stands on its own line, full width, with its name above it. */
const FilterStack = createContext(false);

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

/**
 * A page's filters in a side sheet, like the lead lists' filters: a "Filters" button (with how many are set) opens
 * it, a change applies at once, "Reset filters" puts them back. Filters drive the URL; this only lays them out.
 */
export function FilterSheet({
    label,
    active,
    onReset,
    children,
}: {
    /** The button's name for screen readers ("Filter calls"). */
    label: string;
    /** How many filters are not at their default. */
    active: number;
    onReset: () => void;
    children: ReactNode;
}) {
    const [open, setOpen] = useState(false);
    return (
        <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
                <Button variant="outline" size="sm" aria-label={label} className="shrink-0">
                    <ListFilter aria-hidden />
                    Filters
                    {active > 0 ? (
                        <Badge className="h-4 min-w-4 rounded-full px-1 tabular-nums" aria-hidden>
                            {active}
                        </Badge>
                    ) : null}
                </Button>
            </SheetTrigger>
            <SheetContent side="right" className="flex flex-col gap-0 p-0 sm:max-w-sm">
                <SheetHeader className="border-b p-4">
                    <SheetTitle>Filters</SheetTitle>
                    <SheetDescription>A change applies right away.</SheetDescription>
                </SheetHeader>
                <div role="group" aria-label={label} className="flex flex-1 flex-col gap-5 overflow-y-auto px-4 py-5">
                    <FilterStack.Provider value={true}>{children}</FilterStack.Provider>
                </div>
                <SheetFooter className="flex-row border-t p-4">
                    <Button variant="outline" className="flex-1" disabled={active === 0} onClick={onReset}>
                        Reset filters
                    </Button>
                    <Button className="flex-1" onClick={() => setOpen(false)}>
                        Done
                    </Button>
                </SheetFooter>
            </SheetContent>
        </Sheet>
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
    const stacked = useContext(FilterStack);
    const fallbackId = useId();
    const triggerId = id ?? fallbackId;
    const select = (
        <Select value={value} disabled={disabled} onValueChange={onChange}>
            <SelectTrigger
                id={triggerId}
                size={stacked ? 'default' : 'sm'}
                aria-label={label}
                title={title}
                className={cn('w-full sm:w-auto sm:min-w-32', className, stacked && 'sm:w-full sm:min-w-0 sm:max-w-none')}
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
    if (!stacked) return select;
    return (
        <Field className="gap-2">
            <FieldLabel htmlFor={triggerId}>{label}</FieldLabel>
            {select}
        </Field>
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
