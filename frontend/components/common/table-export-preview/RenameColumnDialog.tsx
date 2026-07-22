'use client';

import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useEffect, useState } from 'react';

export type RenameColumnDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    initialName: string;
    onConfirm: (name: string) => void;
};

export function RenameColumnDialog({
    open,
    onOpenChange,
    initialName,
    onConfirm,
}: RenameColumnDialogProps) {
    const [name, setName] = useState(initialName);

    useEffect(() => {
        if (open) setName(initialName);
    }, [open, initialName]);

    const trimmed = name.trim();

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Rename column</DialogTitle>
                    <DialogDescription>This name becomes the header in your download.</DialogDescription>
                </DialogHeader>
                <div className="space-y-2">
                    <Label htmlFor="export-column-name">Column name</Label>
                    <Input
                        id="export-column-name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && trimmed) {
                                e.preventDefault();
                                onConfirm(trimmed);
                            }
                        }}
                        autoFocus
                    />
                </div>
                <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button type="button" disabled={!trimmed} onClick={() => onConfirm(trimmed)}>
                        Save
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
