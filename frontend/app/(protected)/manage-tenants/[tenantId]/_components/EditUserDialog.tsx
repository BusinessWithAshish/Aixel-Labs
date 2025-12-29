'use client';

import { useEffect, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldContent, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import { toast } from 'sonner';
import type { User, ModuleAccess } from '@aixellabs/shared/mongodb';
import { createUserAction, updateUserAction } from '@/app/actions/user-actions';
import { ModuleAccessCard } from './ModuleAccessCard';
import { getDefaultModuleAccess } from '@/helpers/module-access-helpers';

// Unified schema with optional fields
// Email and password are optional in the schema but validated in the component for create mode
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

    const {
        control,
        handleSubmit,
        formState: { errors, isSubmitting },
        reset,
    } = useForm<UserFormData>({
        resolver: zodResolver(userSchema),
        defaultValues: {
            email: '',
            password: '',
            name: '',
            isAdmin: false,
        },
    });

    useEffect(() => {
        if (open) {
            if (isEditMode && user) {
                reset({
                    email: user.email || '',
                    password: '', // Not used in edit mode
                    name: user.name || '',
                    isAdmin: user.isAdmin ?? false,
                });
                setModuleAccess(user.moduleAccess || getDefaultModuleAccess());
            } else {
                reset({
                    email: '',
                    password: '',
                    name: '',
                    isAdmin: false,
                });
                setModuleAccess(getDefaultModuleAccess());
            }
        }
    }, [user, open, isEditMode, reset]);

    const onSubmit = async (data: UserFormData) => {
        try {
            if (isEditMode) {
                if (!user) return;
                const result = await updateUserAction(user._id, {
                    name: data.name?.trim() || undefined,
                    isAdmin: data.isAdmin,
                    moduleAccess,
                });

                if (!result.success) {
                    throw new Error(result.error || 'Failed to update user');
                }

                toast.success('User updated successfully');
            } else {
                if (!data.email || !data.password) {
                    toast.error('Email and password are required');
                    return;
                }

                const result = await createUserAction({
                    email: data.email.trim().toLowerCase(),
                    password: data.password,
                    name: data.name?.trim(),
                    isAdmin: data.isAdmin,
                    tenantId,
                    moduleAccess,
                });

                if (!result.success) {
                    throw new Error(result.error || 'Failed to create user');
                }

                toast.success('User created successfully');
            }

            onOpenChange(false);
            onSuccess?.();
        } catch (error) {
            const errorMessage =
                error instanceof Error
                    ? error.message
                    : `An error occurred while ${isEditMode ? 'updating' : 'creating'} user`;
            toast.error(errorMessage);
            console.error(`${isEditMode ? 'Update' : 'Create'} user error:`, error);
        }
    };

    const handleOpenChange = (newOpen: boolean) => {
        if (!newOpen) {
            reset({
                email: '',
                password: '',
                name: '',
                isAdmin: false,
            });
            setModuleAccess(getDefaultModuleAccess());
        }
        onOpenChange(newOpen);
    };

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="sm:max-w-2xl max-h-fit">
                <DialogHeader>
                    <DialogTitle>{isEditMode ? 'Edit User' : 'Add User'}</DialogTitle>
                    <DialogDescription>
                        {isEditMode
                            ? 'Update user details. Click save when you&#39;re done.'
                            : 'Create a new user for this tenant. Click create when you&#39;re done.'}
                    </DialogDescription>
                </DialogHeader>
                <form className="max-h-[50dvh] overflow-y-auto p-2" onSubmit={handleSubmit(onSubmit)}>
                    <div className="grid gap-4 py-4">
                        <Field>
                            <FieldLabel htmlFor="email">Email</FieldLabel>
                            <FieldContent>
                                {isEditMode ? (
                                    <>
                                        <Input
                                            id="email"
                                            type="email"
                                            value={user?.email || ''}
                                            disabled
                                            className="bg-muted"
                                        />
                                        <FieldDescription>User email cannot be changed</FieldDescription>
                                    </>
                                ) : (
                                    <>
                                        <Controller
                                            name="email"
                                            control={control}
                                            render={({ field }) => (
                                                <Input
                                                    id="email"
                                                    type="email"
                                                    placeholder="Enter user email"
                                                    value={field.value || ''}
                                                    onChange={(e) => field.onChange(e.target.value)}
                                                    aria-invalid={errors.email ? 'true' : 'false'}
                                                />
                                            )}
                                        />
                                        <FieldError errors={errors.email ? [errors.email] : undefined} />
                                    </>
                                )}
                            </FieldContent>
                        </Field>

                        {!isEditMode && (
                            <Field>
                                <FieldLabel htmlFor="password">Password</FieldLabel>
                                <FieldContent>
                                    <Controller
                                        name="password"
                                        control={control}
                                        render={({ field }) => (
                                            <Input
                                                id="password"
                                                type="password"
                                                placeholder="Enter password (min 6 characters)"
                                                value={field.value || ''}
                                                onChange={(e) => field.onChange(e.target.value)}
                                                aria-invalid={errors.password ? 'true' : 'false'}
                                            />
                                        )}
                                    />
                                    <FieldError errors={errors.password ? [errors.password] : undefined} />
                                </FieldContent>
                            </Field>
                        )}

                        <Field>
                            <FieldLabel htmlFor="name">Name</FieldLabel>
                            <FieldContent>
                                <Controller
                                    name="name"
                                    control={control}
                                    render={({ field }) => (
                                        <Input
                                            id="name"
                                            type="text"
                                            placeholder="Enter user name"
                                            value={field.value || ''}
                                            onChange={(e) => field.onChange(e.target.value)}
                                            aria-invalid={errors.name ? 'true' : 'false'}
                                        />
                                    )}
                                />
                                <FieldError errors={errors.name ? [errors.name] : undefined} />
                            </FieldContent>
                        </Field>

                        <Field orientation="horizontal">
                            <FieldContent>
                                <Controller
                                    name="isAdmin"
                                    control={control}
                                    render={({ field }) => (
                                        <div className="flex items-center gap-2">
                                            <Checkbox
                                                id="isAdmin"
                                                checked={field.value}
                                                onCheckedChange={(checked) => field.onChange(checked === true)}
                                            />
                                            <FieldLabel htmlFor="isAdmin" className="cursor-pointer font-normal">
                                                Admin privileges
                                            </FieldLabel>
                                        </div>
                                    )}
                                />
                                <FieldDescription>Grant administrative access to this user</FieldDescription>
                                <FieldError errors={errors.isAdmin ? [errors.isAdmin] : undefined} />
                            </FieldContent>
                        </Field>

                        {/* Module Access Section */}
                        <ModuleAccessCard moduleAccess={moduleAccess} onChange={setModuleAccess} />
                    </div>
                </form>

                <DialogFooter className="mt-4">
                    <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={isSubmitting}>
                        Cancel
                    </Button>
                    <Button type="submit" disabled={isSubmitting} onClick={handleSubmit(onSubmit)}>
                        {isSubmitting
                            ? isEditMode
                                ? 'Saving...'
                                : 'Creating...'
                            : isEditMode
                            ? 'Save changes'
                            : 'Create user'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// Export EditUserDialog for backward compatibility
export const EditUserDialog = UserDialog;
