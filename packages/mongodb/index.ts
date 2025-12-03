import { MongoClient, Db } from "mongodb";

export type { ObjectId, Document, Collection, Db, MongoClient } from "mongodb";
export { ObjectId as MongoObjectId } from "mongodb";

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
