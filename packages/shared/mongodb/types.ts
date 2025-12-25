import type { ObjectId } from "mongodb";
import type { GMAPS_SCRAPE_LEAD_INFO } from "../common/index.js";
import type { INSTAGRAM_SEARCH_SCRAPE_LEAD_INFO } from "../common/index.js";

export enum MongoCollections {
  TENANTS = "tenants",
  USERS = "users",
  LEADS = "leads",
  USER_LEADS = "user_leads",
}

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
  tenantId: string;
};

export enum LeadSource {
  GOOGLE_MAPS = "GOOGLE_MAPS",
  INSTAGRAM = "INSTAGRAM",
}

export type LeadDoc = {
  _id: ObjectId;
  source: LeadSource;
  sourceId: string;
  data: GMAPS_SCRAPE_LEAD_INFO | INSTAGRAM_SEARCH_SCRAPE_LEAD_INFO;
};

export type Lead = {
  _id: string;
  source: LeadSource;
  sourceId: string;
  data: GMAPS_SCRAPE_LEAD_INFO | INSTAGRAM_SEARCH_SCRAPE_LEAD_INFO;
};

export type UserLeadDoc = {
  _id: ObjectId;
  userId: ObjectId;
  leadId: ObjectId;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
};

export type UserLead = {
  _id: string;
  userId: string;
  leadId: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
};
