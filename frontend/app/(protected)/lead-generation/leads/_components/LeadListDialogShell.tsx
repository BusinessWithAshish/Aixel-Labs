'use client';

import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '@/components/ui/dialog';
import type { ReactNode } from 'react';

export function LeadListDialogShell({
    open,
    onOpenChange,
    title,
    description,
    children,
    footer,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    description?: ReactNode;
    children?: ReactNode;
    footer: ReactNode;
}) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                    {description != null ? (
                        typeof description === 'string' ? (
                            <DialogDescription>{description}</DialogDescription>
                        ) : (
                            description
                        )
                    ) : null}
                </DialogHeader>
                {children}
                <DialogFooter>{footer}</DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
