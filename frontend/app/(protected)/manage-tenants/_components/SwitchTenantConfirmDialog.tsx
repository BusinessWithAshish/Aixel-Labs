'use client';

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

type SwitchTenantConfirmDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    targetTenantName: string;
    /** Where to send the browser after confirm (usually other subdomain URL). */
    targetUrl: string;
    description?: string;
};

/**
 * Explains that admin mutations are scoped to the current host tenant,
 * then navigates to the target tenant host on confirm.
 */
export function SwitchTenantConfirmDialog({
    open,
    onOpenChange,
    targetTenantName,
    targetUrl,
    description,
}: SwitchTenantConfirmDialogProps) {
    const handleConfirm = () => {
        window.location.assign(targetUrl);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Switch to {targetTenantName}?</DialogTitle>
                    <DialogDescription>
                        {description ??
                            `User and tenant changes only apply on the tenant you are signed into. Continue to ${targetTenantName} to manage it there.`}
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button type="button" onClick={handleConfirm}>
                        Switch tenant
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
