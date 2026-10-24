/**
 * Single source for all db-related types and enums.
 * No "mongodb" or Node built-ins here so this file is safe for the client bundle.
 */
import { type GMAPS_INTERNAL_RESPONSE } from "../api/gmaps/internal/types";
import type { GMAPS_DETAILS_RESPONSE } from "../api/gmaps/details";
import type { GSEARCH_RESPONSE } from "../api/gsearch";
import type { INSTAGRAM_RESPONSE } from "../api/instagram";
import type { FACEBOOK_RESPONSE } from "../api/facebook";
import { ObjectId } from "mongodb";
import {
  LINKEDIN_BY_COMPANY_RESPONSE,
  LINKEDIN_BY_PEOPLE_RESPONSE,
} from "../api/linkedin/types";
import type { CRAWL_RESPONSE } from "../api/crawl";
import voiceCallRates from "./voice-call-rates.json";

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
  COUPONS = "coupons",
  COUPON_REDEMPTIONS = "coupon_redemptions",
  /** One per owner: their Gemini key, connected booking apps and phone numbers. */
  VOICE_ACCOUNTS = "voice_accounts",
  VOICE_AGENTS = "voice_agents",
  /** One per call, with what the agent remembers about the caller after it (`memory`). */
  VOICE_CALLS = "voice_calls",
  VOICE_BOOKINGS = "voice_bookings",
  VOICE_CAMPAIGNS = "voice_campaigns",
  VOICE_CAMPAIGN_CONTACTS = "voice_campaign_contacts",
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
  GOOGLE_MAPS_ADVANCED = "GOOGLE_MAPS_ADVANCED",
  GOOGLE_ADVANCED_SEARCH = "GOOGLE_ADVANCED_SEARCH",
  INSTAGRAM_SEARCH = "INSTAGRAM_SEARCH",
  FACEBOOK = "FACEBOOK",
  LINKEDIN = "LINKEDIN",
  CRAWL = "CRAWL",
}

export enum VOICE_AGENT_SUB_MODULES {
  AGENTS = "AGENTS",
  PHONE_NUMBERS = "PHONE_NUMBERS",
  CALL_LOGS = "CALL_LOGS",
  WEB_DIALER = "WEB_DIALER",
  INQUIRY_BOOKINGS = "INQUIRY_BOOKINGS",
  CAMPAIGNS = "CAMPAIGNS",
  CUSTOM_AGENT_ANALYTICS = "CUSTOM_AGENT_ANALYTICS",
  SETTINGS = "SETTINGS",
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
  | FACEBOOK_RESPONSE
  | GMAPS_INTERNAL_RESPONSE
  | GMAPS_DETAILS_RESPONSE
  | GSEARCH_RESPONSE
  | LINKEDIN_BY_COMPANY_RESPONSE
  | LINKEDIN_BY_PEOPLE_RESPONSE
  | CRAWL_RESPONSE;

export type TenantDoc<Id = ObjectId> = {
  _id?: Id;
  name: string;
  label: string;
  type?: TenantType;
  redirect_url?: string;
  app_logo_url?: string;
  app_theme_color?: string;
  app_description?: string;
  defaultModuleAccess?: ModuleAccess;
  /** Credits a new member starts with (never below the daily free allowance). */
  defaultCredits?: number;
};

export type Tenant = TenantDoc<string>;

export type UserDoc<Id = ObjectId> = {
  _id?: Id;
  firebaseUid: string;
  email: string;
  deviceFingerprint: string;
  name?: string;
  /** Profile photo: a small `data:image/jpeg;base64,…` URL (FE `helpers/user-avatar.ts` validates it). */
  avatar?: string;
  isAdmin: boolean;
  tenantId: Id;
  tenantName: string;
  moduleAccess?: ModuleAccess;
  credits?: number;
  /** When the balance was last topped back up to the daily free allowance. */
  creditsRefilledAt?: Date;
};

export type User = UserDoc<string>;

export enum LeadSource {
  GOOGLE_MAPS = "GOOGLE_MAPS",
  GOOGLE_MAPS_ADVANCED = "GOOGLE_MAPS_ADVANCED",
  GOOGLE_ADVANCED_SEARCH = "GOOGLE_ADVANCED_SEARCH",
  INSTAGRAM = "INSTAGRAM",
  LINKEDIN = "LINKEDIN",
  FACEBOOK = "FACEBOOK",
  CRAWL = "CRAWL",
}

export type LeadDoc<Id = ObjectId> = {
  _id?: Id;
  source: LeadSource;
  sourceId: string;
  data: LeadData;
  enriched?: CRAWL_RESPONSE;
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

export type UserLeadList = UserLeadListDoc<string> & {
  leadCount: number;
  sources: LeadSource[];
};

/** Tenant-scoped coupon that grants bonus credits on redeem. */
export type CouponDoc<Id = ObjectId> = {
  _id?: Id;
  tenantId: Id;
  /** Normalized uppercase code, unique per tenant. */
  code: string;
  creditAmount: number;
  /** Total redemption cap; `null` = unlimited. */
  maxRedemptions: number | null;
  redemptionCount: number;
  expiresAt?: Date | null;
  isActive: boolean;
  createdByUserId: Id;
  createdAt: Date;
  updatedAt: Date;
};

export type Coupon = Omit<CouponDoc<string>, "expiresAt" | "createdAt" | "updatedAt"> & {
  expiresAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CouponRedemptionDoc<Id = ObjectId> = {
  _id?: Id;
  tenantId: Id;
  couponId: Id;
  userId: Id;
  code: string;
  creditAmount: number;
  createdAt: Date;
};

export type CouponRedemption = Omit<CouponRedemptionDoc<string>, "createdAt"> & {
  createdAt: string;
};

// ---------------------------------------------------------------------------
// Voice agents. The Python voice engine (~/voice-latency-trial, phone.py) reads
// voice_agents / voice_accounts and writes voice_calls with these same shapes.
// ---------------------------------------------------------------------------

/** Gemini Live's prebuilt voices: key -> the character Google gives it. */
export const VOICE_AGENT_VOICES = {
  achernar: "Soft", achird: "Friendly", algenib: "Gravelly", algieba: "Smooth",
  alnilam: "Firm", aoede: "Breezy", autonoe: "Bright", callirrhoe: "Easy-going",
  charon: "Informative", despina: "Smooth", enceladus: "Breathy", erinome: "Clear",
  fenrir: "Excitable", gacrux: "Mature", iapetus: "Clear", kore: "Firm",
  laomedeia: "Upbeat", leda: "Youthful", orus: "Firm", puck: "Upbeat",
  pulcherrima: "Forward", rasalgethi: "Informative", sadachbia: "Lively",
  sadaltager: "Knowledgeable", schedar: "Even", sulafat: "Warm", umbriel: "Easy-going",
  vindemiatrix: "Gentle", zephyr: "Bright", zubenelgenubi: "Casual",
} as const;

export type VoiceAgentVoice = keyof typeof VOICE_AGENT_VOICES;

/** What an agent is for: answering a number's incoming calls, or placing calls. */
export enum VoiceAgentCallType {
  INBOUND = "INBOUND",
  OUTBOUND = "OUTBOUND",
}

/** Limits on an agent's own fields, enforced by the app. */
export const VOICE_AGENT_LIMITS = {
  nameMax: 80,
  promptMax: 50_000,
} as const;

export type VoiceAgentDoc<Id = ObjectId> = {
  _id?: Id;
  tenantId: Id;
  /** Owner. Agents, numbers and calls are visible to their owner only. */
  userId: Id;
  name: string;
  callType: VoiceAgentCallType;
  voice: VoiceAgentVoice;
  /** The whole system prompt the model runs on, the business's facts included (per-call facts come from `{{variables}}`). */
  prompt: string;
  /** Actions the agent can take during a call. Absent = none (ending the call is always available). */
  tools?: VoiceAgentTools;
  /**
   * Default values for the `{{variables}}` in the prompt. A call's own variables
   * (a campaign contact's CSV columns, a test call's) win; built-ins (VOICE_BUILTIN_VARIABLES) win
   * over both. A variable with no value anywhere is left empty.
   */
  variables?: Record<string, string>;
  /** Outbound agents: what a call that reaches voicemail does. Absent = hang up. */
  voicemail?: VoiceAgentVoicemail | null;
  /** What is worked out from the transcript after each call. Absent = the summary only. */
  analysis?: VoiceAgentAnalysis | null;
  /** Remember each caller (by phone number) from one of this agent's calls to the next. Absent = off. */
  memory?: boolean;
  /** How she takes turns, fills waits and sounds during a call. Absent = today's defaults (agent decides, NORMAL, both off). */
  speech?: VoiceAgentSpeech | null;
  /** What its calls hear, think and speak with (models, keys, prices). Absent / null = VOICE_DEFAULT_STACK; see `voiceStackFor`. */
  stack?: VoiceStack<Id> | null;
  /** The voice it speaks in on a PIPELINE stack. A REALTIME stack speaks in `voice` (Gemini Live's own voices). Absent = none picked yet. */
  ttsVoice?: VoiceTtsVoice | null;
  createdAt: Date;
  updatedAt: Date;
};

/** Days of the week as stored, Monday first (booking hours, campaign calling days). */
export const VOICE_WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

export type VoiceWeekday = (typeof VOICE_WEEKDAYS)[number];

/** A clock time, "HH:MM" (24 h). */
export const VOICE_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/** "Mon".."Sun" -> opening hours that day; a missing day is closed. Times are "HH:MM" (24 h) in the booking timezone. */
export type VoiceBookingHours = Partial<Record<VoiceWeekday, { open: string; close: string }>>;

export const VOICE_BOOKING_LIMITS = {
  slotMinutesMin: 15,
  slotMinutesMax: 240,
  /** Appointment lengths are whole multiples of this. */
  slotMinutesStep: 5,
  maxDaysAheadMin: 1,
  maxDaysAheadMax: 90,
} as const;

/**
 * Built-in appointment booking. The engine gives the model two functions,
 * check_availability(date) and book_appointment(date, time, name, phone?, notes?),
 * which read and write voice_bookings for this agent.
 */
export type VoiceAgentBookingTool = {
  enabled: boolean;
  /** IANA zone the hours and every spoken time are in, e.g. "Asia/Kolkata". */
  timezone: string;
  /** Length of one appointment, and the step between offered start times. 15..240. */
  slotMinutes: number;
  hours: VoiceBookingHours;
  /** How far ahead a caller can book. 1..90. */
  maxDaysAhead: number;
  /** book_appointment, beside check_availability. Absent = on; off = she tells callers free times but books nothing. */
  bookAppointment?: boolean;
  /**
   * Where bookings go. Absent / null = the built-in calendar (voice_bookings only). Otherwise the
   * owner's own booking app through Composio: the engine checks its free/busy (on top of the hours,
   * slot length and timezone above), creates the event there, and mirrors it into voice_bookings.
   */
  destination?: VoiceBookingDestination | null;
};

// ---------------------------------------------------------------------------
// Customers' own booking apps, connected through Composio's managed auth (no Aixel Labs
// OAuth app). Composio user_id = our user's _id as a string; one Composio auth config per
// toolkit (Composio-managed), created on first use. The app keeps one entry per connection
// attempt in the owner's VoiceAccountDoc.calendars (owner check for the callback); attempts that
// never connected are dropped once one connects.
// ---------------------------------------------------------------------------

/** A booking app an agent can book into. */
export enum VoiceCalendarProvider {
  GOOGLE_CALENDAR = "GOOGLE_CALENDAR",
  OUTLOOK = "OUTLOOK",
  CAL_COM = "CAL_COM",
  CALENDLY = "CALENDLY",
}

/** An agent's external booking target. */
export type VoiceBookingDestination = {
  provider: VoiceCalendarProvider;
  /** Composio connected account ("ca_..."), owned by the agent's user. */
  connectedAccountId: string;
  /** Google / Outlook calendar id ("primary" = the main one), Cal.com event type id, Calendly event type URI. */
  calendarId: string;
  /** What the owner picked, for showing it again ("Work", "30 min call"). */
  calendarName: string;
};

export enum VoiceCalendarConnectionStatus {
  /** The owner was sent to Composio's Connect Link and has not come back yet. */
  PENDING = "PENDING",
  ACTIVE = "ACTIVE",
  FAILED = "FAILED",
}

/** One of the owner's connected booking apps (any of their agents can book into it), in VoiceAccountDoc.calendars. */
export type VoiceCalendarConnectionDoc<Id = ObjectId> = {
  _id: Id;
  provider: VoiceCalendarProvider;
  /** Composio connected account id, unique across owners. */
  connectedAccountId: string;
  /** The Composio auth config (Composio-managed) it was made with. */
  authConfigId: string;
  /**
   * The Composio session (`trs_...`, direct tools preset) its tools run in: while PENDING the one
   * the Connect Link came from, once ACTIVE one pinned to this account. Shared by the app and the
   * engine; missing = made on first use. Server-side only.
   */
  composioSessionId?: string | null;
  status: VoiceCalendarConnectionStatus;
  /** Who it is connected as, when Composio says ("ravi@example.com"). */
  label?: string | null;
  statusReason?: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type VoiceCalendarConnection = Omit<VoiceCalendarConnectionDoc<string>, "createdAt" | "updatedAt" | "composioSessionId"> & {
  tenantId: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
};

/** A booking mirrored from an owner's booking app (the engine created it there first). */
export type VoiceBookingExternal = {
  provider: VoiceCalendarProvider;
  /** Google / Outlook event id, Cal.com booking uid, Calendly scheduled event uuid. */
  eventId: string;
  connectedAccountId: string;
  calendarId: string;
  /** Meet / Teams / Cal Video link when the app made one. */
  meetingUrl?: string | null;
};

export const VOICE_WEBHOOK_PARAM_TYPES = ["string", "number", "boolean"] as const;

export type VoiceWebhookParamType = (typeof VOICE_WEBHOOK_PARAM_TYPES)[number];

/** A custom tool's name, as the model sees it. */
export const VOICE_TOOL_NAME_PATTERN = /^[a-z][a-z0-9_]{1,39}$/;

/** A custom tool parameter's name. */
export const VOICE_TOOL_PARAM_NAME_PATTERN = /^[a-z][a-z0-9_]{0,39}$/;

/** Names the engine already uses for its own functions. */
export const VOICE_RESERVED_TOOL_NAMES = ["check_availability", "book_appointment", "end_call"] as const;

export const VOICE_WEBHOOK_LIMITS = {
  maxTools: 10,
  maxParams: 10,
  descriptionMax: 1000,
  paramDescriptionMax: 300,
  urlMax: 2048,
  secretMax: 256,
  /** The engine (and the test request) waits this long for an answer. */
  timeoutMs: 8000,
} as const;

export type VoiceWebhookParam = {
  /** ^[a-z][a-z0-9_]{0,39}$ */
  name: string;
  type: VoiceWebhookParamType;
  description: string;
  required: boolean;
};

/**
 * A custom tool: the model calls it by name and the engine POSTs
 * { tool, arguments, call: { id, agentId, channel, direction, from, to } } as JSON to `url`
 * (header X-Aixel-Signature: sha256=<hex HMAC-SHA256 of the raw body with the owner's secret>, when one is set).
 * Whatever the server answers (JSON or text, first 4000 chars) is handed back to the model. 8 s timeout.
 */
export type VoiceAgentWebhookTool = {
  /** Stable id within the agent (random hex), for editing. */
  id: string;
  /** Function name the model sees: ^[a-z][a-z0-9_]{1,39}$, unique per agent, not a built-in name. */
  name: string;
  /** When the model should use it; the model reads this. */
  description: string;
  parameters: VoiceWebhookParam[];
  /** https:// only (http://127.0.0.1 / localhost allowed outside production, for tests). */
  url: string;
  /** Signing secret, sealed like number API keys. Never sent to the client. */
  secretSealed?: string | null;
  enabled: boolean;
};

export type VoiceAgentTools = {
  booking?: VoiceAgentBookingTool | null;
  webhooks?: VoiceAgentWebhookTool[];
};

/** Client view of a webhook tool: the sealed secret becomes a flag. */
export type VoiceAgentWebhookToolView = Omit<VoiceAgentWebhookTool, "secretSealed"> & { hasSecret: boolean };

/** Client view of an agent's tools. */
export type VoiceAgentToolsView = { booking: VoiceAgentBookingTool | null; webhooks: VoiceAgentWebhookToolView[] };

export enum VoiceBookingStatus {
  BOOKED = "BOOKED",
  CANCELLED = "CANCELLED",
}

/** An appointment an agent booked (book_appointment), or one the owner cancelled. */
export type VoiceBookingDoc<Id = ObjectId> = {
  _id?: Id;
  tenantId: Id;
  userId: Id;
  agentId: Id;
  /** The voice_calls document of the call that booked it (the engine picks the call's _id when the call starts). */
  callId?: Id | null;
  channel: VoiceCallChannel;
  /** Start and end instants (UTC). Unique per agent while BOOKED. */
  start: Date;
  end: Date;
  /** The booking tool's timezone when it was made, for showing local time. */
  timezone: string;
  customerName: string;
  /** What the caller gave, else the caller's number on phone calls. */
  customerPhone?: string | null;
  notes?: string | null;
  status: VoiceBookingStatus;
  /** Set when the booking lives in the owner's own app; cancelling here cancels it there too. */
  external?: VoiceBookingExternal | null;
  createdAt: Date;
  updatedAt: Date;
};

export type VoiceBooking = Omit<VoiceBookingDoc<string>, "start" | "end" | "createdAt" | "updatedAt"> & {
  start: string;
  end: string;
  createdAt: string;
  updatedAt: string;
};

/** Client view: tools without secrets (always present, empty when the agent has none). */
export type VoiceAgent = Omit<VoiceAgentDoc<string>, "tools" | "createdAt" | "updatedAt"> & {
  tools: VoiceAgentToolsView;
  createdAt: string;
  updatedAt: string;
};

export enum VoiceProvider {
  TELNYX = "TELNYX",
  /** Indian numbers (voicelink.co.in). Its API only answers from Indian IPs: see VOICELINK_PROXY_URL. */
  VOICELINK = "VOICELINK",
  /** US and international numbers in the customer's own Twilio account (twilio.com). */
  TWILIO = "TWILIO",
}

/** A VoiceLink DID's routing rule, as VoiceLink stores it (one rule covers both directions). */
export type VoiceLinkRouting = {
  /** 1 mobile, 2 SIP trunk, 3 WebSocket bot (0/null: none). */
  forInboundCall: number | null;
  /** 2 SIP trunk, 3 WebSocket bot, 4 only answer (0/null: none). */
  forOutboundCall: number | null;
  inboundSipTrunkId: number | null;
  inboundWebsocketBotId: number | null;
  outboundSipTrunkId: number | null;
  outboundWebsocketBotId: number | null;
  status: number | null;
};

/** What we created or changed in a customer's VoiceLink account for one number. */
export type VoiceLinkNumberState = {
  /** Reseller accounts must name the client; direct client accounts leave it empty. */
  clientId?: number | null;
  /** The WebSocket bot we registered for this number (points at the engine). */
  botId?: number | null;
  /** The DID's routing rule id, once one exists. */
  routingId?: number | null;
  /** The rule as it was before we touched it; null = the DID had no rule. Restored on off / remove. */
  previousRouting?: VoiceLinkRouting | null;
};

/**
 * A Twilio number's voice routing, as Twilio keeps it on the IncomingPhoneNumber. Empty string = not set.
 * Twilio uses the first one set of: trunkSid, voiceApplicationSid, voiceUrl.
 */
export type TwilioVoiceRouting = {
  voiceUrl: string;
  /** "GET" or "POST". */
  voiceMethod: string;
  /** AP…: a TwiML app the number's calls go to. */
  voiceApplicationSid: string;
  /** TK…: an Elastic SIP Trunk the number is on. */
  trunkSid: string;
};

/**
 * How we reach a customer's Twilio account for one number, and what we changed there.
 * The secret itself (an API key secret, or the Auth Token) is `apiKeySealed`.
 * We never change the number's status callback or fallback URL.
 */
export type TwilioNumberState = {
  /** AC…: the account the number is in (every REST path names it). */
  accountSid: string;
  /** SK…: the API key the sealed secret belongs to. null = the sealed secret is the account's Auth Token. */
  apiKeySid: string | null;
  /**
   * The number's voice routing before AI answering first pointed it at the engine. Absent = we never
   * changed it. Saved on the first change only; put back exactly, then dropped, when AI answering
   * goes off or the number is removed.
   */
  previousRouting?: TwilioVoiceRouting;
};

/** A number the customer brought, in their own provider account. Kept in its owner's VoiceAccountDoc.numbers. */
export type VoiceNumberDoc<Id = ObjectId> = {
  /** Calls, campaigns and campaign contacts point at it (`numberId`). */
  _id: Id;
  provider: VoiceProvider;
  /** E.164, e.g. "+13473703925". Unique across owners: a number is connected to one account. */
  phoneNumber: string;
  /** The provider's id for the number (Telnyx phone_number id, VoiceLink DID id, Twilio IncomingPhoneNumber SID "PN…"). */
  providerNumberId: string;
  /**
   * The customer's API key (Telnyx), API token (VoiceLink), or API key secret / Auth Token (Twilio, see
   * `twilio.apiKeySid`), sealed (AES-256-GCM, see frontend/server/voice-agent/engine.ts). Never sent to the client.
   */
  apiKeySealed: string;
  /** Telnyx TeXML application we created in their account for calls coming in. */
  texmlAppId?: string;
  /** Telnyx Call Control application we created in their account for calls we place. */
  callControlAppId?: string;
  /**
   * A number does one job: it answers calls (`inboundAgentId`), places calls (`outboundAgentId`), or
   * nothing yet (both null). The app sets at most one (setNumberAgent); numbers saved before that
   * rule may still carry both until the owner picks one.
   *
   * Agent that answers calls coming in to this number. null = the AI does not answer: calls ring on
   * the customer's own routing.
   */
  inboundAgentId?: Id | null;
  /** Agent that places calls from this number unless a call names another one (a campaign, a test call). */
  outboundAgentId?: Id | null;
  /** The Telnyx connection the number was on before AI answering; restored when it is turned off or removed. */
  previousConnectionId?: string | null;
  /**
   * Telnyx: the SIP subdomain set on the number's TeXML app, so the owner's softphone reaches its inbound agent at
   * `sip:<anything>@<sipSubdomain>.sip.telnyx.com` (receive settings "only_my_connections": nobody else can).
   */
  sipSubdomain?: string | null;
  /** VoiceLink numbers only. */
  voicelink?: VoiceLinkNumberState;
  /** Twilio numbers only. */
  twilio?: TwilioNumberState;
  createdAt: Date;
  updatedAt: Date;
};

/** Client view: no sealed key. */
export type VoiceNumber = Omit<VoiceNumberDoc<string>, "apiKeySealed" | "createdAt" | "updatedAt"> & {
  tenantId: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
};

export enum VoiceCallChannel {
  PHONE = "PHONE",
  PLAYGROUND = "PLAYGROUND",
}

export enum VoiceCallDirection {
  INBOUND = "INBOUND",
  OUTBOUND = "OUTBOUND",
  PLAYGROUND = "PLAYGROUND",
}

/** How a call ended, as the engine writes `endedBy`. */
export enum VoiceCallEndReason {
  CALLER_HUNG_UP = "caller_hung_up",
  AGENT_HUNG_UP = "agent_hung_up",
  GOODBYE = "goodbye",
  DNC = "dnc",
  ABUSE = "abuse",
  VOICEMAIL = "voicemail",
  /** A message was left after the beep (`voicemailMessage`). */
  VOICEMAIL_MESSAGE = "voicemail_message",
  IVR = "ivr",
  NO_ANSWER = "no_answer",
  NOT_CONNECTED = "not_connected",
  RECORDING_OBJECTION = "recording_objection",
  WRONG_NUMBER = "wrong_number",
  BUSY = "busy",
  FAILED = "failed",
  /** The agent's time limit (`speech.maxCallMinutes`) was reached. */
  TIMEOUT = "timeout",
  ERROR = "error",
  /** Gemini refused the owner's key; the reason is in `flags` and on their VoiceAccountDoc. */
  GEMINI_KEY_ERROR = "gemini_key_error",
  /** The caller stayed silent after she checked in (`speech.silenceSecs`). */
  SILENCE = "silence",
}

export type VoiceCallTurn = {
  role: "agent" | "caller";
  text: string;
};

/** Written by the voice engine when a call ends, however it ended. */
export type VoiceCallDoc<Id = ObjectId> = {
  _id?: Id;
  tenantId: Id;
  userId: Id;
  agentId: Id;
  numberId?: Id | null;
  channel: VoiceCallChannel;
  direction: VoiceCallDirection;
  /** E.164 or SIP URI; absent on playground calls. */
  from?: string;
  to?: string;
  voice: string;
  startedAt: Date;
  endedAt: Date;
  durationSec: number;
  /** A {@link VoiceCallEndReason}, or a newer reason the engine writes as it is. */
  endedBy: string;
  flags: { flag: string; quote: string }[];
  turns: VoiceCallTurn[];
  /** Silence between the caller finishing and the agent's first sound, per turn. */
  gapsMs: number[];
  /** Telnyx call_control_id, VoiceLink call_sid, or Twilio CallSid: used to find the recording in the customer's account. */
  providerCallId?: string;
  /** Set when the provider hands a recording link over (VoiceLink's call.completed webhook). */
  recordingUrl?: string | null;
  /** Every tool the agent used, in order. */
  toolCalls?: VoiceCallToolCall[];
  /** Set on a call an outbound campaign placed (the engine's campaigns.py links it). */
  campaignId?: Id | null;
  campaignContactId?: Id | null;
  /** The campaign contact's variables (extra CSV columns), as the call got them (`ctx["variables"]` in the engine). */
  variables?: Record<string, string>;
  /** Written by the engine a few seconds after the call, when the agent's analysis ran (calls where the caller spoke). */
  analysis?: VoiceCallAnalysis | null;
  /** The message left after the beep (`endedBy: "voicemail_message"`), as she said it. */
  voicemailMessage?: string | null;
  /** What she remembered about the caller when the call started (caller memory on). */
  memoryUsed?: { brief: string; lastCallAt: Date } | null;
  /** The other party's number, E.164, on phone calls the engine answered or placed (what caller memory is kept under). */
  callerPhone?: string | null;
  /** What the agent remembers about the caller after this call (caller memory on). */
  memory?: VoiceCallMemory | null;
  /** What the call cost the owner, written by the engine when the call ends (absent on calls before 2026-10-21). */
  cost?: VoiceCallCost | null;
};

/**
 * A call's cost in US dollars. The engine writes it when the call ends (`backend/voice/costs.py`):
 * Gemini from the tokens Gemini reported, the post-call analysis from its tokens, the phone provider
 * from the minutes at its list rate (`providerExact: false`), replaced by the provider's own charge once it reports one.
 */
/** One part of a PIPELINE call's cost. `priced` false: the model has no rate in the rates file (usd 0). */
type VoiceCallStackPartCost = { provider: VoiceKeyProvider; model: string; usd: number; priced: boolean };

export type VoiceCallStackCost = {
  /** stt + llm + tts. */
  usd: number;
  /** Billed on the call's minutes (the stream is open the whole call). */
  stt: VoiceCallStackPartCost & { minutes: number };
  llm: VoiceCallStackPartCost & { tokensIn: number; tokensOut: number };
  /** Billed on characters (Cartesia, ElevenLabs) or minutes of audio made (Gemini, OpenAI). */
  tts: VoiceCallStackPartCost & { chars: number; audioMinutes: number };
};

export type VoiceCallCost = {
  /** geminiUsd + stack.usd + analysisUsd + providerUsd. */
  totalUsd: number;
  /** 0 when the owner's key is on Google's free tier (`geminiFreeTier`). */
  geminiUsd: number;
  geminiFreeTier: boolean;
  /** Tokens Gemini reported for the whole call (every turn bills the conversation so far). */
  geminiTokens: { textIn: number; audioIn: number; textOut: number; audioOut: number };
  /** The post-call analysis on the same key (0 on the free tier). Absent when it did not run, or on older calls. */
  analysisUsd?: number;
  analysisTokens?: { textIn: number; textOut: number };
  /** A PIPELINE call: each part at its model's list rate (voice-call-rates.json `pipeline`); geminiUsd is then 0. Absent on REALTIME calls. */
  stack?: VoiceCallStackCost;
  /** Absent on playground calls, which have no phone provider. */
  provider?: VoiceProvider;
  providerUsd: number;
  /** True: the provider's own charge for the call. False: minutes × its list rate, until that charge arrives. */
  providerExact: boolean;
};

/**
 * List prices behind `VoiceCallCost` and the cost estimate shown before any call, with sources and
 * dates. The engine reads the same file (`backend/voice/costs.py`): change a rate there, once.
 */
export const VOICE_CALL_RATES = voiceCallRates;

export type VoiceCallToolCall = {
  /** check_availability | book_appointment | end_call | a webhook tool's name */
  name: string;
  /** The arguments the model passed. */
  arguments: Record<string, unknown>;
  /** What the model was told back, shortened to 1000 chars. */
  result: string;
  ok: boolean;
  /** How many turns the transcript had when the tool ran: the UI shows the call after turns[afterTurn - 1]. */
  afterTurn: number;
  durationMs: number;
  /** Set when book_appointment created a booking. */
  bookingId?: string | null;
};

export type VoiceCall = Omit<VoiceCallDoc<string>, "startedAt" | "endedAt" | "memoryUsed" | "recordingUrl"> & {
  startedAt: string;
  endedAt: string;
  memoryUsed?: { brief: string; lastCallAt: string } | null;
  /** The provider handed a recording link over (the link itself stays on the server). */
  hasRecording: boolean;
};

// ---------------------------------------------------------------------------
// Agent features read by the engine per call (prompt variables, voicemail message,
// post-call analysis, caller memory). The engine's side is `product.py` + `analysis.py`.
// ---------------------------------------------------------------------------

/** Variables every call has; their values are worked out per call and cannot be overridden. */
export const VOICE_BUILTIN_VARIABLES = [
  "now",
  "today",
  "weekday",
  "caller_number",
  "agent_name",
  "business_timezone",
] as const;

export type VoiceBuiltinVariable = (typeof VOICE_BUILTIN_VARIABLES)[number];

/** A variable, analysis field or campaign CSV column name as saved. */
export const VOICE_VARIABLE_NAME_PATTERN = /^[a-z][a-z0-9_]{0,43}$/;

export const VOICE_AGENT_FEATURE_LIMITS = {
  /** Default values kept per agent, and each one's length. */
  maxVariables: 30,
  maxVariableLength: 500,
  /** About 30 seconds spoken; the engine also cuts the audio at 30 s. */
  voicemailMessageMax: 500,
  maxAnalysisFields: 10,
  analysisDescriptionMax: 300,
  successDefinitionMax: 500,
  maxChoiceOptions: 10,
  choiceOptionMax: 60,
  /** One caller's memory brief. */
  memoryBriefMax: 600,
  /** The line said while a tool works (`speech.toolWaitLine`), ~8 s spoken at most. */
  toolWaitLineMax: 120,
  /** `speech.silenceSecs`, when on. */
  silenceSecsMin: 5,
  silenceSecsMax: 60,
  /** `speech.maxCallMinutes`, when on. */
  maxCallMinutesMin: 1,
  maxCallMinutesMax: 120,
} as const;

/** What she does while a tool (booking, a webhook) works. */
export enum VoiceToolWait {
  /** The model decides: silence or a couple of words ("one moment"). */
  AGENT = "AGENT",
  SILENT = "SILENT",
  /** `toolWaitLine` is played in her voice as the tool starts. */
  SAY = "SAY",
}

/** How long she waits after the caller stops before answering (the engine's turn settings, speech.py). */
export enum VoiceReplyWait {
  QUICK = "QUICK",
  NORMAL = "NORMAL",
  PATIENT = "PATIENT",
}

/**
 * Who speaks first once the line is open. Absent / null = the call type's default: an inbound agent greets
 * as it picks up (AGENT), an outbound one waits for the callee's "hello?" (CALLER). CALLER waits up to 3 s of
 * nobody speaking, then she starts (phone.RingGate); in the playground she waits for you to speak.
 */
export enum VoiceFirstSpeaker {
  AGENT = "AGENT",
  CALLER = "CALLER",
}

/** Her tone (`# Your style` in her prompt). DEFAULT = whatever the prompt says. */
export enum VoiceTone {
  DEFAULT = "DEFAULT",
  WARM = "WARM",
  FRIENDLY = "FRIENDLY",
  PROFESSIONAL = "PROFESSIONAL",
  FORMAL = "FORMAL",
  ENERGETIC = "ENERGETIC",
}

/** How fast she talks. An instruction in her prompt, so every stack follows it (a PIPELINE stack through how its text model writes). */
export enum VoicePace {
  RELAXED = "RELAXED",
  NORMAL = "NORMAL",
  BRISK = "BRISK",
}

/** How long her replies are. */
export enum VoiceReplyLength {
  BRIEF = "BRIEF",
  NORMAL = "NORMAL",
}

export type VoiceAgentSpeech = {
  toolWait: VoiceToolWait;
  /** `SAY` only: said word for word, `{{variables}}` filled in. Up to `toolWaitLineMax` characters. */
  toolWaitLine: string;
  replyWait: VoiceReplyWait;
  /** Seconds of caller silence after she speaks before she checks they are there; once more and she ends the call. 0 = never. */
  silenceSecs: number;
  /** She wraps up and ends the call after this many minutes. 0 = no limit. */
  maxCallMinutes: number;
  firstSpeaker?: VoiceFirstSpeaker | null;
  /** Personality. Absent = DEFAULT / NORMAL / NORMAL (nothing added to her prompt). */
  tone?: VoiceTone;
  pace?: VoicePace;
  replyLength?: VoiceReplyLength;
};


export enum VoiceVoicemailAction {
  HANG_UP = "HANG_UP",
  /** Leave `message` after the beep, in the agent's voice. */
  MESSAGE = "MESSAGE",
}

export type VoiceAgentVoicemail = {
  action: VoiceVoicemailAction;
  /** Said as written once `{{variables}}` are filled in. Up to `voicemailMessageMax` characters. */
  message: string;
};

export const VOICE_ANALYSIS_FIELD_TYPES = ["text", "number", "boolean", "choice"] as const;

export type VoiceAnalysisFieldType = (typeof VOICE_ANALYSIS_FIELD_TYPES)[number];

/** One custom value the analysis pulls out of each call. */
export type VoiceAnalysisField = {
  /** Lowercase letters, digits and _, like the variables (`budget`, `wants_demo`). Unique per agent. */
  name: string;
  type: VoiceAnalysisFieldType;
  /** What it means, for the model. */
  description: string;
  /** `choice` only: the answers it may take. */
  options?: string[];
};

export type VoiceAgentAnalysis = {
  /** A two or three sentence summary. On unless turned off. */
  summary: boolean;
  /** positive / neutral / negative, from the caller's side. */
  sentiment: boolean;
  /** Whether the call achieved what `successDefinition` says. */
  success: boolean;
  successDefinition: string;
  fields: VoiceAnalysisField[];
};

export type VoiceCallSentiment = "positive" | "neutral" | "negative";

/** One call's analysis. A part that is off (or that the model could not tell) is absent or null. */
export type VoiceCallAnalysis = {
  summary?: string | null;
  sentiment?: VoiceCallSentiment | null;
  successful?: boolean | null;
  /** Custom field name -> value (null = not mentioned on the call). */
  fields?: Record<string, string | number | boolean | null>;
  /** The text model that ran it. */
  model: string;
  /** Set instead of the results when the analysis failed (the call itself is unaffected). */
  error?: string | null;
};

/**
 * What an agent remembers about one caller: a short brief rewritten after each of their calls
 * (from the analysis pass), given to the agent at the start of the next call with that number.
 * It lives on the call it was written after (VoiceCallDoc.memory, keyed by the call's agent and
 * `callerPhone`); the latest one is `current`, the one the next call starts with. Each agent
 * remembers only its own conversations, so turning memory off (or forgetting) on one agent never
 * touches another. Forgetting removes `memory` from every call with that caller.
 */
export type VoiceCallMemory = {
  /** Up to `memoryBriefMax` characters. */
  brief: string;
  /** Calls the brief covers. */
  calls: number;
  /** When the agent first remembered this caller. */
  since: Date;
  /** Set on the caller's latest brief only (one per agent + number). */
  current?: true;
};

/** Client view of one remembered caller: their current brief, `_id` and `lastCallId` being the call it is on. */
export type VoiceCallerMemory = {
  _id: string;
  tenantId: string;
  userId: string;
  agentId: string;
  /** E.164. */
  phone: string;
  brief: string;
  lastCallId: string;
  lastCallAt: string;
  calls: number;
  createdAt: string;
  updatedAt: string;
};

// ---------------------------------------------------------------------------
// Voice accounts: one voice_accounts doc per owner (the user who owns the agents and numbers;
// every voice doc is scoped by `userId`, so the owner is the user, not the tenant). It holds what
// the owner connected: their provider API keys, their booking apps and their phone numbers. Each agent
// picks its own stack (`VoiceAgentDoc.stack`) and which of these keys each part runs on.
//
// Customers bring their own keys: every call their agents take or place (Telnyx, Twilio, VoiceLink,
// playground) runs on them, never on Aixel Labs' keys. No key for a provider the stack uses = no calls.
// `frontend/server/voice-agent/provider-keys.ts` and the engine's `product.gemini_key_for` are the only
// two places that pick a call's key (`voiceStackFor` below says how).
// ---------------------------------------------------------------------------

/** Whose API key it is. The same ids name the provider of a stack part and of a voice. */
export enum VoiceKeyProvider {
  GEMINI = "gemini",
  OPENAI = "openai",
  DEEPGRAM = "deepgram",
  CARTESIA = "cartesia",
  ELEVENLABS = "elevenlabs",
}

/** What the provider last said about a key. The app sets OK on save; the engine sets a problem when a call is refused. */
export enum VoiceKeyStatus {
  OK = "OK",
  /** Not a valid key (mistyped, deleted, expired). */
  INVALID = "INVALID",
  /** The API is not turned on for the key's project, or the key is not allowed to use it. */
  API_DISABLED = "API_DISABLED",
  /** Out of quota, or billing is not set up for what was asked. */
  QUOTA = "QUOTA",
}

export type VoiceGeminiKeyTier = "free" | "paid";

/** Keys one owner may keep, all providers together. */
export const VOICE_KEY_LIMITS = {
  maxPerOwner: 20,
  labelMax: 40,
} as const;

/** One of the owner's API keys, in VoiceAccountDoc.keys. Agents and stacks point at it by `_id`. */
export type VoiceProviderKeyDoc<Id = ObjectId> = {
  _id: Id;
  provider: VoiceKeyProvider;
  /** The owner's name for it ("Clinic project"). */
  label: string;
  /** The key, sealed like number API keys (see frontend/server/voice-agent/engine.ts). Never sent to the client. */
  keySealed: string;
  /** Last 4 characters, to tell keys apart. */
  last4: string;
  status: VoiceKeyStatus;
  /** The provider's own words when status is not OK. */
  statusMessage?: string | null;
  /** When the status was learned: the save's check, the "Check now", or the call that was refused. */
  checkedAt: Date;
  savedAt: Date;
  /** Gemini only: Google's tier for the key's project, as the owner says. Missing = "paid". Calls on a free-tier key cost the owner nothing. */
  tier?: VoiceGeminiKeyTier;
};

/** Client view of one key (never the key). */
export type VoiceProviderKey = Omit<VoiceProviderKeyDoc<string>, "keySealed" | "checkedAt" | "savedAt"> & {
  checkedAt: string;
  savedAt: string;
};

/** How a call hears, thinks and speaks. */
export enum VoiceStackKind {
  /** One speech-to-speech model hears the caller and answers in its own voice (Gemini Live). */
  REALTIME = "REALTIME",
  /** Speech-to-text, then a text model (LLM), then text-to-speech, each from its own provider. */
  PIPELINE = "PIPELINE",
}

/**
 * A model's list price in the unit its provider bills (the shapes of voice-call-rates.json `pipeline`
 * and `gemini`, which the engine's costs.py multiplies by what it metered).
 */
export type VoiceStackPrice =
  | { usdPerMinute: number }
  | { usdPerMillionTokens: { in: number; out: number } }
  | { usdPerMillionTokens: { textIn: number; audioIn: number; textOut: number; audioOut: number } }
  | { usdPerMillionChars: number }
  | { usdPerAudioMinute: number };

/** One model of a stack, on one of the owner's keys of the same provider. */
export type VoiceStackPart<Id = ObjectId> = {
  provider: VoiceKeyProvider;
  /** The provider's model id, one of the catalogue's for this part (frontend/server/voice-agent/voice-catalogue.ts). */
  model: string;
  /** One of the owner's keys of `provider` (VoiceProviderKeyDoc._id). Absent / null / not found = that provider's default key, the first one in `keys`. */
  keyId?: Id | null;
  /** The model's list price when the agent was saved, set by the app from the catalogue; the engine bills on it. Absent = voice-call-rates.json's. */
  price?: VoiceStackPrice | null;
};

export type VoiceStack<Id = ObjectId> =
  | ({ kind: VoiceStackKind.REALTIME } & VoiceStackPart<Id>)
  | { kind: VoiceStackKind.PIPELINE; stt: VoiceStackPart<Id>; llm: VoiceStackPart<Id>; tts: VoiceStackPart<Id> };

export type VoiceStackPartName = "realtime" | "stt" | "llm" | "tts";

/** A model a stack part may use, with its list price and what that comes to per call-minute. */
export type VoiceStackModel = {
  provider: VoiceKeyProvider;
  model: string;
  name: string;
  price: VoiceStackPrice;
  usdPerMinute: number;
  /** Listed but the engine cannot run it yet ("coming soon"). */
  soon?: boolean;
  /** Gemini speech models: a free-tier key is cut off after a few sentences a minute. */
  paidKeyOnly?: boolean;
};

/** The models each part offers, cheapest first (the catalogue). */
export type VoiceStackCatalogue = Record<VoiceStackPartName, VoiceStackModel[]>;

/** The fallback models of each part (voice-call-rates.json `stack`, priced there): first = default. */
export const VOICE_STACK_MODELS = voiceCallRates.stack as unknown as Record<
  VoiceStackPartName,
  Pick<VoiceStackModel, "provider" | "model" | "name">[]
>;

/** The stack of an agent that never picked one: what every agent ran on before stacks existed. */
export const VOICE_DEFAULT_STACK: VoiceStack<never> = {
  kind: VoiceStackKind.REALTIME,
  provider: VoiceKeyProvider.GEMINI,
  model: voiceCallRates.gemini.model,
};

/** The stack a call runs on: the agent's own, else VOICE_DEFAULT_STACK. The engine does the same (product.stack_for). */
export function voiceStackFor<Id>(agent: { stack?: VoiceStack<Id> | null } | null | undefined): VoiceStack<Id> {
  return agent?.stack ?? VOICE_DEFAULT_STACK;
}

/**
 * The key a stack part runs on: `keyId` when the owner still has it, else the provider's first key.
 * Null = the owner has no key for that provider (no calls).
 */
export function voiceKeyFor<K extends { _id: unknown; provider: VoiceKeyProvider }>(
  keys: K[] | null | undefined,
  part: { provider: VoiceKeyProvider; keyId?: unknown },
): K | null {
  const own = (keys ?? []).filter((key) => key.provider === part.provider);
  const id = part.keyId == null ? null : String(part.keyId);
  return own.find((key) => String(key._id) === id) ?? own[0] ?? null;
}

/** A voice a pipeline agent speaks in: a text-to-speech provider's voice. */
export type VoiceTtsVoice = {
  provider: VoiceKeyProvider;
  /** The provider's voice id (Cartesia voice UUID, ElevenLabs voice_id). */
  voiceId: string;
  /** Shown in the app and the call log ("Katie"). */
  name: string;
};

/**
 * The owner's softphone line (Linphone), for testing agents over the internet: no phone network, so no
 * country limits. Telnyx only: the SIP login of the "Aixel Labs web phone" credential connection in their account
 * (the web dialer's browser logins are telephony credentials on the same connection). Its password is not kept: it is
 * shown once, when set up or reset, and sits sealed behind Linphone's one-time setup link for at most 10 minutes.
 */
export type VoiceSoftphoneDoc<Id = ObjectId> = {
  provider: VoiceProvider.TELNYX;
  /** The number it was set up with: its Telnyx account is the softphone's (its key opens the connection). */
  numberId: Id;
  connectionId: string;
  /** Signs in at `sip.telnyx.com`; calls to `sip:<userName>@sip.telnyx.com` ring it (from the owner's account only). */
  userName: string;
  /**
   * Linphone's one-time setup link, made with each new password: the link's token (SHA-256 hex, never the token) and
   * the password (sealed) until the link is fetched once or `expiresAt` (10 minutes) passes; then null.
   */
  provisioning?: { tokenHash: string; passwordSealed: string; expiresAt: Date } | null;
  createdAt: Date;
  updatedAt: Date;
};

/** Numbers one owner may connect; keeps their VoiceAccountDoc far below MongoDB's 16 MB. */
export const VOICE_NUMBER_LIMITS = {
  maxPerOwner: 500,
} as const;

export type VoiceAccountDoc<Id = ObjectId> = {
  _id?: Id;
  tenantId: Id;
  /** Owner. Unique: one account doc per user. */
  userId: Id;
  /** @deprecated The single Gemini key before 2026-10-22; migrate_voice_keys.py moves it into `keys`. Read until the app and engine switch to `keys`. */
  gemini?: Omit<VoiceProviderKeyDoc<Id>, "_id" | "provider" | "label"> | null;
  /** API keys, up to `VOICE_KEY_LIMITS.maxPerOwner`, oldest first: the first key of a provider is its default. Absent = none. */
  keys?: VoiceProviderKeyDoc<Id>[];
  /** Connected booking apps. Absent = none. */
  calendars?: VoiceCalendarConnectionDoc<Id>[];
  /** Phone numbers, up to `VOICE_NUMBER_LIMITS.maxPerOwner`. Absent = none. */
  numbers?: VoiceNumberDoc<Id>[];
  /** Absent or null = none set up. */
  softphone?: VoiceSoftphoneDoc<Id> | null;
  createdAt: Date;
  updatedAt: Date;
};

/** Client view of the Gemini key something runs on (an agent's, or the owner's default): how it is doing, never the key. */
export type VoiceGeminiKeyView = {
  set: boolean;
  /** The key's VoiceProviderKeyDoc._id. Null when no key is set. */
  id: string | null;
  label: string | null;
  last4: string | null;
  status: VoiceKeyStatus | null;
  statusMessage: string | null;
  checkedAt: string | null;
  /** null when no key is set. */
  tier: VoiceGeminiKeyTier | null;
};

// ---------------------------------------------------------------------------
// Outbound campaigns: an outbound agent calls a list of contacts from one of the owner's
// numbers, inside a calling window. The app writes both collections; the voice engine
// (backend/voice/campaigns.py) runs RUNNING campaigns: it claims due contacts, dials
// them through its own POST /calls, and settles each contact from the call's voice_calls doc.
// ---------------------------------------------------------------------------

export enum VoiceCampaignStatus {
  /** Being set up; nothing is called. */
  DRAFT = "DRAFT",
  RUNNING = "RUNNING",
  /** By the owner, or by the engine when the number or agent cannot place calls (`lastError`). */
  PAUSED = "PAUSED",
  /** Every contact was called, skipped or given up on. */
  COMPLETED = "COMPLETED",
  /** Stopped for good by the owner; contacts not yet called are CANCELLED. */
  CANCELLED = "CANCELLED",
}

/** Outcomes a campaign may call again about, after `delayMinutes`. */
export enum VoiceCampaignRetryOutcome {
  /** Also: the provider never connected the call. */
  NO_ANSWER = "no_answer",
  BUSY = "busy",
  /** An answering machine, or a phone menu. */
  VOICEMAIL = "voicemail",
}

export type VoiceCampaignDay = VoiceWeekday;

/** A calling window's end may also be midnight. */
export const VOICE_CAMPAIGN_END_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$|^24:00$/;

/** Calls start only on `days`, from `start` (included) to `end` (excluded), "HH:MM" on the clock of `timezone`. */
export type VoiceCampaignWindow = {
  days: VoiceCampaignDay[];
  start: string;
  /** "24:00" = to midnight. Always after `start` (no windows across midnight). */
  end: string;
  /** IANA zone, e.g. "Asia/Kolkata". */
  timezone: string;
};

export type VoiceCampaignRetry = {
  /** Calls after the first, per contact (0 = call once). */
  maxRetries: number;
  delayMinutes: number;
  on: VoiceCampaignRetryOutcome[];
};

/** Limits the app enforces and the engine relies on. */
export const VOICE_CAMPAIGN_LIMITS = {
  nameMax: 80,
  /** Calls at once per campaign, and per number across campaigns (the engine's MAX_CALLS 8, minus 2 kept for calls coming in). */
  maxConcurrent: 6,
  maxRetries: 5,
  minRetryDelayMinutes: 5,
  maxRetryDelayMinutes: 7 * 24 * 60,
  maxContacts: 10_000,
  /** Extra CSV columns kept per contact as variables. */
  maxVariables: 20,
  maxVariableLength: 500,
} as const;

export type VoiceCampaignDoc<Id = ObjectId> = {
  _id?: Id;
  tenantId: Id;
  userId: Id;
  name: string;
  /** An OUTBOUND agent of the owner. */
  agentId: Id;
  /** The number every call is placed from. */
  numberId: Id;
  status: VoiceCampaignStatus;
  window: VoiceCampaignWindow;
  maxConcurrent: number;
  retry: VoiceCampaignRetry;
  /** ISO 3166 alpha-2 country numbers without a "+" were read in, e.g. "IN". */
  defaultCountry: string;
  /** The variable names the contacts carry (from the CSV's extra columns), in column order. */
  variableKeys: string[];
  /** Why the engine paused it (number removed, provider refusing calls); cleared on resume. */
  lastError?: string | null;
  /** Which engine process drives it, until when (engine-owned lease). */
  runner?: { owner: string; until: Date } | null;
  startedAt?: Date | null;
  completedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export enum VoiceCampaignContactStatus {
  /** Waiting for its first call, or for a retry (`nextAttemptAt`). */
  PENDING = "PENDING",
  CALLING = "CALLING",
  /** A person (or someone) picked up and the agent talked. Final. */
  ANSWERED = "ANSWERED",
  /** No answer / busy / voicemail on every attempt allowed. Final. */
  UNREACHED = "UNREACHED",
  /** The provider refused the call, or the engine lost it with no attempts left. Final. */
  FAILED = "FAILED",
  /** On the do-not-call list (asked not to be called on an earlier call). Final, never dialled. */
  SKIPPED_DNC = "SKIPPED_DNC",
  /** The campaign was cancelled before this contact was called. Final. */
  CANCELLED = "CANCELLED",
}

/** A contact's `lastOutcome` when no call settled it. */
export enum VoiceCampaignOutcome {
  DNC_LIST = "dnc_list",
  INVALID_NUMBER = "invalid_number",
  INTERRUPTED = "interrupted",
}

export type VoiceCampaignContactDoc<Id = ObjectId> = {
  _id?: Id;
  tenantId: Id;
  userId: Id;
  campaignId: Id;
  /** E.164. Unique per campaign. */
  phone: string;
  name: string | null;
  /** Extra CSV columns: variable name -> value. */
  variables: Record<string, string>;
  /** The CSV row it came from (1 = the header). */
  row: number;
  status: VoiceCampaignContactStatus;
  /** Calls placed so far. */
  attempts: number;
  /** When it may be called (again); null = now. */
  nextAttemptAt: Date | null;
  /** The last call's `endedBy` ({@link VoiceCallEndReason}) or a {@link VoiceCampaignOutcome}. */
  lastOutcome?: string | null;
  /** The engine's or provider's words when a call could not be placed. */
  lastError?: string | null;
  lastCallId?: Id | null;
  /** Every call placed to this contact by the campaign (voice_calls). */
  callIds: Id[];
  /** The agent booked an appointment on one of its calls. */
  booked: boolean;
  /** Engine-owned while CALLING: who placed the call, when, from which number. */
  lease?: { owner: string; until: Date } | null;
  dialedAt?: Date | null;
  /** When the call's audio stream opened (possibly on the other deploy slot): it connected. */
  streamedAt?: Date | null;
  numberId?: Id | null;
  providerCallId?: string | null;
  finishedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
};
