import { MongoClient, type Db, type ObjectId } from 'mongodb';
import {
    MongoCollections,
    type ModuleAccess,
    type TenantDoc,
    type UserDoc,
    type UserLeadDoc,
    type UserLeadListDoc,
} from '@aixellabs/backend/db/types';
import { getDefaultModuleAccess } from '@/helpers/module-access-helpers';
import { E2E_DB_NAME, E2E_MONGODB_URI, E2E_TENANT } from './env';
import { DEFAULT_USER_CREDITS, E2E_ADMIN, E2E_USER, type E2eUser } from './users';

/** Direct Mongo access for seeding and for asserting what the server actions persisted. */
export class E2eDb {
    private constructor(
        private readonly client: MongoClient,
        private readonly db: Db,
    ) {}

    static async connect(): Promise<E2eDb> {
        const client = new MongoClient(E2E_MONGODB_URI, { serverSelectionTimeoutMS: 3000 });
        try {
            await client.connect();
        } catch (error) {
            throw new Error(
                `E2E Mongo is not reachable at ${E2E_MONGODB_URI}. Start the services first: pnpm e2e:services:up`,
                { cause: error },
            );
        }
        return new E2eDb(client, client.db(E2E_DB_NAME));
    }

    close(): Promise<void> {
        return this.client.close();
    }

    private get users() {
        return this.db.collection<UserDoc>(MongoCollections.USERS);
    }

    /** Wipes the database and creates the `e2e` tenant with one normal user and one admin. */
    async seed(tenantLabel: string): Promise<void> {
        await this.db.dropDatabase();
        // An existing deployment already has this collection; `ensureUserLeadIndexes` fails without it.
        await this.db.createCollection(MongoCollections.USER_LEADS);

        const tenant: TenantDoc = {
            name: E2E_TENANT,
            label: tenantLabel,
            defaultModuleAccess: getDefaultModuleAccess(),
            defaultCredits: DEFAULT_USER_CREDITS,
        };
        const { insertedId: tenantId } = await this.db
            .collection<TenantDoc>(MongoCollections.TENANTS)
            .insertOne(tenant);

        await this.users.insertMany([
            this.membership(E2E_USER, tenantId, {
                moduleAccess: getDefaultModuleAccess(),
                credits: DEFAULT_USER_CREDITS,
                creditsRefilledAt: new Date(),
            }),
            // Admins store `moduleAccess: {}` and are outside the credits system.
            this.membership(E2E_ADMIN, tenantId, { moduleAccess: {} }),
        ]);
    }

    private membership(user: E2eUser, tenantId: ObjectId, extra: Partial<UserDoc>): UserDoc {
        return {
            firebaseUid: user.firebaseUid,
            email: user.email,
            name: user.name,
            deviceFingerprint: `${user.firebaseUid}-device`,
            isAdmin: user.isAdmin,
            tenantId,
            tenantName: E2E_TENANT,
            ...extra,
        };
    }

    /**
     * Puts a user back to a known balance / access and removes the lead lists they own.
     * The daily refill is marked as just done unless `refilledHoursAgo` says otherwise,
     * so a test's starting balance is not topped up underneath it.
     */
    async resetUser(
        user: E2eUser,
        overrides: { credits?: number; moduleAccess?: ModuleAccess; refilledHoursAgo?: number } = {},
    ): Promise<void> {
        const doc = await this.getUser(user);
        await this.db.collection<UserLeadDoc>(MongoCollections.USER_LEADS).deleteMany({ userId: doc._id });
        await this.db.collection<UserLeadListDoc>(MongoCollections.LEAD_LISTS).deleteMany({ userId: doc._id });

        if (user.isAdmin) return;
        await this.users.updateOne(
            { _id: doc._id },
            {
                $set: {
                    credits: overrides.credits ?? DEFAULT_USER_CREDITS,
                    creditsRefilledAt: new Date(Date.now() - (overrides.refilledHoursAgo ?? 0) * 60 * 60 * 1000),
                    moduleAccess: overrides.moduleAccess ?? getDefaultModuleAccess(),
                },
            },
        );
    }

    async getUser(user: E2eUser) {
        const doc = await this.users.findOne({ firebaseUid: user.firebaseUid, tenantName: E2E_TENANT });
        if (!doc) throw new Error(`E2E user ${user.firebaseUid} is not seeded`);
        return doc;
    }

    async getCredits(user: E2eUser): Promise<number | undefined> {
        return (await this.getUser(user)).credits;
    }

    /** Lead lists owned by the user, each with the number of leads saved into it. */
    async getLeadLists(user: E2eUser): Promise<{ name: string; leadCount: number }[]> {
        const { _id: userId } = await this.getUser(user);
        const lists = await this.db
            .collection<UserLeadListDoc>(MongoCollections.LEAD_LISTS)
            .find({ userId })
            .toArray();
        const userLeads = this.db.collection<UserLeadDoc>(MongoCollections.USER_LEADS);

        return Promise.all(
            lists.map(async (list) => ({
                name: list.name,
                leadCount: await userLeads.countDocuments({ userId, listId: list._id }),
            })),
        );
    }
}
