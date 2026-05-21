'use server';

import { ALApiResponse } from '@aixellabs/backend/api/types';
import type { Tenant, TenantDoc } from '@aixellabs/backend/db/types';
import { MongoCollections, MongoObjectId, getCollection } from '@aixellabs/backend/db';
import { mapMongoDocToClient } from '@/helpers/normalize-helpers';
import { runAuthenticatedAction, runPublicAction } from '@/helpers/server-action-helpers';

export const getAllTenants = async (): Promise<ALApiResponse<Tenant[]>> =>
    runAuthenticatedAction(async function getAllTenants() {
        const tenantsCollection = await getCollection<TenantDoc>(MongoCollections.TENANTS);
        const tenants = await tenantsCollection.find({}).toArray();
        return tenants.map(mapMongoDocToClient);
    });

/**
 * Fetches tenant by name without requiring authentication.
 * Used by middleware for subdomain routing (internal fetch has no cookies).
 */
export const getTenantByNamePublic = async (name: string): Promise<ALApiResponse<Tenant | null>> =>
    runPublicAction(
        async function getTenantByNamePublic() {
            const tenantsCollection = await getCollection<TenantDoc>(MongoCollections.TENANTS);
            const tenant = await tenantsCollection.findOne({ name });
            return tenant ? mapMongoDocToClient(tenant) : null;
        },
        {
            logLabel: 'Error fetching tenant by name (public):',
            fallbackError: 'Failed to fetch tenant by name',
        },
    );

export const getTenantByName = async (name: string): Promise<ALApiResponse<Tenant | null>> =>
    runAuthenticatedAction(async function getTenantByName() {
        const tenantsCollection = await getCollection<TenantDoc>(MongoCollections.TENANTS);
        const tenant = await tenantsCollection.findOne({ name });
        return tenant ? mapMongoDocToClient(tenant) : null;
    });

export const createTenant = async (tenant: Tenant): Promise<ALApiResponse<Tenant>> =>
    runAuthenticatedAction(async function createTenant() {
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

        if (await tenantsCollection.findOne({ name: docToInsert.name })) {
            throw new Error('Tenant already exists');
        }

        const result = await tenantsCollection.insertOne(docToInsert);

        return mapMongoDocToClient({
            ...docToInsert,
            _id: result.insertedId,
        });
    });

export const updateTenant = async (tenant: Tenant): Promise<ALApiResponse<Tenant>> =>
    runAuthenticatedAction(async function updateTenant() {
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
        if (!updatedTenant) {
            throw new Error('Failed to update tenant');
        }
        return mapMongoDocToClient(updatedTenant);
    });

export const deleteTenant = async (id: string): Promise<ALApiResponse<boolean>> =>
    runAuthenticatedAction(async function deleteTenant() {
        const tenantsCollection = await getCollection<TenantDoc>(MongoCollections.TENANTS);
        const result = await tenantsCollection.deleteOne({ _id: new MongoObjectId(id) });
        if (result.deletedCount < 1) {
            throw new Error('Failed to delete tenant');
        }
        return true;
    });
