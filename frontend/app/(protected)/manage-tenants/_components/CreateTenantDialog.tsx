'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { createTenant, updateTenant } from '@/helpers/tenant-operations';
import type { Tenant, CreateTenantInput } from '@aixellabs/shared/mongodb';
import { toast } from 'sonner';

type CreateTenantDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    editingTenant?: Tenant | null;
    onSuccess?: () => void;
};

export function CreateTenantDialog({ open, onOpenChange, editingTenant, onSuccess }: CreateTenantDialogProps) {
    const [formData, setFormData] = useState<CreateTenantInput>({
        name: '',
        redirect_url: '',
    });
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (editingTenant) {
            setFormData({
                name: editingTenant.name,
                redirect_url: editingTenant.redirect_url || '',
            });
        } else {
            setFormData({
                name: '',
                redirect_url: '',
            });
        }
    }, [editingTenant, open]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);

        try {
            if (editingTenant) {
                const result = await updateTenant(editingTenant._id, formData);

                if (result) {
                    toast.success('Tenant updated successfully');
                    onSuccess?.();
                    onOpenChange(false);
                } else {
                    toast.error('Failed to update tenant');
                }
            } else {
                const result = await createTenant(formData);

                if (result) {
                    toast.success('Tenant created successfully');
                    onSuccess?.();
                    onOpenChange(false);
                } else {
                    toast.error('Failed to create tenant');
                }
            }
        } catch (error) {
            console.error('Error submitting tenant:', error);
            toast.error('An unexpected error occurred');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleChange = (field: keyof CreateTenantInput) => (e: React.ChangeEvent<HTMLInputElement>) => {
        setFormData((prev) => ({
            ...prev,
            [field]: e.target.value,
        }));
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{editingTenant ? 'Edit tenant' : 'Create a new tenant'}</DialogTitle>
                    <DialogDescription>
                        {editingTenant ? 'Update the tenant details below.' : 'Add a new tenant to your organization.'}
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit}>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="name">Name *</Label>
                            <Input
                                id="name"
                                placeholder="Tenant name"
                                value={formData.name}
                                onChange={handleChange('name')}
                                required
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="redirect_url">Redirect URL (Optional)</Label>
                            <Input
                                id="redirect_url"
                                type="url"
                                placeholder="https://example.com"
                                value={formData.redirect_url}
                                onChange={handleChange('redirect_url')}
                            />
                            <p className="text-xs text-muted-foreground">
                                Leave empty to auto-generate based on tenant name
                            </p>
                        </div>
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={isSubmitting}>
                            {isSubmitting ? 'Saving...' : editingTenant ? 'Update' : 'Create'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
