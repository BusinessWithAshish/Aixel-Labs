import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { searchGmapsInternal } from "../../api/gmaps/internal/client";
import { GMAPS_REQUEST_SCHEMA } from "../../api/gmaps/schemas";
import { fetchGmapsPlaceDetails } from "../../api/gmaps/details/client";
import { GMAPS_DETAILS_REQUEST_SCHEMA } from "../../api/gmaps/details/schemas";
import { resolveGmapsAdvancedPlaces } from "../../api/gmaps/advanced/client";
import { GMAPS_ADVANCED_REQUEST_SCHEMA } from "../../api/gmaps/advanced/schemas";
import { MCP_LAYER, registerDomainTool, type DomainOp } from "../domain-tool";

const GMAPS_OPS: Record<string, DomainOp> = {
  search: {
    defaultLayer: MCP_LAYER.RAW,
    raw: { schema: GMAPS_REQUEST_SCHEMA, run: searchGmapsInternal },
  },
  details: {
    defaultLayer: MCP_LAYER.RAW,
    raw: { schema: GMAPS_DETAILS_REQUEST_SCHEMA, run: fetchGmapsPlaceDetails },
  },
  advanced: {
    defaultLayer: MCP_LAYER.RAW,
    raw: { schema: GMAPS_ADVANCED_REQUEST_SCHEMA, run: resolveGmapsAdvancedPlaces },
  },
};

const GMAPS_DESCRIPTION = `Google Maps place search and details. Raw only — no intelligence overlay.

Call with { op, layer?, input }. layer must be omitted or raw.

Ops:
- search (raw) — primary Maps lead search by query/placeType across cities. countryCode is always required (even without country). urls is not implemented on this op — use \`advanced\` for URLs. input: query?/placeType? (at least one required), country?, state?, cities?, countryCode (required), enrichment?, limit?
- details (raw) — single place by placeId, featureId, or Maps place url (at least one required). input: placeId?, featureId?, url?, name?, lat?, lng?, countryCode?, hl?, richness? (slim|rich, default slim)
- advanced (raw) — batch of Maps place URLs → rich details, deduped by placeId/featureId. input: urls[] (1-25 Google Maps place URLs), richness? (slim|rich, default rich)`;

export function registerGmapsTool(server: McpServer): void {
  registerDomainTool(server, {
    name: "gmaps",
    description: GMAPS_DESCRIPTION,
    ops: GMAPS_OPS,
  });
}
