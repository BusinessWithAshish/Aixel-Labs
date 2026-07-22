'use client';

import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItems,
    DropdownMenuPortal,
    DropdownMenuSub,
    DropdownMenuSubContent,
    DropdownMenuSubTrigger,
    DropdownMenuTrigger,
    type DropdownMenuOption,
} from '@/components/ui/dropdown-menu';
import {
    ChevronDown,
    Download,
    Eye,
    FolderPlus,
    ListChecks,
    ListOrdered,
    ListX,
    Send,
    Sparkles,
    Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { LEAD_EXPORT_FORMATS, type LeadExportFormat } from '../_utils/export-leads';

function notifyActionComingSoon() {
    toast.info("This action is coming soon — we're still working on it.");
}

export type LeadBulkActionsDropdownProps = {
    selectedCount: number;
    onSelectAll?: () => void;
    selectAllDisabled?: boolean;
    onDeselectAll: () => void;
    onDelete: () => void;
    onExport?: (format: LeadExportFormat) => void;
    onPreviewExport?: () => void;
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
    onExport,
    onPreviewExport,
    onCreateListFromFilters,
    createListFromFiltersDisabled,
    deselectAllLabel = 'Deselect all',
    deleteLabel = 'Delete',
}: LeadBulkActionsDropdownProps) {
    const hasSelection = selectedCount > 0;
    const showExport = Boolean(onExport || onPreviewExport);

    const primaryOptions: DropdownMenuOption[] = [
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
            disabled: !hasSelection,
            onSelect: () => onDeselectAll(),
        },
        { type: 'separator', key: 'sep-selection' },
        {
            key: 'create-list',
            label: 'Create list from filters',
            icon: FolderPlus,
            hidden: !onCreateListFromFilters,
            disabled: !hasSelection || createListFromFiltersDisabled,
            onSelect: () => onCreateListFromFilters?.(),
        },
        {
            key: 'send-to-crm',
            label: 'Send to CRM',
            icon: Send,
            disabled: !hasSelection,
            onSelect: notifyActionComingSoon,
        },
        {
            key: 'move-to-sequence',
            label: 'Move to sequence',
            icon: ListOrdered,
            disabled: !hasSelection,
            onSelect: notifyActionComingSoon,
        },
        {
            key: 'enrich',
            label: 'Enrich',
            icon: Sparkles,
            disabled: !hasSelection,
            onSelect: notifyActionComingSoon,
        },
    ];

    const deleteOptions: DropdownMenuOption[] = [
        { type: 'separator', key: 'sep-delete' },
        {
            key: 'delete',
            label: deleteLabel,
            icon: Trash2,
            variant: 'destructive',
            disabled: !hasSelection,
            onSelect: () => onDelete(),
        },
    ];

    const exportOptions: DropdownMenuOption[] = [
        {
            key: 'preview-edit',
            label: 'Preview & edit…',
            icon: Eye,
            hidden: !onPreviewExport,
            onSelect: () => onPreviewExport?.(),
        },
        {
            type: 'separator',
            key: 'sep-export-formats',
            hidden: !onPreviewExport || !onExport,
        },
        ...(onExport
            ? LEAD_EXPORT_FORMATS.map((format) => ({
                  key: format.value,
                  label: format.label,
                  onSelect: () => onExport(format.value),
              }))
            : []),
    ];

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button className="gap-2" aria-haspopup="menu">
                    {`Actions${hasSelection ? ` (${selectedCount})` : ''}`}
                    <ChevronDown className="size-4" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                <DropdownMenuGroup>
                    <DropdownMenuItems options={primaryOptions} />
                    {showExport ? (
                        <DropdownMenuSub>
                            <DropdownMenuSubTrigger
                                className={
                                    hasSelection
                                        ? 'gap-2'
                                        : 'gap-2 opacity-50 pointer-events-none'
                                }
                                disabled={!hasSelection}
                            >
                                <Download className="size-4 text-muted-foreground" />
                                Export
                            </DropdownMenuSubTrigger>
                            <DropdownMenuPortal>
                                <DropdownMenuSubContent>
                                    <DropdownMenuItems options={exportOptions} />
                                </DropdownMenuSubContent>
                            </DropdownMenuPortal>
                        </DropdownMenuSub>
                    ) : null}
                    <DropdownMenuItems options={deleteOptions} />
                </DropdownMenuGroup>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
