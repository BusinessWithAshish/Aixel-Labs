'use client';

import { useForm, FormProvider } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import z from 'zod';
import { ColorPickerControlledField, SelectControlledField, StringControlledField } from '@/components/common/zod-form-builder/ZodControlledFields';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { createTenant, updateTenant } from '@/app/actions/tenant-actions';
import type { Tenant } from '@aixellabs/backend/db/types';
import { TenantType } from '@aixellabs/backend/db/types';
import { toast } from 'sonner';
import { TENANT_TYPE_OPTIONS } from '@/config/app-config';

type CreateTenantDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    editingTenant?: Tenant | null;
    onSuccess?: () => void;
};

const tenantSchema = z.object({
    name: z.string().min(1, 'Tenant name is required'),
    type: z.nativeEnum(TenantType).optional(),
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
        values: {
            name: editingTenant?.name ?? '',
            type: editingTenant?.type ?? undefined,
            redirect_url: editingTenant?.redirect_url ?? '',
            app_description: editingTenant?.app_description ?? '',
            label: editingTenant?.label ?? '',
            app_logo_url: editingTenant?.app_logo_url ?? '',
            app_theme_color: editingTenant?.app_theme_color ?? '',
        },
    });

    const { handleSubmit, watch, formState: { isSubmitting } } = form;
    const watchedType = watch('type');

    const onSubmit = async (values: TenantFormValues) => {
        const payload = {
            name: values.name.trim(),
            label: values.label?.trim() ?? '',
            type: (values.type as TenantType) || undefined,
            redirect_url: values.redirect_url?.trim() || undefined,
            app_description: values.app_description?.trim() || undefined,
            app_logo_url: values.app_logo_url?.trim() || undefined,
            app_theme_color: values.app_theme_color?.trim() || undefined,
        };

        try {
            if (editingTenant) {
                const res = await updateTenant({ _id: editingTenant._id, ...payload });

                if (res.success && res.data) {
                    toast.success('Tenant updated successfully');
                    onSuccess?.();
                    onOpenChange(false);
                } else {
                    toast.error(res.error ?? 'Failed to update tenant');
                }
            } else {
                const res = await createTenant(payload);

                if (res.success && res.data) {
                    toast.success('Tenant created successfully');
                    onSuccess?.();
                    onOpenChange(false);
                } else {
                    toast.error(res.error ?? 'Failed to create tenant');
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
                            disabled={!!editingTenant?.name}
                            label="Tenant name"
                            description="Tip: This is the name of the tenant that will be used to identify the tenant in the system."
                            required
                        />

                        <SelectControlledField
                            name="type"
                            isClearable={true}
                            label="Tenant type"
                            options={TENANT_TYPE_OPTIONS}
                            description="Normal: full SaaS app with auth. Iframe: embeds an external URL. External: redirects to external URL. Product: in-house product under subdomain."
                        />

                        {(watchedType === TenantType.IFRAME || watchedType === TenantType.EXTERNAL) && (
                            <StringControlledField
                                name="redirect_url"
                                label="Redirect URL"
                                disabled={!!editingTenant?.redirect_url}
                                description="The external URL to embed (iframe) or redirect to (external). Cannot be changed once set."
                                required
                            />
                        )}

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
