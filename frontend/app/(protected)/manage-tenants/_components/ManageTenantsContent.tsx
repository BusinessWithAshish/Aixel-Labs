'use client';

import { useMemo, useState } from 'react';
import { TenantCard } from './TenantCard';
import { CreateTenantCard } from './CreateTenantCard';
import { CreateTenantDialog } from './CreateTenantDialog';
import { DeleteConfirmDialog } from './DeleteConfirmDialog';
import { deleteTenant, type Tenant } from '@/helpers/tenant-operations';
import { usePage } from '@/contexts/PageStore';
import { toast } from 'sonner';
import type { UseManageTenantsPageReturn } from '@/app/(protected)/manage-tenants/_hooks';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';

export function ManageTenantsContent() {
    const { isCreateDialogOpen, setIsCreateDialogOpen, tenants, editingTenant, setEditingTenant } =
        usePage<UseManageTenantsPageReturn>();
    const router = useRouter();

    const dontAllowClickOrEdit = (tenant: Tenant) => {
        return !!tenant.redirect_url;
    };

    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [tenantToDelete, setTenantToDelete] = useState<Tenant | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    const filteredTenants = useMemo(() => {
        const normalizedQuery = searchQuery.trim().toLowerCase();
        if (!normalizedQuery) return tenants;

        return tenants.filter((tenant) => tenant.name.toLowerCase().includes(normalizedQuery));
    }, [searchQuery, tenants]);

    const handleTenantClick = (tenant: (typeof tenants)[0]) => {
        router.push(`/manage-tenants/${tenant.name}`);
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
        } else {
            toast.error('Failed to delete tenant');
        }
        setIsDeleting(false);
    };

    const handleDialogClose = () => {
        setIsCreateDialogOpen(false);
        setEditingTenant(null);
    };

    return (
        <>
            <div className="flex flex-col gap-4 p-6">
                <div className="flex items-center max-w-md">
                    <Input
                        placeholder="Search tenants"
                        value={searchQuery}
                        onChange={(event) => setSearchQuery(event.target.value)}
                    />
                </div>

                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {filteredTenants.map((tenant) => (
                        <TenantCard
                            key={tenant._id}
                            tenant={tenant}
                            onClick={dontAllowClickOrEdit(tenant) ? undefined : () => handleTenantClick(tenant)}
                            onEdit={dontAllowClickOrEdit(tenant) ? undefined : () => handleEditTenant(tenant)}
                            onDelete={() => handleDeleteClick(tenant)}
                        />
                    ))}
                    <CreateTenantCard onClick={() => setIsCreateDialogOpen(true)} />
                </div>

                {filteredTenants.length === 0 && (
                    <p className="text-sm text-slate-500">
                        No tenants found{searchQuery.trim() ? ` for "${searchQuery.trim()}"` : ''}.
                    </p>
                )}
            </div>

            <CreateTenantDialog
                open={isCreateDialogOpen}
                onOpenChange={handleDialogClose}
                editingTenant={editingTenant}
                onSuccess={() => router.refresh()}
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
