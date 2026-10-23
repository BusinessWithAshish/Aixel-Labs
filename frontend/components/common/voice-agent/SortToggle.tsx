'use client';

import { ArrowDownAZ, ArrowDownNarrowWide } from 'lucide-react';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

export type ListSort = 'price' | 'name';

/** Two icon buttons ordering a list of models or voices: cheapest first, or by name. */
export function SortToggle({ value, onChange }: { value: ListSort; onChange: (sort: ListSort) => void }) {
    return (
        <ToggleGroup
            type="single"
            size="sm"
            variant="outline"
            value={value}
            onValueChange={(v) => v && onChange(v as ListSort)}
            aria-label="Sort"
            data-testid="sort-toggle"
        >
            <ToggleGroupItem value="price" aria-label="Cheapest first" title="Cheapest first">
                <ArrowDownNarrowWide aria-hidden />
            </ToggleGroupItem>
            <ToggleGroupItem value="name" aria-label="By name" title="By name">
                <ArrowDownAZ aria-hidden />
            </ToggleGroupItem>
        </ToggleGroup>
    );
}
