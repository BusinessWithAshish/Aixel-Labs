'use server';

import { type Tenant } from '@aixellabs/backend/db/types';
import { extractSubdomain } from '@/middleware';
import { headers } from 'next/headers';
import { getTenantByNamePublic } from '@/app/actions/tenant-actions';

export const getCurrentTenantFromHeaders = async (): Promise<string | null> => {
    const currentHeaders = await headers();
    const { subdomain } = extractSubdomain(currentHeaders);
    return subdomain;
};

const getTenantData = async (tenantName: string): Promise<Tenant | null> => {
    try {
        const res = await getTenantByNamePublic(tenantName);
        if (!res.success || !res.data) {
            return null;
        }
        return res.data;
    } catch (error) {
        console.error('Error validating tenant:', error);
        return null;
    }
};

/**
 * Validates the current tenant and returns tenant data if valid.
 * Returns null if tenant is invalid or not found.
 * This is a convenience function that combines tenant extraction, validation, and data retrieval.
 */
export const validateAndGetTenant = async (): Promise<Tenant | null> => {
    const currentTenantName = await getCurrentTenantFromHeaders();
    if (!currentTenantName) {
        return null;
    }

    const tenantData = await getTenantData(currentTenantName);
    if (!tenantData) {
        return null;
    }

    return tenantData;
};
