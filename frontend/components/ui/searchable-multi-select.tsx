'use client';

import { useState, useMemo } from 'react';
import { CheckIcon, ChevronsUpDownIcon, XIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { OptionType } from './searchable-select';
import { useVirtualizer } from '@tanstack/react-virtual';

type SearchableMultiSelectProps = {
    options: OptionType[];
    placeholder?: string;
    disabled?: boolean;
    values?: string[];
    onChange?: (val: string[]) => void;
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
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);

    const selectedValues =
        values?.map((v) => options.find((o) => o.value === v) ?? { value: v, label: String(v) }) || [];

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
                                          className="cursor-pointer"
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
                <Command shouldFilter={false}>
                    <CommandInput
                        className="cursor-pointer"
                        disabled={disabled}
                        placeholder="Search options..."
                        value={search}
                        onValueChange={(val) => {
                            setSearch(val);
                            scrollEl?.scrollTo({ top: 0 });
                        }}
                    />
                    <CommandList ref={setScrollEl}>
                        {filteredOptions.length === 0 ? (
                            <CommandEmpty>No options found.</CommandEmpty>
                        ) : (
                            <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
                                {virtualizer.getVirtualItems().map((virtualItem) => {
                                    const option = filteredOptions[virtualItem.index];
                                    return (
                                        <CommandItem
                                            className="cursor-pointer"
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
