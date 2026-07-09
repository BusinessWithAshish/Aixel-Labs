'use client';

import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ChevronDown, FolderPlus, ListChecks, ListOrdered, ListX, Send, Sparkles, Trash2, type LucideIcon } from 'lucide-react';
import { toast } from 'sonner';

const DELETE_ITEM_CLASS =
    'text-red-500 focus:text-red-600 focus:bg-red-500/10 data-highlighted:text-red-600 data-highlighted:bg-red-500/10 dark:focus:text-red-400 dark:data-highlighted:text-red-400 dark:focus:bg-red-500/15 dark:data-highlighted:bg-red-500/15 [&_svg]:text-red-500! data-highlighted:[&_svg]:text-red-600! dark:[&_svg]:text-red-400! dark:data-highlighted:[&_svg]:text-red-300!';

const DESELECT_ITEM_CLASS =
    'text-amber-700 focus:text-amber-900 focus:bg-amber-500/15 data-highlighted:text-amber-900 data-highlighted:bg-amber-500/15 dark:text-amber-500 dark:focus:text-amber-100 dark:data-highlighted:text-amber-100 dark:focus:bg-amber-500/20 dark:data-highlighted:bg-amber-500/20 [&_svg]:text-amber-600! data-highlighted:[&_svg]:text-amber-900! dark:[&_svg]:text-amber-500! dark:data-highlighted:[&_svg]:text-amber-100!';

const SELECT_ALL_ITEM_CLASS =
    'text-primary focus:text-primary focus:bg-primary/10 data-highlighted:text-primary data-highlighted:bg-primary/10 dark:focus:bg-primary/15 dark:data-highlighted:bg-primary/15 [&_svg]:text-primary! data-highlighted:[&_svg]:text-primary! dark:[&_svg]:text-primary! dark:data-highlighted:[&_svg]:text-primary!';

const PLANNED_BULK_ACTIONS: ReadonlyArray<{ label: string; icon: LucideIcon }> = [
    { label: 'Send to CRM', icon: Send },
    { label: 'Move to sequence', icon: ListOrdered },
    { label: 'Enrich', icon: Sparkles },
];

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
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button className="gap-2" aria-haspopup="menu" disabled={selectedCount === 0}>
                    {`Actions${selectedCount > 0 ? ` (${selectedCount})` : ''}`}
                    <ChevronDown className="size-4" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                <DropdownMenuGroup aria-label="Selection">
                    {onSelectAll ? (
                        <DropdownMenuItem
                            className={SELECT_ALL_ITEM_CLASS}
                            disabled={selectAllDisabled}
                            onSelect={() => onSelectAll()}
                        >
                            <ListChecks className="size-4" />
                            Select all
                        </DropdownMenuItem>
                    ) : null}
                    <DropdownMenuItem className={DESELECT_ITEM_CLASS} onSelect={() => onDeselectAll()}>
                        <ListX className="size-4" />
                        {deselectAllLabel}
                    </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuGroup aria-label="Lead bulk actions">
                    {onCreateListFromFilters ? (
                        <DropdownMenuItem
                            disabled={createListFromFiltersDisabled}
                            onSelect={() => onCreateListFromFilters()}
                        >
                            <FolderPlus className="size-4" />
                            Create list from filters
                        </DropdownMenuItem>
                    ) : null}
                    {PLANNED_BULK_ACTIONS.map(({ label, icon: Icon }) => (
                        <DropdownMenuItem key={label} onSelect={notifyActionComingSoon}>
                            <Icon className="size-4" />
                            {label}
                        </DropdownMenuItem>
                    ))}
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem className={DELETE_ITEM_CLASS} onSelect={() => onDelete()}>
                    <Trash2 className="size-4" />
                    {deleteLabel}
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
