'use client';

import type { ReactNode } from 'react';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';

export type SegmentedOption<T extends string> = {
    value: T;
    label: string;
    /** Shown before the label, e.g. a platform logo. */
    icon?: ReactNode;
    /** Shown after the label in a muted chip, e.g. how many posts. */
    count?: number;
};

type SegmentedSwitchProps<T extends string> = {
    options: readonly SegmentedOption<T>[];
    value: T;
    onValueChange: (value: T) => void;
    'aria-label': string;
    className?: string;
};

/** A one-of-few switch drawn as a pill track with the chosen segment raised, like iOS / YouTube Studio filters. */
export function SegmentedSwitch<T extends string>({ options, value, onValueChange, className, ...props }: SegmentedSwitchProps<T>) {
    return (
        <ToggleGroup
            type="single"
            value={value}
            onValueChange={(next) => next && onValueChange(next as T)}
            aria-label={props['aria-label']}
            className={cn('bg-muted h-9 max-w-full gap-0.5 rounded-lg p-1', className)}
        >
            {options.map((option) => (
                <ToggleGroupItem
                    key={option.value}
                    value={option.value}
                    aria-label={option.label}
                    className={cn(
                        'text-muted-foreground h-7 min-w-0 gap-1.5 rounded-md border-0 px-2.5 text-sm font-medium shadow-none first:rounded-md last:rounded-md',
                        'hover:text-foreground hover:bg-transparent',
                        'data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm',
                    )}
                >
                    {option.icon}
                    <span className="truncate">{option.label}</span>
                    {option.count != null ? (
                        <span className="bg-muted-foreground/10 rounded px-1 text-xs tabular-nums">{option.count}</span>
                    ) : null}
                </ToggleGroupItem>
            ))}
        </ToggleGroup>
    );
}
