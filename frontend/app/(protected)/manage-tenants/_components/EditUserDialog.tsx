'use client';

import { useState, useEffect } from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import type { User } from '@/helpers/user-operations';

type EditUserDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    user: User | null;
    onSuccess?: () => void;
};

export function EditUserDialog({ open, onOpenChange, user, onSuccess }: EditUserDialogProps) {
    const [name, setName] = useState('');
    const [isAdmin, setIsAdmin] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (user) {
            setName(user.name || '');
            setIsAdmin(user.isAdmin);
        }
    }, [user]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return;

        setIsSubmitting(true);

        try {
            const response = await fetch('/api/users', {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    id: user._id,
                    name: name.trim() || undefined,
                    isAdmin,
                }),
            });

            const data = await response.json();

            if (data.success) {
                toast.success('User updated successfully');
                onOpenChange(false);
                onSuccess?.();
            } else {
                toast.error(data.error || 'Failed to update user');
            }
        } catch (error) {
            toast.error('An error occurred while updating user');
            console.error('Update user error:', error);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Edit User</DialogTitle>
                    <DialogDescription>Update user details. Click save when you're done.</DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit}>
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label htmlFor="email">Email</Label>
                            <Input id="email" type="email" value={user?.email || ''} disabled className="bg-muted" />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="name">Name</Label>
                            <Input
                                id="name"
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="Enter user name"
                            />
                        </div>
                        <div className="flex items-center gap-2">
                            <Checkbox id="isAdmin" checked={isAdmin} onCheckedChange={(checked) => setIsAdmin(checked === true)} />
                            <Label htmlFor="isAdmin" className="cursor-pointer">
                                Admin privileges
                            </Label>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={isSubmitting}>
                            {isSubmitting ? 'Saving...' : 'Save changes'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
