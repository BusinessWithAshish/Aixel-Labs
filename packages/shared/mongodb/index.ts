import { MongoClient, Db, ObjectId } from "mongodb";
import type { LeadDoc, UserLeadDoc } from "./types";
import { LeadSource, MongoCollections } from "./types";
import type { GMAPS_SCRAPE_LEAD_INFO } from "../common";
import type { INSTAGRAM_SCRAPE_LEAD_INFO } from "../common/apis/instagram";

export type { ObjectId, Document, Collection, Db, MongoClient } from "mongodb";
export { ObjectId as MongoObjectId } from "mongodb";
export * from "./types";
export { LeadSource, MongoCollections };

type GlobalWithMongo = typeof globalThis & {
  _mongoClientPromise?: Promise<MongoClient>;
};

let clientPromise: Promise<MongoClient> | null = null;

const getClientPromise = (): Promise<MongoClient> => {
  if (clientPromise) {
    return clientPromise;
  }

  if (!process.env.MONGODB_URI) {
    throw new Error('Invalid/Missing environment variable: "MONGODB_URI"');
  }

  const uri = process.env.MONGODB_URI;
  const options = {};

  if (process.env.NODE_ENV === "development") {
    const globalWithMongo = global as GlobalWithMongo;

    if (!globalWithMongo._mongoClientPromise) {
      const client = new MongoClient(uri, options);
      globalWithMongo._mongoClientPromise = client.connect();
    }
    clientPromise = globalWithMongo._mongoClientPromise;
  } else {
    const client = new MongoClient(uri, options);
    clientPromise = client.connect();
  }

  return clientPromise;
};

export default getClientPromise;

export const getDatabase = async (dbName?: string): Promise<Db> => {
  const client = await getClientPromise();
  return client.db(dbName || process.env.MONGODB_DB_NAME);
};

export const getCollection = async <
  T extends Record<string, unknown> = Record<string, unknown>
>(
  collectionName: string,
  dbName?: string
) => {
  const db = await getDatabase(dbName);
  return db.collection<T>(collectionName);
};

export const checkConnection = async (): Promise<boolean> => {
  try {
    const client = await getClientPromise();
    await client.db("admin").command({ ping: 1 });
    return true;
  } catch (error) {
    console.error("MongoDB connection error:", error);
    return false;
  }
};

/**
 * Saves leads for a user with automatic deduplication.
 * - Checks if lead exists by (source, sourceId)
 * - If new: inserts into Leads collection
 * - If exists: retrieves existing lead _id
 * - Creates UserLeads entry if user doesn't already have this lead
 *
 * @returns Array of results with leadId and whether it was newly created
 */
export const saveLeadsForUser = async (
  userId: ObjectId,
  leads: Array<{
    source: LeadSource;
    sourceId: string;
    data: GMAPS_SCRAPE_LEAD_INFO | INSTAGRAM_SCRAPE_LEAD_INFO;
  }>,
  dbName?: string
): Promise<
  Array<{ leadId: ObjectId; isNewLead: boolean; isNewUserLead: boolean }>
> => {
  const leadsCollection = await getCollection<LeadDoc>(MongoCollections.LEADS, dbName);
  const userLeadsCollection = await getCollection<UserLeadDoc>(
    MongoCollections.USER_LEADS,
    dbName
  );

  const results = [];

  for (const lead of leads) {
    // Step 1: Check if lead exists globally
    let existingLead = await leadsCollection.findOne({
      source: lead.source,
      sourceId: lead.sourceId,
    });

    let leadId: ObjectId;
    let isNewLead = false;

    if (!existingLead) {
      // Insert new lead
      const insertResult = await leadsCollection.insertOne({
        _id: new ObjectId(),
        source: lead.source,
        sourceId: lead.sourceId,
        data: lead.data,
      });
      leadId = insertResult.insertedId;
      isNewLead = true;
    } else {
      leadId = existingLead._id;
    }

    // Step 2: Check if user already has this lead
    const existingUserLead = await userLeadsCollection.findOne({
      userId,
      leadId,
    });

    let isNewUserLead = false;

    if (!existingUserLead) {
      // Create UserLead entry
      const now = new Date();
      await userLeadsCollection.insertOne({
        _id: new ObjectId(),
        userId,
        leadId,
        createdAt: now,
        updatedAt: now,
      });
      isNewUserLead = true;
    }

    results.push({ leadId, isNewLead, isNewUserLead });
  }

  return results;
};

/**
 * Retrieves all leads for a specific user, optionally filtered by source.
 */
export const getUserLeads = async (
  userId: ObjectId,
  source?: LeadSource,
  dbName?: string
): Promise<LeadDoc[]> => {
  const userLeadsCollection = await getCollection<UserLeadDoc>(
    MongoCollections.USER_LEADS,
    dbName
  );
  const leadsCollection = await getCollection<LeadDoc>(MongoCollections.LEADS, dbName);

  // Get all UserLead entries for this user
  const userLeads = await userLeadsCollection.find({ userId }).toArray();

  // Extract lead IDs
  const leadIds = userLeads.map((ul) => ul.leadId);

  if (leadIds.length === 0) {
    return [];
  }

  // Build query
  const query: any = { _id: { $in: leadIds } };
  if (source) {
    query.source = source;
  }

  // Fetch lead details
  const leads = await leadsCollection.find(query).toArray();

  return leads;
};

/**
 * Checks if a lead already exists in the Leads collection.
 */
export const checkLeadExists = async (
  source: LeadSource,
  sourceId: string,
  dbName?: string
): Promise<boolean> => {
  const leadsCollection = await getCollection<LeadDoc>(MongoCollections.LEADS, dbName);
  const count = await leadsCollection.countDocuments({ source, sourceId });
  return count > 0;
};
