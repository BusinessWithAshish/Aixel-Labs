'use client';

import { ConfirmDialog } from '@/components/wrappers/ConfirmDialog';

type DeleteUserConfirmDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    userEmail: string;
    onConfirm: () => void;
    isDeleting?: boolean;
};

export function DeleteUserConfirmDialog({
    open,
    onOpenChange,
    userEmail,
    onConfirm,
    isDeleting,
}: DeleteUserConfirmDialogProps) {
    return (
        <ConfirmDialog
            open={open}
            onOpenChange={onOpenChange}
            title="Delete User"
            description="This action cannot be undone."
            alertMessage={
                <>
                    You are about to delete user <strong>{userEmail}</strong>. This will permanently remove the user
                    from this tenant.
                </>
            }
            onConfirm={onConfirm}
            isLoading={isDeleting}
            confirmText="Delete"
            variant="destructive"
        />
    );
}

