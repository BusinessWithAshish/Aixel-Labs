'use client';

import { CardContent } from '@/components/ui/card';
import { usePage } from '@/contexts/PageStore';
import type { TUseUserLeadListsPageReturn } from '../_hooks/use-user-lead-lists-page';
import { LeadListItemCard } from './LeadListItemCard';

export function LeadListsBody() {
    const { filteredLists, selectedIds, toggleSelect } = usePage<TUseUserLeadListsPageReturn>();

    return (
        <CardContent className="grid grid-cols-1 gap-2 py-2 overflow-y-auto">
            {filteredLists.map((list, index) => {
                const rowId = list._id ?? '';
                return (
                    <LeadListItemCard
                        list={list}
                        key={rowId || `list-${index}`}
                        selected={selectedIds.has(rowId)}
                        onToggleSelect={toggleSelect}
                    />
                );
            })}
        </CardContent>
    );
}
