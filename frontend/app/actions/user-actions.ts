'use server';

import { auth } from '@/auth';
import { ALApiResponse } from '@aixellabs/backend/api/types';
import {
    getCollection,
    MongoCollections,
    MongoObjectId,
    type ModuleAccess,
    type TenantDoc,
    type User,
    type UserDoc,
} from '@aixellabs/backend/db';
import { mapMongoDocToClient } from '@/helpers/normalize-helpers';
import { assertValidObjectId, runAuthenticatedAction } from '@/helpers/server-action-helpers';
import { parseUserName } from '@/helpers/user-name';
import { normalizeCredits, parseCreditsInput } from '@/helpers/credits';
import { getUserCredits } from '@/app/actions/credit-db';
import type { Filter } from 'mongodb';

const mapUserDocToUser = (user: UserDoc): User => ({
    ...mapMongoDocToClient(user),
    tenantId: user.tenantId.toString(),
    password: user.password ?? '',
    credits: normalizeCredits(user.credits),
});

export const getAllUsers = async (): Promise<ALApiResponse<User[]>> =>
    runAuthenticatedAction(async function getAllUsers() {
        const usersCollection = await getCollection<UserDoc>(MongoCollections.USERS);
        const users = await usersCollection.find({}).toArray();
        return users.map(mapUserDocToUser);
    });

/** `tenantId` is the tenant document `name` (see legacy query on tenants collection). */
export const getAllUsersByTenant = async (tenantId: string): Promise<ALApiResponse<User[]>> =>
    runAuthenticatedAction(async function getAllUsersByTenant(_userId: string) {
        assertValidObjectId(_userId, 'User ID');
        const usersCollection = await getCollection<UserDoc>(MongoCollections.USERS);
        const tenantsCollection = await getCollection<TenantDoc>(MongoCollections.TENANTS);

        const tenant = await tenantsCollection.findOne({ name: tenantId });
        if (!tenant?._id) {
            throw new Error('Tenant not found to query users');
        }

        const users = await usersCollection.find({ tenantId: tenant._id }).toArray();
        return users.map(mapUserDocToUser);
    });

export const getUserById = async (id: string): Promise<ALApiResponse<User>> =>
    runAuthenticatedAction(async function getUserById() {
        assertValidObjectId(id, 'User ID');

        const usersCollection = await getCollection<UserDoc>(MongoCollections.USERS);
        const user = await usersCollection.findOne({ _id: new MongoObjectId(id) });
        if (!user) {
            throw new Error('User not found');
        }

        return mapUserDocToUser(user);
    });

export const createUser = async (input: User): Promise<ALApiResponse<User>> => {
    if (!input.email || !input.password || !input.tenantId) {
        throw new Error('Email, password, and tenant ID are required');
    }
    return runAuthenticatedAction(async function createUser() {
        await assertCallerIsAdmin();

        const usersCollection = await getCollection<UserDoc>(MongoCollections.USERS);
        const tenantsCollection = await getCollection<TenantDoc>(MongoCollections.TENANTS);

        const normalizedEmail = input.email.trim().toLowerCase();
        const credits = input.credits !== undefined ? parseCreditsInput(input.credits) : 0;

        const tenant = await tenantsCollection.findOne({ name: input.tenantId });
        if (!tenant?._id) {
            throw new Error('Tenant not found to create user');
        }

        const existingUser = await usersCollection.findOne({
            email: normalizedEmail,
            tenantId: tenant._id,
        });
        if (existingUser) {
            throw new Error('User already exists');
        }

        const docToInsert: UserDoc = {
            email: normalizedEmail,
            password: input.password,
            name: input.name?.trim(),
            isAdmin: input.isAdmin ?? false,
            tenantId: tenant._id,
            moduleAccess: input.moduleAccess,
            credits,
        };

        const result = await usersCollection.insertOne(docToInsert as UserDoc);

        return {
            _id: result.insertedId.toString(),
            email: docToInsert.email,
            name: docToInsert.name,
            isAdmin: docToInsert.isAdmin,
            tenantId: input.tenantId,
            password: '',
            moduleAccess: docToInsert.moduleAccess,
            credits,
        };
    });
};

export const updateUser = async (input: User): Promise<ALApiResponse<User>> => {
    if (!input._id) {
        throw new Error('User ID is required');
    }
    return runAuthenticatedAction(async function updateUser() {
        await assertCallerIsAdmin();
        assertValidObjectId(input._id as string, 'User ID');

        const usersCollection = await getCollection<UserDoc>(MongoCollections.USERS);

        const updateFields: Partial<UserDoc> = {};
        if (input.name !== undefined) updateFields.name = input.name;
        if (input.isAdmin !== undefined) updateFields.isAdmin = input.isAdmin;
        if (input.moduleAccess !== undefined) updateFields.moduleAccess = input.moduleAccess;
        if (input.credits !== undefined) updateFields.credits = parseCreditsInput(input.credits);

        const updatedUser = await usersCollection.findOneAndUpdate(
            { _id: new MongoObjectId(input._id) },
            { $set: updateFields },
            { returnDocument: 'after' },
        );

        if (!updatedUser) {
            throw new Error('User not found');
        }

        return mapUserDocToUser(updatedUser);
    });
};

export const deleteUser = async (id: string): Promise<ALApiResponse<boolean>> => {
    if (!id) {
        throw new Error('User ID is required');
    }
    return runAuthenticatedAction(async function deleteUser() {
        assertValidObjectId(id, 'User ID');

        const usersCollection = await getCollection<UserDoc>(MongoCollections.USERS);
        const result = await usersCollection.deleteOne({ _id: new MongoObjectId(id) });

        if (result.deletedCount !== 1) {
            throw new Error('User not found');
        }

        return true;
    });
};

export type BulkUpdateUsersModuleAccessInput = {
    tenantName: string;
    userIds: string[];
    applyToAll: boolean;
    moduleAccess: ModuleAccess;
};

export type BulkUpdateUsersModuleAccessResult = {
    matchedCount: number;
    modifiedCount: number;
};

async function assertCallerIsAdmin(): Promise<void> {
    const session = await auth();
    if (!session?.user?.isAdmin) {
        throw new Error('Unauthorized: admin access required');
    }
}

/** Updates the authenticated user's own display name. */
export const updateCurrentUserName = async (name: string): Promise<ALApiResponse<{ name: string }>> =>
    runAuthenticatedAction(async function updateCurrentUserName(userId) {
        assertValidObjectId(userId, 'User ID');

        let normalizedName: string;
        try {
            normalizedName = parseUserName(name);
        } catch (error) {
            if (error instanceof Error) {
                throw new Error(error.message);
            }
            throw new Error('Invalid name');
        }

        const usersCollection = await getCollection<UserDoc>(MongoCollections.USERS);
        const updatedUser = await usersCollection.findOneAndUpdate(
            { _id: new MongoObjectId(userId) },
            { $set: { name: normalizedName } },
            { returnDocument: 'after' },
        );

        if (!updatedUser) {
            throw new Error('User not found');
        }

        return { name: updatedUser.name ?? normalizedName };
    });

/** Returns the authenticated user's current credit balance. */
export const getCurrentUserCredits = async (): Promise<ALApiResponse<number>> =>
    runAuthenticatedAction(async function getCurrentUserCredits(userId) {
        assertValidObjectId(userId, 'User ID');
        return getUserCredits(userId);
    });

/** Replaces `moduleAccess` for selected users (or all users) within a tenant. */
export const bulkUpdateUsersModuleAccess = async (
    input: BulkUpdateUsersModuleAccessInput,
): Promise<ALApiResponse<BulkUpdateUsersModuleAccessResult>> => {
    const tenantName = input.tenantName?.trim();
    if (!tenantName) {
        throw new Error('Tenant name is required');
    }
    if (!input.applyToAll && (!input.userIds || input.userIds.length === 0)) {
        throw new Error('At least one user must be selected');
    }

    return runAuthenticatedAction(async function bulkUpdateUsersModuleAccess() {
        await assertCallerIsAdmin();

        const tenantsCollection = await getCollection<TenantDoc>(MongoCollections.TENANTS);
        const tenant = await tenantsCollection.findOne({ name: tenantName });
        if (!tenant?._id) {
            throw new Error('Tenant not found');
        }

        const filter: Filter<UserDoc> = { tenantId: tenant._id };

        if (!input.applyToAll) {
            for (const id of input.userIds) {
                assertValidObjectId(id, 'User ID');
            }
            filter._id = { $in: input.userIds.map((id) => new MongoObjectId(id)) };
        }

        const usersCollection = await getCollection<UserDoc>(MongoCollections.USERS);
        const result = await usersCollection.updateMany(filter, {
            $set: { moduleAccess: input.moduleAccess },
        });

        return {
            matchedCount: result.matchedCount,
            modifiedCount: result.modifiedCount,
        };
    });
};
