"use client"

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"

type CreateTenantDialogProps = {
    open: boolean
    onOpenChange: (open: boolean) => void
}

export function CreateTenantDialog({ open, onOpenChange }: CreateTenantDialogProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Create a new tenant</DialogTitle>
                    <DialogDescription>
                        Add a new tenant to your organization.
                    </DialogDescription>
                </DialogHeader>
                {/* Empty dialog body as per requirements */}
            </DialogContent>
        </Dialog>
    )
}
