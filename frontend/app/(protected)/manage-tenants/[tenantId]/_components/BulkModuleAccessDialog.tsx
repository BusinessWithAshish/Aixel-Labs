'use client';

import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import type { ModuleAccess } from '@aixellabs/backend/db/types';
import { bulkUpdateUsersModuleAccess } from '@/app/actions/user-actions';
import { ModuleAccessCard } from '../../_components/ModuleAccessCard';
import { getDefaultModuleAccess } from '@/helpers/module-access-helpers';
import type { BulkModuleAccessTarget } from '../_hooks/use-tenant-users-page';

type BulkModuleAccessDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    tenantName: string;
    target: BulkModuleAccessTarget;
    selectedUserIds: string[];
    totalUserCount: number;
    onSuccess?: () => void;
};

export function BulkModuleAccessDialog({
    open,
    onOpenChange,
    tenantName,
    target,
    selectedUserIds,
    totalUserCount,
    onSuccess,
}: BulkModuleAccessDialogProps) {
    const [moduleAccess, setModuleAccess] = useState<ModuleAccess>(getDefaultModuleAccess());
    const [isSubmitting, setIsSubmitting] = useState(false);

    const applyToAll = target === 'all';
    const affectedCount = applyToAll ? totalUserCount : selectedUserIds.length;

    useEffect(() => {
        if (open) {
            setModuleAccess(getDefaultModuleAccess());
            setIsSubmitting(false);
        }
    }, [open]);

    const handleSubmit = async () => {
        if (affectedCount === 0) {
            toast.error(applyToAll ? 'This tenant has no users' : 'Select at least one user');
            return;
        }

        setIsSubmitting(true);
        try {
            const result = await bulkUpdateUsersModuleAccess({
                tenantName,
                userIds: applyToAll ? [] : selectedUserIds,
                applyToAll,
                moduleAccess,
            });

            if (!result.success) {
                throw new Error(result.error || 'Failed to update module access');
            }

            const updatedCount = result.data?.matchedCount ?? affectedCount;
            toast.success(`Updated module access for ${updatedCount} user${updatedCount === 1 ? '' : 's'}`);
            onOpenChange(false);
            onSuccess?.();
        } catch (error) {
            const msg = error instanceof Error ? error.message : 'Failed to update module access';
            toast.error(msg);
            console.error('Bulk module access update error:', error);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleOpenChange = (newOpen: boolean) => {
        if (!newOpen && isSubmitting) return;
        if (!newOpen) {
            setModuleAccess(getDefaultModuleAccess());
        }
        onOpenChange(newOpen);
    };

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>
                        {applyToAll
                            ? 'Update all users in this tenant'
                            : `Update ${affectedCount} selected user${affectedCount === 1 ? '' : 's'}`}
                    </DialogTitle>
                    <DialogDescription>
                        This will overwrite each non-admin user&apos;s current module access with the template below.
                        Admins are skipped.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <ModuleAccessCard moduleAccess={moduleAccess} onChange={setModuleAccess} />
                </div>
                <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={isSubmitting}>
                        Cancel
                    </Button>
                    <Button type="button" onClick={handleSubmit} disabled={isSubmitting || affectedCount === 0}>
                        {isSubmitting ? 'Updating...' : 'Replace module access'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
