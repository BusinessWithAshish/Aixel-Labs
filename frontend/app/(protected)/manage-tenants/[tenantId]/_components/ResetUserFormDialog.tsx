'use client';

import { ConfirmDialog } from '@/components/wrappers/ConfirmDialog';

type ResetUserFormDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    userEmail: string;
    onConfirm: () => void;
};

export function ResetUserFormDialog({ open, onOpenChange, userEmail, onConfirm }: ResetUserFormDialogProps) {
    return (
        <ConfirmDialog
            open={open}
            onOpenChange={onOpenChange}
            title="Reset form"
            description="Discard unsaved changes for this user."
            alertMessage={
                <>
                    Reset the form for <strong>{userEmail}</strong>? Name, admin privileges, credits, and module access
                    will return to their last saved values.
                </>
            }
            onConfirm={() => {
                onConfirm();
                onOpenChange(false);
            }}
            confirmText="Reset"
            variant="default"
        />
    );
}
