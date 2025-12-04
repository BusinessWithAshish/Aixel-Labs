'use server';

import { getCollection, MongoObjectId, type Tenant, type TenantDoc } from '@aixellabs/shared/mongodb';

// ============================================================================
// TENANT INPUT TYPES (Frontend/Forms)
// ============================================================================

/**
 * Input for creating a new tenant (used in forms/API).
 */
export type CreateTenantInput = {
    name: string;
    redirect_url?: string;
};

/**
 * Input for updating a tenant (used in forms/API).
 */
export type UpdateTenantInput = Partial<CreateTenantInput>;

export type { Tenant };

export const getAllTenants = async (): Promise<Tenant[]> => {
    try {
        const tenantsCollection = await getCollection<TenantDoc>('tenants');
        const tenants = await tenantsCollection.find({}).toArray();
        
        // Convert MongoDB documents to frontend-friendly format
        return tenants.map((tenant) => ({
            _id: tenant._id.toString(),
            name: tenant.name,
            redirect_url: tenant.redirect_url,
        }));
    } catch {
        return [];
    }
};

export const createTenant = async (input: CreateTenantInput): Promise<Tenant | null> => {
    try {
        if (!input.name) return null;

        const tenantsCollection = await getCollection<TenantDoc>('tenants');
        
        // Prepare document for insertion (without _id, MongoDB will generate it)
        const docToInsert: Omit<TenantDoc, '_id'> = {
            name: input.name,
            redirect_url: input.redirect_url,
        };
        
        const result = await tenantsCollection.insertOne(docToInsert as TenantDoc);

        // Return frontend-friendly format
        return {
            _id: result.insertedId.toString(),
            name: docToInsert.name,
            redirect_url: docToInsert.redirect_url,
        };
    } catch {
        return null;
    }
};

export const updateTenant = async (id: string, input: UpdateTenantInput): Promise<Tenant | null> => {
    try {
        if (!MongoObjectId.isValid(id)) return null;

        const tenantsCollection = await getCollection<TenantDoc>('tenants');

        const updateFields: Partial<Pick<TenantDoc, 'name' | 'redirect_url'>> = {};
        if (input.name !== undefined) updateFields.name = input.name;
        if (input.redirect_url !== undefined) updateFields.redirect_url = input.redirect_url;

        const result = await tenantsCollection.findOneAndUpdate(
            { _id: new MongoObjectId(id) },
            { $set: updateFields },
            { returnDocument: 'after' },
        );

        if (!result) return null;

        // Return frontend-friendly format
        return {
            _id: result._id.toString(),
            name: result.name,
            redirect_url: result.redirect_url,
        };
    } catch {
        return null;
    }
};

export const deleteTenant = async (id: string): Promise<boolean> => {
    try {
        if (!MongoObjectId.isValid(id)) return false;

        const tenantsCollection = await getCollection<TenantDoc>('tenants');
        const result = await tenantsCollection.deleteOne({ _id: new MongoObjectId(id) });

        return result.deletedCount === 1;
    } catch {
        return false;
    }
};
