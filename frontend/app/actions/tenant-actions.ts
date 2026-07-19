'use server';

import { ALApiResponse } from '@aixellabs/backend/api/types';
import type { Tenant, TenantDoc, UserDoc } from '@aixellabs/backend/db/types';
import { MongoCollections, MongoObjectId, getCollection } from '@aixellabs/backend/db';
import { parseCreditsInput } from '@/helpers/credits';
import { mapMongoDocToClient } from '@/helpers/normalize-helpers';
import { assertValidObjectId, runAuthenticatedAction, runPublicAction } from '@/helpers/server-action-helpers';
import {
    assertCallerIsAdmin,
    assertTenantIsSessionTenant,
    requireAdminSessionContext,
} from '@/server/auth';
import { deleteOrphanedFirebaseUsers } from '@/server/auth/firebase-cleanup';
import { deleteUserOwnedLeadData } from '@/server/leads/cascade-delete';

export const getAllTenants = async (): Promise<ALApiResponse<Tenant[]>> =>
    runAuthenticatedAction(async function getAllTenants() {
        await assertCallerIsAdmin();
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
            const tenant = await tenantsCollection.findOne({ name: name.toLowerCase() });
            return tenant ? mapMongoDocToClient(tenant) : null;
        },
        {
            logLabel: 'Error fetching tenant by name (public):',
            fallbackError: 'Failed to fetch tenant by name',
        },
    );

export const getTenantByName = async (name: string): Promise<ALApiResponse<Tenant | null>> =>
    runAuthenticatedAction(async function getTenantByName() {
        await assertCallerIsAdmin();
        const tenantsCollection = await getCollection<TenantDoc>(MongoCollections.TENANTS);
        const tenant = await tenantsCollection.findOne({ name });
        return tenant ? mapMongoDocToClient(tenant) : null;
    });

export const createTenant = async (tenant: Tenant): Promise<ALApiResponse<Tenant>> =>
    runAuthenticatedAction(async function createTenant() {
        await assertCallerIsAdmin();
        const tenantsCollection = await getCollection<TenantDoc>(MongoCollections.TENANTS);

        const isNormalTenant = !tenant.type;

        const docToInsert: TenantDoc = {
            name: tenant.name,
            label: tenant.label,
            type: tenant.type,
            redirect_url: tenant.redirect_url,
            app_description: tenant.app_description,
            app_logo_url: tenant.app_logo_url,
            app_theme_color: tenant.app_theme_color,
        };

        if (isNormalTenant) {
            if (tenant.defaultModuleAccess === undefined) {
                throw new Error('Default module access is required when creating a normal tenant');
            }
            docToInsert.defaultModuleAccess = tenant.defaultModuleAccess;
            docToInsert.defaultCredits = parseCreditsInput(tenant.defaultCredits);
        }

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
        const ctx = await requireAdminSessionContext();
        const tenantsCollection = await getCollection<TenantDoc>(MongoCollections.TENANTS);

        const existing = await tenantsCollection.findOne({ _id: new MongoObjectId(tenant._id) });
        if (!existing) {
            throw new Error('Tenant not found');
        }
        assertTenantIsSessionTenant(existing, ctx);

        const updateFields: Partial<TenantDoc> = {
            name: tenant.name,
            label: tenant.label,
            type: tenant.type,
            redirect_url: tenant.redirect_url,
            app_description: tenant.app_description,
            app_logo_url: tenant.app_logo_url,
            app_theme_color: tenant.app_theme_color,
            // defaultModuleAccess / defaultCredits are immutable after create.
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

export type TenantDeletePreview = {
    userCount: number;
};

/** Count users that would be removed if this tenant is deleted. */
export const getTenantDeletePreview = async (id: string): Promise<ALApiResponse<TenantDeletePreview>> =>
    runAuthenticatedAction(async function getTenantDeletePreview() {
        const ctx = await requireAdminSessionContext();
        assertValidObjectId(id, 'Tenant ID');

        const tenantObjectId = new MongoObjectId(id);
        const tenantsCollection = await getCollection<TenantDoc>(MongoCollections.TENANTS);
        const tenant = await tenantsCollection.findOne({ _id: tenantObjectId });
        if (!tenant) {
            throw new Error('Tenant not found');
        }
        assertTenantIsSessionTenant(tenant, ctx);

        const usersCollection = await getCollection<UserDoc>(MongoCollections.USERS);
        const userCount = await usersCollection.countDocuments({ tenantId: tenantObjectId });
        return { userCount };
    });

export type DeleteTenantResult = {
    deletedUsers: number;
    deletedLeadLists: number;
    deletedUserLeads: number;
};

/**
 * Deletes the session tenant and cascades to its users and user-owned lead data.
 * Shared `leads` documents are kept. Firebase Auth is deleted when no memberships remain.
 */
export const deleteTenant = async (id: string): Promise<ALApiResponse<DeleteTenantResult>> =>
    runAuthenticatedAction(async function deleteTenant() {
        const ctx = await requireAdminSessionContext();
        assertValidObjectId(id, 'Tenant ID');

        const tenantObjectId = new MongoObjectId(id);
        const tenantsCollection = await getCollection<TenantDoc>(MongoCollections.TENANTS);
        const usersCollection = await getCollection<UserDoc>(MongoCollections.USERS);

        const tenant = await tenantsCollection.findOne({ _id: tenantObjectId });
        if (!tenant) {
            throw new Error('Tenant not found');
        }
        assertTenantIsSessionTenant(tenant, ctx);

        const users = await usersCollection
            .find({ tenantId: tenantObjectId }, { projection: { _id: 1, firebaseUid: 1 } })
            .toArray();
        const userIds = users.map((user) => user._id).filter((userId): userId is MongoObjectId => Boolean(userId));
        const firebaseUids = users.map((user) => user.firebaseUid).filter((uid): uid is string => Boolean(uid));

        const { deletedUserLeads, deletedLeadLists } = await deleteUserOwnedLeadData(userIds);

        const usersResult = await usersCollection.deleteMany({ tenantId: tenantObjectId });
        const tenantResult = await tenantsCollection.deleteOne({ _id: tenantObjectId });
        if (tenantResult.deletedCount < 1) {
            throw new Error('Failed to delete tenant');
        }

        await deleteOrphanedFirebaseUsers(firebaseUids);

        return {
            deletedUsers: usersResult.deletedCount,
            deletedLeadLists,
            deletedUserLeads,
        };
    });
