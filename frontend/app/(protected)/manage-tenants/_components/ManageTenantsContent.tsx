'use client';

import { useState } from 'react';
import { TenantCard } from './TenantCard';
import { CreateTenantCard } from './CreateTenantCard';
import { CreateTenantDialog } from './CreateTenantDialog';
import { DeleteConfirmDialog } from './DeleteConfirmDialog';
import { CommonLoader } from '@/components/common/CommonLoader';
import { getTenantRedirectUrl } from '@/helpers/get-tenant-redirect-url';
import { deleteTenant, type Tenant } from '@/helpers/tenant-operations';
import { usePage } from '@/contexts/PageStore';
import { toast } from 'sonner';
import type { UseManageTenantsPageReturn } from '@/app/(protected)/manage-tenants/_hooks';

export function ManageTenantsContent() {
    const {
        isCreateDialogOpen,
        setIsCreateDialogOpen,
        tenants,
        isLoading,
        editingTenant,
        setEditingTenant,
        refreshTenants,
    } = usePage<UseManageTenantsPageReturn>();

    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [tenantToDelete, setTenantToDelete] = useState<Tenant | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    const handleTenantClick = (tenant: (typeof tenants)[0]) => {
        window.location.href = `/manage-tenants/${tenant._id}`;
    };

    const handleEditTenant = (tenant: (typeof tenants)[0]) => {
        setEditingTenant(tenant);
    };

    const handleDeleteClick = (tenant: (typeof tenants)[0]) => {
        setTenantToDelete(tenant);
        setDeleteDialogOpen(true);
    };

    const handleConfirmDelete = async () => {
        if (!tenantToDelete) return;

        setIsDeleting(true);
        const success = await deleteTenant(tenantToDelete._id);

        if (success) {
            toast.success('Tenant deleted successfully');
            setDeleteDialogOpen(false);
            setTenantToDelete(null);
            refreshTenants();
        } else {
            toast.error('Failed to delete tenant');
        }
        setIsDeleting(false);
    };

    const handleDialogClose = () => {
        setIsCreateDialogOpen(false);
        setEditingTenant(null);
    };

    if (isLoading) {
        return <CommonLoader size="lg" text="Loading tenants..." />;
    }

    return (
        <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 p-6">
                {tenants.map((tenant) => (
                    <TenantCard
                        key={tenant._id}
                        tenant={tenant}
                        onClick={() => handleTenantClick(tenant)}
                        onEdit={() => handleEditTenant(tenant)}
                        onDelete={() => handleDeleteClick(tenant)}
                    />
                ))}
                <CreateTenantCard onClick={() => setIsCreateDialogOpen(true)} />
            </div>

            <CreateTenantDialog
                open={isCreateDialogOpen}
                onOpenChange={handleDialogClose}
                editingTenant={editingTenant}
                onSuccess={refreshTenants}
            />

            <DeleteConfirmDialog
                open={deleteDialogOpen}
                onOpenChange={setDeleteDialogOpen}
                tenantName={tenantToDelete?.name || ''}
                onConfirm={handleConfirmDelete}
                isDeleting={isDeleting}
            />
        </>
    );
}
