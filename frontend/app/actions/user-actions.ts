'use server';

import { withAuthentication } from './auth-actions';
import {
    getCollection,
    MongoCollections,
    MongoObjectId,
    type UserDoc,
    type TenantDoc,
    type User,
} from '@aixellabs/backend/db';
import { ALApiResponse } from '@aixellabs/backend/api/types';

const mapUserDocToUser = (user: UserDoc): User => {
    const { _id, password = '', tenantId, ...userData } = user;

    return {
        _id: _id?.toString(),
        tenantId: tenantId.toString(),
        password,
        ...userData,
    };
};

export const getAllUsers = async (): Promise<ALApiResponse<User[]>> => {
    try {
        const getAllUsersResponse = await withAuthentication<User[]>(async () => {
            const usersCollection = await getCollection<UserDoc>(MongoCollections.USERS);
            const users = await usersCollection.find({}).toArray();
            return users.map((user) => mapUserDocToUser(user));
        });

        if (!getAllUsersResponse?.success) {
            return {
                success: false,
                error: getAllUsersResponse?.error ?? 'User not authenticated',
            };
        }

        return {
            success: true,
            data: getAllUsersResponse.data ?? [],
        };
    } catch (error) {
        console.error('Error fetching users:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to fetch users',
        };
    }
};

export const getAllUsersByTenant = async (tenantId: string): Promise<ALApiResponse<User[]>> => {
    try {
        const getAllUsersByTenantResponse = await withAuthentication<User[]>(async () => {
            const usersCollection = await getCollection<UserDoc>(MongoCollections.USERS);
            const tenantsCollection = await getCollection<TenantDoc>(MongoCollections.TENANTS);

            const tenant = await tenantsCollection.findOne({ name: tenantId });
            if (!tenant?._id) {
                return [];
            }

            const users = await usersCollection.find({ tenantId: tenant._id }).toArray();
            return users.map((user) => mapUserDocToUser(user));
        });

        if (!getAllUsersByTenantResponse.success) {
            return {
                success: false,
                error: getAllUsersByTenantResponse.error ?? 'User not authenticated',
            };
        }

        return {
            success: true,
            data: getAllUsersByTenantResponse.data ?? [],
        };
    } catch (error) {
        console.error('Error fetching users by tenant:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to fetch users by tenant',
        };
    }
};

export const getUserById = async (id: string): Promise<ALApiResponse<User>> => {
    try {
        const getUserByIdResponse = await withAuthentication<User | null>(async () => {
            if (!MongoObjectId.isValid(id)) {
                return null;
            }

            const usersCollection = await getCollection<UserDoc>(MongoCollections.USERS);

            const user = await usersCollection.findOne({ _id: new MongoObjectId(id) });
            if (!user) return null;

            return mapUserDocToUser(user);
        });

        if (!getUserByIdResponse.success || !getUserByIdResponse.data) {
            return {
                success: false,
                error: getUserByIdResponse.error ?? 'User not found',
            };
        }

        return {
            success: true,
            data: getUserByIdResponse.data,
        };
    } catch (error) {
        console.error('Error fetching user by id:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to fetch user',
        };
    }
};

export const createUser = async (input: User): Promise<ALApiResponse<User>> => {
    try {
        if (!input.email || !input.password || !input.tenantId) {
            return {
                success: false,
                error: 'Email, password, and tenant ID are required',
            };
        }

        const createUserResponse = await withAuthentication<User | null>(async () => {
            const usersCollection = await getCollection<UserDoc>(MongoCollections.USERS);
            const tenantsCollection = await getCollection<TenantDoc>(MongoCollections.TENANTS);

            const normalizedEmail = input.email.trim().toLowerCase();

            const tenant = await tenantsCollection.findOne({ name: input.tenantId });
            if (!tenant?._id) {
                return null;
            }

            const existingUser = await usersCollection.findOne({
                email: normalizedEmail,
                tenantId: tenant._id,
            });

            if (existingUser) {
                return null;
            }

            const docToInsert: UserDoc = {
                email: normalizedEmail,
                password: input.password,
                name: input.name?.trim(),
                isAdmin: input.isAdmin ?? false,
                tenantId: tenant._id,
                moduleAccess: input.moduleAccess,
            };

            const result = await usersCollection.insertOne(docToInsert as UserDoc);

            const createdUser: User = {
                _id: result.insertedId.toString(),
                email: docToInsert.email,
                name: docToInsert.name,
                isAdmin: docToInsert.isAdmin,
                tenantId: input.tenantId,
                password: '',
                moduleAccess: docToInsert.moduleAccess,
            };

            return createdUser;
        });

        if (!createUserResponse.success) {
            return {
                success: false,
                error: createUserResponse.error ?? 'User not authenticated',
            };
        }

        if (!createUserResponse.data) {
            return {
                success: false,
                error: 'User already exists or creation failed',
            };
        }

        return {
            success: true,
            data: createUserResponse.data,
        };
    } catch (error) {
        console.error('Error creating user:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to create user',
        };
    }
};

export const updateUser = async (input: User): Promise<ALApiResponse<User>> => {
    try {
        if (!input._id) {
            return {
                success: false,
                error: 'User ID is required',
            };
        }

        const response = await withAuthentication<User | null>(async () => {
            if (!MongoObjectId.isValid(input._id as string)) {
                return null;
            }

            const usersCollection = await getCollection<UserDoc>(MongoCollections.USERS);

            const updateFields: Partial<UserDoc> = {};

            if (input.name !== undefined) updateFields.name = input.name;
            if (input.isAdmin !== undefined) updateFields.isAdmin = input.isAdmin;
            if (input.moduleAccess !== undefined) updateFields.moduleAccess = input.moduleAccess;

            const updatedUser = await usersCollection.findOneAndUpdate(
                { _id: new MongoObjectId(input._id) },
                { $set: updateFields },
                { returnDocument: 'after' },
            );

            if (!updatedUser) {
                return null;
            }

            return mapUserDocToUser(updatedUser);
        });

        if (!response.success || !response.data) {
            return {
                success: false,
                error: response.error ?? 'User not found or update failed',
            };
        }

        return {
            success: true,
            data: response.data,
        };
    } catch (error) {
        console.error('Error updating user:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to update user',
        };
    }
};

export const deleteUser = async (id: string): Promise<ALApiResponse<boolean>> => {
    try {
        if (!id) {
            return {
                success: false,
                error: 'User ID is required',
            };
        }

        const response = await withAuthentication<boolean>(async () => {
            if (!MongoObjectId.isValid(id)) {
                return false;
            }

            const usersCollection = await getCollection<UserDoc>(MongoCollections.USERS);
            const result = await usersCollection.deleteOne({ _id: new MongoObjectId(id) });

            return result.deletedCount === 1;
        });

        if (!response.success) {
            return {
                success: false,
                error: response.error ?? 'User not authenticated',
            };
        }

        if (!response.data) {
            return {
                success: false,
                error: 'User not found or deletion failed',
            };
        }

        return {
            success: true,
            data: true,
        };
    } catch (error) {
        console.error('Error deleting user:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to delete user',
        };
    }
};
