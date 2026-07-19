'use server';

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
import {
    assertTenantNameIsSessionTenant,
    assertUserInSessionTenant,
    requireAdminSessionContext,
} from '@/server/auth';
import { deleteOrphanedFirebaseUsers } from '@/server/auth/firebase-cleanup';
import { deleteUserOwnedLeadData } from '@/server/leads/cascade-delete';
import type { Filter } from 'mongodb';

const mapUserDocToUser = (user: UserDoc): User => ({
    ...mapMongoDocToClient(user),
    tenantId: user.tenantId.toString(),
    credits: normalizeCredits(user.credits),
});

/** `tenantId` is the tenant document `name` (slug). Must match the session tenant. */
export const getAllUsersByTenant = async (tenantId: string): Promise<ALApiResponse<User[]>> =>
    runAuthenticatedAction(async function getAllUsersByTenant() {
        const { tenantObjectId, tenantName } = await requireAdminSessionContext();
        assertTenantNameIsSessionTenant(tenantId, tenantName);

        const usersCollection = await getCollection<UserDoc>(MongoCollections.USERS);
        const users = await usersCollection.find({ tenantId: tenantObjectId }).toArray();
        return users.map(mapUserDocToUser);
    });

export const updateUser = async (input: User): Promise<ALApiResponse<User>> => {
    if (!input._id) {
        throw new Error('User ID is required');
    }
    return runAuthenticatedAction(async function updateUser() {
        const { tenantObjectId } = await requireAdminSessionContext();
        assertValidObjectId(input._id as string, 'User ID');

        const usersCollection = await getCollection<UserDoc>(MongoCollections.USERS);
        const existing = await usersCollection.findOne({ _id: new MongoObjectId(input._id) });
        if (!existing) {
            throw new Error('User not found');
        }
        assertUserInSessionTenant(existing, tenantObjectId);

        const updateFields: Partial<UserDoc> = {};
        if (input.name !== undefined) updateFields.name = input.name;
        if (input.credits !== undefined) updateFields.credits = parseCreditsInput(input.credits);

        const nextIsAdmin = input.isAdmin !== undefined ? input.isAdmin : existing.isAdmin;
        if (input.isAdmin !== undefined) {
            updateFields.isAdmin = input.isAdmin;
        }

        if (nextIsAdmin) {
            updateFields.moduleAccess = {};
        } else if (existing.isAdmin && !nextIsAdmin) {
            const tenantsCollection = await getCollection<TenantDoc>(MongoCollections.TENANTS);
            const tenant = await tenantsCollection.findOne(
                { _id: tenantObjectId },
                { projection: { defaultModuleAccess: 1 } },
            );
            updateFields.moduleAccess = tenant?.defaultModuleAccess ?? {};
        } else if (input.moduleAccess !== undefined) {
            updateFields.moduleAccess = input.moduleAccess;
        }

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
        const { tenantObjectId } = await requireAdminSessionContext();
        assertValidObjectId(id, 'User ID');

        const usersCollection = await getCollection<UserDoc>(MongoCollections.USERS);
        const user = await usersCollection.findOne({ _id: new MongoObjectId(id) });
        if (!user) {
            throw new Error('User not found');
        }
        assertUserInSessionTenant(user, tenantObjectId);

        const userOid = new MongoObjectId(id);
        await deleteUserOwnedLeadData([userOid]);

        const result = await usersCollection.deleteOne({ _id: userOid });
        if (result.deletedCount !== 1) {
            throw new Error('User not found');
        }

        await deleteOrphanedFirebaseUsers(user.firebaseUid ? [user.firebaseUid] : []);

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

/** Replaces `moduleAccess` for selected non-admin users (or all non-admins) within the session tenant. */
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
        const { tenantObjectId, tenantName: sessionTenantName } = await requireAdminSessionContext();
        assertTenantNameIsSessionTenant(tenantName, sessionTenantName);

        const filter: Filter<UserDoc> = {
            tenantId: tenantObjectId,
            isAdmin: { $ne: true },
        };

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
