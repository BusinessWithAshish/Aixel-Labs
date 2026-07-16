'use client';

import { useState } from 'react';
import type { Tenant } from '@aixellabs/backend/db/types';

export type ManageTenantsPageData = {
    tenants: Tenant[];
    sessionTenantName: string;
};

export type UseManageTenantsPageReturn = {
    isCreateDialogOpen: boolean;
    setIsCreateDialogOpen: (open: boolean) => void;
    tenants: Tenant[];
    sessionTenantName: string;
    editingTenant: Tenant | null;
    setEditingTenant: (tenant: Tenant | null) => void;
};

/**
 * Hook for managing tenants page state and interactions
 * Accepts server-fetched tenants as initial data
 */
export const useManageTenantsPage = (data: ManageTenantsPageData): UseManageTenantsPageReturn => {
    const { tenants, sessionTenantName } = data;
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
        sessionTenantName,
        editingTenant,
        setEditingTenant: handleSetEditingTenant,
    };
};
