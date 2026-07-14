'use client';

import { useEffect, useState } from 'react';
import { useForm, FormProvider } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import z from 'zod';
import {
    ColorPickerControlledField,
    NumberControlledField,
    SelectControlledField,
    StringControlledField,
} from '@/components/common/zod-form-builder/ZodControlledFields';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { createTenant, updateTenant } from '@/app/actions/tenant-actions';
import type { ModuleAccess, Tenant } from '@aixellabs/backend/db/types';
import { TenantType } from '@aixellabs/backend/db/types';
import { toast } from 'sonner';
import { TENANT_TYPE_OPTIONS } from '@/config/app-config';
import { MAX_USER_CREDITS } from '@/helpers/credits';
import { ModuleAccessCard } from './ModuleAccessCard';

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
    defaultCredits: z.coerce
        .number({ invalid_type_error: 'Default credits must be a number' })
        .int('Default credits must be a whole number')
        .min(0, 'Default credits cannot be below zero')
        .max(MAX_USER_CREDITS, `Default credits cannot exceed ${MAX_USER_CREDITS.toLocaleString()}`),
});

export const createTenantFormName = 'create-tenant-form';
type TenantFormValues = z.infer<typeof tenantSchema>;

const emptyModuleAccess = (): ModuleAccess => ({});

export function CreateTenantDialog({ open, onOpenChange, editingTenant, onSuccess }: CreateTenantDialogProps) {
    const isEditing = Boolean(editingTenant);
    const [defaultModuleAccess, setDefaultModuleAccess] = useState<ModuleAccess>(emptyModuleAccess());

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
            defaultCredits: editingTenant?.defaultCredits ?? 0,
        },
    });

    const { handleSubmit, watch, formState: { isSubmitting }, reset } = form;
    const watchedType = watch('type');
    const isNormalTenant = !watchedType;
    const showNormalDefaults = !isEditing && isNormalTenant;

    useEffect(() => {
        if (!open) return;
        setDefaultModuleAccess(editingTenant?.defaultModuleAccess ?? emptyModuleAccess());
    }, [open, editingTenant]);

    const handleOpenChange = (nextOpen: boolean) => {
        if (!nextOpen) {
            reset();
            setDefaultModuleAccess(emptyModuleAccess());
        }
        onOpenChange(nextOpen);
    };

    const onSubmit = async (values: TenantFormValues) => {
        const isNormal = !values.type;
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
                // defaultModuleAccess / defaultCredits are create-only; edits do not change them.
                const res = await updateTenant({ _id: editingTenant._id, ...payload });

                if (res.success && res.data) {
                    toast.success('Tenant updated successfully');
                    onSuccess?.();
                    handleOpenChange(false);
                } else {
                    toast.error(res.error ?? 'Failed to update tenant');
                }
            } else {
                const res = await createTenant({
                    ...payload,
                    ...(isNormal
                        ? {
                              defaultModuleAccess,
                              defaultCredits: values.defaultCredits,
                          }
                        : {}),
                });

                if (res.success && res.data) {
                    toast.success('Tenant created successfully');
                    onSuccess?.();
                    handleOpenChange(false);
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
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="flex max-h-[min(90vh,calc(100svh-2rem))] flex-col gap-4 overflow-y-auto sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>{isEditing ? 'Edit tenant' : 'Create a new tenant'}</DialogTitle>
                    <DialogDescription>
                        {isEditing
                            ? 'Update tenant details.'
                            : 'Add a new tenant. For normal tenants, set default module access and credits for new signups.'}
                    </DialogDescription>
                </DialogHeader>

                <FormProvider {...form}>
                    <form id={createTenantFormName} onSubmit={handleSubmit(onSubmit)} className="space-y-4">
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

                        {showNormalDefaults && (
                            <>
                                <NumberControlledField
                                    name="defaultCredits"
                                    label="Default credits"
                                    description={`Applied to every new user who signs up under this tenant (0–${MAX_USER_CREDITS.toLocaleString()}). Cannot be changed after create.`}
                                    required
                                    min={0}
                                    max={MAX_USER_CREDITS}
                                    step={1}
                                />
                                <ModuleAccessCard
                                    moduleAccess={defaultModuleAccess}
                                    onChange={setDefaultModuleAccess}
                                    title="Default module access"
                                    description="Applied to every new user who signs up under this tenant. You can still override individuals later."
                                />
                            </>
                        )}

                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={isSubmitting}>
                                Cancel
                            </Button>
                            <Button type="submit" form={createTenantFormName} disabled={isSubmitting}>
                                {isSubmitting ? 'Saving...' : isEditing ? 'Update' : 'Create'}
                            </Button>
                        </DialogFooter>
                    </form>
                </FormProvider>
            </DialogContent>
        </Dialog>
    );
}
