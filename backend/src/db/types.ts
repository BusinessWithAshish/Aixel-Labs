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
  VOICE_AGENTS = "voice_agents",
  VOICE_NUMBERS = "voice_numbers",
  VOICE_CALLS = "voice_calls",
  VOICE_BOOKINGS = "voice_bookings",
  VOICE_CALENDAR_CONNECTIONS = "voice_calendar_connections",
  VOICE_SETTINGS = "voice_settings",
  VOICE_CAMPAIGNS = "voice_campaigns",
  VOICE_CAMPAIGN_CONTACTS = "voice_campaign_contacts",
  VOICE_CALLER_MEMORIES = "voice_caller_memories",
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
  INSTAGRAM_ADVANCED_SEARCH = "INSTAGRAM_ADVANCED_SEARCH",
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
// voice_agents / voice_numbers and writes voice_calls with these same shapes.
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

export type VoiceAgentDoc<Id = ObjectId> = {
  _id?: Id;
  tenantId: Id;
  /** Owner. Agents, numbers and calls are visible to their owner only. */
  userId: Id;
  name: string;
  callType: VoiceAgentCallType;
  voice: VoiceAgentVoice;
  /** The whole system prompt the model runs on. */
  prompt: string;
  /** Facts about the business being called, appended to the prompt per call ("Website: none found."). */
  callNotes: string;
  /** Actions the agent can take during a call. Absent = none (ending the call is always available). */
  tools?: VoiceAgentTools;
  /**
   * Default values for the `{{variables}}` in the prompt and call notes. A call's own variables
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
  createdAt: Date;
  updatedAt: Date;
};

/** "Mon".."Sun" -> opening hours that day; a missing day is closed. Times are "HH:MM" (24 h) in the booking timezone. */
export type VoiceBookingHours = Partial<Record<"mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun", { open: string; close: string }>>;

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
// toolkit (Composio-managed), created on first use. The app keeps one
// voice_calendar_connections doc per connection attempt (owner check for the callback).
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

/** One of the owner's connected booking apps (any of their agents can book into it). */
export type VoiceCalendarConnectionDoc<Id = ObjectId> = {
  _id?: Id;
  tenantId: Id;
  userId: Id;
  provider: VoiceCalendarProvider;
  /** Composio connected account id, unique. */
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

export type VoiceWebhookParamType = "string" | "number" | "boolean";

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

/** A number the customer brought, in their own provider account. */
export type VoiceNumberDoc<Id = ObjectId> = {
  _id?: Id;
  tenantId: Id;
  userId: Id;
  provider: VoiceProvider;
  /** E.164, e.g. "+13473703925". */
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
   * Agent that answers calls coming in to this number. null = the AI does not answer:
   * the number stays on the customer's own routing and only places calls.
   */
  inboundAgentId?: Id | null;
  /** Agent that places calls from this number unless a call names another one. */
  outboundAgentId?: Id | null;
  /** The Telnyx connection the number was on before AI answering; restored when it is turned off or removed. */
  previousConnectionId?: string | null;
  /** VoiceLink numbers only. */
  voicelink?: VoiceLinkNumberState;
  /** Twilio numbers only. */
  twilio?: TwilioNumberState;
  createdAt: Date;
  updatedAt: Date;
};

/** Client view: no sealed key. */
export type VoiceNumber = Omit<VoiceNumberDoc<string>, "apiKeySealed" | "createdAt" | "updatedAt"> & {
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
  /**
   * caller_hung_up | goodbye | dnc | abuse | voicemail | voicemail_message | ivr | no_answer | ...
   * | gemini_key_error (Gemini refused the owner's key; the reason is in `flags` and on their VoiceSettingsDoc).
   */
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
};

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

export type VoiceCall = Omit<VoiceCallDoc<string>, "startedAt" | "endedAt" | "memoryUsed"> & {
  startedAt: string;
  endedAt: string;
  memoryUsed?: { brief: string; lastCallAt: string } | null;
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
} as const;

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

export type VoiceAnalysisFieldType = "boolean" | "text" | "number" | "choice";

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
 * Keyed by owner + agent + number (E.164): each agent remembers only its own conversations,
 * so turning memory off (or forgetting) on one agent never touches another.
 */
export type VoiceCallerMemoryDoc<Id = ObjectId> = {
  _id?: Id;
  tenantId: Id;
  userId: Id;
  agentId: Id;
  /** E.164. Unique per agent. */
  phone: string;
  /** Up to `memoryBriefMax` characters. */
  brief: string;
  lastCallId: Id;
  lastCallAt: Date;
  /** Calls the brief covers. */
  calls: number;
  createdAt: Date;
  updatedAt: Date;
};

export type VoiceCallerMemory = Omit<VoiceCallerMemoryDoc<string>, "lastCallAt" | "createdAt" | "updatedAt"> & {
  lastCallAt: string;
  createdAt: string;
  updatedAt: string;
};

// ---------------------------------------------------------------------------
// Voice settings: one voice_settings doc per owner (the user who owns the agents and numbers;
// every voice doc above is scoped by `userId`, so the owner is the user, not the tenant).
//
// Customers bring their own Gemini API key: every call their agents take or place (Telnyx,
// Twilio, VoiceLink, playground) runs on it, never on Aixel Labs' key. No key = no calls.
// A later "use Aixel Labs credits" option would be a choice stored here, read by the app's
// `server/voice-agent/gemini-key.ts` and the engine's `product.gemini_key_for` (the only two
// places that pick the key); it does not exist yet.
// ---------------------------------------------------------------------------

/** What Google last said about an owner's key. The app sets OK on save; the engine sets a problem when a call is refused. */
export enum VoiceGeminiKeyStatus {
  OK = "OK",
  /** Not a valid key (mistyped, deleted, expired). */
  INVALID = "INVALID",
  /** The Gemini API is not turned on for the key's Google Cloud project, or the key is not allowed to use it. */
  API_DISABLED = "API_DISABLED",
  /** Out of quota, or billing is not set up for what was asked. */
  QUOTA = "QUOTA",
}

export type VoiceGeminiKey = {
  /** The key, sealed like number API keys (see frontend/server/voice-agent/engine.ts). Never sent to the client. */
  keySealed: string;
  /** Last 4 characters, to tell keys apart. */
  last4: string;
  status: VoiceGeminiKeyStatus;
  /** Google's own words when status is not OK. */
  statusMessage?: string | null;
  /** When the status was learned: the save's check, or the call that was refused. */
  checkedAt: Date;
  savedAt: Date;
};

export type VoiceSettingsDoc<Id = ObjectId> = {
  _id?: Id;
  tenantId: Id;
  /** Owner. Unique: one settings doc per user. */
  userId: Id;
  /** Absent / null = no key: the owner's agents cannot take or place calls. */
  gemini?: VoiceGeminiKey | null;
  createdAt: Date;
  updatedAt: Date;
};

/** Client view of the owner's key: whether one is set and how it is doing, never the key. */
export type VoiceGeminiKeyView = {
  set: boolean;
  last4: string | null;
  status: VoiceGeminiKeyStatus | null;
  statusMessage: string | null;
  checkedAt: string | null;
};

// ---------------------------------------------------------------------------
// Outbound campaigns: an outbound agent calls a list of contacts from one of the owner's
// numbers, inside a calling window. The app writes both collections; the voice engine
// (~/voice-latency-trial/campaigns.py) runs RUNNING campaigns: it claims due contacts, dials
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

export type VoiceCampaignDay = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

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
  /** The last call's `endedBy` (no_answer, goodbye, ...), `dnc_list`, `invalid_number` or `interrupted`. */
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
