'use server';

import { getCollection, MongoObjectId, MongoCollections, type User, type UserDoc, type TenantDoc } from '@aixellabs/shared/mongodb';

// ============================================================================
// USER INPUT TYPES (Frontend/Forms)
// ============================================================================

/**
 * Input for creating a new user (used in forms/API).
 * tenantId is the tenant name (string) from the frontend.
 */
export type CreateUserInput = {
    email: string;
    password: string;
    name?: string;
    isAdmin?: boolean;
    tenantId: string; // Tenant name as string
};

/**
 * Input for updating a user (used in forms/API).
 */
export type UpdateUserInput = {
    name?: string;
    isAdmin?: boolean;
};

export type { User };

export const getUsersByTenantId = async (tenantId: string): Promise<User[]> => {
    try {
        const usersCollection = await getCollection<UserDoc>(MongoCollections.USERS);
        const tenantsCollection = await getCollection<TenantDoc>(MongoCollections.TENANTS);
        
        // Find the tenant by name to get its ObjectId
        const tenant = await tenantsCollection.findOne({ name: tenantId });
        
        if (!tenant) {
            return [];
        }
        
        // Query users using the tenant's ObjectId
        const users = await usersCollection.find({ tenantId: tenant._id }).toArray();
        
        // Convert MongoDB documents to frontend-friendly format
        return users.map((user) => ({
            _id: user._id.toString(),
            email: user.email,
            name: user.name,
            isAdmin: user.isAdmin,
            tenantId: tenantId, // Return the tenant name as string
        }));
    } catch {
        return [];
    }
};

export const createUser = async (input: CreateUserInput): Promise<User | null> => {
    try {
        if (!input.email || !input.password || !input.tenantId) return null;

        const usersCollection = await getCollection<UserDoc>(MongoCollections.USERS);
        const tenantsCollection = await getCollection<TenantDoc>(MongoCollections.TENANTS);

        // Find the tenant by name to get its ObjectId
        const tenant = await tenantsCollection.findOne({ name: input.tenantId });
        
        if (!tenant) {
            return null; // Tenant doesn't exist
        }

        // Check if user already exists with this email and tenantId
        const existingUser = await usersCollection.findOne({
            email: input.email.trim().toLowerCase(),
            tenantId: tenant._id,
        });

        if (existingUser) {
            return null; // User already exists
        }

        // Prepare document for insertion (without _id, MongoDB will generate it)
        const docToInsert: Omit<UserDoc, '_id'> = {
            email: input.email.trim().toLowerCase(),
            password: input.password,
            name: input.name?.trim(),
            isAdmin: input.isAdmin ?? false,
            tenantId: tenant._id,
        };

        const result = await usersCollection.insertOne(docToInsert as UserDoc);

        // Return frontend-friendly format
        return {
            _id: result.insertedId.toString(),
            email: docToInsert.email,
            name: docToInsert.name,
            isAdmin: docToInsert.isAdmin,
            tenantId: input.tenantId, // Return the tenant name as string
        };
    } catch {
        return null;
    }
};

export const updateUser = async (id: string, input: UpdateUserInput): Promise<User | null> => {
    try {
        if (!MongoObjectId.isValid(id)) return null;

        const usersCollection = await getCollection<UserDoc>(MongoCollections.USERS);
        const tenantsCollection = await getCollection<TenantDoc>(MongoCollections.TENANTS);

        const updateFields: Partial<Pick<UserDoc, 'name' | 'isAdmin'>> = {};
        if (input.name !== undefined) updateFields.name = input.name;
        if (input.isAdmin !== undefined) updateFields.isAdmin = input.isAdmin;

        const result = await usersCollection.findOneAndUpdate(
            { _id: new MongoObjectId(id) },
            { $set: updateFields },
            { returnDocument: 'after' },
        );

        if (!result) return null;

        // Find the tenant name from the ObjectId
        const tenant = await tenantsCollection.findOne({ _id: result.tenantId });
        const tenantName = tenant?.name || '';

        // Return frontend-friendly format
        return {
            _id: result._id.toString(),
            email: result.email,
            name: result.name,
            isAdmin: result.isAdmin,
            tenantId: tenantName, // Return the tenant name as string
        };
    } catch {
        return null;
    }
};

export const deleteUser = async (id: string): Promise<boolean> => {
    try {
        if (!MongoObjectId.isValid(id)) return false;

        const usersCollection = await getCollection<UserDoc>(MongoCollections.USERS);
        const result = await usersCollection.deleteOne({ _id: new MongoObjectId(id) });

        return result.deletedCount === 1;
    } catch {
        return false;
    }
};
