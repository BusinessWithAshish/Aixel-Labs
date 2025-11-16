import { getCollection } from '@/lib/mongodb';
import { extractSubdomain } from '@/middleware';
import { headers } from 'next/headers';

export const getCurrentTenant = async (): Promise<string | null> => {
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
