'use server';

import { getCollection, MongoObjectId, MongoCollections, type Tenant, type TenantDoc } from '@aixellabs/shared/mongodb';

// ============================================================================
// TENANT INPUT TYPES (Frontend/Forms)
// ============================================================================

/**
 * Input for creating a new tenant (used in forms/API).
 */
export type CreateTenantInput = {
    name: string;
    redirect_url?: string;
    label: string;
    app_description?: string;
    app_logo_url?: string;
    app_theme_color?: string;
};

/**
 * Input for updating a tenant (used in forms/API).
 */
export type UpdateTenantInput = Partial<CreateTenantInput>;

export type { Tenant };

export const getAllTenants = async (): Promise<Tenant[]> => {
    try {
        const tenantsCollection = await getCollection<TenantDoc>(MongoCollections.TENANTS);
        const tenants = await tenantsCollection.find({}).toArray();
        
        // Convert MongoDB documents to frontend-friendly format
        return tenants.map((tenant) => ({
            _id: tenant._id.toString(),
            name: tenant.name,
            redirect_url: tenant.redirect_url,
            app_description: tenant.app_description,
            label: tenant.label,
            app_logo_url: tenant.app_logo_url,
            app_theme_color: tenant.app_theme_color,
        }));
    } catch {
        return [];
    }
};

export const createTenant = async (input: CreateTenantInput): Promise<Tenant | null> => {
    try {
        if (!input.name) return null;

        const tenantsCollection = await getCollection<TenantDoc>(MongoCollections.TENANTS);
        
        // Prepare document for insertion (without _id, MongoDB will generate it)
        const docToInsert: Omit<TenantDoc, '_id'> = {
            name: input.name,
            label: input.label,
            redirect_url: input.redirect_url,
            app_description: input.app_description,
            app_logo_url: input.app_logo_url,
            app_theme_color: input.app_theme_color,
        };

        const result = await tenantsCollection.insertOne(docToInsert as TenantDoc);

        // Return frontend-friendly format
        return {
            _id: result.insertedId.toString(),
            name: docToInsert.name,
            label: docToInsert.label,
            redirect_url: docToInsert.redirect_url,
            app_description: docToInsert.app_description,
            app_logo_url: docToInsert.app_logo_url,
            app_theme_color: docToInsert.app_theme_color,
        };
    } catch {
        return null;
    }
};

export const updateTenant = async (id: string, input: UpdateTenantInput): Promise<Tenant | null> => {
    try {
        if (!MongoObjectId.isValid(id)) return null;

        const tenantsCollection = await getCollection<TenantDoc>(MongoCollections.TENANTS);

        const updateFields: Partial<
            Pick<TenantDoc, 'name' | 'redirect_url' | 'app_description' | 'label' | 'app_logo_url' | 'app_theme_color'>
        > = {};
        if (input.name !== undefined) updateFields.name = input.name;
        if (input.redirect_url !== undefined) updateFields.redirect_url = input.redirect_url;
        if (input.app_description !== undefined) updateFields.app_description = input.app_description;
        if (input.label !== undefined) updateFields.label = input.label;
        if (input.app_logo_url !== undefined) updateFields.app_logo_url = input.app_logo_url;
        if (input.app_theme_color !== undefined) updateFields.app_theme_color = input.app_theme_color;

        const result = await tenantsCollection.findOneAndUpdate(
            { _id: new MongoObjectId(id) },
            { $set: updateFields },
            { returnDocument: 'after' },
        );

        if (!result) return null;

        // Return frontend-friendly format
        return {
            _id: result._id.toString(),
            label: result.label,
            name: result.name,
            redirect_url: result.redirect_url,
            app_description: result.app_description,
            app_logo_url: result.app_logo_url,
            app_theme_color: result.app_theme_color,
        };
    } catch {
        return null;
    }
};

export const deleteTenant = async (id: string): Promise<boolean> => {
    try {
        if (!MongoObjectId.isValid(id)) return false;

        const tenantsCollection = await getCollection<TenantDoc>(MongoCollections.TENANTS);
        const result = await tenantsCollection.deleteOne({ _id: new MongoObjectId(id) });

        return result.deletedCount === 1;
    } catch {
        return false;
    }
};
