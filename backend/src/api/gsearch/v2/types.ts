import type { z } from "zod";

import type { GSEARCH_RESULT } from "../types";
import type { GSEARCH_V2_REQUEST_SCHEMA } from "./schemas";
import type { GSEARCH_V2_BACKEND } from "./constants";

export type GSEARCH_V2_REQUEST = z.input<typeof GSEARCH_V2_REQUEST_SCHEMA>;
export type GSEARCH_V2_REQUEST_PARSED = z.output<typeof GSEARCH_V2_REQUEST_SCHEMA>;

export type GSEARCH_V2_BACKEND_VALUE =
  (typeof GSEARCH_V2_BACKEND)[keyof typeof GSEARCH_V2_BACKEND];

/** Knowledge Graph card from Docs Explore (Serper-compatible shape). */
export type GSEARCH_V2_KNOWLEDGE_GRAPH = {
  kgmid: string | null;
  title: string | null;
  type: string | null;
  description: string | null;
  descriptionSource: { url: string | null; name: string | null } | null;
  image: {
    url: string | null;
    width: number | null;
    height: number | null;
    sourceUrl: string | null;
  } | null;
  attributes: Record<string, string> | null;
};

/** Internal envelope from `fetchGsearchV2` (IG/LI discovery + debugging). */
export type GSEARCH_V2_FETCH_RESPONSE = {
  query: string;
  resolvedQuery: string;
  country: string;
  region: string | null;
  state: string | null;
  language: string;
  backend: GSEARCH_V2_BACKEND_VALUE;
  pagesFetched: number;
  knowledgeGraph: GSEARCH_V2_KNOWLEDGE_GRAPH | null;
  results: GSEARCH_RESULT[];
};

/** Product lead-gen item — same shape as v1 for FE cards / createUserLeads. */
export type GSEARCH_V2_RESPONSE = GSEARCH_RESULT;
