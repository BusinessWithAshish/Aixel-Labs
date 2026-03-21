'use client';

import { useState, useMemo } from 'react';
import { CheckIcon, ChevronsUpDownIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useVirtualizer } from '@tanstack/react-virtual';

export type OptionType = {
    value: string;
    label: string;
};

type SearchableSelectProps = {
    options: OptionType[];
    placeholder?: string;
    disabled?: boolean;
    value?: string;
    onChange?: (val: string) => void;
    className?: string;
};

export function SearchableSelect({
    options,
    placeholder = 'Select or search for an option...',
    value,
    disabled = false,
    onChange,
    className,
}: SearchableSelectProps) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);

    const selectedLabel = options.find((o) => o.value === value)?.label;

    const filteredOptions = useMemo(
        () => (search ? options.filter((o) => o.label.toLowerCase().includes(search.toLowerCase())) : options),
        [options, search],
    );

    const virtualizer = useVirtualizer({
        count: filteredOptions.length,
        getScrollElement: () => scrollEl,
        estimateSize: () => 32,
        overscan: 5,
    });

    return (
        <Popover
            open={open}
            onOpenChange={(isOpen) => {
                setOpen(isOpen);
                if (!isOpen) setSearch('');
            }}
        >
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    disabled={disabled}
                    role="combobox"
                    aria-expanded={open}
                    className={cn('justify-between', className)}
                >
                    {selectedLabel ?? placeholder}
                    <ChevronsUpDownIcon className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent side="bottom" className="p-0">
                <Command shouldFilter={false}>
                    <CommandInput
                        disabled={disabled}
                        placeholder="Search option..."
                        value={search}
                        onValueChange={(val) => {
                            setSearch(val);
                            scrollEl?.scrollTo({ top: 0 });
                        }}
                    />
                    <CommandList ref={setScrollEl}>
                        {filteredOptions.length === 0 ? (
                            <CommandEmpty>No option found.</CommandEmpty>
                        ) : (
                            <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
                                {virtualizer.getVirtualItems().map((virtualItem) => {
                                    const option = filteredOptions[virtualItem.index];
                                    return (
                                        <CommandItem
                                            key={virtualItem.key}
                                            value={option.value}
                                            style={{
                                                position: 'absolute',
                                                top: 0,
                                                left: 0,
                                                width: '100%',
                                                height: `${virtualItem.size}px`,
                                                transform: `translateY(${virtualItem.start}px)`,
                                            }}
                                            onSelect={() => {
                                                onChange?.(option.value);
                                                setOpen(false);
                                            }}
                                        >
                                            <CheckIcon
                                                className={cn('mr-2 h-4 w-4', value === option.value ? 'opacity-100' : 'opacity-0')}
                                            />
                                            {option.label}
                                        </CommandItem>
                                    );
                                })}
                            </div>
                        )}
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}
