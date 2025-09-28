/* eslint-disable */
// db.ts - Your MongoDB client setup with TypeScript
import { MongoClient, ServerApiVersion, Db } from "mongodb";
import dotenv from "dotenv";
dotenv.config();

const uri = process.env.MONGODB_URI as string;

// Connection pooling variables
let client: MongoClient | null = null;
let clientPromise: Promise<MongoClient> | null = null;

/**
 * Connect to the MongoDB database
 * @returns Promise that resolves to the MongoDB client
 */
export function connectToDatabase(): Promise<MongoClient> {
  // If we already have a connection, use it
  if (client && clientPromise) {
    return clientPromise;
  }

  // Create a new MongoDB client
  client = new MongoClient(uri, {
    serverApi: {
      version: ServerApiVersion.v1,
    },
  });

  // Connect to the database
  clientPromise = client.connect();

  // Handle connection errors
  clientPromise.catch(err => {
    console.error("MongoDB connection error:", err);
    client = null;
    clientPromise = null;
  });

  // Return the promise
  return clientPromise;
}

/**
 * Get a database instance
 * @param dbName Name of the database
 * @returns Promise that resolves to the Db instance
 */
export async function getDatabase(dbName: string): Promise<{ db: Db, mongoClient: MongoClient }> {
  const mongoClient = await connectToDatabase();
  const db = mongoClient.db(dbName)
  return { db , mongoClient };
}