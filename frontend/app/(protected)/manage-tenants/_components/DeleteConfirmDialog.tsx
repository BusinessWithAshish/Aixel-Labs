'use client';

import { ConfirmDialog } from '@/components/wrappers/ConfirmDialog';

type DeleteConfirmDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    tenantName: string;
    onConfirm: () => void;
    isDeleting?: boolean;
};

export function DeleteConfirmDialog({ open, onOpenChange, tenantName, onConfirm, isDeleting }: DeleteConfirmDialogProps) {
    return (
        <ConfirmDialog
            open={open}
            onOpenChange={onOpenChange}
            title="Delete Tenant"
            description="This action cannot be undone."
            alertMessage={
                <>
                    You are about to delete <strong>{tenantName}</strong>. This will permanently remove the tenant and
                    all associated data.
                </>
            }
            onConfirm={onConfirm}
            isLoading={isDeleting}
            confirmText="Delete"
            variant="destructive"
        />
    );
}

