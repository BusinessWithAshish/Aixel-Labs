'use client';

import * as React from 'react';
import { CheckIcon, ChevronsUpDownIcon, XIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { OptionType } from './searchable-select';

type SearchableMultiSelectProps = {
    options: OptionType[];
    placeholder?: string;
    disabled?: boolean;
    values?: string[]; // controlled selected value
    onChange?: (val: string[]) => void; // callback when selected
    className?: string;
};

//TODO: Fix the width to adjust to its parent width, while keeping minimum width as well
export function SearchableMultiSelect({
    options,
    placeholder = 'Select options...',
    values,
    disabled = false,
    onChange,
    className,
}: SearchableMultiSelectProps) {
    const [open, setOpen] = React.useState(false);

    const selectedValues = values?.map((v) => options.find((o) => o.value === v)) || [];

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger className="cursor-pointer w-md" asChild>
                <Button
                    variant="outline"
                    disabled={disabled}
                    role="combobox"
                    aria-expanded={open}
                    className={cn('justify-between min-h-fit', className)}
                >
                    <div className="flex flex-wrap gap-2">
                        {selectedValues.length === 0 ? (
                            <span className="text-muted-foreground">{placeholder}</span>
                        ) : (
                            selectedValues.map(
                                (option) =>
                                    option && (
                                        <Badge
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onChange?.((values || []).filter((v) => v !== option.value));
                                            }}
                                            className="cursor-pointer "
                                            key={option.value}
                                        >
                                            {option.label}
                                            <XIcon className="h-4 w-4 shrink-0 opacity-50" />
                                        </Badge>
                                    ),
                            )
                        )}
                    </div>

                    <ChevronsUpDownIcon className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent side="bottom" className="p-0">
                <Command
                    filter={(value, search) => {
                        if (!search) return 1;
                        return options.some((o) => o.label.toLowerCase().includes(search.toLowerCase())) ? 1 : 0;
                    }}
                >
                    <CommandInput className="cursor-pointer" disabled={disabled} placeholder="Search options..." />
                    <CommandList>
                        <CommandEmpty>No options found.</CommandEmpty>
                        <CommandGroup>
                            {options.map((option) => (
                                <CommandItem
                                    className="cursor-pointer"
                                    key={option.value}
                                    value={option.value}
                                    onSelect={() => {
                                        const isSelected = values?.includes(option.value);
                                        if (isSelected) {
                                            onChange?.((values || []).filter((v) => v !== option.value));
                                        } else {
                                            onChange?.([...(values || []), option.value]);
                                        }
                                        setOpen(false);
                                    }}
                                >
                                    <CheckIcon
                                        className={cn(
                                            'mr-2 h-4 w-4',
                                            values?.includes(option.value) ? 'opacity-100' : 'opacity-0',
                                        )}
                                    />
                                    {option.label}
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}
