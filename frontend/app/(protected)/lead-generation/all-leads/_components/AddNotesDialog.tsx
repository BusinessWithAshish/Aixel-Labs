'use client';

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useState } from 'react';

type AddNotesDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onConfirm: (notes: string) => void;
    isLoading?: boolean;
    initialNotes?: string;
};

export const AddNotesDialog = ({ open, onOpenChange, onConfirm, isLoading, initialNotes = '' }: AddNotesDialogProps) => {
    const [notes, setNotes] = useState(initialNotes);

    const handleConfirm = () => {
        onConfirm(notes);
        setNotes('');
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Add Notes</DialogTitle>
                    <DialogDescription>Add or update notes for the selected lead(s).</DialogDescription>
                </DialogHeader>

                <div className="space-y-2">
                    <Label htmlFor="notes">Notes</Label>
                    <Input
                        id="notes"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Enter notes..."
                        disabled={isLoading}
                    />
                </div>

                <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
                        Cancel
                    </Button>
                    <Button type="button" onClick={handleConfirm} disabled={isLoading}>
                        {isLoading ? 'Saving...' : 'Save'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
