'use server';

import { getCollection } from '@aixellabs/shared/utils';
import { extractSubdomain } from '@/middleware';
import { headers } from 'next/headers';

export const getCurrentTenantFromHeaders = async (): Promise<string | null> => {
    const currentHeaders = await headers();
    const { subdomain } = extractSubdomain(currentHeaders);
    return subdomain;
};

export const validateTenant = async (tenant: string): Promise<boolean> => {
    try {
        const collection = await getCollection('tenants');
        const tenantData = await collection.findOne({ name: tenant });
        return !!tenantData;
    } catch (error) {
        console.error('Error validating tenant:', error);
        return false;
    }
};

export const getCurrentTenantData = async (tenant: string): Promise<Record<string, unknown> | null> => {
    try {
        const collection = await getCollection('tenants');
        return await collection.findOne({ name: tenant });
    } catch (error) {
        console.error('Error getting tenant data:', error);
        return null;
    }
};

/**
 * Validates the current tenant and returns tenant data if valid.
 * Returns null if tenant is invalid or not found.
 * This is a convenience function that combines tenant extraction, validation, and data retrieval.
 */
export const validateAndGetTenant = async (): Promise<{
    tenant: string;
    tenantData: Record<string, unknown>;
} | null> => {
    const currentTenant = await getCurrentTenantFromHeaders();
    if (!currentTenant) {
        return null;
    }

    const isTenantValid = await validateTenant(currentTenant);
    if (!isTenantValid) {
        return null;
    }

    const tenantData = await getCurrentTenantData(currentTenant);
    if (!tenantData) {
        return null;
    }

    return {
        tenant: currentTenant,
        tenantData,
    };
};
