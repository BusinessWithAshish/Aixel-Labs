'use client';

import { useEffect } from 'react';
import { useForm, FormProvider } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import z from 'zod';
import { ColorPickerControlledField, StringControlledField } from '@/components/common/zod-form-builder/ZodControlledFields';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { createTenant, updateTenant, type CreateTenantInput } from '@/helpers/tenant-operations';
import type { Tenant } from '@aixellabs/shared/mongodb';
import { toast } from 'sonner';

type CreateTenantDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    editingTenant?: Tenant | null;
    onSuccess?: () => void;
};

const tenantSchema = z.object({
    name: z.string().min(1, 'Tenant name is required'),
    redirect_url: z.string().optional(),
    app_description: z.string().optional(),
    label: z.string().optional(),
    app_logo_url: z.string().optional(),
    app_theme_color: z.string().optional(),
});

export const createTenantFormName = 'create-tenant-form';
type TenantFormValues = z.infer<typeof tenantSchema>;

export function CreateTenantDialog({ open, onOpenChange, editingTenant, onSuccess }: CreateTenantDialogProps) {
    const form = useForm<TenantFormValues>({
        resolver: zodResolver(tenantSchema),
        defaultValues: {
            name: '',
            redirect_url: '',
            app_description: '',
            label: '',
            app_logo_url: '',
            app_theme_color: '',
        },
    });

    const { handleSubmit, reset, formState: { isSubmitting } } = form;

    useEffect(() => {
        if (!open) return;

        if (editingTenant) {
            reset({
                name: editingTenant.name ?? '',
                redirect_url: editingTenant.redirect_url ?? '',
                app_description: editingTenant.app_description ?? '',
                label: editingTenant.label ?? '',
                app_logo_url: editingTenant.app_logo_url ?? '',
                app_theme_color: editingTenant.app_theme_color ?? '',
            });
        } else {
            reset({
                name: '',
                redirect_url: '',
                app_description: '',
                label: '',
                app_logo_url: '',
                app_theme_color: '',
            });
        }
    }, [editingTenant, open, reset]);

    const onSubmit = async (values: TenantFormValues) => {
        const payload: CreateTenantInput = {
            name: values.name.trim(),
            label: values.label?.trim() ?? '',
            redirect_url: values.redirect_url?.trim() || undefined,
            app_description: values.app_description?.trim() || undefined,
            app_logo_url: values.app_logo_url?.trim() || undefined,
            app_theme_color: values.app_theme_color?.trim() || undefined,
        };

        try {
            if (editingTenant) {
                const result = await updateTenant(editingTenant._id, payload);

                if (result) {
                    toast.success('Tenant updated successfully');
                    onSuccess?.();
                    onOpenChange(false);
                } else {
                    toast.error('Failed to update tenant');
                }
            } else {
                const result = await createTenant(payload);

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
        }
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

                <FormProvider {...form}>
                    <form id={createTenantFormName} onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-4">

                        <StringControlledField
                            name="name"
                            disabled={true}
                            label="Tenant name"
                            description="Tip: This is the name of the tenant that will be used to identify the tenant in the system."
                            required
                        />

                        {/* NOTE: Never allow to change the redirect URL */}
                        {/* <StringControlledField
                            name="redirect_url"
                            label="Redirect URL"
                            disabled={true}
                            description="Tenant's redirect URL. Leave empty to auto-generate from tenant name. Cannot be changed once set."
                            required
                        /> */}

                        <StringControlledField
                            name="label"
                            label="Tenant label"
                            description="Tip: This is the label of the tenant that will be used to identify the tenant in the system."
                        />

                        <StringControlledField
                            name="app_description"
                            label="App description"
                            description="This is the description of the tenant."
                        />

                        <StringControlledField
                            name="app_logo_url"
                            label="Tenant app logo URL"
                            description="This is the URL of the tenant's logo."
                        />

                        <ColorPickerControlledField
                            name="app_theme_color"
                            label="Tenant global theme color"
                            description="Hex color for the tenant's primary theme. Users can still override this in their account settings."
                        />

                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
                                Cancel
                            </Button>
                            <Button type="submit" form={createTenantFormName} disabled={isSubmitting}>
                                {isSubmitting ? 'Saving...' : editingTenant ? 'Update' : 'Create'}
                            </Button>
                        </DialogFooter>
                    </form>
                </FormProvider>
            </DialogContent>
        </Dialog>
    );
}
