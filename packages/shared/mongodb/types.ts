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
// MODULE ACCESS TYPES
// ============================================================================

/**
 * Enum for all available modules in the application
 */
export enum Modules {
  LEAD_GENERATION = "LEAD_GENERATION",
  VOICE_AGENT = "VOICE_AGENT",
  MESSAGING = "MESSAGING",
  EMAIL = "EMAIL",
}

/**
 * Enum for Lead Generation submodules
 */
export enum LEAD_GENERATION_SUB_MODULES {
  GOOGLE_MAPS = "GOOGLE_MAPS",
  GOOGLE_ADVANCED_SEARCH = "GOOGLE_ADVANCED_SEARCH",
  INSTAGRAM_SEARCH = "INSTAGRAM_SEARCH",
  INSTAGRAM_ADVANCED_SEARCH = "INSTAGRAM_ADVANCED_SEARCH",
  FACEBOOK = "FACEBOOK",
  LINKEDIN = "LINKEDIN",
}

/**
 * Enum for Voice Agent submodules
 */
export enum VOICE_AGENT_SUB_MODULES {
  WEB_DIALER = "WEB_DIALER",
  INQUIRY_BOOKINGS = "INQUIRY_BOOKINGS",
  CUSTOM_AGENT_ANALYTICS = "CUSTOM_AGENT_ANALYTICS",
}

/**
 * Enum for Messaging submodules
 */
export enum MESSAGING_SUB_MODULES {
  WHATSAPP = "WHATSAPP",
  SMS = "SMS",
}

/**
 * Enum for Email submodules
 */
export enum EMAIL_SUB_MODULES {
  COLD_OUTREACH = "COLD_OUTREACH",
  WARM_OUTREACH = "WARM_OUTREACH",
  TEMPLATES = "TEMPLATES",
  AI_REPLIES = "AI_REPLIES",
}

/**
 * Union type of all submodule enums
 */
export type SubModule =
  | LEAD_GENERATION_SUB_MODULES
  | VOICE_AGENT_SUB_MODULES
  | MESSAGING_SUB_MODULES
  | EMAIL_SUB_MODULES;

/**
 * Module access configuration for a user
 * Maps module to its enabled submodules
 */
export type ModuleAccess = {
  [Modules.LEAD_GENERATION]?: LEAD_GENERATION_SUB_MODULES[];
  [Modules.VOICE_AGENT]?: VOICE_AGENT_SUB_MODULES[];
  [Modules.MESSAGING]?: MESSAGING_SUB_MODULES[];
  [Modules.EMAIL]?: EMAIL_SUB_MODULES[];
};

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
  label: string;
  redirect_url?: string;
  app_logo_url?: string;
  app_theme_color?: string;
  app_description?: string;
};

/**
 * Tenant data as used in the frontend/API (serialized from MongoDB).
 * _id and references are strings after JSON serialization.
 */
export type Tenant = {
  _id: string;
  name: string;
  label: string;
  redirect_url?: string;
  app_logo_url?: string;
  app_theme_color?: string;
  app_description?: string;
};

// ============================================================================
// USER TYPES
// ============================================================================

/**
 * User document structure as stored in MongoDB.
 * Used when inserting/querying MongoDB directly.
 * - tenantId is ObjectId in the database
 * - password is stored (plain text for now, should be hashed in production)
 * - moduleAccess defines which modules and submodules the user can access
 */
export type UserDoc = {
  _id: ObjectId;
  email: string;
  name?: string;
  isAdmin: boolean;
  tenantId: ObjectId;
  password: string;
  moduleAccess?: ModuleAccess;
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
  moduleAccess?: ModuleAccess;
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
