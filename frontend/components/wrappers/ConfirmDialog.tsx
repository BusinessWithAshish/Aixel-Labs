'use client';

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';
import type { ReactNode } from 'react';

type ConfirmDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    description?: string;
    alertMessage: ReactNode;
    onConfirm: () => void;
    isLoading?: boolean;
    confirmText?: string;
    cancelText?: string;
    variant?: 'destructive' | 'default';
};

export const ConfirmDialog = ({
    open,
    onOpenChange,
    title,
    description,
    alertMessage,
    onConfirm,
    isLoading = false,
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    variant = 'destructive',
}: ConfirmDialogProps) => {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                    {description && <DialogDescription>{description}</DialogDescription>}
                </DialogHeader>

                <Alert variant={variant}>
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>{alertMessage}</AlertDescription>
                </Alert>

                <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
                        {cancelText}
                    </Button>
                    <Button type="button" variant={variant} onClick={onConfirm} disabled={isLoading}>
                        {isLoading ? 'Processing...' : confirmText}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
