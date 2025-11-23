'use client';

import { useState } from 'react';
import { type Tenant } from '@/helpers/tenant-operations';

export type UseManageTenantsPageReturn = {
    isCreateDialogOpen: boolean;
    setIsCreateDialogOpen: (open: boolean) => void;
    tenants: Tenant[];
    editingTenant: Tenant | null;
    setEditingTenant: (tenant: Tenant | null) => void;
};

/**
 * Hook for managing tenants page state and interactions
 * Accepts server-fetched tenants as initial data
 */
export const useManageTenantsPage = (tenants: Tenant[]): UseManageTenantsPageReturn => {
    const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
    const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);

    const handleSetIsCreateDialogOpen = (open: boolean) => {
        setIsCreateDialogOpen(open);
        if (open && !editingTenant) {
            setEditingTenant(null);
        }
    };

    const handleSetEditingTenant = (tenant: Tenant | null) => {
        setEditingTenant(tenant);
        if (tenant) {
            setIsCreateDialogOpen(true);
        }
    };

    return {
        isCreateDialogOpen,
        setIsCreateDialogOpen: handleSetIsCreateDialogOpen,
        tenants,
        editingTenant,
        setEditingTenant: handleSetEditingTenant,
    };
};
