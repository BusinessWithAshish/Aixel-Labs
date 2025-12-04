import type { ObjectId } from "mongodb";

// ============================================================================
// TENANT TYPES
// ============================================================================

/**
 * Tenant document structure as stored in MongoDB.
 * Used when inserting/querying MongoDB directly.
 */
export type TenantDoc = {
  _id: ObjectId;
  name: string;
  redirect_url?: string;
};

/**
 * Tenant data as used in the frontend/API (serialized from MongoDB).
 * _id and references are strings after JSON serialization.
 */
export type Tenant = {
  _id: string;
  name: string;
  redirect_url?: string;
};

// ============================================================================
// USER TYPES
// ============================================================================

/**
 * User document structure as stored in MongoDB.
 * Used when inserting/querying MongoDB directly.
 * - tenantId is ObjectId in the database
 * - password is stored (plain text for now, should be hashed in production)
 */
export type UserDoc = {
  _id: ObjectId;
  email: string;
  name?: string;
  isAdmin: boolean;
  tenantId: ObjectId;
  password: string;
};

/**
 * User data as used in the frontend/API (serialized from MongoDB).
 * _id and tenantId are strings after JSON serialization.
 * Password is never exposed to the frontend.
 */
export type User = {
  _id: string;
  email: string;
  name?: string;
  isAdmin: boolean;
  tenantId: string; // Tenant name as string for frontend
};
