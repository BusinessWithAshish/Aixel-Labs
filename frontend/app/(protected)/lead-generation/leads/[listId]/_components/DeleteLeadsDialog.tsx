'use client';

import { ConfirmDialog } from '@/components/wrappers/ConfirmDialog';

type DeleteLeadsDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    count: number;
    onConfirm: () => void;
    isDeleting?: boolean;
};

export const DeleteLeadsDialog = ({
    open,
    onOpenChange,
    count,
    onConfirm,
    isDeleting,
}: DeleteLeadsDialogProps) => {
    return (
        <ConfirmDialog
            open={open}
            onOpenChange={onOpenChange}
            title="Delete Selected Leads"
            description="This action cannot be undone."
            alertMessage={
                <>
                    You are about to delete <strong>{count}</strong> lead(s). This will
                    permanently remove all these leads from your saved leads.
                </>
            }
            onConfirm={onConfirm}
            isLoading={isDeleting}
            confirmText="Delete Selected"
            variant="destructive"
        />
    );
};
