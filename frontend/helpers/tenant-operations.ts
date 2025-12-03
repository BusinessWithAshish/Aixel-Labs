'use server';

import { getCollection, MongoObjectId, type Document } from '@aixellabs/shared/mongodb';

export type Tenant = {
    _id: string;
    name: string;
    redirect_url?: string;
};

export type CreateTenantInput = Omit<Tenant, '_id'>;
export type UpdateTenantInput = Partial<CreateTenantInput>;

type TenantDoc = Omit<Tenant, '_id'>;

export const getAllTenants = async (): Promise<Tenant[]> => {
    try {
        const collection = await getCollection<Document>('tenants');
        const tenants = await collection.find({}).toArray();
        return JSON.parse(
            JSON.stringify(
                tenants.map((tenant) => ({
                    _id: tenant._id.toString(),
                    name: tenant.name,
                    redirect_url: tenant.redirect_url,
                })),
            ),
        );
    } catch {
        return [];
    }
};

export const createTenant = async (input: CreateTenantInput): Promise<Tenant | null> => {
    try {
        if (!input.name) return null;

        const collection = await getCollection<TenantDoc>('tenants');
        const doc: TenantDoc = {
            name: input.name,
            redirect_url: input.redirect_url,
        };
        const result = await collection.insertOne(doc);

        return JSON.parse(
            JSON.stringify({
                _id: result.insertedId.toString(),
                name: doc.name,
                redirect_url: doc.redirect_url,
            }),
        );
    } catch {
        return null;
    }
};

export const updateTenant = async (id: string, input: UpdateTenantInput): Promise<Tenant | null> => {
    try {
        if (!MongoObjectId.isValid(id)) return null;

        const collection = await getCollection<Document>('tenants');

        const updateFields: Partial<TenantDoc> = {};
        if (input.name !== undefined) updateFields.name = input.name;
        if (input.redirect_url !== undefined) updateFields.redirect_url = input.redirect_url;

        const result = await collection.findOneAndUpdate(
            { _id: new MongoObjectId(id) },
            { $set: updateFields },
            { returnDocument: 'after' },
        );

        if (!result) return null;

        return JSON.parse(
            JSON.stringify({
                _id: result._id.toString(),
                name: result.name,
                redirect_url: result.redirect_url,
            }),
        );
    } catch {
        return null;
    }
};

export const deleteTenant = async (id: string): Promise<boolean> => {
    try {
        if (!MongoObjectId.isValid(id)) return false;

        const collection = await getCollection<Document>('tenants');
        const result = await collection.deleteOne({ _id: new MongoObjectId(id) });

        return result.deletedCount === 1;
    } catch {
        return false;
    }
};
