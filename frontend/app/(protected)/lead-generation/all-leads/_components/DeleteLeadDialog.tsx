'use client';

import { ConfirmDialog } from '@/components/ui/wrappers/ConfirmDialog';

type DeleteLeadDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    leadName: string;
    onConfirm: () => void;
    isDeleting?: boolean;
};

export const DeleteLeadDialog = ({ open, onOpenChange, leadName, onConfirm, isDeleting }: DeleteLeadDialogProps) => {
    return (
        <ConfirmDialog
            open={open}
            onOpenChange={onOpenChange}
            title="Delete Lead"
            description="This action cannot be undone."
            alertMessage={
                <>
                    You are about to delete <strong>{leadName}</strong>. This will permanently remove this lead from
                    your saved leads.
                </>
            }
            onConfirm={onConfirm}
            isLoading={isDeleting}
            confirmText="Delete"
            variant="destructive"
        />
    );
};
