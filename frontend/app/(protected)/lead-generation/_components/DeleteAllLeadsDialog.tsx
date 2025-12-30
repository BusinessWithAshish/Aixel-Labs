'use client';

import { ConfirmDialog } from '@/components/wrappers/ConfirmDialog';

type DeleteAllLeadsDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    category: string;
    count: number;
    onConfirm: () => void;
    isDeleting?: boolean;
};

export const DeleteAllLeadsDialog = ({
    open,
    onOpenChange,
    category,
    count,
    onConfirm,
    isDeleting,
}: DeleteAllLeadsDialogProps) => {
    return (
        <ConfirmDialog
            open={open}
            onOpenChange={onOpenChange}
            title="Delete All Leads"
            description="This action cannot be undone."
            alertMessage={
                <>
                    You are about to delete <strong>{count}</strong> lead(s) from <strong>{category}</strong>. This will
                    permanently remove all these leads from your saved leads.
                </>
            }
            onConfirm={onConfirm}
            isLoading={isDeleting}
            confirmText="Delete All"
            variant="destructive"
        />
    );
};
