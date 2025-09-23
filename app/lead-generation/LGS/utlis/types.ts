import {TApiResponse} from "@/types/api";

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

// Streaming message types
export type StreamMessage = {
    type: 'progress' | 'status' | 'error' | 'complete';
    message: string;
    data?: {
        current?: number;
        total?: number;
        percentage?: number;
        stage?: string;
        batch?: number;
        browser?: number;
        phase?: number;
        foundedLeadsCount?: number;
        allLeadsCount?: number;
        founded?: string[];
        allLeads?: Lead[];
    };
    timestamp: string;
}