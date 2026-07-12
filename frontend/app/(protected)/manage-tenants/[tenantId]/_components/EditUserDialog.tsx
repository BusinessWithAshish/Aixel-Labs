'use client';

import { useEffect, useState } from 'react';
import { useForm, FormProvider } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import type { User, ModuleAccess } from '@aixellabs/backend/db/types';
import { updateUser } from '@/app/actions/user-actions';
import { ModuleAccessCard } from './ModuleAccessCard';
import { getDefaultModuleAccess } from '@/helpers/module-access-helpers';
import {
    StringControlledField,
    BooleanControlledField,
    NumberControlledField,
} from '@/components/common/zod-form-builder/ZodControlledFields';
import { ZodMetaType } from '@/components/common/zod-form-builder/zod-meta-types';

const userSchema = z.object({
    name: z.string().max(100, 'Name must be less than 100 characters').optional().or(z.literal('')),
    isAdmin: z.boolean(),
    credits: z.coerce
        .number({ invalid_type_error: 'Credits must be a number' })
        .int('Credits must be a whole number')
        .min(0, 'Credits cannot be below zero'),
});

type UserFormData = z.infer<typeof userSchema>;

type UserDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    user: User | null;
    tenantId: string;
    onSuccess?: () => void;
};

export function UserDialog({ open, onOpenChange, user, onSuccess }: UserDialogProps) {
    const [moduleAccess, setModuleAccess] = useState<ModuleAccess>(getDefaultModuleAccess());

    const form = useForm<UserFormData>({
        resolver: zodResolver(userSchema),
        defaultValues: { name: '', isAdmin: false, credits: 0 },
    });

    const { handleSubmit, reset, formState: { isSubmitting } } = form;

    useEffect(() => {
        if (open && user) {
            reset({
                name: user.name || '',
                isAdmin: user.isAdmin ?? false,
                credits: user.credits ?? 0,
            });
            setModuleAccess(user.moduleAccess || getDefaultModuleAccess());
        }
    }, [user, open, reset]);

    const onSubmit = async (data: UserFormData) => {
        if (!user) return;
        try {
            const result = await updateUser({
                ...user,
                name: data.name?.trim(),
                isAdmin: data.isAdmin,
                credits: data.credits,
                moduleAccess,
            });
            if (!result.success) throw new Error(result.error || 'Failed to update user');
            toast.success('User updated successfully');
            onOpenChange(false);
            onSuccess?.();
        } catch (error) {
            const msg = error instanceof Error ? error.message : 'An error occurred while updating user';
            toast.error(msg);
            console.error('Update user error:', error);
        }
    };

    const handleOpenChange = (newOpen: boolean) => {
        if (!newOpen) {
            reset({ name: '', isAdmin: false, credits: 0 });
            setModuleAccess(getDefaultModuleAccess());
        }
        onOpenChange(newOpen);
    };

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="sm:max-w-2xl">
                <FormProvider {...form}>
                    <form onSubmit={handleSubmit(onSubmit)}>
                        <DialogHeader>
                            <DialogTitle>Edit User</DialogTitle>
                            <DialogDescription>
                                Update permissions and credits. Users sign up via Google and phone verification.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                            <div className="grid gap-1">
                                <p className="text-sm font-medium">Email</p>
                                <p className="text-muted-foreground text-sm">{user?.email}</p>
                            </div>
                            {user?.phoneNumber && (
                                <div className="grid gap-1">
                                    <p className="text-sm font-medium">Phone</p>
                                    <p className="text-muted-foreground text-sm">{user.phoneNumber}</p>
                                </div>
                            )}
                            <StringControlledField
                                name="name"
                                label="Name"
                                placeholder="Enter user name"
                                description="Display name for this user"
                            />
                            <BooleanControlledField
                                name="isAdmin"
                                label="Admin privileges"
                                description="Grant administrative access to this user"
                                metadata={ZodMetaType.CHECKBOX}
                            />
                            <NumberControlledField
                                name="credits"
                                label="Credits"
                                description="Absolute credit balance for this user (cannot be below zero)"
                                min={0}
                                step={1}
                            />
                            <ModuleAccessCard moduleAccess={moduleAccess} onChange={setModuleAccess} />
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={isSubmitting}>
                                Cancel
                            </Button>
                            <Button type="submit" disabled={isSubmitting || !user}>
                                {isSubmitting ? 'Saving...' : 'Save changes'}
                            </Button>
                        </DialogFooter>
                    </form>
                </FormProvider>
            </DialogContent>
        </Dialog>
    );
}

export const EditUserDialog = UserDialog;
