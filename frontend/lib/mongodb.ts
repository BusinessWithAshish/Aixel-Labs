import { MongoClient, Db } from 'mongodb';

if (!process.env.MONGODB_URI) {
  throw new Error('Invalid/Missing environment variable: "MONGODB_URI"');
}

const uri = process.env.MONGODB_URI;
const options = {};

let client: MongoClient;
let clientPromise: Promise<MongoClient>;

// Define a global type for MongoDB client caching
type GlobalWithMongo = typeof globalThis & {
  _mongoClientPromise?: Promise<MongoClient>;
};

if (process.env.NODE_ENV === 'development') {
  // In development mode, use a global variable so that the value
  // is preserved across module reloads caused by HMR (Hot Module Replacement).
  const globalWithMongo = global as GlobalWithMongo;

  if (!globalWithMongo._mongoClientPromise) {
    client = new MongoClient(uri, options);
    globalWithMongo._mongoClientPromise = client.connect();
  }
  clientPromise = globalWithMongo._mongoClientPromise;
} else {
  // In production mode, it's best to not use a global variable.
  client = new MongoClient(uri, options);
  clientPromise = client.connect();
}

// Export a module-scoped MongoClient promise. By doing this in a
// separate module, the client can be shared across functions.
export default clientPromise;

/**
 * Get the MongoDB database instance
 * @param dbName - Optional database name, defaults to the one in the connection string
 * @returns Promise<Db>
 */
export async function getDatabase(dbName?: string): Promise<Db> {
  const client = await clientPromise;
  return client.db(dbName);
}

/**
 * Get a specific collection from the database
 * @param collectionName - Name of the collection
 * @param dbName - Optional database name
 * @returns Promise with collection instance
 */
export async function getCollection<T = any>(
  collectionName: string,
  dbName?: string
) {
  const db = await getDatabase(dbName);
  return db.collection<T>(collectionName);
}

/**
 * Check if MongoDB connection is healthy
 * @returns Promise<boolean>
 */
export async function checkConnection(): Promise<boolean> {
  try {
    const client = await clientPromise;
    await client.db('admin').command({ ping: 1 });
    return true;
  } catch (error) {
    console.error('MongoDB connection error:', error);
    return false;
  }
}
