'use client';

import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItems,
    DropdownMenuTrigger,
    type DropdownMenuOption,
} from '@/components/ui/dropdown-menu';
import { ChevronDown, FolderPlus, ListChecks, ListOrdered, ListX, Send, Sparkles, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

function notifyActionComingSoon() {
    toast.info("This action is coming soon — we're still working on it.");
}

export type LeadBulkActionsDropdownProps = {
    selectedCount: number;
    onSelectAll?: () => void;
    selectAllDisabled?: boolean;
    onDeselectAll: () => void;
    onDelete: () => void;
    onCreateListFromFilters?: () => void;
    createListFromFiltersDisabled?: boolean;
    deselectAllLabel?: string;
    deleteLabel?: string;
};

export function LeadBulkActionsDropdown({
    selectedCount,
    onSelectAll,
    selectAllDisabled,
    onDeselectAll,
    onDelete,
    onCreateListFromFilters,
    createListFromFiltersDisabled,
    deselectAllLabel = 'Deselect all',
    deleteLabel = 'Delete',
}: LeadBulkActionsDropdownProps) {
    const options: DropdownMenuOption[] = [
        {
            key: 'select-all',
            label: 'Select all',
            icon: ListChecks,
            variant: 'primary',
            hidden: !onSelectAll,
            disabled: selectAllDisabled,
            onSelect: () => onSelectAll?.(),
        },
        {
            key: 'deselect-all',
            label: deselectAllLabel,
            icon: ListX,
            variant: 'warning',
            onSelect: () => onDeselectAll(),
        },
        { type: 'separator', key: 'sep-selection' },
        {
            key: 'create-list',
            label: 'Create list from filters',
            icon: FolderPlus,
            hidden: !onCreateListFromFilters,
            disabled: createListFromFiltersDisabled,
            onSelect: () => onCreateListFromFilters?.(),
        },
        {
            key: 'send-to-crm',
            label: 'Send to CRM',
            icon: Send,
            onSelect: notifyActionComingSoon,
        },
        {
            key: 'move-to-sequence',
            label: 'Move to sequence',
            icon: ListOrdered,
            onSelect: notifyActionComingSoon,
        },
        {
            key: 'enrich',
            label: 'Enrich',
            icon: Sparkles,
            onSelect: notifyActionComingSoon,
        },
        { type: 'separator', key: 'sep-delete' },
        {
            key: 'delete',
            label: deleteLabel,
            icon: Trash2,
            variant: 'destructive',
            onSelect: () => onDelete(),
        },
    ];

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button className="gap-2" aria-haspopup="menu" disabled={selectedCount === 0}>
                    {`Actions${selectedCount > 0 ? ` (${selectedCount})` : ''}`}
                    <ChevronDown className="size-4" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                <DropdownMenuItems options={options} />
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
