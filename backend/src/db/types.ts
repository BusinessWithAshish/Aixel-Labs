/**
 * Single source for all db-related types and enums.
 * No "mongodb" or Node built-ins here so this file is safe for the client bundle.
 */
import { type GMAPS_INTERNAL_RESPONSE } from "../api/gmaps/internal/types";

import { INSTAGRAM_RESPONSE } from "../api/instagram";
import { ObjectId } from "mongodb";
import {
  LINKEDIN_BY_COMPANY_RESPONSE,
  LINKEDIN_BY_PEOPLE_RESPONSE,
} from "../api/linkedin/types";

export enum TenantType {
  IFRAME = "IFRAME",
  PRODUCT = "PRODUCT",
  EXTERNAL = "EXTERNAL",
}

export enum MongoCollections {
  TENANTS = "tenants",
  USERS = "users",
  LEADS = "leads",
  USER_LEADS = "user_leads",
  LEAD_LISTS = "lead_lists",
}

export enum Modules {
  LEAD_GENERATION = "LEAD_GENERATION",
  VOICE_AGENT = "VOICE_AGENT",
  MESSAGING = "MESSAGING",
  EMAIL = "EMAIL",
  LEAD_ENRICHMENT = "LEAD_ENRICHMENT",
}

export enum LEAD_GENERATION_SUB_MODULES {
  LEADS = "LEADS",
  GOOGLE_MAPS = "GOOGLE_MAPS",
  GOOGLE_ADVANCED_SEARCH = "GOOGLE_ADVANCED_SEARCH",
  INSTAGRAM_SEARCH = "INSTAGRAM_SEARCH",
  INSTAGRAM_ADVANCED_SEARCH = "INSTAGRAM_ADVANCED_SEARCH",
  FACEBOOK = "FACEBOOK",
  LINKEDIN = "LINKEDIN",
}

export enum VOICE_AGENT_SUB_MODULES {
  WEB_DIALER = "WEB_DIALER",
  INQUIRY_BOOKINGS = "INQUIRY_BOOKINGS",
  CUSTOM_AGENT_ANALYTICS = "CUSTOM_AGENT_ANALYTICS",
}

export enum MESSAGING_SUB_MODULES {
  WHATSAPP = "WHATSAPP",
  SMS = "SMS",
}

export enum EMAIL_SUB_MODULES {
  COLD_OUTREACH = "COLD_OUTREACH",
  WARM_OUTREACH = "WARM_OUTREACH",
  TEMPLATES = "TEMPLATES",
  AI_REPLIES = "AI_REPLIES",
}

export enum LEAD_ENRICHMENT_SUB_MODULES {
  EMAIL_VERIFICATION = "EMAIL_VERIFICATION",
  PHONE_VERIFICATION = "PHONE_VERIFICATION",
}

export type SubModule =
  | LEAD_GENERATION_SUB_MODULES
  | VOICE_AGENT_SUB_MODULES
  | MESSAGING_SUB_MODULES
  | EMAIL_SUB_MODULES
  | LEAD_ENRICHMENT_SUB_MODULES;

export type ModuleAccess = {
  [Modules.LEAD_GENERATION]?: LEAD_GENERATION_SUB_MODULES[];
  [Modules.VOICE_AGENT]?: VOICE_AGENT_SUB_MODULES[];
  [Modules.MESSAGING]?: MESSAGING_SUB_MODULES[];
  [Modules.EMAIL]?: EMAIL_SUB_MODULES[];
  [Modules.LEAD_ENRICHMENT]?: LEAD_ENRICHMENT_SUB_MODULES[];
};

export type LeadData =
  | INSTAGRAM_RESPONSE
  | GMAPS_INTERNAL_RESPONSE
  | LINKEDIN_BY_COMPANY_RESPONSE
  | LINKEDIN_BY_PEOPLE_RESPONSE;

export type TenantDoc<Id = ObjectId> = {
  _id?: Id;
  name: string;
  label: string;
  type?: TenantType;
  redirect_url?: string;
  app_logo_url?: string;
  app_theme_color?: string;
  app_description?: string;
};

export type Tenant = TenantDoc<string>;

export type UserDoc<Id = ObjectId> = {
  _id?: Id;
  firebaseUid: string;
  email: string;
  phoneNumber: string;
  name?: string;
  isAdmin: boolean;
  tenantId: Id;
  moduleAccess?: ModuleAccess;
  credits?: number;
};

export type User = UserDoc<string>;

export enum LeadSource {
  GOOGLE_MAPS = "GOOGLE_MAPS",
  INSTAGRAM = "INSTAGRAM",
  LINKEDIN = "LINKEDIN",
  FACEBOOK = "FACEBOOK",
}

export type LeadDoc<Id = ObjectId> = {
  _id?: Id;
  source: LeadSource;
  sourceId: string;
  data: LeadData;
};

export type Lead = LeadDoc<string>;

export type UserLeadDoc<Id = ObjectId> = {
  _id?: Id;
  userId: Id;
  leadId: Id;
  listId: Id;
  tags?: string[];
  lastVerifiedAt?: Date;
  score?: number;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
};

export type UserLead = UserLeadDoc<string>;

export type UserLeadListDoc<Id = ObjectId> = {
  _id?: Id;
  userId: Id;
  name: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
};

/** List row for UI/API: `leadCount` is derived from `user_leads`, not stored on the list document. */
export type UserLeadList = UserLeadListDoc<string> & { leadCount: number };
