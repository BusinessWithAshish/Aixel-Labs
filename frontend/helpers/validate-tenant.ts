'use server';

import { getCollection, MongoCollections, type Tenant, type TenantDoc } from '@aixellabs/shared/mongodb';
import { extractSubdomain } from '@/middleware';
import { headers } from 'next/headers';

export const getCurrentTenantFromHeaders = async (): Promise<string | null> => {
    const currentHeaders = await headers();
    const { subdomain } = extractSubdomain(currentHeaders);
    return subdomain;
};

const validateTenant = async (tenant: string): Promise<boolean> => {
    try {
        const tenantsCollection = await getCollection<TenantDoc>(MongoCollections.TENANTS);
        const tenantData = await tenantsCollection.findOne({ name: tenant });
        return !!tenantData;
    } catch (error) {
        console.error('Error validating tenant:', error);
        return false;
    }
};

const getCurrentTenantData = async (tenant: string): Promise<Tenant | null> => {
    try {
        const tenantsCollection = await getCollection<TenantDoc>(MongoCollections.TENANTS);
        const tenantDoc = await tenantsCollection.findOne({ name: tenant });

        if (!tenantDoc) return null;

        // Convert to frontend-friendly format
        return {
            _id: tenantDoc._id.toString(),
            name: tenantDoc.name,
            label: tenantDoc.label,
            redirect_url: tenantDoc.redirect_url,
            app_description: tenantDoc.app_description,
            app_logo_url: tenantDoc.app_logo_url,
            app_theme_color: tenantDoc.app_theme_color,
        };
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
export const validateAndGetTenant = async (): Promise<Tenant | null> => {
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

    return tenantData;
};
