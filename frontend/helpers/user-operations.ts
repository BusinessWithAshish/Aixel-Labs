'use server';

import { getCollection } from '@/lib/mongodb';
import { ObjectId, type Document } from 'mongodb';

export type User = {
    _id: string;
    email: string;
    name?: string;
    isAdmin: boolean;
    tenantId: string;
};

export type CreateUserInput = {
    email: string;
    password: string;
    name?: string;
    isAdmin?: boolean;
    tenantId: string;
};

export type UpdateUserInput = {
    name?: string;
    isAdmin?: boolean;
};

type UserDoc = {
    email: string;
    name?: string;
    isAdmin: boolean;
    tenantId: ObjectId;
    password: string;
};

export const getUsersByTenantId = async (tenantId: string): Promise<User[]> => {
    try {
        const collection = await getCollection<Document>('users');
        const tenantsCollection = await getCollection<Document>('tenants');
        
        // Find the tenant by name to get its ObjectId
        const tenant = await tenantsCollection.findOne({ name: tenantId });
        
        if (!tenant) {
            return [];
        }
        
        // Query users using the tenant's ObjectId
        const users = await collection.find({ tenantId: tenant._id }).toArray();
        return JSON.parse(
            JSON.stringify(
                users.map((user) => ({
                    _id: user._id.toString(),
                    email: user.email,
                    name: user.name,
                    isAdmin: Boolean(user.isAdmin),
                    tenantId: tenantId, // Return the tenant name as string
                })),
            ),
        );
    } catch {
        return [];
    }
};

export const createUser = async (input: CreateUserInput): Promise<User | null> => {
    try {
        if (!input.email || !input.password || !input.tenantId) return null;

        const collection = await getCollection<Document>('users');
        const tenantsCollection = await getCollection<Document>('tenants');

        // Find the tenant by name to get its ObjectId
        const tenant = await tenantsCollection.findOne({ name: input.tenantId });
        
        if (!tenant) {
            return null; // Tenant doesn't exist
        }
        
        const tenantObjectId = tenant._id;

        // Check if user already exists with this email and tenantId
        const existingUser = await collection.findOne({
            email: input.email.trim().toLowerCase(),
            tenantId: tenantObjectId,
        });

        if (existingUser) {
            return null; // User already exists
        }

        const doc: UserDoc = {
            email: input.email.trim().toLowerCase(),
            password: input.password,
            name: input.name?.trim(),
            isAdmin: Boolean(input.isAdmin),
            tenantId: tenantObjectId,
        };

        const result = await collection.insertOne(doc);

        return JSON.parse(
            JSON.stringify({
                _id: result.insertedId.toString(),
                email: doc.email,
                name: doc.name,
                isAdmin: doc.isAdmin,
                tenantId: input.tenantId, // Return the tenant name as string
            }),
        );
    } catch {
        return null;
    }
};

export const updateUser = async (id: string, input: UpdateUserInput): Promise<User | null> => {
    try {
        if (!ObjectId.isValid(id)) return null;

        const collection = await getCollection<Document>('users');
        const tenantsCollection = await getCollection<Document>('tenants');

        const updateFields: Partial<UserDoc> = {};
        if (input.name !== undefined) updateFields.name = input.name;
        if (input.isAdmin !== undefined) updateFields.isAdmin = input.isAdmin;

        const result = await collection.findOneAndUpdate(
            { _id: new ObjectId(id) },
            { $set: updateFields },
            { returnDocument: 'after' },
        );

        const updated = result?.value ?? null;
        if (!updated) return null;

        // Find the tenant name from the ObjectId
        const tenant = await tenantsCollection.findOne({ _id: updated.tenantId });
        const tenantName = tenant?.name || '';

        return JSON.parse(
            JSON.stringify({
                _id: updated._id.toString(),
                email: updated.email,
                name: updated.name,
                isAdmin: Boolean(updated.isAdmin),
                tenantId: tenantName, // Return the tenant name as string
            }),
        );
    } catch {
        return null;
    }
};

export const deleteUser = async (id: string): Promise<boolean> => {
    try {
        if (!ObjectId.isValid(id)) return false;

        const collection = await getCollection<Document>('users');
        const result = await collection.deleteOne({ _id: new ObjectId(id) });

        return result.deletedCount === 1;
    } catch {
        return false;
    }
};
