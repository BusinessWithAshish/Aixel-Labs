'use client';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export type ListSort = 'price' | 'name';

/** How a list of models or voices is ordered: cheapest first, or by name. */
export function SortSelect({ value, onChange }: { value: ListSort; onChange: (sort: ListSort) => void }) {
    return (
        <Select value={value} onValueChange={(v) => onChange(v as ListSort)}>
            <SelectTrigger size="sm" aria-label="Sort" className="w-36" data-testid="sort-select">
                <SelectValue />
            </SelectTrigger>
            <SelectContent>
                <SelectItem value="price">Cheapest first</SelectItem>
                <SelectItem value="name">Name</SelectItem>
            </SelectContent>
        </Select>
    );
}
