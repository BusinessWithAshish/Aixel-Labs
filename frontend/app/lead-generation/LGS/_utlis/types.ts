import {TApiResponse} from "@/types/api";
import { Lead, GmapsScrapeResponse, StreamMessage } from "@aixellabs/shared/apis";

// Re-export shared types for convenience
export type { Lead, GmapsScrapeResponse, StreamMessage };

export type GmapsData = GmapsScrapeResponse;

export type TGmapsScrapeResult = TApiResponse<GmapsData>