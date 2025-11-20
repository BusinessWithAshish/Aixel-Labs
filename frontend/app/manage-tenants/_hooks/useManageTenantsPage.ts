'use client';

import { useState, useEffect } from 'react';
import { getAllTenants, type Tenant } from '@/helpers/tenant-operations';

export type UseManageTenantsPageReturn = {
    isCreateDialogOpen: boolean;
    setIsCreateDialogOpen: (open: boolean) => void;
    tenants: Tenant[];
    isLoading: boolean;
    editingTenant: Tenant | null;
    setEditingTenant: (tenant: Tenant | null) => void;
    refreshTenants: () => Promise<void>;
};

export const useManageTenantsPage = (): UseManageTenantsPageReturn => {
    const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
    const [tenants, setTenants] = useState<Tenant[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);

    const fetchTenants = async () => {
        setIsLoading(true);
        try {
            const data = await getAllTenants();
            setTenants(data);
        } catch (error) {
            console.error('Failed to fetch tenants:', error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchTenants();
    }, []);

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
        isLoading,
        editingTenant,
        setEditingTenant: handleSetEditingTenant,
        refreshTenants: fetchTenants,
    };
};
