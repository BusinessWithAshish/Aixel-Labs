import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { fetchLinkedInByCompany, fetchLinkedInByPeople } from "../../api/linkedin/helpers";
import {
  LINKEDIN_BY_COMPANY_REQUEST_SCHEMA,
  LINKEDIN_BY_PEOPLE_REQUEST_SCHEMA,
} from "../../api/linkedin/schemas";
import { MCP_LAYER, registerDomainTool, type DomainOp } from "../domain-tool";

const LINKEDIN_OPS: Record<string, DomainOp> = {
  people: {
    defaultLayer: MCP_LAYER.RAW,
    raw: { schema: LINKEDIN_BY_PEOPLE_REQUEST_SCHEMA, run: fetchLinkedInByPeople },
  },
  company: {
    defaultLayer: MCP_LAYER.RAW,
    raw: { schema: LINKEDIN_BY_COMPANY_REQUEST_SCHEMA, run: fetchLinkedInByCompany },
  },
};

const LINKEDIN_DESCRIPTION = `LinkedIn people / company discovery via Google CSE + guest-view profile scrape. Raw only — no intelligence overlay.

Call with { op, layer?, input }. layer must be omitted or raw. \`searchType\` must match the op ("people" for op=people, "company" for op=company).

country inside discovery_filters is always required (ISO alpha-2) on both ops — state/city are optional refinements on top of it.

Ops:
- people (raw) — profile search. input: searchType: "people", discovery_filters { country (required, ISO alpha-2), state?, city?, name?, bio?, job_titles?, keywords?, languages?, companies?, educations? }, enrichment? { followers? {min,max}, experience_years? {min,max}, industry? }, limit? (max 250, default 100)
- company (raw) — company page search. input: searchType: "company", discovery_filters { country (required, ISO alpha-2), state?, city?, company_name?, industry?, keywords?, company_size?, type?, specialties? }, enrichment? { employee_count? {min,max}, funding? {min,max}, is_recently_active? (has|missing|any, default any), company_engagement_rate? {min_likes,max_like,min_comment,max_comment}, is_hiring? (has|missing|any, default any), recently_funded? (has|missing|any, default any), follower_count? {min,max}, description_include?, description_exclude? }, limit? (max 250, default 100)`;

export function registerLinkedinTool(server: McpServer): void {
  registerDomainTool(server, {
    name: "linkedin",
    description: LINKEDIN_DESCRIPTION,
    ops: LINKEDIN_OPS,
  });
}
