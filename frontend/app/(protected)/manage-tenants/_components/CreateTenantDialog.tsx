'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ZodColorPicker } from '@/components/common/zod-form-builder';
import { createTenant, updateTenant, type CreateTenantInput } from '@/helpers/tenant-operations';
import type { Tenant } from '@aixellabs/shared/mongodb';
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
        app_description: '',
        label: '',
        app_logo_url: '',
        app_theme_color: '',
    });
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (editingTenant) {
            setFormData({
                name: editingTenant.name,
                redirect_url: editingTenant.redirect_url || '',
                app_description: editingTenant.app_description || '',
                label: editingTenant.label,
                app_logo_url: editingTenant.app_logo_url || '',
                app_theme_color: editingTenant.app_theme_color || '',
            });
        } else {
            setFormData({
                name: '',
                redirect_url: '',
                app_description: '',
                label: '',
                app_logo_url: '',
                app_theme_color: '',
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

    const handleChange = (field: keyof CreateTenantInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
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
                                disabled={!!(editingTenant && editingTenant.redirect_url)}
                            />
                            <p className="text-xs text-muted-foreground">
                                {editingTenant && editingTenant.redirect_url
                                    ? 'Redirect URL cannot be changed once set'
                                    : 'Leave empty to auto-generate based on tenant name'}
                            </p>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="label">Label (Optional)</Label>
                            <Input
                                id="label"
                                type="text"
                                placeholder="Enter label for your app"
                                value={formData.label}
                                onChange={handleChange('label')}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="app_logo_url">Tenant app logo URL (Optional)</Label>
                            <Input
                                id="app_logo_url"
                                type="url"
                                placeholder="https://example.com/logo.png"
                                value={formData.app_logo_url}
                                onChange={handleChange('app_logo_url')}
                            />
                            <p className="text-xs text-muted-foreground">
                                If empty, the default Aixel Labs logo will be used.
                            </p>
                        </div>

                        <div className="space-y-2">
                            <ZodColorPicker
                                name="tenant-theme-color"
                                label="Tenant global theme color (Optional)"
                                description="Hex color for the tenant's primary theme (e.g. #4f46e5). Users can still override this in their account settings."
                                value={formData.app_theme_color || '#4f46e5'}
                                onChange={(color) =>
                                    setFormData((prev) => ({
                                        ...prev,
                                        app_theme_color: color ?? '',
                                    }))
                                }
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="app_description">App Description (Optional)</Label>
                            <Textarea
                                id="app_description"
                                placeholder="Enter app description for metadata"
                                value={formData.app_description}
                                onChange={handleChange('app_description')}
                                rows={3}
                            />
                            <p className="text-xs text-muted-foreground">
                                Add a description for your app to help with SEO and metadata.
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
