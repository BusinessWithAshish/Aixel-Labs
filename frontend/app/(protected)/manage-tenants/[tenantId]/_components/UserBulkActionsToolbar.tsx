'use client';

import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItems,
    DropdownMenuTrigger,
    type DropdownMenuOption,
} from '@/components/ui/dropdown-menu';
import { ChevronDown, ListChecks, ListX, Shield, Users } from 'lucide-react';

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

    const options: DropdownMenuOption[] = [
        {
            type: 'label',
            key: 'selection-summary',
            label:
                selectedCount > 0
                    ? `${selectedCount} user${selectedCount === 1 ? '' : 's'} selected`
                    : 'Select users, or update everyone',
            className: 'text-xs font-normal text-muted-foreground',
        },
        { type: 'separator', key: 'sep-label' },
        {
            key: 'select-all',
            label: 'Select all visible',
            icon: ListChecks,
            variant: 'primary',
            disabled: selectAllDisabled,
            onSelect: () => onSelectAll(),
        },
        {
            key: 'clear-selection',
            label: 'Clear selection',
            icon: ListX,
            variant: 'warning',
            disabled: clearDisabled,
            onSelect: () => onDeselectAll(),
        },
        { type: 'separator', key: 'sep-actions' },
        {
            key: 'update-selected',
            label:
                selectedCount > 0
                    ? `Update selected (${selectedCount})`
                    : 'Update selected',
            icon: Shield,
            disabled: updateSelectedDisabled,
            onSelect: () => onEditSelectedModuleAccess(),
        },
        {
            key: 'update-all',
            label: 'Update all in tenant',
            icon: Users,
            disabled: applyToAllDisabled,
            onSelect: () => onApplyToAllUsers(),
        },
    ];

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
                <DropdownMenuItems options={options} />
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
