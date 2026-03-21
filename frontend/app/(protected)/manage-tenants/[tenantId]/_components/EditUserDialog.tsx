'use client';

import { useEffect, useState } from 'react';
import { useForm, FormProvider } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import type { User, ModuleAccess } from '@aixellabs/backend/db/types';
import { createUser, updateUser } from '@/app/actions/user-actions';
import { ModuleAccessCard } from './ModuleAccessCard';
import { getDefaultModuleAccess } from '@/helpers/module-access-helpers';
import { StringControlledField, BooleanControlledField } from '@/components/common/zod-form-builder/ZodControlledFields';
import { ZodMetaType } from '@/components/common/zod-form-builder/zod-meta-types';

const userSchema = z.object({
    email: z.string().email('Invalid email address').optional().or(z.literal('')),
    password: z.string().min(8, 'Password must be at least 8 characters').optional().or(z.literal('')),
    name: z.string().max(100, 'Name must be less than 100 characters').optional().or(z.literal('')),
    isAdmin: z.boolean(),
});

type UserFormData = z.infer<typeof userSchema>;

type UserDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    user: User | null;
    tenantId: string;
    onSuccess?: () => void;
};

export function UserDialog({ open, onOpenChange, user, tenantId, onSuccess }: UserDialogProps) {
    const isEditMode = !!user;
    const [moduleAccess, setModuleAccess] = useState<ModuleAccess>(getDefaultModuleAccess());

    const form = useForm<UserFormData>({
        resolver: zodResolver(userSchema),
        defaultValues: { email: '', password: '', name: '', isAdmin: false },
    });

    const { handleSubmit, reset, formState: { isSubmitting } } = form;

    useEffect(() => {
        if (open) {
            if (isEditMode && user) {
                reset({ email: user.email || '', password: '', name: user.name || '', isAdmin: user.isAdmin ?? false });
                setModuleAccess(user.moduleAccess || getDefaultModuleAccess());
            } else {
                reset({ email: '', password: '', name: '', isAdmin: false });
                setModuleAccess(getDefaultModuleAccess());
            }
        }
    }, [user, open, isEditMode, reset]);

    const onSubmit = async (data: UserFormData) => {
        try {
            if (isEditMode) {
                if (!user) return;
                const result = await updateUser({ ...user, name: data.name?.trim(), isAdmin: data.isAdmin, moduleAccess });
                if (!result.success) throw new Error(result.error || 'Failed to update user');
                toast.success('User updated successfully');
            } else {
                if (!data.email || !data.password) throw new Error('Email and password are required');
                const newUser: User = {
                    email: data.email.trim().toLowerCase(),
                    password: data.password,
                    name: data.name?.trim(),
                    isAdmin: data.isAdmin,
                    tenantId,
                    moduleAccess,
                };
                const result = await createUser(newUser);
                if (!result.success) throw new Error(result.error || 'Failed to create user');
                toast.success('User created successfully');
            }
            onOpenChange(false);
            onSuccess?.();
        } catch (error) {
            const msg = error instanceof Error ? error.message : `An error occurred while ${isEditMode ? 'updating' : 'creating'} user`;
            toast.error(msg);
            console.error(`${isEditMode ? 'Update' : 'Create'} user error:`, error);
        }
    };

    const handleOpenChange = (newOpen: boolean) => {
        if (!newOpen) {
            reset({ email: '', password: '', name: '', isAdmin: false });
            setModuleAccess(getDefaultModuleAccess());
        }
        onOpenChange(newOpen);
    };

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="sm:max-w-2xl max-h-fit">
                <FormProvider {...form}>
                    <form onSubmit={handleSubmit(onSubmit)}>
                        <DialogHeader>
                            <DialogTitle>{isEditMode ? 'Edit User' : 'Add User'}</DialogTitle>
                            <DialogDescription>
                                {isEditMode ? 'Update user details. Click save when you\'re done.' : 'Create a new user for this tenant. Click create when you\'re done.'}
                            </DialogDescription>
                        </DialogHeader>
                        <div className="max-h-[50dvh] overflow-y-auto p-2 grid gap-4 py-4">
                            <StringControlledField
                                name="email"
                                label="Email"
                                type="email"
                                placeholder="Enter user email"
                                disabled={isEditMode}
                                description={isEditMode ? 'User email cannot be changed' : undefined}
                                classNames={isEditMode ? { input: 'bg-muted' } : undefined}
                            />
                            {!isEditMode && (
                                <StringControlledField
                                    name="password"
                                    label="Password"
                                    type="password"
                                    placeholder="Enter password (min 8 characters)"
                                />
                            )}
                            <StringControlledField
                                name="name"
                                label="Name"
                                placeholder="Enter user name"
                                description={isEditMode ? 'Display name for this user' : undefined}
                            />
                            <BooleanControlledField
                                name="isAdmin"
                                label="Admin privileges"
                                description="Grant administrative access to this user"
                                metadata={ZodMetaType.CHECKBOX}
                            />
                            <ModuleAccessCard moduleAccess={moduleAccess} onChange={setModuleAccess} />
                        </div>
                        <DialogFooter className="mt-4">
                            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={isSubmitting}>
                                Cancel
                            </Button>
                            <Button type="submit" disabled={isSubmitting}>
                                {isSubmitting ? (isEditMode ? 'Saving...' : 'Creating...') : isEditMode ? 'Save changes' : 'Create user'}
                            </Button>
                        </DialogFooter>
                    </form>
                </FormProvider>
            </DialogContent>
        </Dialog>
    );
}

export const EditUserDialog = UserDialog;
