import { MongoClient, Db } from "mongodb";

// Re-export commonly used MongoDB types
export type { ObjectId, Document, Collection, Db, MongoClient } from "mongodb";
export { ObjectId as MongoObjectId } from "mongodb";

// Define a global type for MongoDB client caching
type GlobalWithMongo = typeof globalThis & {
  _mongoClientPromise?: Promise<MongoClient>;
};

let clientPromise: Promise<MongoClient> | null = null;

/**
 * Get or create the MongoDB client promise (lazy initialization)
 * This ensures the client is only created when actually needed,
 * not at module import time
 */
function getClientPromise(): Promise<MongoClient> {
  if (clientPromise) {
    return clientPromise;
  }

  // Check for MONGODB_URI only when actually connecting
  if (!process.env.MONGODB_URI) {
    throw new Error('Invalid/Missing environment variable: "MONGODB_URI"');
  }

  const uri = process.env.MONGODB_URI;
  const options = {};

  if (process.env.NODE_ENV === "development") {
    // In development mode, use a global variable so that the value
    // is preserved across module reloads caused by HMR (Hot Module Replacement).
    const globalWithMongo = global as GlobalWithMongo;

    if (!globalWithMongo._mongoClientPromise) {
      const client = new MongoClient(uri, options);
      globalWithMongo._mongoClientPromise = client.connect();
    }
    clientPromise = globalWithMongo._mongoClientPromise;
  } else {
    // In production mode, it's best to not use a global variable.
    const client = new MongoClient(uri, options);
    clientPromise = client.connect();
  }

  return clientPromise;
}

// Export the client promise getter as default
// This is lazy-loaded, so it won't throw errors at import time
export default getClientPromise;

/**
 * Get the MongoDB database instance
 * @param dbName - Optional database name
 * @default process.env.MONGODB_DATABASE
 * @returns Promise<Db>
 */
export async function getDatabase(dbName?: string): Promise<Db> {
  const client = await getClientPromise();
  return client.db(dbName || process.env.MONGODB_DB_NAME);
}

/**
 * Get a specific collection from the database
 * @param collectionName - Name of the collection
 * @param dbName - Optional database name
 * @returns Promise with collection instance
 */
export async function getCollection<
  T extends Record<string, unknown> = Record<string, unknown>
>(collectionName: string, dbName?: string) {
  const db = await getDatabase(dbName);
  return db.collection<T>(collectionName);
}

/**
 * Check if MongoDB connection is healthy
 * @returns Promise<boolean>
 */
export async function checkConnection(): Promise<boolean> {
  try {
    const client = await getClientPromise();
    await client.db("admin").command({ ping: 1 });
    return true;
  } catch (error) {
    console.error("MongoDB connection error:", error);
    return false;
  }
}
