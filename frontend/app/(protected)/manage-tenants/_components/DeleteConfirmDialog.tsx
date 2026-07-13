'use client';

import { ConfirmDialog } from '@/components/wrappers/ConfirmDialog';

type DeleteConfirmDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    tenantName: string;
    userCount: number | null;
    onConfirm: () => void;
    isDeleting?: boolean;
};

export function DeleteConfirmDialog({
    open,
    onOpenChange,
    tenantName,
    userCount,
    onConfirm,
    isDeleting,
}: DeleteConfirmDialogProps) {
    const userLabel =
        userCount === null
            ? 'its users'
            : `${userCount} user${userCount === 1 ? '' : 's'}`;

    return (
        <ConfirmDialog
            open={open}
            onOpenChange={onOpenChange}
            title="Delete Tenant"
            description="This action cannot be undone."
            alertMessage={
                <>
                    You are about to delete <strong>{tenantName}</strong>. This permanently removes the tenant,{' '}
                    {userLabel}, and their lead lists / lead links. Shared lead records are kept. Firebase sign-in
                    identities are not deleted.
                </>
            }
            onConfirm={onConfirm}
            isLoading={isDeleting}
            confirmText={
                userCount === null
                    ? 'Delete'
                    : `Delete tenant and ${userCount} user${userCount === 1 ? '' : 's'}`
            }
            variant="destructive"
        />
    );
}

