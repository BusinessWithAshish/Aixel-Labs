import { LEAD_GENERATION_SUB_MODULES } from '@aixellabs/backend/db/types';
import { GMAPS_REQUEST_FIELDS_SCHEMA, GMAPS_REQUEST_SCHEMA } from '@aixellabs/backend/gmaps';
import { INSTAGRAM_REQUEST_SCHEMA } from '@aixellabs/backend/instagram/schemas';
import { LINKEDIN_BY_PEOPLE_REQUEST_SCHEMA } from '@aixellabs/backend/linkedin/schemas';
import { z } from 'zod';

export type ServerPhase = 'collecting' | 'ready';

export type TurnModelOutput = {
    message: string;
    draftUpdates?: Record<string, unknown>;
    status: ServerPhase;
};

export type TaskConfig = {
    requestSchema: z.ZodTypeAny;
    turnSchema: z.ZodTypeAny;
    label: string;
    description: string;
};

export type NlChatModule =
    | typeof LEAD_GENERATION_SUB_MODULES.GOOGLE_MAPS
    | typeof LEAD_GENERATION_SUB_MODULES.INSTAGRAM_SEARCH
    | typeof LEAD_GENERATION_SUB_MODULES.LINKEDIN;

// ─── Schema helpers ───────────────────────────────────────────────────────────

function makePartial(schema: z.ZodTypeAny): z.ZodTypeAny {
    if (schema instanceof z.ZodEffects) {
        return makePartial(schema.innerType() as z.ZodTypeAny);
    }
    if (schema instanceof z.ZodObject) {
        return schema.deepPartial();
    }
    return schema.optional();
}

function createTurnSchema(requestSchema: z.ZodTypeAny): z.ZodTypeAny {
    return z.object({
        message: z.string().describe('Conversational reply to the user. Never include raw JSON or field names.'),
        draftUpdates: makePartial(requestSchema)
            .optional()
            .default({})
            .describe(
                'Extract ALL fields the user mentioned. Always include every piece of information provided, including inferred geographic data. ' +
                    'Set to {} only if the user provided absolutely no extractable information.',
            ),
        status: z
            .enum(['collecting', 'ready'])
            .describe(
                '"collecting" while still gathering info; "ready" only when all required fields are satisfied and you want the user to confirm.',
            ),
    });
}

// ─── System prompt ────────────────────────────────────────────────────────────

/**
 * Rules injected into every module's system prompt regardless of schema.
 * Covers the common patterns that models consistently get wrong without explicit guidance.
 */
const UNIVERSAL_EXTRACTION_RULES = `
Extraction rules (apply to EVERY turn):

1. ALWAYS separate the business/search type from the location.
   - "dentists in miami"   → query:"dentists", city/cities:"Miami"  (NOT query:"dentists in miami")
   - "Italian restaurants near Times Square" → query:"Italian restaurants", city:"New York City"

2. ALWAYS infer full geographic context from any city or region mentioned.
   When a city is identified, also populate country, state/province (where applicable), and countryCode.
   - Miami     → country:"United States",     state:"Florida",          countryCode:"us"
   - Chicago   → country:"United States",     state:"Illinois",         countryCode:"us"
   - New York  → country:"United States",     state:"New York",         countryCode:"us"
   - London    → country:"United Kingdom",                              countryCode:"gb"
   - Dubai     → country:"United Arab Emirates",                        countryCode:"ae"   ← NO state
   - Singapore → country:"Singapore",                                   countryCode:"sg"   ← NO state
   - Mumbai    → country:"India",             state:"Maharashtra",      countryCode:"in"
   - Toronto   → country:"Canada",            state:"Ontario",          countryCode:"ca"
   - Sydney    → country:"Australia",         state:"New South Wales",  countryCode:"au"
   - Paris     → country:"France",                                      countryCode:"fr"

3. Omit state for city-states and small countries: UAE, Singapore, Hong Kong, Bahrain, Kuwait, Qatar, Oman, Luxembourg, Monaco, Malta, Maldives.

4. Expand common abbreviations automatically — never store the abbreviation:
   - NYC / New York City → cities:["New York City"], state:"New York"
   - LA / Los Angeles    → cities:["Los Angeles"],   state:"California"
   - SF                  → cities:["San Francisco"], state:"California"
   - UK                  → country:"United Kingdom", countryCode:"gb"
   - US / USA            → country:"United States",  countryCode:"us"
   - UAE                 → country:"United Arab Emirates", countryCode:"ae"

5. countryCode is ALWAYS a lowercase ISO 3166-1 alpha-2 code. Set it whenever country is known. NEVER ask the user for it.

6. Multiple cities: add all to the cities array as long as they are in the same country and state.
   "Miami and Fort Lauderdale" → cities:["Miami","Fort Lauderdale"], state:"Florida"

7. To clear a field the user asked to remove, output null for that key in draftUpdates.`.trim();

export function buildSystemPrompt(
    label: string,
    description: string,
    draft: Record<string, unknown>,
    issues: string[],
    turnsUsed: number,
    maxTurns: number,
): string {
    const draftJson = Object.keys(draft).length > 0 ? JSON.stringify(draft, null, 2) : '(empty — nothing collected yet)';
    const validationBlock =
        issues.length > 0 ? `Missing / invalid:\n${issues.join('\n')}` : 'All required fields are satisfied.';

    const urgencyNote =
        turnsUsed >= maxTurns - 3
            ? '\n\nIMPORTANT: The conversation is near its turn limit. If you have enough information, set status to "ready" right now so the user can confirm.'
            : '';

    return `You are a lead generation assistant helping a user fill in a "${label}" search form through natural conversation.

Module: ${description}

General rules:
- Ask 1–2 questions at a time. Keep replies short and friendly.
- Never output raw JSON, field names, or technical schema details in your message.
- Set status to "ready" only when the draft satisfies all required fields AND you have summarised what was collected.
- Keep status as "collecting" while still gathering information.${urgencyNote}

${UNIVERSAL_EXTRACTION_RULES}

Current collected draft:
${draftJson}

${validationBlock}`;
}

// ─── Task registry ────────────────────────────────────────────────────────────

export const TASK_REGISTRY: Record<NlChatModule, TaskConfig> = {
    [LEAD_GENERATION_SUB_MODULES.GOOGLE_MAPS]: {
        requestSchema: GMAPS_REQUEST_SCHEMA,
        turnSchema: createTurnSchema(GMAPS_REQUEST_FIELDS_SCHEMA),
        label: 'Google Maps Lead Search',
        description: `Search Google Maps for businesses. Fields:
- query: the business TYPE only — never include city/location here (e.g. "dentists", "Italian restaurants", "emergency plumbers")
- country + state + cities: geographic scope — always infer all three from any location the user mentions
- countryCode: ISO 3166-1 alpha-2, always derived from country, never asked
- urls: only when the user pastes a Google Maps URL; when urls are provided, omit query/country/state/cities

Worked examples:
  "dentists in miami"          → query:"dentists",      cities:["Miami"],      state:"Florida",          country:"United States",       countryCode:"us"
  "restaurants in london"      → query:"restaurants",   cities:["London"],                               country:"United Kingdom",      countryCode:"gb"
  "plumbers in dubai"          → query:"plumbers",      cities:["Dubai"],                                country:"United Arab Emirates", countryCode:"ae"
  "cafes in mumbai"            → query:"cafes",         cities:["Mumbai"],     state:"Maharashtra",      country:"India",               countryCode:"in"
  "gyms in toronto"            → query:"gyms",          cities:["Toronto"],    state:"Ontario",          country:"Canada",              countryCode:"ca"`,
    },

    [LEAD_GENERATION_SUB_MODULES.INSTAGRAM_SEARCH]: {
        requestSchema: INSTAGRAM_REQUEST_SCHEMA,
        turnSchema: createTurnSchema(INSTAGRAM_REQUEST_SCHEMA),
        label: 'Instagram Profile Search',
        description: `Search for Instagram profiles. Fields:
- entities: specific Instagram usernames or profile URLs the user names (strip the @ prefix from usernames)
- query: free-text description of the type of profiles to find (e.g. "fitness coaches in London")
- country / city: geographic scope — infer country from any city or region mentioned (apply universal geo rules)
- hashtags: topics the profiles post about — strip the # prefix (e.g. ["fitness","yoga"])
- keywords: words that should appear in bios (e.g. ["certified coach","personal trainer"])
- excludeKeywords / excludeHashtags: topics or words to filter out

Worked examples:
  "@nike and @adidas"                  → entities:["nike","adidas"]
  "#fitness influencers in London"     → hashtags:["fitness"],  city:"London",  country:"United Kingdom"
  "personal trainers in Mumbai"        → query:"personal trainers", city:"Mumbai", country:"India"
  "exclude bots and spam accounts"     → excludeKeywords:["bot","spam"]`,
    },

    [LEAD_GENERATION_SUB_MODULES.LINKEDIN]: {
        requestSchema: LINKEDIN_BY_PEOPLE_REQUEST_SCHEMA,
        turnSchema: createTurnSchema(LINKEDIN_BY_PEOPLE_REQUEST_SCHEMA),
        label: 'LinkedIn People Search',
        description: `Search for LinkedIn profiles (people). All fields live inside discovery_filters or enrichment. Fields:
- discovery_filters.country: REQUIRED — always infer from any city or region mentioned
- discovery_filters.state / city: infer from location mentions (apply universal geo rules)
- discovery_filters.job_titles: list of job titles (e.g. ["CTO","VP Engineering"])
- discovery_filters.companies: current or past companies (e.g. ["Google","Meta"])
- discovery_filters.keywords: general keywords related to skills or background
- enrichment.experience_years: { min, max } — extract from "X+ years", "5-10 years" etc.
- enrichment.industry: list of industry names (e.g. ["Technology","Finance"])
- limit: number of results requested (default 100, max 250)

Worked examples:
  "software engineers in California"    → discovery_filters:{ country:"United States", state:"California", job_titles:["Software Engineer"] }
  "CTOs at Google or Meta"              → discovery_filters:{ companies:["Google","Meta"], job_titles:["CTO"] }
  "finance professionals with 10+ years" → discovery_filters:{ }, enrichment:{ experience_years:{ min:10 }, industry:["Finance"] }
  "marketers in London"                 → discovery_filters:{ country:"United Kingdom", city:"London", job_titles:["Marketing Manager","Marketing Director","CMO"] }`,
    },
};
