/**
 * Single source for all db-related types and enums.
 * No "mongodb" or Node built-ins here so this file is safe for the client bundle.
 */
import { type GMAPS_INTERNAL_RESPONSE } from "../api/gmaps/internal/types";
import { type GMAPS_SCRAPE_LEAD_INFO } from "../api/gmaps/scrape/types";
import { ObjectId } from "mongodb";
import {INSTAGRAM_RESPONSE} from "../api/instagram";

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
}

export enum Modules {
  LEAD_GENERATION = "LEAD_GENERATION",
  VOICE_AGENT = "VOICE_AGENT",
  MESSAGING = "MESSAGING",
  EMAIL = "EMAIL",
  LEAD_ENRICHMENT = "LEAD_ENRICHMENT",
}

export enum LEAD_GENERATION_SUB_MODULES {
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
  | GMAPS_SCRAPE_LEAD_INFO
  | INSTAGRAM_RESPONSE
  | GMAPS_INTERNAL_RESPONSE;

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
  email: string;
  name?: string;
  isAdmin: boolean;
  tenantId: Id;
  password: string;
  moduleAccess?: ModuleAccess;
};

export type User = UserDoc<string>;

export enum LeadSource {
  GOOGLE_MAPS = "GOOGLE_MAPS",
  INSTAGRAM = "INSTAGRAM",
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
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
};

export type UserLead = UserLeadDoc<string>;
