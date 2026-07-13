'use server';

import { getAppSession } from '@/server/auth';
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
import { normalizeCredits, parseCreditsInput, type UserCreditsState } from '@/helpers/credits';
import { getUserCreditsState } from '@/app/actions/credit-db';
import { getFirebaseAdminAuth } from '@/lib/firebase/admin';
import type { Filter } from 'mongodb';

const mapUserDocToUser = (user: UserDoc): User => ({
    ...mapMongoDocToClient(user),
    tenantId: user.tenantId.toString(),
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
        await assertCallerIsAdmin();
        assertValidObjectId(id, 'User ID');

        const usersCollection = await getCollection<UserDoc>(MongoCollections.USERS);
        const user = await usersCollection.findOne({ _id: new MongoObjectId(id) });
        if (!user) {
            throw new Error('User not found');
        }

        const result = await usersCollection.deleteOne({ _id: new MongoObjectId(id) });
        if (result.deletedCount !== 1) {
            throw new Error('User not found');
        }

        // Firebase identity is shared across tenant memberships — only delete when none remain.
        if (user.firebaseUid) {
            const remaining = await usersCollection.countDocuments({ firebaseUid: user.firebaseUid });
            if (remaining === 0) {
                try {
                    await getFirebaseAdminAuth().deleteUser(user.firebaseUid);
                } catch (error) {
                    console.error('Failed to delete Firebase user:', error);
                }
            }
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
    const session = await getAppSession();
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

/** Returns the authenticated user's credit balance (and whether they are credit-exempt). */
export const getCurrentUserCredits = async (): Promise<ALApiResponse<UserCreditsState>> =>
    runAuthenticatedAction(async function getCurrentUserCredits(userId) {
        assertValidObjectId(userId, 'User ID');
        return getUserCreditsState(userId);
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
