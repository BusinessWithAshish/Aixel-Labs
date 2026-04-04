 'use server';

import { ALApiResponse } from '@aixellabs/backend/api/types';
import { getCollection } from '@aixellabs/backend/db/mongo-client';
import { MongoCollections, Tenant, TenantDoc } from '@aixellabs/backend/db/types';
import { withAuthentication } from './auth-actions';
import { MongoObjectId } from '@aixellabs/backend/db';

const mapTenantDocToTenant = (tenant: TenantDoc): Tenant => {
    const { _id, ...tenantData } = tenant;
    return {
        _id: _id?.toString(),
        ...tenantData,
    };
};

export const getAllTenants = async (): Promise<ALApiResponse<Tenant[]>> => {
    try {
        const getAllTenantsResponse = await withAuthentication<Tenant[]>(async () => {
            const tenantsCollection = await getCollection<TenantDoc>(MongoCollections.TENANTS);
            const tenants = await tenantsCollection.find({}).toArray();
            return tenants.map((tenant) => mapTenantDocToTenant(tenant));
        });

        if (!getAllTenantsResponse.success) {
            return {
                success: false,
                error: getAllTenantsResponse.error ?? 'Failed to fetch tenants',
            };
        }

        return {
            success: true,
            data: getAllTenantsResponse.data ?? [],
        };
    } catch (error) {
        console.error('Error fetching tenants:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to fetch tenants',
        };
    }
};

/**
 * Fetches tenant by name without requiring authentication.
 * Used by middleware for subdomain routing (internal fetch has no cookies).
 */
export const getTenantByNamePublic = async (name: string): Promise<ALApiResponse<Tenant | null>> => {
    try {
        const tenantsCollection = await getCollection<TenantDoc>(MongoCollections.TENANTS);
        const tenant = await tenantsCollection.findOne({ name });
        return {
            success: true,
            data: tenant ? mapTenantDocToTenant(tenant) : null,
        };
    } catch (error) {
        console.error('Error fetching tenant by name (public):', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to fetch tenant by name',
        };
    }
};

export const getTenantByName = async (name: string): Promise<ALApiResponse<Tenant | null>> => {
    try {
        const getTenantByNameResponse = await withAuthentication<Tenant | null>(async () => {
            const tenantsCollection = await getCollection<TenantDoc>(MongoCollections.TENANTS);
            const tenant = await tenantsCollection.findOne({ name });
            return tenant ? mapTenantDocToTenant(tenant) : null;
        });

        if (!getTenantByNameResponse.success) {
            return {
                success: false,
                error: getTenantByNameResponse.error ?? 'Failed to fetch tenant',
            };
        }

        return {
            success: true,
            data: getTenantByNameResponse.data,
        };
    } catch (error) {
        console.error('Error fetching tenant by name:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to fetch tenant by name',
        };
    }
};

export const createTenant = async (tenant: Tenant): Promise<ALApiResponse<Tenant | null>> => {
    try {
        const createTenantResponse = await withAuthentication<Tenant | null>(async () => {
            const tenantsCollection = await getCollection<TenantDoc>(MongoCollections.TENANTS);

            const docToInsert: TenantDoc = {
                name: tenant.name,
                label: tenant.label,
                type: tenant.type,
                redirect_url: tenant.redirect_url,
                app_description: tenant.app_description,
                app_logo_url: tenant.app_logo_url,
                app_theme_color: tenant.app_theme_color,
            };

            const existingTenant = await tenantsCollection.findOne({ name: docToInsert.name });

            if (existingTenant) {
                return null;
            }

            const result = await tenantsCollection.insertOne(docToInsert);

            const createdTenant: Tenant = {
                _id: result.insertedId.toString(),
                name: docToInsert.name,
                label: docToInsert.label,
                type: docToInsert.type,
                redirect_url: docToInsert.redirect_url,
                app_description: docToInsert.app_description,
                app_logo_url: docToInsert.app_logo_url,
                app_theme_color: docToInsert.app_theme_color,
            };

            return createdTenant;
        });

        if (!createTenantResponse.success || !createTenantResponse.data) {
            return {
                success: false,
                error: createTenantResponse.error ?? 'Failed to create tenant',
            };
        }

        return {
            success: true,
            data: createTenantResponse.data,
        };
    } catch (error) {
        console.error('Error creating tenant:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to create tenant',
        };
    }
};

export const updateTenant = async (tenant: Tenant): Promise<ALApiResponse<Tenant | null>> => {
    try {
        const updateTenantResponse = await withAuthentication<Tenant | null>(async () => {
            const tenantsCollection = await getCollection<TenantDoc>(MongoCollections.TENANTS);

            const updateFields: Partial<TenantDoc> = {
                name: tenant.name,
                label: tenant.label,
                type: tenant.type,
                redirect_url: tenant.redirect_url,
                app_description: tenant.app_description,
                app_logo_url: tenant.app_logo_url,
                app_theme_color: tenant.app_theme_color,
            };

            const updatedTenant = await tenantsCollection.findOneAndUpdate(
                { _id: new MongoObjectId(tenant._id) },
                { $set: updateFields },
                { returnDocument: 'after' },
            );
            return updatedTenant ? mapTenantDocToTenant(updatedTenant) : null;
        });

        if (!updateTenantResponse.success || !updateTenantResponse.data) {
            return {
                success: false,
                error: updateTenantResponse.error ?? 'Failed to update tenant',
            };
        }

        return {
            success: true,
            data: updateTenantResponse.data,
        };
    } catch (error) {
        console.error('Error updating tenant:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to update tenant',
        };
    }
};

export const deleteTenant = async (id: string): Promise<ALApiResponse<boolean>> => {
    try {
        const deleteTenantResponse = await withAuthentication<boolean>(async () => {
            const tenantsCollection = await getCollection<TenantDoc>(MongoCollections.TENANTS);
            const result = await tenantsCollection.deleteOne({ _id: new MongoObjectId(id) });
            return result.deletedCount > 0;
        });

        if (!deleteTenantResponse.success || !deleteTenantResponse.data) {
            return {
                success: false,
                error: deleteTenantResponse.error ?? 'Failed to delete tenant',
            };
        }

        return {
            success: true,
            data: deleteTenantResponse.data,
        };
    } catch (error) {
        console.error('Error deleting tenant:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to delete tenant',
        };
    }
};
