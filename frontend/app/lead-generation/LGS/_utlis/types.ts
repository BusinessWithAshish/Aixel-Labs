import { TApiResponse } from "@/types/api";
import { StreamMessage as BaseStreamMessage, BrowserStreamMetadata } from "@aixellabs/shared-types";

export type Lead = {
    id?: string;
    name: string;
    overAllRating: string;
    phoneNumber: string;
    numberOfReviews: string;
    website: string;
    gmapsUrl: string;
};

export type GmapsData = {
    founded: string[];
    foundedLeadsCount: number;
    allLeads: Lead[];
    allLeadsCount: number;
}

export type TGmapsScrapeResult = TApiResponse<GmapsData>

// Streaming message types - extending base types with GMAPS-specific metadata
export type GmapsStreamEventType = 
    | 'status'
    | 'progress'
    | 'error'
    | 'complete'
    | 'warning'
    | 'phase_start'
    | 'phase_complete'
    | 'browser_start'
    | 'browser_complete'
    | 'page_start'
    | 'page_complete'
    | 'batch_start'
    | 'batch_complete';

export type GmapsStreamMetadata = BrowserStreamMetadata & {
    phase?: number;
    foundedLeadsCount?: number;
    allLeadsCount?: number;
    founded?: string[];
    allLeads?: Lead[];
};

export type StreamMessage = BaseStreamMessage<GmapsStreamEventType, GmapsStreamMetadata>;