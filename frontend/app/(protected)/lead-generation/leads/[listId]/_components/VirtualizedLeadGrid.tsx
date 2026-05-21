'use client';

import type { Lead } from '@aixellabs/backend/db/types';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useLayoutEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { LeadListItem } from './LeadListItem';

/** Match Tailwind `sm` / `lg` / `xl` default breakpoints for grid columns */
const BP_SM = 640;
const BP_LG = 1024;
const BP_XL = 1280;

function columnsForWidth(w: number) {
    if (w >= BP_XL) return 4;
    if (w >= BP_LG) return 3;
    if (w >= BP_SM) return 2;
    return 1;
}

export type VirtualizedLeadGridProps = {
    leads: Lead[];
    selectedLeadIds: Set<string>;
    onToggleSelect: (leadId: string, selected: boolean) => void;
    className?: string;
};

export function VirtualizedLeadGrid({ leads, selectedLeadIds, onToggleSelect, className }: VirtualizedLeadGridProps) {
    const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);
    const [width, setWidth] = useState(0);

    useLayoutEffect(() => {
        if (!scrollEl) return;
        const ro = new ResizeObserver((entries) => {
            setWidth(entries[0]?.contentRect.width ?? 0);
        });
        ro.observe(scrollEl);
        return () => ro.disconnect();
    }, [scrollEl]);

    const colCount = width > 0 ? columnsForWidth(width) : 1;
    const rowCount = Math.ceil(leads.length / colCount);

    const virtualizer = useVirtualizer({
        count: rowCount,
        getScrollElement: () => scrollEl,
        /** Card block + `pb-3` row gap (matches `gap-3` between rows) */
        estimateSize: () => 272,
        overscan: 4,
        getItemKey: (index) => {
            const start = index * colCount;
            return `${colCount}-${start}-${String(leads[start]?._id ?? '')}`;
        },
    });

    return (
        <div
            ref={setScrollEl}
            aria-label="Lead results"
            className={cn('flex-1 overflow-y-auto p-1', className)}
        >
            <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
                {virtualizer.getVirtualItems().map((vRow) => {
                    const offset = vRow.index * colCount;
                    const slice = leads.slice(offset, offset + colCount);
                    return (
                        <div
                            key={vRow.key}
                            ref={virtualizer.measureElement}
                            data-index={vRow.index}
                            className="grid gap-3 pb-3 *:min-w-0"
                            style={{
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                width: '100%',
                                transform: `translateY(${vRow.start}px)`,
                                gridTemplateColumns: `repeat(${colCount}, minmax(0, 1fr))`,
                            }}
                        >
                            {slice.map((lead) => (
                                <LeadListItem
                                    key={lead._id as string}
                                    lead={lead}
                                    isSelected={selectedLeadIds.has(lead._id as string)}
                                    onToggleSelect={onToggleSelect}
                                />
                            ))}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
