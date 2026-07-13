'use client';

import { useEffect, useRef, useState } from 'react';
import { useForm, FormProvider, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import type { User, ModuleAccess } from '@aixellabs/backend/db/types';
import { updateUser } from '@/app/actions/user-actions';
import { ModuleAccessCard } from '../../_components/ModuleAccessCard';
import { ResetUserFormDialog } from './ResetUserFormDialog';
import { getDefaultModuleAccess } from '@/helpers/module-access-helpers';
import { MAX_USER_CREDITS } from '@/helpers/credits';
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
        .min(0, 'Credits cannot be below zero')
        .max(MAX_USER_CREDITS, `Credits cannot exceed ${MAX_USER_CREDITS.toLocaleString()}`),
});

type UserFormData = z.infer<typeof userSchema>;

type UserDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    user: User | null;
    tenantId: string;
    onSuccess?: () => void;
};

function getInitialModuleAccess(user: User): ModuleAccess {
    if (user.isAdmin) return getDefaultModuleAccess();
    return user.moduleAccess ?? {};
}

function getFormValues(user: User): UserFormData {
    return {
        name: user.name || '',
        isAdmin: user.isAdmin ?? false,
        credits: user.credits ?? 0,
    };
}

export function UserDialog({ open, onOpenChange, user, onSuccess }: UserDialogProps) {
    const [moduleAccess, setModuleAccess] = useState<ModuleAccess>(getDefaultModuleAccess());
    const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
    const previousIsAdminRef = useRef(false);

    const form = useForm<UserFormData>({
        resolver: zodResolver(userSchema),
        defaultValues: { name: '', isAdmin: false, credits: 0 },
    });

    const { handleSubmit, reset, control, formState: { isSubmitting } } = form;
    const isAdmin = useWatch({ control, name: 'isAdmin' });

    const applyUserState = (nextUser: User) => {
        reset(getFormValues(nextUser));
        setModuleAccess(getInitialModuleAccess(nextUser));
        previousIsAdminRef.current = nextUser.isAdmin ?? false;
    };

    useEffect(() => {
        if (open && user) {
            applyUserState(user);
        }
        if (!open) {
            previousIsAdminRef.current = false;
            setResetConfirmOpen(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps -- sync only when dialog opens for a user
    }, [user, open, reset]);

    // Admins always get full module access: on load (already admin) and when isAdmin is checked.
    useEffect(() => {
        if (!open) return;
        if (isAdmin && !previousIsAdminRef.current) {
            setModuleAccess(getDefaultModuleAccess());
        }
        previousIsAdminRef.current = Boolean(isAdmin);
    }, [isAdmin, open]);

    const onSubmit = async (data: UserFormData) => {
        if (!user) return;
        try {
            const result = await updateUser({
                ...user,
                name: data.name?.trim(),
                isAdmin: data.isAdmin,
                credits: data.credits,
                moduleAccess: data.isAdmin ? getDefaultModuleAccess() : moduleAccess,
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
            setResetConfirmOpen(false);
        }
        onOpenChange(newOpen);
    };

    const handleResetConfirm = () => {
        if (!user) return;
        applyUserState(user);
    };

    return (
        <>
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
                                    description={`Absolute credit balance (0–${MAX_USER_CREDITS.toLocaleString()})`}
                                    min={0}
                                    max={MAX_USER_CREDITS}
                                    step={1}
                                />
                                <ModuleAccessCard moduleAccess={moduleAccess} onChange={setModuleAccess} />
                            </div>
                            <DialogFooter className="sm:justify-between">
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => setResetConfirmOpen(true)}
                                    disabled={isSubmitting || !user}
                                >
                                    Reset
                                </Button>
                                <div className="flex flex-col-reverse gap-2 sm:flex-row">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() => handleOpenChange(false)}
                                        disabled={isSubmitting}
                                    >
                                        Cancel
                                    </Button>
                                    <Button type="submit" disabled={isSubmitting || !user}>
                                        {isSubmitting ? 'Saving...' : 'Save changes'}
                                    </Button>
                                </div>
                            </DialogFooter>
                        </form>
                    </FormProvider>
                </DialogContent>
            </Dialog>

            <ResetUserFormDialog
                open={resetConfirmOpen}
                onOpenChange={setResetConfirmOpen}
                userEmail={user?.email ?? 'this user'}
                onConfirm={handleResetConfirm}
            />
        </>
    );
}

export const EditUserDialog = UserDialog;
