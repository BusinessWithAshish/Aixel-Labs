'use client';

import { useMemo, useState, type CSSProperties } from 'react';
import { CheckIcon, ChevronsUpDownIcon, XIcon } from 'lucide-react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
    CommandSeparator,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { OptionType } from '@/components/ui/searchable-select';
import { cn } from '@/lib/utils';

export type OptionGroupType = OptionType & {
    group: string;
};

type SearchableGroupedMultiSelectProps = {
    options: OptionGroupType[];
    placeholder?: string;
    disabled?: boolean;
    values?: string[];
    onChange?: (val: string[]) => void;
    className?: string;
};

type Row =
    | { type: 'separator' }
    | { type: 'group'; label: string }
    | { type: 'item'; option: OptionGroupType };

function groupOrdered(options: OptionGroupType[]): { label: string; options: OptionGroupType[] }[] {
    const map = new Map<string, OptionGroupType[]>();
    const order: string[] = [];
    for (const o of options) {
        if (!map.has(o.group)) {
            order.push(o.group);
            map.set(o.group, []);
        }
        map.get(o.group)!.push(o);
    }
    return order.map((label) => ({ label, options: map.get(label)! }));
}

function rowHeight(row: Row): number {
    if (row.type === 'separator') return 9;
    if (row.type === 'group') return 32;
    return 32;
}

export function SearchableGroupedMultiSelect({
    options,
    placeholder = 'Select options...',
    values,
    disabled = false,
    onChange,
    className,
}: SearchableGroupedMultiSelectProps) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);

    const selectedValues =
        values?.map((v) => options.find((o) => o.value === v) ?? { value: v, label: String(v), group: '' }) || [];

    const filteredOptions = useMemo(
        () =>
            search
                ? options.filter((o) => o.label.toLowerCase().includes(search.toLowerCase()))
                : options,
        [options, search],
    );

    const grouped = useMemo(() => groupOrdered(filteredOptions), [filteredOptions]);

    const rows = useMemo(() => {
        const r: Row[] = [];
        for (let i = 0; i < grouped.length; i++) {
            const g = grouped[i];
            if (g.options.length === 0) continue;
            if (r.length > 0) r.push({ type: 'separator' });
            r.push({ type: 'group', label: g.label });
            for (const o of g.options) r.push({ type: 'item', option: o });
        }
        return r;
    }, [grouped]);

    const virtualizer = useVirtualizer({
        count: rows.length,
        getScrollElement: () => scrollEl,
        estimateSize: (index) => rowHeight(rows[index]!),
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
                        {rows.length === 0 ? (
                            <CommandEmpty>No options found.</CommandEmpty>
                        ) : (
                            <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
                                {virtualizer.getVirtualItems().map((virtualItem) => {
                                    const row = rows[virtualItem.index]!;
                                    const style: CSSProperties = {
                                        position: 'absolute',
                                        top: 0,
                                        left: 0,
                                        width: '100%',
                                        height: `${virtualItem.size}px`,
                                        transform: `translateY(${virtualItem.start}px)`,
                                    };

                                    if (row.type === 'separator') {
                                        return (
                                            <CommandSeparator key={virtualItem.key} style={style} />
                                        );
                                    }

                                    if (row.type === 'group') {
                                        return (
                                            <CommandGroup
                                                key={virtualItem.key}
                                                heading={row.label}
                                                style={style}
                                                className="p-0 overflow-visible"
                                            />
                                        );
                                    }

                                    const option = row.option;
                                    return (
                                        <CommandItem
                                            className="cursor-pointer"
                                            key={virtualItem.key}
                                            value={option.value}
                                            style={style}
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
