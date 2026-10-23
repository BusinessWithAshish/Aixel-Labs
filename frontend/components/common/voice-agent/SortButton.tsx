'use client';

import { ArrowDownAZ, ArrowDownNarrowWide } from 'lucide-react';
import { Button } from '@/components/ui/button';

export type ListSort = 'price' | 'name';

/** Beside a list of models or voices: one click switches its order between cheapest first and by name. */
export function SortButton({ value, onChange }: { value: ListSort; onChange: (sort: ListSort) => void }) {
    const next = value === 'price' ? 'name' : 'price';
    const label = next === 'name' ? 'Sort by name' : 'Sort cheapest first';
    return (
        <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-9 shrink-0"
            onClick={() => onChange(next)}
            aria-label={label}
            title={label}
            data-testid="sort-button"
        >
            {value === 'price' ? <ArrowDownNarrowWide aria-hidden /> : <ArrowDownAZ aria-hidden />}
        </Button>
    );
}
