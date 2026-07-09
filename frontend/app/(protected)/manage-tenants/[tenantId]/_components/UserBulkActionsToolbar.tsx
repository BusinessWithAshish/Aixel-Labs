'use client';

import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ChevronDown, ListChecks, ListX, Shield, Users } from 'lucide-react';

const SELECT_ALL_ITEM_CLASS =
    'text-primary focus:text-primary focus:bg-primary/10 data-highlighted:text-primary data-highlighted:bg-primary/10 dark:focus:bg-primary/15 dark:data-highlighted:bg-primary/15 [&_svg]:text-primary! data-highlighted:[&_svg]:text-primary! dark:[&_svg]:text-primary! dark:data-highlighted:[&_svg]:text-primary!';

const CLEAR_ITEM_CLASS =
    'text-amber-700 focus:text-amber-900 focus:bg-amber-500/15 data-highlighted:text-amber-900 data-highlighted:bg-amber-500/15 dark:text-amber-500 dark:focus:text-amber-100 dark:data-highlighted:text-amber-100 dark:focus:bg-amber-500/20 dark:data-highlighted:bg-amber-500/20 [&_svg]:text-amber-600! data-highlighted:[&_svg]:text-amber-900! dark:[&_svg]:text-amber-500! dark:data-highlighted:[&_svg]:text-amber-100!';

export type UserBulkActionsToolbarProps = {
    selectedCount: number;
    filteredCount: number;
    totalCount: number;
    onSelectAll: () => void;
    onDeselectAll: () => void;
    onEditSelectedModuleAccess: () => void;
    onApplyToAllUsers: () => void;
};

export function UserBulkActionsToolbar({
    selectedCount,
    filteredCount,
    totalCount,
    onSelectAll,
    onDeselectAll,
    onEditSelectedModuleAccess,
    onApplyToAllUsers,
}: UserBulkActionsToolbarProps) {
    const allFilteredSelected = filteredCount > 0 && selectedCount === filteredCount;
    const selectAllDisabled = filteredCount === 0 || allFilteredSelected;
    const clearDisabled = selectedCount === 0;
    const updateSelectedDisabled = selectedCount === 0;
    const applyToAllDisabled = totalCount === 0;

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button type="button" variant="outline" className="gap-2 shrink-0" aria-haspopup="menu">
                    <Shield className="size-4" />
                    {selectedCount > 0 ? `Module access (${selectedCount})` : 'Module access'}
                    <ChevronDown className="size-4 opacity-60" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                    {selectedCount > 0
                        ? `${selectedCount} user${selectedCount === 1 ? '' : 's'} selected`
                        : 'Select users, or update everyone'}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuGroup aria-label="Selection">
                    <DropdownMenuItem
                        className={SELECT_ALL_ITEM_CLASS}
                        disabled={selectAllDisabled}
                        onSelect={() => onSelectAll()}
                    >
                        <ListChecks className="size-4" />
                        Select all visible
                    </DropdownMenuItem>
                    <DropdownMenuItem
                        className={CLEAR_ITEM_CLASS}
                        disabled={clearDisabled}
                        onSelect={() => onDeselectAll()}
                    >
                        <ListX className="size-4" />
                        Clear selection
                    </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuGroup aria-label="Module access">
                    <DropdownMenuItem
                        disabled={updateSelectedDisabled}
                        onSelect={() => onEditSelectedModuleAccess()}
                    >
                        <Shield className="size-4" />
                        {selectedCount > 0
                            ? `Update selected (${selectedCount})`
                            : 'Update selected'}
                    </DropdownMenuItem>
                    <DropdownMenuItem disabled={applyToAllDisabled} onSelect={() => onApplyToAllUsers()}>
                        <Users className="size-4" />
                        Update all in tenant
                    </DropdownMenuItem>
                </DropdownMenuGroup>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
